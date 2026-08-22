import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// ═══════════════════════════════════════════════════════════════════════════
// Retourne la liste détaillée des livreurs actifs injoignables par push.
// Pour chaque livreur sans token valide : dernier login, dernière activité,
// version APK (si disponible), statut permission notifications, dernier token connu.
// ═══════════════════════════════════════════════════════════════════════════

const ERREURS_FATALES = ['UNREGISTERED', 'INVALID_ARGUMENT', 'SENDER_ID_MISMATCH', 'QUOTA_EXCEEDED'];
const ONE_DAY_MS = 24 * 3600 * 1000;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // ── Authentification (admin seulement) ──
    try {
      const user = await base44.auth.me();
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Accès admin requis' }, { status: 403 });
      }
    } catch (_) {
      return Response.json({ error: 'Authentification requise' }, { status: 401 });
    }

    // ── Charger tous les tokens push ──
    const allTokens: any[] = [];
    let offset = 0;
    const limit = 500;
    while (true) {
      const batch = await base44.asServiceRole.entities.NotificationToken.list('-created_date', limit, offset).catch(() => []);
      if (!batch || batch.length === 0) break;
      allTokens.push(...batch);
      if (batch.length < limit) break;
      offset += limit;
    }

    // Map livreur_id → tokens
    const livreurTokenMap = new Map<string, any[]>();
    for (const t of allTokens) {
      if (t.user_type !== 'livreur' || !t.livreur_id) continue;
      if (!livreurTokenMap.has(t.livreur_id)) livreurTokenMap.set(t.livreur_id, []);
      livreurTokenMap.get(t.livreur_id)!.push(t);
    }

    // ── Charger les livreurs actifs ──
    const livreursActifs = await base44.asServiceRole.entities.Livreur.filter(
      { actif: true }, '-created_date', 500
    ).catch(() => []);

    // ── Charger les AppInstall pour version APK ──
    const appInstalls = await base44.asServiceRole.entities.AppInstall.list('-last_seen_at', 500).catch(() => []);
    const emailToAppVersion = new Map<string, string>();
    for (const ai of appInstalls || []) {
      if (ai.user_email && ai.app_version && !emailToAppVersion.has(ai.user_email)) {
        emailToAppVersion.set(ai.user_email, ai.app_version);
      }
    }

    // ── Charger les DeviceSession pour permission notif ──
    const deviceSessions = await base44.asServiceRole.entities.DeviceSession.list('-last_seen_at', 500).catch(() => []);
    const emailToNotifPermission = new Map<string, string>();
    for (const ds of deviceSessions || []) {
      if (!ds.user_email) continue;
      if (!emailToNotifPermission.has(ds.user_email)) {
        if (ds.notification_token) {
          emailToNotifPermission.set(ds.user_email, 'accordée');
        } else {
          emailToNotifPermission.set(ds.user_email, 'refusée');
        }
      }
    }

    // ── Compiler la liste des livreurs injoignables ──
    const now = Date.now();
    const livreursInjoignables = [];

    for (const livreur of livreursActifs) {
      const tokens = livreurTokenMap.get(livreur.id) || [];
      const validTokens = tokens.filter((t: any) =>
        t.actif && !ERREURS_FATALES.some(e => t.fcm_error && t.fcm_error.includes(e))
      );

      if (validTokens.length > 0) continue; // livreur joignable

      // Dernier token connu (même inactif ou en erreur)
      const lastToken = tokens.length > 0
        ? tokens.sort((a: any, b: any) => new Date(b.derniere_utilisation || b.created_date).getTime() - new Date(a.derniere_utilisation || a.created_date).getTime())[0]
        : null;

      // Déterminer si le livreur est "actif aujourd'hui"
      const lastSeen = livreur.last_seen_at ? new Date(livreur.last_seen_at).getTime() : 0;
      const isActifAujourdhui = livreur.app_active === true || (now - lastSeen) < ONE_DAY_MS;

      // Déterminer si inactif depuis longtemps (>7 jours)
      const isInactiveLongtemps = lastSeen > 0 && (now - lastSeen) > 7 * ONE_DAY_MS;

      livreursInjoignables.push({
        livreur_id: livreur.id,
        nom: livreur.nom,
        prenom: livreur.prenom,
        telephone: livreur.telephone,
        vehicule: livreur.vehicule,
        ville: livreur.ville,
        quartier: livreur.quartier,
        user_email: livreur.user_email,
        last_seen_at: livreur.last_seen_at || null,
        derniere_position_date: livreur.derniere_position_date || null,
        app_active: livreur.app_active,
        app_version: livreur.user_email ? (emailToAppVersion.get(livreur.user_email) || null) : null,
        notification_permission: livreur.user_email ? (emailToNotifPermission.get(livreur.user_email) || 'inconnue') : 'inconnue',
        dernier_token_date: lastToken?.derniere_utilisation || lastToken?.created_date || null,
        has_token_record: tokens.length > 0,
        token_count: tokens.length,
        last_token_error: lastToken?.fcm_error || null,
        is_critique: isActifAujourdhui, // actif aujourd'hui sans token = critique pour le dispatch
        is_inactive_longtemps: isInactiveLongtemps,
        critere: isActifAujourdhui ? 'actif_aujourdhui' : (isInactiveLongtemps ? 'inactif_longtemps' : 'inactif_recent'),
      });
    }

    // Trier : critique (actif aujourd'hui) en premier
    livreursInjoignables.sort((a, b) => {
      if (a.is_critique && !b.is_critique) return -1;
      if (!a.is_critique && b.is_critique) return 1;
      // Pour les mêmes niveau, trier par last_seen_at décroissant
      const aTime = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
      const bTime = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
      return bTime - aTime;
    });

    return Response.json({
      success: true,
      livreurs: livreursInjoignables,
      total: livreursInjoignables.length,
      critique_count: livreursInjoignables.filter(l => l.is_critique).length,
      inactif_longtemps_count: livreursInjoignables.filter(l => l.is_inactive_longtemps && !l.is_critique).length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[GET_LIVREURS_INJOIGNABLES] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}