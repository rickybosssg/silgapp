// PHASE 3 VENUS ADMIN — Rapports automatiques et synthèses de direction
// READ → ANALYZE → INFORM
// Calculs 100% déterministes. Aucune IA pour calculer les montants.
// Sources officielles: CourseExterne.prix_final, CourseExterne.commission_silga,
//                      Livreur.montant_du_silga, PaiementSilgapp
// Aucun pouvoir d'action autonome. Aucune modification de données métier.
// VENUS WhatsApp reste 100% inchangée.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_STR = (d) => d.toISOString().split('T')[0];

export default async function handler(req) {
  const body = await req.json().catch(() => ({}));
  const type = body.type || 'matin';
  const countryCode = body.country_code || 'ALL';

  const base44 = createClientFromRequest(req);

  const currentUser = await base44.auth.me().catch(() => null);
  if (!currentUser || currentUser.role !== 'admin') {
    return Response.json(
      { success: false, error: 'Accès refusé — les rapports VENUS sont réservés à l\'administrateur' },
      { status: 403 }
    );
  }

  // ── 1. Calcul des périodes ──
  const now = new Date();
  const today = new Date(now.getTime());
  const yesterday = new Date(now.getTime() - DAY_MS);
  const dayBefore = new Date(now.getTime() - 2 * DAY_MS);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS);

  let periodeDebut, periodeFin, compDebut, compFin;

  if (type === 'matin') {
    periodeDebut = DATE_STR(yesterday); periodeFin = DATE_STR(yesterday);
    compDebut = DATE_STR(dayBefore); compFin = DATE_STR(dayBefore);
  } else if (type === 'soir') {
    periodeDebut = DATE_STR(today); periodeFin = DATE_STR(today);
    compDebut = DATE_STR(yesterday); compFin = DATE_STR(yesterday);
  } else if (type === 'journee') {
    periodeDebut = DATE_STR(today); periodeFin = DATE_STR(today);
    compDebut = DATE_STR(yesterday); compFin = DATE_STR(yesterday);
  } else if (type === 'hebdomadaire') {
    periodeDebut = DATE_STR(weekAgo); periodeFin = DATE_STR(today);
    compDebut = DATE_STR(twoWeeksAgo); compFin = DATE_STR(weekAgo);
  } else {
    return Response.json({ success: false, error: `Type inconnu: ${type}` }, { status: 400 });
  }

  // ── 2. Anti-spam — vérifier si un rapport existe déjà pour cette période ──
  const existing = await base44.entities.VenusRapport.filter({
    sous_type: type,
    periode_debut: periodeDebut,
  });
  if (existing && existing.length > 0) {
    return Response.json({ success: true, message: 'Rapport déjà généré', rapport_id: existing[0].id });
  }

  // ── 3. Récupération des données sources ──
  const allCourses = await base44.entities.CourseExterne.list('-created_date', 2000);
  const allDrivers = await base44.entities.Livreur.list('-created_date', 500);
  const allPayments = await base44.entities.PaiementSilgapp.filter({ statut: 'traite' });

  const filterByCountry = (items) => {
    if (countryCode === 'ALL') return items;
    return items.filter(i => i.country_code === countryCode);
  };

  const filterByPeriod = (items, debut, fin) => {
    return items.filter(i => {
      const d = i.created_date?.split('T')[0];
      return d && d >= debut && d <= fin;
    });
  };

  const courses = filterByCountry(allCourses);
  const drivers = filterByCountry(allDrivers);
  const payments = filterByCountry(allPayments).filter(p => {
    const d = p.date_envoi?.split('T')[0];
    return d && d >= periodeDebut && d <= periodeFin;
  });

  // ── 4. Calculs déterministes ──
  const periodCourses = filterByPeriod(courses, periodeDebut, periodeFin);
  const compCourses = filterByPeriod(courses, compDebut, compFin);

  const coursesCrees = periodCourses.length;
  const coursesLivrees = periodCourses.filter(c => c.statut === 'livree').length;
  const coursesAnnulees = periodCourses.filter(c => c.statut === 'annulee').length;
  const coursesEnCours = periodCourses.filter(c => !['livree', 'annulee'].includes(c.statut)).length;

  // CA = sum prix_final des courses livrées (source officielle)
  const ca = periodCourses
    .filter(c => c.statut === 'livree')
    .reduce((sum, c) => sum + (c.prix_final || 0), 0);

  // Commissions = sum commission_silga des courses livrées (source officielle)
  const commissions = periodCourses
    .filter(c => c.statut === 'livree')
    .reduce((sum, c) => sum + (c.commission_silga || 0), 0);

  // Montants dus = sum montant_du_silga de tous les livreurs (source officielle)
  const montantsDus = drivers.reduce((sum, d) => sum + (d.montant_du_silga || 0), 0);
  const nbLivreursDette = drivers.filter(d => (d.montant_du_silga || 0) > 0).length;

  // Paiements reçus = sum montant_paye des PaiementSilgapp traités (source officielle)
  const paiementsRecus = payments.reduce((sum, p) => sum + (p.montant_paye || 0), 0);

  const livreursDispo = drivers.filter(d => d.statut === 'disponible' && d.actif).length;

  // Comparaison veille
  const compCa = compCourses.filter(c => c.statut === 'livree').reduce((sum, c) => sum + (c.prix_final || 0), 0);
  const compAnnulees = compCourses.filter(c => c.statut === 'annulee').length;
  const compCrees = compCourses.length;

  const caEvol = compCa > 0 ? Math.round(((ca - compCa) / compCa) * 100) : 0;
  const annulEvol = compAnnulees > 0 ? Math.round(((coursesAnnulees - compAnnulees) / compAnnulees) * 100) : 0;
  const volEvol = compCrees > 0 ? Math.round(((coursesCrees - compCrees) / compCrees) * 100) : 0;

  // Top livreurs actifs
  const driverCounts = {};
  periodCourses.filter(c => c.statut === 'livree' && c.livreur_id).forEach(c => {
    const id = c.livreur_id;
    if (!driverCounts[id]) driverCounts[id] = { nom: c.livreur_nom || 'N/A', count: 0 };
    driverCounts[id].count += 1;
  });
  const topDrivers = Object.values(driverCounts).sort((a, b) => b.count - a.count).slice(0, 5);

  // ── 5. Point intelligent en journée — ne pas envoyer si rien d'intéressant ──
  if (type === 'journee') {
    const alerts = [];
    if (volEvol > 20) alerts.push(`activité supérieure de ${volEvol} % à hier`);
    if (volEvol < -20) alerts.push(`activité inférieure de ${Math.abs(volEvol)} % à hier`);
    if (annulEvol > 50) alerts.push(`hausse des annulations de ${annulEvol} %`);
    const blocked = periodCourses.filter(c => c.statut === 'recherche_livreur').length;
    if (blocked > 3) alerts.push(`${blocked} courses bloquées en recherche de livreur`);
    if (montantsDus > 50000) alerts.push(`montant dû important : ${montantsDus.toLocaleString('fr-FR')} F CFA`);
    if (ca > 100000) alerts.push(`seuil de CA franchi : ${ca.toLocaleString('fr-FR')} F CFA`);

    if (alerts.length === 0) {
      return Response.json({ success: true, message: 'Rien à signaler', type: 'journee' });
    }

    const resume = `Eric, point de la journée : ${alerts.join(' ; ')}.`;

    const contenu = {
      courses_crees: coursesCrees, courses_livrees: coursesLivrees,
      courses_annulees: coursesAnnulees, ca, commissions,
      montants_dus: montantsDus, paiements_recus: paiementsRecus,
      alerts, comparison: { ca_evol: caEvol, annul_evol: annulEvol, vol_evol: volEvol },
      sources: ['CourseExterne.prix_final', 'CourseExterne.commission_silga', 'Livreur.montant_du_silga', 'PaiementSilgapp'],
    };

    const rapport = await base44.entities.VenusRapport.create({
      type_rapport: 'quotidien', sous_type: 'journee', country_code: countryCode,
      periode_debut: periodeDebut, periode_fin: periodeFin,
      resume, contenu_json: JSON.stringify(contenu),
      statut_lecture: 'non_lu', genere_par: 'venus-admin',
    });

    return Response.json({ success: true, rapport_id: rapport.id, resume, type: 'journee' });
  }

  // ── 6. Construction du résumé déterministe ──
  const fmt = (n) => n.toLocaleString('fr-FR');
  let resume = `Bonjour Eric. `;

  if (type === 'matin') {
    resume += `Hier, SILGAPP a enregistré ${coursesCrees} courses, dont ${coursesLivrees} livrées et ${coursesAnnulees} annulées. `;
    resume += `Le chiffre d'affaires s'élève à ${fmt(ca)} F CFA. `;
    resume += `Les commissions SILGAPP représentent ${fmt(commissions)} F CFA. `;
    resume += `${nbLivreursDette} livreur${nbLivreursDette > 1 ? 's ont' : ' a'} encore un montant à reverser. `;
    resume += `${livreursDispo} livreur${livreursDispo > 1 ? 's' : ''} disponible${livreursDispo > 1 ? 's' : ''} actuellement.`;
    if (caEvol !== 0) resume += ` Le volume est ${caEvol > 0 ? 'supérieur' : 'inférieur'} de ${Math.abs(caEvol)} % à la veille.`;
    if (annulEvol > 0) resume += ` Les annulations ont également augmenté de ${annulEvol} %.`;
  } else if (type === 'soir') {
    resume += `Aujourd'hui, SILGAPP a enregistré ${coursesCrees} courses, dont ${coursesLivrees} livrées et ${coursesAnnulees} annulées. `;
    resume += `${coursesEnCours} course${coursesEnCours > 1 ? 's' : ''} en cours. `;
    resume += `CA total : ${fmt(ca)} F CFA. `;
    resume += `Commission SILGAPP : ${fmt(commissions)} F CFA. `;
    resume += `Montants encaissés : ${fmt(paiementsRecus)} F CFA. `;
    resume += `Montants restant dus : ${fmt(montantsDus)} F CFA. `;
    if (topDrivers.length > 0) resume += `Top livreur : ${topDrivers[0].nom} (${topDrivers[0].count} courses). `;
    if (caEvol !== 0) resume += `CA ${caEvol > 0 ? 'en hausse' : 'en baisse'} de ${Math.abs(caEvol)} % vs hier.`;
  } else if (type === 'hebdomadaire') {
    resume += `Cette semaine, SILGAPP a enregistré ${coursesCrees} courses, dont ${coursesLivrees} livrées et ${coursesAnnulees} annulées. `;
    resume += `CA total : ${fmt(ca)} F CFA. `;
    resume += `Commissions : ${fmt(commissions)} F CFA. `;
    resume += `Montants dus : ${fmt(montantsDus)} F CFA. `;
    if (volEvol !== 0) resume += ` Volume ${volEvol > 0 ? 'en hausse' : 'en baisse'} de ${Math.abs(volEvol)} % vs semaine précédente.`;
  }

  const contenu = {
    courses_crees: coursesCrees, courses_livrees: coursesLivrees,
    courses_annulees: coursesAnnulees, courses_en_cours: coursesEnCours,
    ca, commissions, montants_dus: montantsDus, nb_livreurs_dette: nbLivreursDette,
    paiements_recus: paiementsRecus, livreurs_disponibles: livreursDispo,
    top_livreurs: topDrivers,
    comparison: { ca_evol: caEvol, annul_evol: annulEvol, vol_evol: volEvol },
    sources: ['CourseExterne.prix_final', 'CourseExterne.commission_silga', 'Livreur.montant_du_silga', 'PaiementSilgapp'],
  };

  const rapport = await base44.entities.VenusRapport.create({
    type_rapport: type === 'hebdomadaire' ? 'hebdomadaire' : 'quotidien',
    sous_type: type, country_code: countryCode,
    periode_debut: periodeDebut, periode_fin: periodeFin,
    resume, contenu_json: JSON.stringify(contenu),
    statut_lecture: 'non_lu', genere_par: 'venus-admin',
  });

  return Response.json({ success: true, rapport_id: rapport.id, resume, type });
}
