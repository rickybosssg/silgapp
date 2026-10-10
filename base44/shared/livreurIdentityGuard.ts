// ═══════════════════════════════════════════════════════════════════════════
// LIVREUR IDENTITY GUARD — Vérification d'identité pour l'acceptation de courses
// ═══════════════════════════════════════════════════════════════════════════
//
// RÈGLE DE SÉCURITÉ ABSOLUE :
//   Aucun livreur_id fourni par le frontend n'est accepté sans vérification
//   que le profil Livreur appartient réellement à l'utilisateur authentifié.
//
//   Le frontend envoie livreur_id → le backend vérifie :
//     1. base44.auth.me() (utilisateur authentifié)
//     2. livreur.user_email === user.email (liaison correcte)
//     3. Fallback : livreur.email === user.email → auto-liaison asServiceRole
//     4. Si aucun match → 403 (refus catégorique)
//
//   Ce guard est APPLICABLE à :
//     - accepterCourseV2 (dispatchV2.ts)
//     - acceptEcoMission (ecoOptimizationEngine.ts)
//     - respondToOnRouteProposal (ecoOptimizationEngine.ts)
//
//   Il ne modifie JAMAIS la logique de dispatch, de scoring ou de commission.
//   Il s'exécute AVANT toute logique métier, comme un middleware de sécurité.
// ═══════════════════════════════════════════════════════════════════════════

export async function verifyLivreurIdentity(base44: any, livreurId: string): Promise<{
  verified: boolean;
  livreur: any | null;
  user: any | null;
  error?: string;
  auto_linked?: boolean;
}> {
  if (!livreurId) {
    return { verified: false, livreur: null, user: null, error: 'livreur_id requis' };
  }

  // 1. Authentification requise
  let user: any;
  try {
    user = await base44.auth.me();
  } catch (_) {
    return { verified: false, livreur: null, user: null, error: 'Authentification requise' };
  }
  if (!user || !user.email) {
    return { verified: false, livreur: null, user: null, error: 'Utilisateur non authentifié' };
  }

  // 2. Récupérer le profil livreur
  const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
  if (!livreur) {
    return { verified: false, livreur: null, user, error: 'Livreur introuvable' };
  }

  const livreurUserEmail = (livreur.user_email || '').trim().toLowerCase();
  const livreurEmail = (livreur.email || '').trim().toLowerCase();
  const userEmail = (user.email || '').trim().toLowerCase();

  // 3. Vérification primaire : user_email correspond
  if (livreurUserEmail === userEmail) {
    return { verified: true, livreur, user };
  }

  // 4. Fallback : email correspond mais user_email manquant/différent
  //    → auto-liaison avec asServiceRole (contourne le RLS)
  //    MAIS refus si user_email est déjà lié à un AUTRE utilisateur
  if (livreurUserEmail && livreurUserEmail !== userEmail) {
    // user_email est déjà lié à un autre utilisateur → refus catégorique
    return {
      verified: false,
      livreur,
      user,
      error: 'Ce profil livreur est lié à un autre compte utilisateur',
    };
  }

  // user_email est null/vide — vérifier si email correspond
  if (livreurEmail && livreurEmail === userEmail) {
    // Auto-liaison sécurisée : email correspond → corriger user_email
    await base44.asServiceRole.entities.Livreur.update(livreurId, {
      user_email: user.email,
    }).catch(() => {});

    // Relire pour confirmer
    const livreurRelu = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
    if (livreurRelu && (livreurRelu.user_email || '').trim().toLowerCase() === userEmail) {
      return { verified: true, livreur: livreurRelu, user, auto_linked: true };
    }
    return { verified: false, livreur: livreurRelu || livreur, user, error: 'Échec de l\'auto-liaison du profil' };
  }

  // 5. Aucun match → refus
  return {
    verified: false,
    livreur,
    user,
    error: 'Ce profil livreur ne vous appartient pas',
  };
}