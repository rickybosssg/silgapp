import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

/**
 * auditLivreurReachability — Diagnostic backend uniquement
 *
 * Calcule l'état de joignabilité des livreurs SANS modifier leur statut métier.
 * Utilise les données existantes : last_seen_at, derniere_position_date,
 * background_active, app_active, token FCM, statut livreur.
 *
 * États calculés :
 *   - ACTIF_TEMPS_REEL       : heartbeat <10min ET GPS <30min
 *   - HEARTBEAT_SILENCIEUX   : statut disponible mais heartbeat >10min
 *   - GPS_STALE              : heartbeat récent mais GPS >30min
 *   - INACTIF_TECHNIQUE      : heartbeat >10min ET GPS >30min
 *
 * ⚠️ NE MODIFIE JAMAIS Livreur.statut — lecture seule.
 * ⚠️ Ne touche pas à Dispatch V2, FCM, GPS natif, Foreground Service.
 */
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const now = Date.now();
    const TEN_MIN = 10 * 60 * 1000;
    const THIRTY_MIN = 30 * 60 * 1000;

    // Récupérer tous les livreurs (tri par last_seen_at desc)
    const livreurs = await base44.asServiceRole.entities.Livreur.list('-last_seen_at', 500);

    // Récupérer les tokens FCM actifs pour vérifier la joignabilité push
    const tokens = await base44.asServiceRole.entities.NotificationToken.filter({
      user_type: 'livreur',
      actif: true,
    }, '-derniere_utilisation', 500);

    // Indexer les tokens par livreur_id
    const tokenByLivreurId = new Map<string, boolean>();
    for (const t of tokens) {
      if (t.livreur_id && t.token) {
        tokenByLivreurId.set(t.livreur_id, true);
      }
    }

    // Classifier chaque livreur
    const details = [];
    const summary = {
      total: livreurs.length,
      disponible: 0,
      heartbeat_recent: 0,      // heartbeat <10 min
      gps_recent: 0,            // GPS <30 min
      avec_token_fcm: 0,         // token FCM valide
      reellement_joignables: 0,  // disponible + heartbeat<10min + GPS<30min + token
      fantomes: 0,              // disponible mais aucune activité récente
      actif_temps_reel: 0,
      heartbeat_silencieux: 0,
      gps_stale: 0,
      inactif_technique: 0,
    };

    for (const l of livreurs) {
      const heartbeatAgeMs = l.last_seen_at ? now - new Date(l.last_seen_at).getTime() : null;
      const gpsAgeMs = l.derniere_position_date ? now - new Date(l.derniere_position_date).getTime() : null;
      const hasToken = tokenByLivreurId.has(l.id);
      const isDisponible = l.statut === 'disponible';

      const heartbeatRecent = heartbeatAgeMs !== null && heartbeatAgeMs <= TEN_MIN;
      const gpsRecent = gpsAgeMs !== null && gpsAgeMs <= THIRTY_MIN;

      // État calculé
      let etat: string;
      if (heartbeatRecent && gpsRecent) {
        etat = 'ACTIF_TEMPS_REEL';
      } else if (!heartbeatRecent && gpsRecent) {
        etat = 'HEARTBEAT_SILENCIEUX';
      } else if (heartbeatRecent && !gpsRecent) {
        etat = 'GPS_STALE';
      } else {
        etat = 'INACTIF_TECHNIQUE';
      }

      // Fantôme : statut disponible mais heartbeat et GPS anciens
      const isFantome = isDisponible && !heartbeatRecent && (gpsAgeMs === null || gpsAgeMs > THIRTY_MIN);

      // Joignable : disponible + heartbeat récent + GPS récent + token FCM
      const isJoignable = isDisponible && heartbeatRecent && gpsRecent && hasToken;

      // Compteurs summary
      if (isDisponible) summary.disponible++;
      if (heartbeatRecent) summary.heartbeat_recent++;
      if (gpsRecent) summary.gps_recent++;
      if (hasToken) summary.avec_token_fcm++;
      if (isJoignable) summary.reellement_joignables++;
      if (isFantome) summary.fantomes++;
      if (etat === 'ACTIF_TEMPS_REEL') summary.actif_temps_reel++;
      if (etat === 'HEARTBEAT_SILENCIEUX') summary.heartbeat_silencieux++;
      if (etat === 'GPS_STALE') summary.gps_stale++;
      if (etat === 'INACTIF_TECHNIQUE') summary.inactif_technique++;

      details.push({
        id: l.id,
        nom: `${l.prenom || ''} ${l.nom || ''}`.trim(),
        telephone: l.telephone,
        statut_metier: l.statut,
        etat_calcule: etat,
        heartbeat_age_min: heartbeatAgeMs !== null ? Math.round(heartbeatAgeMs / 60000) : null,
        gps_age_min: gpsAgeMs !== null ? Math.round(gpsAgeMs / 60000) : null,
        background_active: l.background_active,
        app_active: l.app_active,
        token_fcm_valide: hasToken,
        est_joignable: isJoignable,
        est_fantome: isFantome,
        last_seen_at: l.last_seen_at,
        derniere_position_date: l.derniere_position_date,
      });
    }

    return Response.json({
      generated_at: new Date().toISOString(),
      summary,
      details,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}