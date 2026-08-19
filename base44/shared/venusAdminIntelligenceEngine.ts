// ═══════════════════════════════════════════════════════════════════════
// VENUS Admin Intelligence Engine — Logique de détection déterministe
// Phase 5 / 5.1 / 5.1.1 — Lecture seule stricte
// Extrait de venusAdminIntelligence pour réutilisation par le scheduler push
// ═══════════════════════════════════════════════════════════════════════

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_STR = (d: Date): string => d.toISOString().split('T')[0];

export const SEUILS = {
  annulation_rate: 0.30,
  annulation_increase: 0.50,
  course_volume_change: 0.20,
  ca_change: 0.25,
  ca_week_change: 0.25,
  debt_concentration: 0.60,
  problem_courses: 3,
  dispatch_delay_min: 30,
  driver_availability_drop: 0.70,
  commission_tolerance: 0.05,
  repetitive_events: 3,
  debtors_threshold: 5,
  debt_significant_total: 50000,
  problem_course_max_age_hours: 24,
};

export interface Insight {
  id: string;
  type: string;
  priority: 'haute' | 'moyenne' | 'basse';
  confidence: 'eleve' | 'moyen' | 'faible';
  comparison: string;
  observation: string;
  analyse: string;
  recommandation: string;
  data: Record<string, any>;
  course_ids: string[];
  livreur_ids: string[];
}

/**
 * Calcule les insights VENUS Admin de manière déterministe.
 * Utilise asServiceRole pour fonctionner dans tous les contextes (user + automation).
 */
export async function computeVenusAdminInsights(
  base44: any,
  countryCode: string = 'ALL'
): Promise<{ insights: Insight[]; metrics: Record<string, any> }> {
  const entities = base44.asServiceRole.entities;

  // ── 1. Périodes ──
  const now = new Date();
  const today = DATE_STR(now);
  const yesterday = DATE_STR(new Date(now.getTime() - DAY_MS));
  const weekAgo = DATE_STR(new Date(now.getTime() - 7 * DAY_MS));
  const twoWeeksAgo = DATE_STR(new Date(now.getTime() - 14 * DAY_MS));
  const currentHour = now.getHours();

  // ── 2. Données ──
  const [allCourses, allDrivers, allPayments, recentEvents, countries] = await Promise.all([
    entities.CourseExterne.list('-created_date', 1000),
    entities.Livreur.list('-created_date', 500),
    entities.PaiementSilgapp.filter({ statut: 'traite' }),
    entities.VenusAdminEvent.list('-created_date', 50),
    entities.Country.list(),
  ]);

  const commissionByCountry: Record<string, number> = {};
  countries.forEach((c: any) => { commissionByCountry[c.code] = (c.commission_pct || 10) / 100; });

  const filterCountry = (items: any[]) => countryCode === 'ALL' ? items : items.filter(i => i.country_code === countryCode);
  const courses = filterCountry(allCourses);
  const drivers = filterCountry(allDrivers);
  const payments = filterCountry(allPayments);

  // ── 3. Métriques ──
  const coursesToday = courses.filter(c => c.created_date?.split('T')[0] === today);
  const coursesYesterday = courses.filter(c => c.created_date?.split('T')[0] === yesterday);
  const todayUpToNow = coursesToday.filter(c => new Date(c.created_date).getHours() <= currentHour);
  const yesterdayUpToSameHour = coursesYesterday.filter(c => new Date(c.created_date).getHours() <= currentHour);
  const coursesWeek = courses.filter(c => { const d = c.created_date?.split('T')[0]; return d && d >= weekAgo && d <= today; });
  const coursesPrevWeek = courses.filter(c => { const d = c.created_date?.split('T')[0]; return d && d >= twoWeeksAgo && d < weekAgo; });

  const sum = (arr: any[], key: string) => arr.reduce((s, c) => s + (c[key] || 0), 0);
  const livreesToday = coursesToday.filter(c => c.statut === 'livree');
  const livreesYesterday = coursesYesterday.filter(c => c.statut === 'livree');
  const livreesWeek = coursesWeek.filter(c => c.statut === 'livree');
  const livreesPrevWeek = coursesPrevWeek.filter(c => c.statut === 'livree');

  const caToday = sum(livreesToday, 'prix_final');
  const caYesterday = sum(livreesYesterday, 'prix_final');
  const livreesYesterdayUpToHour = yesterdayUpToSameHour.filter(c => c.statut === 'livree');
  const caYesterdayUpToHour = sum(livreesYesterdayUpToHour, 'prix_final');
  const caWeek = sum(livreesWeek, 'prix_final');
  const caPrevWeek = sum(livreesPrevWeek, 'prix_final');

  const annuleesToday = coursesToday.filter(c => c.statut === 'annulee').length;
  const annuleesYesterday = coursesYesterday.filter(c => c.statut === 'annulee').length;
  const annuleesTodayUpToNow = todayUpToNow.filter(c => c.statut === 'annulee').length;
  const annuleesYesterdayUpToHour = yesterdayUpToSameHour.filter(c => c.statut === 'annulee').length;
  const enCoursToday = coursesToday.filter(c => !['livree', 'annulee'].includes(c.statut)).length;
  const coursesTodayCount = todayUpToNow.length;
  const coursesYesterdayUpToHourCount = yesterdayUpToSameHour.length;

  const commissionsToday = sum(livreesToday, 'commission_silga');
  const commissionsWeek = sum(livreesWeek, 'commission_silga');
  const paiementsTodayTotal = sum(payments.filter(p => p.date_envoi?.split('T')[0] === today), 'montant_paye');
  const paiementsWeekTotal = sum(payments.filter(p => { const d = p.date_envoi?.split('T')[0]; return d && d >= weekAgo && d <= today; }), 'montant_paye');

  const montantsDus = sum(drivers, 'montant_du_silga');
  const debtors = drivers.filter(d => (d.montant_du_silga || 0) > 0).sort((a, b) => (b.montant_du_silga || 0) - (a.montant_du_silga || 0));
  const topDebiteurs = debtors.slice(0, 10).map(d => ({ id: d.id, nom: `${d.prenom || ''} ${d.nom || ''}`.trim() || 'N/A', montant: d.montant_du_silga, telephone: d.telephone }));
  const top3Debt = topDebiteurs.slice(0, 3).reduce((s, d) => s + (d.montant || 0), 0);
  const debtConcentration = montantsDus > 0 ? top3Debt / montantsDus : 0;

  const availableDrivers = drivers.filter(d => d.statut === 'disponible' && d.actif).length;
  const availableDriversYesterday = drivers.filter(d => d.last_seen_at && DATE_STR(new Date(d.last_seen_at)) === yesterday && d.statut === 'disponible').length;

  const nowMs = now.getTime();
  const maxAgeMs = SEUILS.problem_course_max_age_hours * 60 * 60 * 1000;
  const problemCourses = courses.filter(c =>
    (nowMs - new Date(c.created_date).getTime()) < maxAgeMs &&
    (
      (c.statut === 'recherche_livreur') ||
      (c.dispatch_status === 'cycle_epuise' && c.statut !== 'annulee')
    )
  );
  const problemCoursesCount = problemCourses.length;

  const dispatchDelayedCourses = courses.filter(c =>
    c.statut === 'recherche_livreur' &&
    (nowMs - new Date(c.created_date).getTime()) > SEUILS.dispatch_delay_min * 60 * 1000 &&
    (nowMs - new Date(c.created_date).getTime()) < maxAgeMs
  );

  const commissionAnomalies = courses.filter(c => {
    if (c.statut !== 'livree' || !c.prix_final || !c.commission_silga) return false;
    const expectedRate = commissionByCountry[c.country_code] || 0.10;
    const expectedCommission = c.prix_final * expectedRate;
    return Math.abs(c.commission_silga - expectedCommission) / Math.max(expectedCommission, 1) > SEUILS.commission_tolerance;
  });

  const eventCounts: Record<string, number> = {};
  recentEvents.forEach((e: any) => { eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1; });
  const repetitiveTypes = Object.entries(eventCounts).filter(([, count]) => count >= SEUILS.repetitive_events);

  // ── 4. Détections ──
  const insights: Insight[] = [];

  const annulationRateToday = coursesToday.length > 0 ? annuleesToday / coursesToday.length : 0;
  if (annuleesToday >= 3 && annulationRateToday > SEUILS.annulation_rate) {
    const increaseVsYesterday = annuleesYesterdayUpToHour > 0 ? ((annuleesTodayUpToNow - annuleesYesterdayUpToHour) / annuleesYesterdayUpToHour * 100) : null;
    insights.push({ id: 'annulation_hausse', type: 'annulation_hausse', priority: 'haute', confidence: 'eleve', comparison: 'today_vs_yesterday',
      observation: `${annuleesToday} annulation(s) aujourd'hui (taux: ${(annulationRateToday * 100).toFixed(0)}%)` + (increaseVsYesterday !== null ? `, soit ${increaseVsYesterday > 0 ? '+' : ''}${increaseVsYesterday.toFixed(0)}% vs même heure hier` : ''),
      analyse: 'La majorité des annulations peut indiquer un problème de disponibilité ou de dispatch',
      recommandation: 'Vérifier les courses concernées et le statut des livreurs disponibles',
      data: { annulees_today: annuleesToday, annulees_yesterday: annuleesYesterday, annulation_rate: annulationRateToday, increase_pct: increaseVsYesterday },
      course_ids: coursesToday.filter(c => c.statut === 'annulee').slice(0, 10).map(c => c.id), livreur_ids: [] });
  }

  if (coursesYesterdayUpToHourCount > 0) {
    const volumeChange = (coursesTodayCount - coursesYesterdayUpToHourCount) / coursesYesterdayUpToHourCount;
    if (Math.abs(volumeChange) > SEUILS.course_volume_change) {
      insights.push({ id: 'volume_courses', type: volumeChange > 0 ? 'volume_hausse' : 'volume_baisse', priority: 'moyenne', confidence: 'eleve', comparison: 'now_vs_yesterday_hour',
        observation: `${coursesTodayCount} courses créées jusqu'à présent aujourd'hui vs ${coursesYesterdayUpToHourCount} à la même heure hier (${volumeChange > 0 ? '+' : ''}${(volumeChange * 100).toFixed(0)}%)`,
        analyse: volumeChange > 0 ? "L'activité est en hausse significative" : "L'activité est en baisse significative",
        recommandation: volumeChange > 0 ? 'Surveiller la capacité de dispatch' : 'Vérifier les causes potentielles',
        data: { courses_today: coursesTodayCount, courses_yesterday_hour: coursesYesterdayUpToHourCount, change_pct: volumeChange },
        course_ids: [], livreur_ids: [] });
    }
  }

  if (caYesterdayUpToHour > 0) {
    const caChange = (caToday - caYesterdayUpToHour) / caYesterdayUpToHour;
    if (Math.abs(caChange) > SEUILS.ca_change) {
      insights.push({ id: 'ca_evolution', type: caChange > 0 ? 'ca_hausse' : 'ca_baisse', priority: caChange < 0 ? 'haute' : 'moyenne', confidence: 'eleve', comparison: 'today_vs_yesterday_same_hour',
        observation: `CA aujourd'hui à ${currentHour}h: ${caToday} F CFA vs ${caYesterdayUpToHour} F CFA à la même heure hier (${caChange > 0 ? '+' : ''}${(caChange * 100).toFixed(0)}%)`,
        analyse: caChange < 0 ? 'Baisse significative du chiffre d\'affaires à heure équivalente' : 'Hausse significative du chiffre d\'affaires à heure équivalente',
        recommandation: caChange < 0 ? 'Analyser les causes (annulations, moins de courses, prix plus bas)' : 'Maintenir la dynamique',
        data: { ca_today: caToday, ca_yesterday_same_hour: caYesterdayUpToHour, ca_yesterday_full: caYesterday, change_pct: caChange, current_hour: currentHour },
        course_ids: [], livreur_ids: [] });
    }
  }

  if (caPrevWeek > 0) {
    const caWeekChange = (caWeek - caPrevWeek) / caPrevWeek;
    if (Math.abs(caWeekChange) > SEUILS.ca_week_change) {
      insights.push({ id: 'ca_week_evolution', type: caWeekChange > 0 ? 'ca_week_hausse' : 'ca_week_baisse', priority: 'moyenne', confidence: 'eleve', comparison: 'week_vs_prev_week',
        observation: `CA des 7 derniers jours: ${caWeek} F CFA vs ${caPrevWeek} F CFA la semaine précédente (${caWeekChange > 0 ? '+' : ''}${(caWeekChange * 100).toFixed(0)}%)`,
        analyse: caWeekChange < 0 ? 'Baisse significative du chiffre d\'affaires hebdomadaire' : 'Hausse significative du chiffre d\'affaires hebdomadaire',
        recommandation: caWeekChange < 0 ? 'Analyser la tendance hebdomadaire' : 'Maintenir la dynamique',
        data: { ca_week: caWeek, ca_prev_week: caPrevWeek, change_pct: caWeekChange },
        course_ids: [], livreur_ids: [] });
    }
  }

  if (debtors.length >= SEUILS.debtors_threshold && montantsDus >= SEUILS.debt_significant_total) {
    insights.push({ id: 'dette_accumulation', type: 'dette_accumulation', priority: 'moyenne', confidence: 'eleve', comparison: 'snapshot',
      observation: `${debtors.length} livreurs doivent un total de ${montantsDus} F CFA à SILGAPP`,
      analyse: "L'accumulation des montants dus peut affecter la trésorerie",
      recommandation: 'Envisager des relances auprès des livreurs les plus endettés',
      data: { total_dette: montantsDus, nb_debiteurs: debtors.length },
      course_ids: [], livreur_ids: topDebiteurs.slice(0, 5).map(d => d.id) });
  }

  if (montantsDus >= SEUILS.debt_significant_total && debtConcentration > SEUILS.debt_concentration) {
    insights.push({ id: 'dette_concentration', type: 'dette_concentration', priority: 'moyenne', confidence: 'eleve', comparison: 'snapshot',
      observation: `Les 3 livreurs les plus endettés concentrent ${(debtConcentration * 100).toFixed(0)}% de la dette totale (${top3Debt} F CFA sur ${montantsDus} F CFA)`,
      analyse: 'La concentration de la dette sur quelques livreurs augmente le risque de non-recouvrement',
      recommandation: 'Prioriser le recouvrement auprès de ces livreurs',
      data: { top3_debt: top3Debt, total_debt: montantsDus, concentration_pct: debtConcentration },
      course_ids: [], livreur_ids: topDebiteurs.slice(0, 3).map(d => d.id) });
  }

  if (problemCoursesCount >= SEUILS.problem_courses) {
    insights.push({ id: 'courses_problematiques', type: 'courses_problematiques', priority: 'haute', confidence: 'eleve', comparison: 'snapshot',
      observation: `${problemCoursesCount} courses problématiques (en recherche de livreur, annulées, ou dispatch épuisé)`,
      analyse: 'Plusieurs courses simultanées nécessitent une attention immédiate',
      recommandation: 'Vérifier les courses concernées et le statut des livreurs',
      data: { count: problemCoursesCount },
      course_ids: problemCourses.slice(0, 10).map(c => c.id), livreur_ids: [] });
  }

  if (dispatchDelayedCourses.length > 0) {
    insights.push({ id: 'dispatch_retard', type: 'dispatch_retard', priority: 'haute', confidence: 'eleve', comparison: 'snapshot',
      observation: `${dispatchDelayedCourses.length} course(s) en recherche de livreur depuis plus de ${SEUILS.dispatch_delay_min} minutes`,
      analyse: "Le délai de dispatch est anormalement long, ce qui peut indiquer un manque de disponibilité",
      recommandation: 'Vérifier le nombre de livreurs disponibles et leur GPS',
      data: { count: dispatchDelayedCourses.length, threshold_min: SEUILS.dispatch_delay_min },
      course_ids: dispatchDelayedCourses.slice(0, 10).map(c => c.id), livreur_ids: [] });
  }

  if (availableDriversYesterday > 0 && availableDrivers < availableDriversYesterday * SEUILS.driver_availability_drop) {
    insights.push({ id: 'livreurs_dispo_baisse', type: 'livreurs_dispo_baisse', priority: 'moyenne', confidence: 'moyen', comparison: 'today_vs_yesterday',
      observation: `${availableDrivers} livreurs disponibles aujourd'hui vs ${availableDriversYesterday} hier`,
      analyse: "La baisse du nombre de livreurs disponibles peut affecter le dispatch",
      recommandation: 'Vérifier le statut GPS et la connexion des livreurs',
      data: { today: availableDrivers, yesterday: availableDriversYesterday },
      course_ids: [], livreur_ids: [] });
  }

  if (commissionAnomalies.length > 0) {
    insights.push({ id: 'commission_anomalie', type: 'commission_anomalie', priority: 'basse', confidence: 'eleve', comparison: 'snapshot',
      observation: `${commissionAnomalies.length} course(s) livrée(s) avec une commission anormale (écart > ${(SEUILS.commission_tolerance * 100).toFixed(0)}% vs taux attendu)`,
      analyse: "Des écarts de commission peuvent indiquer des erreurs de configuration",
      recommandation: 'Vérifier les configurations de commission par pays',
      data: { count: commissionAnomalies.length },
      course_ids: commissionAnomalies.slice(0, 5).map(c => c.id), livreur_ids: [] });
  }

  if (repetitiveTypes.length > 0) {
    insights.push({ id: 'events_repetitifs', type: 'events_repetitifs', priority: 'basse', confidence: 'moyen', comparison: 'snapshot',
      observation: `${repetitiveTypes.length} type(s) d'événement(s) répétitif(s): ${repetitiveTypes.map(([t, c]) => `${t} (${c}x)`).join(', ')}`,
      analyse: "La répétition d'événements identiques peut révéler un problème opérationnel",
      recommandation: 'Analyser les causes sous-jacentes',
      data: { types: repetitiveTypes },
      course_ids: [], livreur_ids: [] });
  }

  const priorityOrder = { haute: 0, moyenne: 1, basse: 2 };
  insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const driverStats: Record<string, any> = {};
  courses.filter(c => c.statut === 'livree' && c.livreur_id).forEach(c => {
    if (!driverStats[c.livreur_id]) driverStats[c.livreur_id] = { nom: c.livreur_nom || 'N/A', count: 0, revenu: 0 };
    driverStats[c.livreur_id].count += 1;
    driverStats[c.livreur_id].revenu += c.prix_final || 0;
  });
  const topLivreurs = Object.values(driverStats).sort((a: any, b: any) => b.count - a.count).slice(0, 10);

  const metrics = {
    periode: { today, yesterday, weekAgo, twoWeeksAgo, currentHour },
    financials: {
      today: { ca: caToday, livrees: livreesToday.length, annulees: annuleesToday, en_cours: enCoursToday, commissions: commissionsToday, paiements_recus: paiementsTodayTotal, courses_count: coursesTodayCount },
      yesterday: { ca: caYesterday, annulees: annuleesYesterday, courses_up_to_hour: coursesYesterdayUpToHourCount },
      this_week: { ca: caWeek, commissions: commissionsWeek, paiements_recus: paiementsWeekTotal },
      last_week: { ca: caPrevWeek },
      debt: { total: montantsDus, debtors_count: debtors.length, top3_concentration: debtConcentration },
    },
    top_debiteurs: topDebiteurs,
    top_livreurs: topLivreurs,
    courses_problematiques: problemCourses.slice(0, 5).map(c => ({ id: c.id, statut: c.statut, client: c.client_nom, adresse_depart: c.adresse_depart, prix: c.prix_final, livreur: c.livreur_nom, dispatch_status: c.dispatch_status, notes: c.notes, created_date: c.created_date })),
    drivers: { available: availableDrivers, total: drivers.length },
    seuils: SEUILS,
  };

  return { insights: insights.slice(0, 5), metrics };
}