// PHASE 4 VENUS ADMIN — Conversation contextuelle (READ ONLY)
// VENUS répond aux questions d'Eric sur les rapports, événements et données SILGAPP.
// Aucune modification. Aucune action. Lecture seule stricte.
// Sources officielles: CourseExterne.prix_final, CourseExterne.commission_silga,
//                      Livreur.montant_du_silga, PaiementSilgapp.montant_paye (statut=traite)
// VENUS WhatsApp reste 100% inchangée.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_STR = (d) => d.toISOString().split('T')[0];

export default async function handler(req) {
  const body = await req.json().catch(() => ({}));
  const message = body.message || '';
  const history = Array.isArray(body.history) ? body.history : [];
  const countryCode = body.country_code || 'ALL';

  if (!message) {
    return Response.json({ success: false, error: 'Message requis' }, { status: 400 });
  }

  const base44 = createClientFromRequest(req);

  // ── 1. Périodes ──
  const now = new Date();
  const today = DATE_STR(now);
  const yesterday = DATE_STR(new Date(now.getTime() - DAY_MS));
  const weekAgo = DATE_STR(new Date(now.getTime() - 7 * DAY_MS));
  const twoWeeksAgo = DATE_STR(new Date(now.getTime() - 14 * DAY_MS));

  // ── 2. Récupération des données (sources officielles) ──
  const [allCourses, allDrivers, allPayments, recentEvents, recentReports] = await Promise.all([
    base44.entities.CourseExterne.list('-created_date', 1000),
    base44.entities.Livreur.list('-created_date', 500),
    base44.entities.PaiementSilgapp.filter({ statut: 'traite' }),
    base44.entities.VenusAdminEvent.list('-created_date', 20),
    base44.entities.VenusRapport.list('-created_date', 10),
  ]);

  const filterCountry = (items) =>
    countryCode === 'ALL' ? items : items.filter(i => i.country_code === countryCode);
  const courses = filterCountry(allCourses);
  const drivers = filterCountry(allDrivers);
  const payments = filterCountry(allPayments);

  // ── 3. Calculs déterministes ──
  const coursesToday = courses.filter(c => c.created_date?.split('T')[0] === today);
  const coursesYesterday = courses.filter(c => c.created_date?.split('T')[0] === yesterday);
  const coursesWeek = courses.filter(c => {
    const d = c.created_date?.split('T')[0];
    return d && d >= weekAgo && d <= today;
  });
  const coursesPrevWeek = courses.filter(c => {
    const d = c.created_date?.split('T')[0];
    return d && d >= twoWeeksAgo && d < weekAgo;
  });

  const caToday = coursesToday.filter(c => c.statut === 'livree').reduce((s, c) => s + (c.prix_final || 0), 0);
  const caYesterday = coursesYesterday.filter(c => c.statut === 'livree').reduce((s, c) => s + (c.prix_final || 0), 0);
  const caWeek = coursesWeek.filter(c => c.statut === 'livree').reduce((s, c) => s + (c.prix_final || 0), 0);
  const caPrevWeek = coursesPrevWeek.filter(c => c.statut === 'livree').reduce((s, c) => s + (c.prix_final || 0), 0);

  const livreesToday = coursesToday.filter(c => c.statut === 'livree').length;
  const annuleesToday = coursesToday.filter(c => c.statut === 'annulee').length;
  const annuleesYesterday = coursesYesterday.filter(c => c.statut === 'annulee').length;
  const annuleesWeek = coursesWeek.filter(c => c.statut === 'annulee').length;
  const enCoursToday = coursesToday.filter(c => !['livree', 'annulee'].includes(c.statut)).length;

  const commissionsToday = coursesToday.filter(c => c.statut === 'livree').reduce((s, c) => s + (c.commission_silga || 0), 0);
  const commissionsWeek = coursesWeek.filter(c => c.statut === 'livree').reduce((s, c) => s + (c.commission_silga || 0), 0);

  const montantsDus = drivers.reduce((s, d) => s + (d.montant_du_silga || 0), 0);
  const paiementsToday = payments.filter(p => p.date_envoi?.split('T')[0] === today).reduce((s, p) => s + (p.montant_paye || 0), 0);
  const paiementsWeek = payments.filter(p => {
    const d = p.date_envoi?.split('T')[0];
    return d && d >= weekAgo && d <= today;
  }).reduce((s, p) => s + (p.montant_paye || 0), 0);

  // Top débiteurs (Livreur.montant_du_silga — source officielle)
  const topDebiteurs = drivers
    .filter(d => (d.montant_du_silga || 0) > 0)
    .sort((a, b) => (b.montant_du_silga || 0) - (a.montant_du_silga || 0))
    .slice(0, 10)
    .map(d => ({
      nom: `${d.prenom || ''} ${d.nom || ''}`.trim() || 'N/A',
      montant: d.montant_du_silga,
      telephone: d.telephone,
    }));

  // Top livreurs (par nombre de courses livrées)
  const driverStats = {};
  courses.filter(c => c.statut === 'livree' && c.livreur_id).forEach(c => {
    const id = c.livreur_id;
    if (!driverStats[id]) driverStats[id] = { nom: c.livreur_nom || 'N/A', count: 0, revenu: 0 };
    driverStats[id].count += 1;
    driverStats[id].revenu += c.prix_final || 0;
  });
  const topLivreurs = Object.values(driverStats).sort((a, b) => b.count - a.count).slice(0, 10);

  // Courses problématiques
  const coursesProblematiques = courses
    .filter(c => c.statut === 'recherche_livreur' || c.statut === 'annulee' || c.dispatch_status === 'cycle_epuise')
    .slice(0, 5)
    .map(c => ({
      id: c.id,
      statut: c.statut,
      client: c.client_nom,
      adresse_depart: c.adresse_depart,
      prix: c.prix_final,
      livreur: c.livreur_nom,
      dispatch_status: c.dispatch_status,
      notes: c.notes,
      created_date: c.created_date,
    }));

  // ── 4. Contexte pour le LLM ──
  const contextData = {
    periode: { today, yesterday, weekAgo, twoWeeksAgo },
    financials: {
      today: { ca: caToday, livrees: livreesToday, annulees: annuleesToday, en_cours: enCoursToday, commissions: commissionsToday, paiements_recus: paiementsToday },
      yesterday: { ca: caYesterday, annulees: annuleesYesterday },
      this_week: { ca: caWeek, commissions: commissionsWeek, annulees: annuleesWeek, paiements_recus: paiementsWeek },
      last_week: { ca: caPrevWeek },
      montants_dus_total: montantsDus,
      nb_livreurs_endette: topDebiteurs.length,
    },
    top_debiteurs: topDebiteurs,
    top_livreurs: topLivreurs,
    courses_problematiques: coursesProblematiques,
    recent_events: recentEvents.slice(0, 10).map(e => ({
      type: e.event_type, priority: e.priority, title: e.title, summary: e.summary,
      time: e.created_date, status: e.status,
    })),
    recent_reports: recentReports.slice(0, 5).map(r => ({
      type: r.sous_type, resume: r.resume, date: r.periode_debut,
    })),
    country_code: countryCode,
  };

  // ── 5. Prompt LLM ──
  const systemPrompt = `Tu es VENUS Admin, l'assistante de direction d'Eric. Tu réponds à ses questions sur l'activité SILGAPP en te basant sur les données réelles fournies dans le contexte.

RÈGLES STRICTES:
- Lecture seule absolue. Tu ne modifies jamais aucune donnée.
- Tu ne proposes aucune action. Tu ne changes aucun statut.
- Tu utilises UNIQUEMENT les données du contexte fourni.
- Si une information n'est pas dans le contexte, dis-le honnêtement.
- Sois précis avec les montants (format X F CFA).
- Sois concis mais complet. Réponds en français.
- Tu gardes le contexte de la conversation: si Eric pose une question de suivi ("lesquels ?", "pourquoi ?", "et hier ?"), réponds en référence au message précédent.
- Tu t'adresses toujours à Eric par son prénom.

DONNÉES TEMPS RÉEL:
${JSON.stringify(contextData, null, 2)}`;

  // Historique de conversation (10 derniers messages)
  const historyStr = history.slice(-10).map(h => {
    const role = h.role === 'user' ? 'ERIC' : 'VENUS';
    return `${role}: ${h.content}`;
  }).join('\n');

  const fullPrompt = `${systemPrompt}

${historyStr ? `HISTORIQUE:
${historyStr}

` : ''}QUESTION D'ERIC: ${message}

RÉPONSE DE VENUS:`;

  // ── 6. Appel LLM ──
  const llmResponse = await base44.integrations.Core.InvokeLLM({
    prompt: fullPrompt,
  });

  const responseText = typeof llmResponse === 'string'
    ? llmResponse
    : (llmResponse?.response || llmResponse?.output || JSON.stringify(llmResponse));

  return Response.json({
    success: true,
    response: responseText,
    context_summary: {
      today_ca: caToday,
      yesterday_ca: caYesterday,
      debtors_count: topDebiteurs.length,
      top_debtor: topDebiteurs[0] || null,
      top_driver: topLivreurs[0]?.nom || null,
      problem_courses_count: coursesProblematiques.length,
    },
  });
}