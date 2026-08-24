// ═══════════════════════════════════════════════════════════════════════════
// SOLDE CALCULATOR — Formule financière unique (READ-ONLY)
// ═══════════════════════════════════════════════════════════════════════════
//
// FORMULE EXPLICITE :
//
//   totalCommissions = SUM(commission_silga WHERE statut=livree)
//                      clé de rattachement = livreur_financier_id (immuable)
//                      fallback : livreur_id (pour courses non encore backfillées)
//   totalPaye        = SUM(montant_paye FROM PaiementSilgapp WHERE statut=traite)
//                      clé de rattachement = user_id (= livreur_id)
//
//   solde            = max(0, totalCommissions - totalPaye)
//   creditDisponible = max(0, totalPaye - totalCommissions)
//
// Ce module est la SOURCE DE VÉRITÉ unique pour le calcul du solde et du crédit.
// - recalculerSoldeLivreur.ts l'utilise puis écrit le résultat sur le livreur.
// - getSoldeLivreur (backend) l'utilise pour exposer la valeur au frontend.
//
// RÈGLE D'IMMUTABILITÉ :
//   livreur_financier_id est renseigné à la livraison et JAMAIS modifié ensuite.
//   livreur_id peut évoluer (redispatch, annulation, nettoyage) — il n'est utilisé
//   que comme fallback pour les courses non encore backfillées.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clé financière d'une course : livreur_financier_id en priorité, fallback livreur_id.
 * Utilisée pour agréger les commissions par livreur financier.
 */
function getLivreurFinancierId(course: any): string {
  return course.livreur_financier_id || course.livreur_id || '';
}

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

  // 0. Récupérer le livreur pour vérifier la base comptable
  const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
  const baseDate = livreur?.base_comptable_date || null;
  const baseSoldeInitial = Number(livreur?.base_comptable_solde_initial) || 0;

  // 1. Toutes les courses livrées du livreur (dette brute)
  //    On récupère par livreur_financier_id ET par livreur_id (fallback)
  //    puis on déduplique en mémoire.
  const coursesByFinancier = await base44.asServiceRole.entities.CourseExterne.filter(
    { livreur_financier_id: livreurId, statut: 'livree' },
    'heure_livraison', 500
  ).catch(() => []);

  const coursesByLivreurId = await base44.asServiceRole.entities.CourseExterne.filter(
    { livreur_id: livreurId, statut: 'livree' },
    'heure_livraison', 500
  ).catch(() => []);

  // Dédupliquer : une course peut avoir les deux champs renseignés
  const seenIds = new Set<string>();
  const allCourses = [];
  for (const c of (coursesByFinancier || [])) {
    if (!seenIds.has(c.id)) { seenIds.add(c.id); allCourses.push(c); }
  }
  for (const c of (coursesByLivreurId || [])) {
    if (!seenIds.has(c.id)) { seenIds.add(c.id); allCourses.push(c); }
  }

  // Filtrer par base comptable si définie
  const coursesForCalc = baseDate
    ? allCourses.filter((c: any) => {
        const d = c.heure_livraison || c.colis_livre_at || c.created_date;
        return d && new Date(d) >= new Date(baseDate);
      })
    : allCourses;

  const totalCommissions = coursesForCalc.reduce(
    (sum: number, c: any) => sum + (Number(c.commission_silga) || 0), 0
  );

  // 2. Tous les paiements traités (journal immuable PaiementSilgapp)
  const paiements = await base44.asServiceRole.entities.PaiementSilgapp.filter(
    { user_id: livreurId, statut: 'traite', type_dette: 'commission_livreur' },
    '-date_envoi', 500
  ).catch(() => []);

  // Filtrer par base comptable si définie (paiements traités après la base)
  const paiementsForCalc = baseDate
    ? (paiements || []).filter((p: any) => {
        const d = p.traite_at || p.date_envoi;
        return d && new Date(d) >= new Date(baseDate);
      })
    : (paiements || []);

  const totalPaye = paiementsForCalc.reduce(
    (sum: number, p: any) => sum + (Number(p.montant_paye) || 0), 0
  );

  // 3. Formule avec base comptable
  //    solde = base_solde_initial + commissions(après base) - paiements(après base)
  //    du = max(0, solde)
  //    credit = max(0, -solde)
  const soldeBrut = baseDate
    ? baseSoldeInitial + totalCommissions - totalPaye
    : totalCommissions - totalPaye;

  const solde = Math.max(0, soldeBrut);
  const creditDisponible = Math.max(0, -soldeBrut);

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

  // 3. Récupérer les livreurs avec base comptable pour filtrage
  const livreurIds = new Set<string>();
  (allCourses || []).forEach((c: any) => {
    const fid = getLivreurFinancierId(c);
    if (fid) livreurIds.add(fid);
    if (c.livreur_id) livreurIds.add(c.livreur_id);
  });
  (allPaiements || []).forEach((p: any) => {
    if (p.user_id) livreurIds.add(p.user_id);
  });

  const livreursAvecBase: Record<string, { date: string; soldeInitial: number }> = {};
  for (const id of livreurIds) {
    const l = await base44.asServiceRole.entities.Livreur.get(id).catch(() => null);
    if (l?.base_comptable_date) {
      livreursAvecBase[id] = {
        date: l.base_comptable_date,
        soldeInitial: Number(l.base_comptable_solde_initial) || 0,
      };
    }
  }

  // 4. Agréger par livreur_financier_id (fallback livreur_id)
  //    En filtrant par base comptable si définie
  const commissionsByLivreur: Record<string, number> = {};
  (allCourses || []).forEach((c: any) => {
    const fid = getLivreurFinancierId(c);
    if (!fid) return;
    const base = livreursAvecBase[fid];
    if (base) {
      const d = c.heure_livraison || c.colis_livre_at || c.created_date;
      if (!d || new Date(d) < new Date(base.date)) return; // course avant base → ignorée
    }
    commissionsByLivreur[fid] = (commissionsByLivreur[fid] || 0) + (Number(c.commission_silga) || 0);
  });

  const payeByLivreur: Record<string, number> = {};
  (allPaiements || []).forEach((p: any) => {
    if (!p.user_id) return;
    const base = livreursAvecBase[p.user_id];
    if (base) {
      const d = p.traite_at || p.date_envoi;
      if (!d || new Date(d) < new Date(base.date)) return; // paiement avant base → ignoré
    }
    payeByLivreur[p.user_id] = (payeByLivreur[p.user_id] || 0) + (Number(p.montant_paye) || 0);
  });

  // 5. Calculer pour chaque livreur présent dans les commissions OU les paiements
  const allIds = new Set([...Object.keys(commissionsByLivreur), ...Object.keys(payeByLivreur)]);
  const result: Record<string, any> = {};
  allIds.forEach(id => {
    const totalCommissions = commissionsByLivreur[id] || 0;
    const totalPaye = payeByLivreur[id] || 0;
    const base = livreursAvecBase[id];
    const soldeBrut = base
      ? base.soldeInitial + totalCommissions - totalPaye
      : totalCommissions - totalPaye;
    result[id] = {
      solde: Math.max(0, soldeBrut),
      creditDisponible: Math.max(0, -soldeBrut),
      totalCommissions,
      totalPaye,
    };
  });

  return result;
}