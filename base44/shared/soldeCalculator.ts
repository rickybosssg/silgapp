// ═══════════════════════════════════════════════════════════════════════════
// SOLDE CALCULATOR — Formule financière unique (READ-ONLY)
// ═══════════════════════════════════════════════════════════════════════════
//
// FORMULE EXPLICITE :
//
//   totalCommissions = SUM(commission_silga WHERE statut=livree)
//   totalPaye        = SUM(montant_paye FROM PaiementSilgapp WHERE statut=traite)
//
//   solde            = max(0, totalCommissions - totalPaye)
//   creditDisponible = max(0, totalPaye - totalCommissions)
//
// Ce module est la SOURCE DE VÉRITÉ unique pour le calcul du solde et du crédit.
// - recalculerSoldeLivreur.ts l'utilise puis écrit le résultat sur le livreur.
// - getSoldeLivreur (backend) l'utilise pour exposer la valeur au frontend.
//
// Aucun calcul de solde ne doit être dupliqué ailleurs (frontend ou backend).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcule le solde dû et le crédit disponible d'un livreur SANS écrire en DB.
 * Utilise le service role pour accéder aux courses et paiements.
 *
 * @returns { solde, creditDisponible, totalCommissions, totalPaye }
 */
export async function calculerSoldeLivreur(base44: any, livreurId: string): Promise<{
  solde: number;
  creditDisponible: number;
  totalCommissions: number;
  totalPaye: number;
}> {
  if (!livreurId) {
    return { solde: 0, creditDisponible: 0, totalCommissions: 0, totalPaye: 0 };
  }

  // 1. Toutes les courses livrées du livreur (dette brute)
  const coursesLivrees = await base44.asServiceRole.entities.CourseExterne.filter(
    { livreur_id: livreurId, statut: 'livree' },
    'heure_livraison', 500
  ).catch(() => []);

  const totalCommissions = (coursesLivrees || []).reduce(
    (sum: number, c: any) => sum + (Number(c.commission_silga) || 0), 0
  );

  // 2. Tous les paiements traités (journal immuable PaiementSilgapp)
  const paiements = await base44.asServiceRole.entities.PaiementSilgapp.filter(
    { user_id: livreurId, statut: 'traite', type_dette: 'commission_livreur' },
    '-date_envoi', 500
  ).catch(() => []);

  const totalPaye = (paiements || []).reduce(
    (sum: number, p: any) => sum + (Number(p.montant_paye) || 0), 0
  );

  // 3. Formule unique
  const solde = Math.max(0, totalCommissions - totalPaye);
  const creditDisponible = Math.max(0, totalPaye - totalCommissions);

  return { solde, creditDisponible, totalCommissions, totalPaye };
}

/**
 * Calcule le solde pour TOUS les livreurs d'un pays en une seule passe.
 * Optimisé pour l'admin : 2 requêtes agrégées au lieu de N×2.
 *
 * @returns Map<livreurId, { solde, creditDisponible, totalCommissions, totalPaye }>
 */
export async function calculerSoldesLivreursBatch(
  base44: any,
  countryCode: string | null
): Promise<Record<string, { solde: number; creditDisponible: number; totalCommissions: number; totalPaye: number }>> {
  // 1. Toutes les courses livrées du pays
  const coursesFilter = countryCode
    ? { statut: 'livree', country_code: countryCode }
    : { statut: 'livree' };
  const allCourses = await base44.asServiceRole.entities.CourseExterne.filter(
    coursesFilter, 'heure_livraison', 2000
  ).catch(() => []);

  // 2. Tous les paiements traités du pays
  const paiementsFilter = countryCode
    ? { statut: 'traite', type_dette: 'commission_livreur', country_code: countryCode }
    : { statut: 'traite', type_dette: 'commission_livreur' };
  const allPaiements = await base44.asServiceRole.entities.PaiementSilgapp.filter(
    paiementsFilter, '-date_envoi', 2000
  ).catch(() => []);

  // 3. Agréger par livreur_id
  const commissionsByLivreur: Record<string, number> = {};
  (allCourses || []).forEach((c: any) => {
    if (!c.livreur_id) return;
    commissionsByLivreur[c.livreur_id] = (commissionsByLivreur[c.livreur_id] || 0) + (Number(c.commission_silga) || 0);
  });

  const payeByLivreur: Record<string, number> = {};
  (allPaiements || []).forEach((p: any) => {
    if (!p.user_id) return;
    payeByLivreur[p.user_id] = (payeByLivreur[p.user_id] || 0) + (Number(p.montant_paye) || 0);
  });

  // 4. Calculer pour chaque livreur présent dans les commissions OU les paiements
  const allIds = new Set([...Object.keys(commissionsByLivreur), ...Object.keys(payeByLivreur)]);
  const result: Record<string, any> = {};
  allIds.forEach(id => {
    const totalCommissions = commissionsByLivreur[id] || 0;
    const totalPaye = payeByLivreur[id] || 0;
    result[id] = {
      solde: Math.max(0, totalCommissions - totalPaye),
      creditDisponible: Math.max(0, totalPaye - totalCommissions),
      totalCommissions,
      totalPaye,
    };
  });

  return result;
}