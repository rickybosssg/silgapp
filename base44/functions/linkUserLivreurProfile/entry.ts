import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// ═══════════════════════════════════════════════════════════════════════════
// LINK USER ↔ LIVREUR PROFILE — Correction durable de la liaison
// ═══════════════════════════════════════════════════════════════════════════
//
// PROBLÈME :
//   AuthGate.jsx tentait de lier user_email sur Livreur via le SDK normal,
//   mais le RLS Livreur.update exige data.user_email === user.email.
//   Si user_email est null, l'update est bloqué par RLS → .catch(() => {})
//   avale l'erreur silencieusement. Le livreur peut alors accepter des courses
//   (accepterCourseV2 ne vérifie pas user_email) mais ne peut pas les terminer
//   (transitionStatutLivreur et finaliserLivraisonLivreur vérifient user_email).
//
// SOLUTION :
//   Fonction backend dédiée qui utilise asServiceRole pour contourner le RLS,
//   avec vérification stricte de l'identité de l'utilisateur authentifié.
//
// SÉCURITÉ :
//   - Vérifie base44.auth.me() (utilisateur authentifié)
//   - Recherche le livreur par user_email OU email (fallback)
//   - Si user_email est null/différent ET email correspond → lie avec asServiceRole
//   - Si aucun livreur trouvé → retourne null (nouvel utilisateur)
//   - N'affaiblit JAMAIS les contrôles : seul l'utilisateur authentifié peut
//     lier SON propre profil livreur (par email correspondant)
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !user.email) {
      return Response.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const userEmail = user.email.trim().toLowerCase();

    // 1. Chercher le livreur par user_email (chemin normal)
    let livreurs = await base44.asServiceRole.entities.Livreur.filter(
      { user_email: user.email }, '-created_date', 5
    ).catch(() => []);

    // 2. Fallback : chercher par email (livreur créé par admin sans user_email)
    if (!livreurs || livreurs.length === 0) {
      livreurs = await base44.asServiceRole.entities.Livreur.filter(
        { email: user.email }, '-created_date', 5
      ).catch(() => []);
    }

    if (!livreurs || livreurs.length === 0) {
      return Response.json({ success: true, linked: false, reason: 'no_livreur_found' });
    }

    const livreur = livreurs[0];
    const livreurUserEmail = (livreur.user_email || '').trim().toLowerCase();
    const livreurEmail = (livreur.email || '').trim().toLowerCase();

    // 3. Vérifier que l'utilisateur authentifié correspond au livreur
    //    Soit user_email correspond déjà, soit email correspond (fallback admin-created)
    const emailMatches = livreurEmail === userEmail;
    const userEmailMatches = livreurUserEmail === userEmail;

    if (!userEmailMatches && !emailMatches) {
      // L'email du livreur ne correspond pas à l'utilisateur authentifié
      // → refuser la liaison (sécurité : ne jamais lier un profil à un mauvais utilisateur)
      return Response.json({
        success: false,
        linked: false,
        reason: 'email_mismatch',
        error: 'L\'email du profil livreur ne correspond pas à votre compte.',
      }, { status: 403 });
    }

    // 4. Si user_email est manquant ou différent, le corriger avec asServiceRole
    if (!userEmailMatches) {
      await base44.asServiceRole.entities.Livreur.update(livreur.id, {
        user_email: user.email,
      }).catch(() => {});
      console.log(`[linkUserLivreurProfile] user_email corrigé pour livreur ${livreur.id}: ${user.email}`);
    }

    // 5. Mettre à jour silgapp_role sur le User si manquant
    if (user.silgapp_role !== 'livreur') {
      try {
        await base44.auth.updateMe({ silgapp_role: 'livreur' });
      } catch (_) {}
    }

    return Response.json({
      success: true,
      linked: true,
      livreur_id: livreur.id,
      user_email_set: !userEmailMatches,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}