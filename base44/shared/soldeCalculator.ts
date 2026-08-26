// ═══════════════════════════════════════════════════════════════════════════
// SOLDE CALCULATOR — Formule financière unique (READ-ONLY)
// ═══════════════════════════════════════════════════════════════════════════
//
// RÈGLE MÉTIER DÉFINITIVE (correction 26/08/2026) :
//
//   Un paiement traité règle le dû existant AU MOMENT DU PAIEMENT.
//   Si le paiement dépasse le dû, seul le montant explicitement enregistré
//   dans credit_surplus peut servir à payer des commissions futures.
//   Un ancien paiement ne doit JAMAIS continuer à être soustrait indéfiniment
//   des nouvelles commissions.
//
// ALGORITHME — Traitement chronologique des événements :
//
//   1. balance = base_comptable_solde_initial
//   2. Trier tous les événements (commissions + paiements) par date croissante
//   3. Pour chaque événement :
//      - Commission : balance += amount
//      - Paiement : balance -= amount
//        Si balance < 0, balance = 0 (l'excès n'est PAS reporté)
//   4. raw_solde = max(0, balance)
//   5. credit_surplus est appliqué comme CAP final : solde = max(0, raw_solde - credit_surplus)
//      credit_surplus n'est JAMAIS modifié ni consommé — il reste à sa valeur DB.
//
// IDEMPOTENCE : credit_surplus étant lu (jamais écrit), 2 recalculs successifs
// produisent rigoureusement le même résultat.
//
// CONSEQUENCE : un paiement effectué avant une nouvelle commission (sans dû
// existant à ce moment) est "consommé" et ne peut pas annuler une commission
// future. Seul credit_surplus (validé par l'admin) peut absorber les futures
// commissions, en tant que cap sur le solde final.
//
// RÈGLE D'IMMUTABILITÉ :
//   livreur_financier_id est renseigné à la livraison et JAMAIS modifié ensuite.
//   livreur_id peut évoluer (redispatch, annulation, nettoyage) — il n'est utilisé
//   que comme fallback pour les courses non encore backfillées.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Clé financière d'une course : livreur_financier_id en priorité, fallback livreur_id.
 */
function getLivreurFinancierId(course: any): string {
  return course.livreur_financier_id || course.livreur_id || '';
}

/**
 * Traite les événements chronologiquement et calcule le solde final.
 * Logique partagée entre calculerSoldeLivreur et calculerSoldesLivreursBatch.
 */
function processTimeline(
  baseSoldeInitial: number,
  rawCreditSurplus: number,
  events: { type: 'commission' | 'payment'; date: string; amount: number }[]
): { solde: number; creditSurplus: number; totalCommissions: number; totalPaye: number } {
  let balance = baseSoldeInitial;
  let totalCommissions = 0;
  let totalPaye = 0;

  // Trier par date croissante
  const sorted = [...events].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return da - db;
  });

  for (const e of sorted) {
    if (e.type === 'commission') {
      totalCommissions += e.amount;
      balance += e.amount;
    } else {
      totalPaye += e.amount;
      balance -= e.amount;
      // L'excès n'est PAS reporté — un paiement ne peut pas créer un crédit implicite
      if (balance < 0) balance = 0;
    }
  }

  // Le credit_surplus est un CAP appliqué à la fin — il n'est JAMAIS consommé
  // ni réécrit. Cela garantit l'idempotence : 2 recalculs successifs = 0 modification.
  const rawSolde = Math.max(0, balance);
  const solde = rawCreditSurplus > 0 ? Math.max(0, rawSolde - rawCreditSurplus) : rawSolde;

  return {
    solde,
    creditSurplus: rawCreditSurplus, // Inchangé — jamais modifié par le calcul
    totalCommissions,
    totalPaye,
  };
}

/**
 * Calcule le solde dû et le crédit disponible d'un livreur SANS écrire en DB.
 */
export async function calculerSoldeLivreur(base44: any, livreurId: string): Promise<{
  solde: number;
  creditDisponible: number;
  creditSurplus: number;
  totalCommissions: number;
  totalPaye: number;
}> {
  if (!livreurId) {
    return { solde: 0, creditDisponible: 0, creditSurplus: 0, totalCommissions: 0, totalPaye: 0 };
  }

  // 0. Récupérer le livreur
  const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
  const baseDate = livreur?.base_comptable_date || null;
  const baseSoldeInitial = Number(livreur?.base_comptable_solde_initial) || 0;
  const rawCreditSurplus = Number(livreur?.credit_surplus) || 0;

  // Cut-off comptable obligatoire — si pas de base définie, aucun dû reconnu
  if (!baseDate) {
    return { solde: 0, creditDisponible: 0, creditSurplus: 0, totalCommissions: 0, totalPaye: 0 };
  }

  // 1. Courses livrées (par livreur_financier_id ET livreur_id, dédupliquées)
  const coursesByFinancier = await base44.asServiceRole.entities.CourseExterne.filter(
    { livreur_financier_id: livreurId, statut: 'livree' },
    'heure_livraison', 500
  ).catch(() => []);

  const coursesByLivreurId = await base44.asServiceRole.entities.CourseExterne.filter(
    { livreur_id: livreurId, statut: 'livree' },
    'heure_livraison', 500
  ).catch(() => []);

  const seenIds = new Set<string>();
  const allCourses: any[] = [];
  for (const c of (coursesByFinancier || [])) {
    if (!seenIds.has(c.id)) { seenIds.add(c.id); allCourses.push(c); }
  }
  for (const c of (coursesByLivreurId || [])) {
    if (!seenIds.has(c.id)) { seenIds.add(c.id); allCourses.push(c); }
  }

  // Filtrer par base comptable
  const coursesForCalc = allCourses.filter((c: any) => {
    const d = c.heure_livraison || c.colis_livre_at || c.created_date;
    return d && new Date(d) >= new Date(baseDate);
  });

  // 2. Paiements traités
  const paiements = await base44.asServiceRole.entities.PaiementSilgapp.filter(
    { user_id: livreurId, statut: 'traite', type_dette: 'commission_livreur' },
    '-date_envoi', 500
  ).catch(() => []);

  const paiementsForCalc = (paiements || []).filter((p: any) => {
    const d = p.traite_at || p.date_envoi;
    return d && new Date(d) >= new Date(baseDate);
  });

  // 3. Construire la timeline chronologique
  const events: { type: 'commission' | 'payment'; date: string; amount: number }[] = [
    ...coursesForCalc.map((c: any) => ({
      type: 'commission' as const,
      date: c.heure_livraison || c.colis_livre_at || c.created_date,
      amount: Number(c.commission_silga) || 0,
    })),
    ...paiementsForCalc.map((p: any) => ({
      type: 'payment' as const,
      date: p.traite_at || p.date_envoi,
      amount: Number(p.montant_paye) || 0,
    })),
  ];

  // 4. Traiter chronologiquement
  const { solde, creditSurplus, totalCommissions, totalPaye } = processTimeline(
    baseSoldeInitial,
    rawCreditSurplus,
    events
  );

  return { solde, creditDisponible: 0, creditSurplus, totalCommissions, totalPaye };
}

/**
 * Calcule le solde pour TOUS les livreurs d'un pays en une seule passe.
 */
export async function calculerSoldesLivreursBatch(
  base44: any,
  countryCode: string | null
): Promise<Record<string, { solde: number; creditDisponible: number; creditSurplus: number; totalCommissions: number; totalPaye: number }>> {
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
  const creditSurplusMap: Record<string, number> = {};
  for (const id of livreurIds) {
    const l = await base44.asServiceRole.entities.Livreur.get(id).catch(() => null);
    if (l?.base_comptable_date) {
      livreursAvecBase[id] = {
        date: l.base_comptable_date,
        soldeInitial: Number(l.base_comptable_solde_initial) || 0,
      };
    }
    creditSurplusMap[id] = Number(l?.credit_surplus) || 0;
  }

  // 4. Grouper les événements par livreur (filtrés par base comptable)
  const eventsByDriver: Record<string, { type: 'commission' | 'payment'; date: string; amount: number }[]> = {};

  (allCourses || []).forEach((c: any) => {
    const fid = getLivreurFinancierId(c);
    if (!fid) return;
    const base = livreursAvecBase[fid];
    if (!base) return; // Pas de base comptable → ignoré
    const d = c.heure_livraison || c.colis_livre_at || c.created_date;
    if (!d || new Date(d) < new Date(base.date)) return; // Avant base → ignoré

    if (!eventsByDriver[fid]) eventsByDriver[fid] = [];
    eventsByDriver[fid].push({
      type: 'commission',
      date: d,
      amount: Number(c.commission_silga) || 0,
    });
  });

  (allPaiements || []).forEach((p: any) => {
    if (!p.user_id) return;
    const base = livreursAvecBase[p.user_id];
    if (!base) return;
    const d = p.traite_at || p.date_envoi;
    if (!d || new Date(d) < new Date(base.date)) return;

    if (!eventsByDriver[p.user_id]) eventsByDriver[p.user_id] = [];
    eventsByDriver[p.user_id].push({
      type: 'payment',
      date: d,
      amount: Number(p.montant_paye) || 0,
    });
  });

  // 5. Traiter chronologiquement par livreur
  const allIds = new Set<string>([
    ...Object.keys(eventsByDriver),
    ...Object.keys(livreursAvecBase),
  ]);

  const result: Record<string, any> = {};
  allIds.forEach(id => {
    const base = livreursAvecBase[id];
    if (!base) {
      result[id] = { solde: 0, creditDisponible: 0, creditSurplus: 0, totalCommissions: 0, totalPaye: 0 };
      return;
    }

    const { solde, creditSurplus, totalCommissions, totalPaye } = processTimeline(
      base.soldeInitial,
      creditSurplusMap[id] || 0,
      eventsByDriver[id] || []
    );

    result[id] = {
      solde,
      creditDisponible: 0,
      creditSurplus: creditSurplus,
      totalCommissions,
      totalPaye,
    };
  });

  return result;
}