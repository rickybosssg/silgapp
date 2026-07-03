import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Accès admin requis' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const days = body?.days || 7;
    const since = new Date(Date.now() - days * 86400000);

    // ── Récupérer les notifications récentes ──
    const notifs = await base44.asServiceRole.entities.Notification.list('-created_date', 500);
    const recentNotifs = notifs.filter(n => n.created_date && new Date(n.created_date) >= since);

    // ── Récupérer les tokens ──
    const tokens = await base44.asServiceRole.entities.NotificationToken.list('-created_date', 500);

    // ── Statistiques de délivrabilité ──
    const tokensActifs = tokens.filter(t => t.actif);
    const tokensInactifs = tokens.filter(t => !t.actif);
    const tokensAvecErreurs = tokens.filter(t => t.fcm_error);
    const tokensSuccess = tokens.filter(t => t.derniere_notif_statut === 'success');
    const tokensFailed = tokens.filter(t => t.derniere_notif_statut === 'failed');

    // ── Segmentation par type d'utilisateur ──
    const parUserType = {};
    for (const t of tokens) {
      const ut = t.user_type || 'inconnu';
      if (!parUserType[ut]) parUserType[ut] = { total: 0, actifs: 0, erreurs: 0 };
      parUserType[ut].total++;
      if (t.actif) parUserType[ut].actifs++;
      if (t.fcm_error) parUserType[ut].erreurs++;
    }

    // ── Segmentation par plateforme ──
    const parPlateforme = {};
    for (const t of tokens) {
      const p = t.platform || 'inconnu';
      if (!parPlateforme[p]) parPlateforme[p] = { total: 0, actifs: 0 };
      parPlateforme[p].total++;
      if (t.actif) parPlateforme[p].actifs++;
    }

    // ── Notifications par type ──
    const parType = {};
    for (const n of recentNotifs) {
      const t = n.type || 'generic';
      if (!parType[t]) parType[t] = { total: 0, lues: 0, non_lues: 0 };
      parType[t].total++;
      if (n.lue) parType[t].lues++;
      else parType[t].non_lues++;
    }

    // ── Taux de lecture global ──
    const tauxLecture = recentNotifs.length > 0
      ? Math.round(recentNotifs.filter(n => n.lue).length / recentNotifs.length * 100)
      : 0;

    // ── Erreurs FCM les plus fréquentes ──
    const erreurFreq = {};
    for (const t of tokensAvecErreurs) {
      let errType = 'autre';
      const err = t.fcm_error || '';
      if (err.includes('UNREGISTERED')) errType = 'UNREGISTERED';
      else if (err.includes('INVALID_ARGUMENT')) errType = 'INVALID_ARGUMENT';
      else if (err.includes('SENDER_ID_MISMATCH')) errType = 'SENDER_ID_MISMATCH';
      else if (err.includes('QUOTA_EXCEEDED')) errType = 'QUOTA_EXCEEDED';
      else if (err.includes('UNAVAILABLE')) errType = 'UNAVAILABLE';
      erreurFreq[errType] = (erreurFreq[errType] || 0) + 1;
    }

    // ── Recommandations automatiques ──
    const recommandations = [];

    const tauxTokensActifs = tokens.length > 0 ? Math.round(tokensActifs.length / tokens.length * 100) : 0;
    if (tauxTokensActifs < 70) {
      recommandations.push({
        priorite: 'elevee',
        titre: 'Nettoyer les tokens inactifs',
        detail: `Taux de tokens actifs: ${tauxTokensActifs}%. ${tokensInactifs.length} tokens inactifs. Nettoyer les tokens expirés pour améliorer la délivrabilité.`,
      });
    }

    const tauxErreurs = tokens.length > 0 ? Math.round(tokensAvecErreurs.length / tokens.length * 100) : 0;
    if (tauxErreurs > 10) {
      recommandations.push({
        priorite: 'moyenne',
        titre: 'Investiguer les erreurs FCM',
        detail: `${tauxErreurs}% des tokens ont des erreurs FCM. Erreurs les plus fréquentes: ${JSON.stringify(erreurFreq)}.`,
      });
    }

    if (tauxLecture < 30 && recentNotifs.length > 10) {
      recommandations.push({
        priorite: 'moyenne',
        titre: 'Améliorer la pertinence des notifications',
        detail: `Taux de lecture: ${tauxLecture}%. Les notifications ne sont pas assez pertinentes. Segmenter par type et réduire le bruit.`,
      });
    }

    const tokensSansDerniereUtilisation = tokens.filter(t => !t.derniere_utilisation).length;
    if (tokensSansDerniereUtilisation > tokens.length * 0.3) {
      recommandations.push({
        priorite: 'faible',
        titre: 'Purger les tokens jamais utilisés',
        detail: `${tokensSansDerniereUtilisation} tokens n'ont jamais reçu de notification. Possiblement des tokens obsolètes d'installations abandonnées.`,
      });
    }

    return Response.json({
      date_audit: new Date().toISOString(),
      periode_jours: days,
      resume: `Audit notifications (${days}j): ${recentNotifs.length} notifications envoyées, ${tauxLecture}% taux de lecture, ${tauxTokensActifs}% tokens actifs. ${recommandations.length} recommandation(s).`,
      stats_globales: {
        notifications_total: recentNotifs.length,
        notifications_lues: recentNotifs.filter(n => n.lue).length,
        notifications_non_lues: recentNotifs.filter(n => !n.lue).length,
        taux_lecture: tauxLecture,
        tokens_total: tokens.length,
        tokens_actifs: tokensActifs.length,
        tokens_inactifs: tokensInactifs.length,
        tokens_avec_erreurs: tokensAvecErreurs.length,
        taux_tokens_actifs: tauxTokensActifs,
        taux_erreurs: tauxErreurs,
        tokens_success: tokensSuccess.length,
        tokens_failed: tokensFailed.length,
      },
      par_user_type: parUserType,
      par_plateforme: parPlateforme,
      par_type_notification: parType,
      erreurs_fcm: erreurFreq,
      recommandations,
      lance_par: user.email,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});