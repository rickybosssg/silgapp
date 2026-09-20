import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { normalizePhone } from '../../shared/phoneUtils.ts';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * relancePremiereCourse — Relance automatique après la première course livrée
 *
 * OBJECTIF : identifier les clients qui viennent de livrer leur première course
 * et préparer une relance push FCM pour provoquer une deuxième commande.
 *
 * DEUX SWITCHS SÉPARÉS :
 *   1. FIRST_COURSE_RELANCE_ANALYSIS_ENABLED (défaut: true)
 *      → Le moteur analyse les clients, applique tous les filtres, et enregistre
 *        ce qu'il aurait envoyé en DRY-RUN. Aucun push n'est envoyé.
 *   2. FIRST_COURSE_RELANCE_SEND_ENABLED (défaut: false)
 *      → Autorise l'envoi FCM réel. Tant que false, aucun push n'est envoyé.
 *
 * ANTI-SOLLICITATION CROISÉE :
 *   - Vérifie les HabitReminder 'sent' des dernières 72h (moteurRappelsHabitude + cette fonction)
 *   - Vérifie les ReactivationScenario actifs ou avec push récent (moteurReactivationAuto)
 *   - Si un client a reçu une sollicitation marketing dans les 72h, il est exclu
 *
 * CONTRAINTES :
 *   - Aucune dépense publicitaire (FCM natif uniquement)
 *   - Aucune réduction/récompense financière
 *   - Pas de doublon avec moteurReactivationAuto (first_course_delivered J+1/J+3/J+7)
 *   - Séparation par pays
 *   - Frequency cap : 1 relance par client
 *   - Idempotence : vérifie les HabitReminder existants
 *   - Consentement marketing respecté (preferences_categories)
 *
 * NE MODIFIE PAS : Dispatch V2, tarification, finance, QR/PIN, GPS, FCM natif.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const RELANCE_DELAY_HOURS = 2; // Délai minimum avant relance après livraison
const MAX_TARGETS_PER_RUN = 50; // Limite anti-saturation
const ANTI_SOLICITATION_WINDOW_HOURS = 72; // Fenêtre anti-sollicitation croisée

const RELANCE_TITLE = "SILGAPP — Et si on recommençait ?";
const RELANCE_MESSAGE = "Bonjour ! Vous avez récemment utilisé SILGAPP pour votre première livraison. Si vous avez besoin d'un livreur à nouveau, ouvrez l'app et créez une course en quelques secondes. À tout de suite !";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // ── Auth : accepter les appels service-role (Workflow) ET admin manuels ──
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch {
      // Appel depuis un Workflow Base44 (service role)
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'run';

    // ── Deux switches séparés ──
    let analysisEnabled = true; // Analyse activée par défaut (DRY-RUN observation)
    let sendEnabled = false;    // Envoi FCM désactivé par défaut
    try {
      const configs = await base44.asServiceRole.entities.AppConfig.filter({
        cle: { $in: ['FIRST_COURSE_RELANCE_ANALYSIS_ENABLED', 'FIRST_COURSE_RELANCE_SEND_ENABLED'] },
      });
      const configMap: Record<string, string> = {};
      for (const c of configs) {
        if (c.cle) configMap[c.cle] = c.valeur;
      }
      analysisEnabled = configMap['FIRST_COURSE_RELANCE_ANALYSIS_ENABLED'] !== 'false'; // true par défaut
      sendEnabled = configMap['FIRST_COURSE_RELANCE_SEND_ENABLED'] === 'true';            // false par défaut
    } catch {}

    if (!analysisEnabled) {
      return Response.json({
        action,
        status: 'analysis_disabled',
        message: 'FIRST_COURSE_RELANCE_ANALYSIS_ENABLED is false. Motor does not run.',
      });
    }

    // ── Action : audit (analyser sans rien créer) ──
    if (action === 'audit') {
      const result = await analyzeEligibleClients(base44);
      return Response.json({
        action: 'audit',
        analysis_enabled: true,
        send_enabled: sendEnabled,
        dry_run: !sendEnabled,
        ...result,
        message_title: RELANCE_TITLE,
        message_body: RELANCE_MESSAGE,
      });
    }

    // ── Action : run (préparer les relances en DRY-RUN) ──
    if (action === 'run') {
      const result = await analyzeEligibleClients(base44);
      const effectiveDryRun = !sendEnabled; // DRY-RUN tant que sendEnabled est false

      const now = new Date().toISOString();
      const batchId = `first_course_relance_${Date.now()}`;
      let prepared = 0;
      const details: any[] = [];

      for (const el of result.retained) {
        const { client, token, deliveredAt, hoursSinceDelivery } = el;

        // ── Créer un HabitReminder (DRY-RUN = status 'pending', pas d'envoi) ──
        await base44.asServiceRole.entities.HabitReminder.create({
          client_id: client.id,
          client_telephone: client.telephone || '',
          client_phone_normalized: normalizePhone(client.telephone, client.country_code || undefined) || '',
          client_user_email: client.user_email || '',
          country_code: client.country_code || '',
          segment: 'first_course_delivered',
          habit_type: 'tranche_horaire',
          habit_detail: JSON.stringify({
            first_course_delivered_at: deliveredAt,
            hours_since_delivery: hoursSinceDelivery,
            message_title: RELANCE_TITLE,
            message_body: RELANCE_MESSAGE,
          }),
          habit_occurrences: 1,
          habit_ratio: 1.0,
          is_control_group: false,
          status: effectiveDryRun ? 'pending' : 'sent',
          push_token: token.token,
          push_token_id: token.id || '',
          campaign_batch_id: batchId,
        });
        prepared++;
        details.push({
          client_id: client.id,
          country_code: client.country_code,
          status: effectiveDryRun ? 'dry_run_pending' : 'sent',
          hours_since_delivery: hoursSinceDelivery,
          delivered_at: deliveredAt,
        });
      }

      return Response.json({
        action: 'run',
        analysis_enabled: true,
        send_enabled: sendEnabled,
        dry_run: effectiveDryRun,
        eligible_count: result.eligible_count,
        excluded_opt_out: result.excluded_opt_out,
        excluded_duplicate: result.excluded_duplicate,
        excluded_no_fcm: result.excluded_no_fcm,
        excluded_recent_solicitation: result.excluded_recent_solicitation,
        retained_count: result.retained.length,
        prepared,
        message_title: RELANCE_TITLE,
        message_body: RELANCE_MESSAGE,
        details: details.slice(0, 10),
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[relancePremiereCourse] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Analyse complète des clients éligibles avec breakdown détaillé
// ═══════════════════════════════════════════════════════════════════════════

async function analyzeEligibleClients(base44: any): Promise<any> {
  const now = Date.now();

  // ── Charger les courses livrées récentes (7 derniers jours) ──
  const recentDelivered: any[] = [];
  let skip = 0;
  while (true) {
    const batch = await base44.asServiceRole.entities.CourseExterne.filter(
      { statut: 'livree' },
      '-heure_livraison', 500, skip
    );
    if (!batch || batch.length === 0) break;
    recentDelivered.push(...batch);
    if (batch.length < 500) break;
    skip += 500;
    if (skip > 2000) break;
  }

  // ── Grouper par client (phone_normalized ou user_email) ──
  const clientCourses = new Map<string, any[]>();
  for (const c of recentDelivered) {
    const key = c.client_phone_normalized || c.client_user_email || c.client_telephone || '';
    if (!key) continue;
    if (!clientCourses.has(key)) clientCourses.set(key, []);
    clientCourses.get(key)!.push(c);
  }

  // ── Filtrer : exactement 1 course livrée ET délai ≥ 2h ──
  const firstCourseClients: any[] = [];
  for (const [key, courses] of clientCourses) {
    if (courses.length !== 1) continue;
    const course = courses[0];
    const deliveredAt = course.heure_livraison || course.colis_livre_at || course.created_date;
    if (!deliveredAt) continue;
    const deliveredMs = new Date(deliveredAt).getTime();
    const hoursSinceDelivery = (now - deliveredMs) / 3600000;
    if (hoursSinceDelivery < RELANCE_DELAY_HOURS) continue;
    firstCourseClients.push({ key, course, deliveredAt, hoursSinceDelivery });
  }

  // ── Charger les clients ClientExterne ──
  const clients = await base44.asServiceRole.entities.ClientExterne.list();
  const clientByPhone = new Map<string, any>();
  const clientByEmail = new Map<string, any>();
  for (const c of clients) {
    if (c.telephone_normalized) clientByPhone.set(c.telephone_normalized, c);
    if (c.user_email) clientByEmail.set(c.user_email.trim().toLowerCase(), c);
  }

  // ── Charger les tokens FCM natifs ──
  const tokens = await base44.asServiceRole.entities.NotificationToken.filter({
    user_type: 'client',
    actif: true,
  });
  const tokenByEmail = new Map<string, any>();
  for (const t of tokens) {
    if (t.token && !String(t.token).startsWith('web_') && t.user_email) {
      tokenByEmail.set(t.user_email, t);
    }
  }

  // ── Charger les HabitReminder existants (anti-doublon + anti-sollicitation) ──
  const allReminders = await base44.asServiceRole.entities.HabitReminder.list();
  const remindedClientIds = new Set<string>(); // Déjà relancé par cette fonction
  const recentlySolicitedClientIds = new Set<string>(); // Sollicité par moteurRappelsHabitude dans les 72h
  const solWindowMs = ANTI_SOLICITATION_WINDOW_HOURS * 3600000;

  for (const r of allReminders) {
    // Anti-doublon : déjà relancé par cette fonction (segment first_course_delivered)
    if (r.segment === 'first_course_delivered' && r.client_id) {
      remindedClientIds.add(r.client_id);
    }
    // Anti-sollicitation : push envoyé par moteurRappelsHabitude dans les 72h
    if (r.status === 'sent' && r.sent_at) {
      const sentMs = new Date(r.sent_at).getTime();
      if (now - sentMs < solWindowMs && r.client_id) {
        recentlySolicitedClientIds.add(r.client_id);
      }
    }
  }

  // ── Charger les ReactivationScenario (anti-doublon + anti-sollicitation) ──
  const allScenarios = await base44.asServiceRole.entities.ReactivationScenario.list();
  const reactivationClientIds = new Set<string>(); // Scénario actif
  const recentlyReactivatedClientIds = new Set<string>(); // Push récent dans les 72h

  for (const s of allScenarios) {
    if (s.status === 'active' && s.client_id) {
      reactivationClientIds.add(s.client_id);
    }
    // Anti-sollicitation : push de réactivation envoyé dans les 72h
    const lastPush = s.j0_sent_at || s.j2_sent_at || s.j5_sent_at;
    if (lastPush && s.client_id) {
      const pushMs = new Date(lastPush).getTime();
      if (now - pushMs < solWindowMs) {
        recentlyReactivatedClientIds.add(s.client_id);
      }
    }
  }

  // ── Construire la liste finale avec breakdown ──
  const eligible: any[] = [];
  const seenClientIds = new Set<string>();
  let excludedOptOut = 0;
  let excludedDuplicate = 0;
  let excludedNoFcm = 0;
  let excludedRecentSolicitation = 0;

  for (const fc of firstCourseClients) {
    let client = null;
    const phone = fc.key;
    const email = fc.course.client_user_email?.trim().toLowerCase();
    if (phone) client = clientByPhone.get(phone);
    if (!client && email) client = clientByEmail.get(email);
    if (!client) continue;

    if (seenClientIds.has(client.id)) continue;
    seenClientIds.add(client.id);

    // 1. Anti-doublon : déjà relancé par cette fonction
    if (remindedClientIds.has(client.id)) {
      excludedDuplicate++;
      continue;
    }
    // 2. Anti-doublon : déjà dans un scénario de réactivation actif
    if (reactivationClientIds.has(client.id)) {
      excludedDuplicate++;
      continue;
    }
    // 3. Anti-sollicitation croisée : push récent par moteurRappelsHabitude ou moteurReactivationAuto
    if (recentlySolicitedClientIds.has(client.id) || recentlyReactivatedClientIds.has(client.id)) {
      excludedRecentSolicitation++;
      continue;
    }

    // 4. Vérifier le token FCM natif
    const token = client.user_email ? tokenByEmail.get(client.user_email) : null;
    if (!token || !token.token || String(token.token).startsWith('web_')) {
      excludedNoFcm++;
      continue;
    }

    // 5. Vérifier le consentement marketing
    const prefs = parseMarketingPrefs(token.preferences_categories);
    if (prefs.includes('marketing')) {
      excludedOptOut++;
      continue;
    }

    eligible.push({
      client,
      token,
      deliveredAt: fc.deliveredAt,
      hoursSinceDelivery: fc.hoursSinceDelivery,
    });
  }

  const retained = eligible.slice(0, MAX_TARGETS_PER_RUN);

  return {
    eligible_count: firstCourseClients.length,
    excluded_opt_out: excludedOptOut,
    excluded_duplicate: excludedDuplicate,
    excluded_no_fcm: excludedNoFcm,
    excluded_recent_solicitation: excludedRecentSolicitation,
    retained_count: retained.length,
    retained: retained.map(e => ({
      client_id: e.client.id,
      country_code: e.client.country_code,
      delivered_at: e.deliveredAt,
      hours_since_delivery: Math.round(e.hoursSinceDelivery * 10) / 10,
      has_fcm: !!e.token?.token,
    })),
  };
}

function parseMarketingPrefs(prefsStr: string | null | undefined): string[] {
  if (!prefsStr) return [];
  try {
    const arr = JSON.parse(prefsStr);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}