import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Nettoie les tokens push inactifs :
 * - SUPPRIME les tokens déjà marqués actif=false (tokens morts qui encombrent la base)
 * - Désactive les tokens actifs avec erreur FCM fatale (UNREGISTERED, INVALID_ARGUMENT, etc.)
 * - Désactive les tokens actifs non utilisés depuis +30 jours
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Accès admin requis' }, { status: 403 });

    const tokens = await base44.asServiceRole.entities.NotificationToken.list('-created_date', 500);
    const now = Date.now();
    const RATIO_INACTIVITE_MS = 30 * 86400000; // 30 jours

    const erreursFatales = ['UNREGISTERED', 'INVALID_ARGUMENT', 'SENDER_ID_MISMATCH', 'QUOTA_EXCEEDED'];

    // ── 1. Tokens déjà inactifs → SUPPRESSION ──
    const aSupprimer = tokens.filter(t => !t.actif).map(t => t.id);

    // ── 2. Tokens actifs à désactiver (erreurs fatales ou inactivité) ──
    const aDesactiver = [];
    for (const t of tokens) {
      if (!t.actif) continue;

      let raison = null;

      if (t.fcm_error && erreursFatales.some(e => t.fcm_error.includes(e))) {
        raison = `Erreur FCM fatale: ${t.fcm_error.slice(0, 80)}`;
      }

      if (!raison && t.derniere_utilisation) {
        const age = now - new Date(t.derniere_utilisation).getTime();
        if (age > RATIO_INACTIVITE_MS) {
          raison = `Inactif depuis ${Math.round(age / 86400000)} jours`;
        }
      }

      if (!raison && t.derniere_notif_statut === 'failed' && t.fcm_error) {
        raison = `Dernière notification échouée: ${t.fcm_error.slice(0, 80)}`;
      }

      if (raison) {
        aDesactiver.push({ id: t.id, raison, user_type: t.user_type, platform: t.platform });
      }
    }

    // ── Suppression des tokens morts ──
    let supprimes = 0;
    const batchSize = 50;
    for (let i = 0; i < aSupprimer.length; i += batchSize) {
      const batchIds = aSupprimer.slice(i, i + batchSize);
      try {
        await base44.asServiceRole.entities.NotificationToken.deleteMany(
          { id: { $in: batchIds } }
        );
        supprimes += batchIds.length;
      } catch (_) {
        // Fallback individuel
        for (const id of batchIds) {
          try {
            await base44.asServiceRole.entities.NotificationToken.delete(id);
            supprimes++;
          } catch (_) {}
        }
      }
      if (i + batchSize < aSupprimer.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // ── Désactivation des tokens actifs problématiques ──
    let desactives = 0;
    for (let i = 0; i < aDesactiver.length; i += batchSize) {
      const batch = aDesactiver.slice(i, i + batchSize);
      const ids = batch.map(b => b.id);
      try {
        await base44.asServiceRole.entities.NotificationToken.updateMany(
          { id: { $in: ids } },
          { $set: { actif: false } }
        );
        desactives += batch.length;
      } catch (_) {
        for (const b of batch) {
          try {
            await base44.asServiceRole.entities.NotificationToken.update(b.id, { actif: false });
            desactives++;
          } catch (_) {}
        }
      }
      if (i + batchSize < aDesactiver.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // ── Stats post-nettoyage ──
    const actifsAvant = tokens.filter(t => t.actif).length;
    const totalApres = tokens.length - supprimes;
    const actifsApres = actifsAvant - desactives;
    const tauxActifApres = totalApres > 0 ? Math.round(actifsApres / totalApres * 100) : 0;

    return Response.json({
      success: true,
      tokens_total_avant: tokens.length,
      tokens_total_apres: totalApres,
      tokens_supprimes: supprimes,
      tokens_desactives: desactives,
      taux_actif_avant: tokens.length > 0 ? Math.round(actifsAvant / tokens.length * 100) : 0,
      taux_actif_apres: tauxActifApres,
      details_desactivation: aDesactiver.slice(0, 20).map(d => ({
        user_type: d.user_type,
        platform: d.platform,
        raison: d.raison,
      })),
      resume: `${supprimes} token(s) mort(s) supprimé(s), ${desactives} token(s) désactivé(s). Taux actifs: ${tauxActifApres}% (${actifsApres}/${totalApres}).`,
      date_nettoyage: new Date().toISOString(),
      lance_par: user.email,
    });
  } catch (error) {
    console.error('[nettoyerTokensInactifs] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});