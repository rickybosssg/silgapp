import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Réactivation en masse des tokens FCM inactifs pour tous les livreurs.
 * Pour chaque livreur sans token actif, réactive le token Android le plus récent.
 * Admin only.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(body.limit || 200, 200);

    // 1. Récupérer tous les livreurs
    const livreurs = await base44.asServiceRole.entities.Livreur.list('-created_date', limit);

    let dejaOk = 0;
    let reactivated = 0;
    let sansToken = 0;
    const listeReactivés = [];
    const listeSansToken = [];

    // 2. Pour chaque livreur, vérifier et réactiver
    for (const l of livreurs) {
      const tokens = await base44.asServiceRole.entities.NotificationToken.filter({ livreur_id: l.id });
      const actifs = tokens.filter(t => t.actif);

      if (actifs.length > 0) {
        dejaOk++;
        continue;
      }

      if (tokens.length === 0) {
        sansToken++;
        listeSansToken.push({
          nom: `${l.prenom || ''} ${l.nom || ''}`.trim(),
          email: l.user_email,
          telephone: l.telephone,
          statut: l.statut,
        });
        continue;
      }

      // Réactiver le token Android le plus récent
      const android = tokens
        .filter(t => t.platform === 'android')
        .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      const candidat = android[0] || [...tokens]
        .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];

      if (candidat) {
        await base44.asServiceRole.entities.NotificationToken.update(candidat.id, { actif: true });
        reactivated++;
        listeReactivés.push({
          nom: `${l.prenom || ''} ${l.nom || ''}`.trim(),
          platform: candidat.platform,
        });
      }
    }

    console.log('[reactiverTokensLivreurs] Terminé', {
      total: livreurs.length,
      dejaOk,
      reactivated,
      sansToken,
    });

    return Response.json({
      success: true,
      total_livreurs: livreurs.length,
      deja_avec_token_actif: dejaOk,
      tokens_reactives: reactivated,
      sans_token_jamais: sansToken,
      liste_reactives: listeReactivés,
      liste_sans_token: listeSansToken,
    });
  } catch (error) {
    console.error('[reactiverTokensLivreurs] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});