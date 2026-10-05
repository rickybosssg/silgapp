import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

/**
 * getProsAutonomiser — Analyse les clients "Sans App" (sans user_email)
 * et retourne un score CRM explicable pour identifier les professionnels
 * potentiels à autonomiser (clients récurrents créés majoritairement par l'admin).
 *
 * NE MODIFIE AUCUNE DONNÉE — lecture seule.
 * NE TOUCHE PAS au dispatch, finance, tarification, FCM, GPS, QR/PIN, auth.
 *
 * Scoring (explicable, sans IA) :
 *   1. Volume de courses (≥3=+1, ≥5=+3, ≥10=+5, ≥20=+6)
 *   2. Récence (≤30j=+3, ≤90j=+2, ≤180j=+1)
 *   3. Départ récurrent (≥60%=+2, ≥80%=+3, nécessite ≥3 courses)
 *   4. Destinations diverses (≥3=+2, ≥5=+3)
 *   5. Majorité admin (≥50%=+2, 100%=+3)
 *   6. Fréquence (≤7j=+2, ≤3j=+3)
 *   7. Montant total (≥10k=+1, ≥50k=+2)
 *
 * Niveaux :
 *   priorite_forte : score ≥ 10 (🔥)
 *   potentiel      : score 6-9 (🟠)
 *   occasionnel    : score < 6 (⚪)
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // ── 1. Charger tous les ClientExterne sans user_email ──
    let allClients = [];
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.ClientExterne.list('-created_date', 500, skip);
      if (!batch || batch.length === 0) break;
      allClients.push(...batch);
      if (batch.length < 500) break;
      skip += 500;
      if (skip > 3000) break;
    }

    const sansApp = allClients.filter(c => !c.user_email);
    const eligibles = sansApp.filter(c => (c.nb_courses_total || 0) >= 2);

    if (eligibles.length === 0) {
      return Response.json({ pros: [], stats: { total_sans_app: sansApp.length, eligible: 0 } });
    }

    // ── 2. Charger les courses des clients éligibles ──
    const telsEligibles = new Set();
    for (const c of eligibles) {
      if (c.telephone_normalized) telsEligibles.add(c.telephone_normalized);
      if (c.telephone) telsEligibles.add(c.telephone);
    }

    let allCourses = [];
    skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.CourseExterne.list('-created_date', 500, skip);
      if (!batch || batch.length === 0) break;
      allCourses.push(...batch);
      if (batch.length < 500) break;
      skip += 500;
      if (skip > 5000) break;
    }

    // ── 3. Grouper les courses par téléphone ──
    const coursesParTel = new Map();
    for (const course of allCourses) {
      const tel = course.client_phone_normalized || course.client_telephone;
      if (!tel) continue;
      if (!telsEligibles.has(tel) && !telsEligibles.has(course.client_telephone)) continue;
      if (!coursesParTel.has(tel)) coursesParTel.set(tel, []);
      coursesParTel.get(tel).push(course);
    }

    // ── 4. Scoring ──
    const now = new Date();
    const pros = [];

    for (const client of eligibles) {
      const tel = client.telephone_normalized || client.telephone;
      const courses = coursesParTel.get(tel) || [];
      if (courses.length === 0) continue;

      const nbCourses = courses.length;
      const adminCount = courses.filter(c => c.source === 'admin').length;

      const departs = courses.map(c => (c.quartier_depart || c.adresse_depart || '').trim()).filter(Boolean);
      const departCounts = {};
      for (const d of departs) departCounts[d] = (departCounts[d] || 0) + 1;
      const topDepart = Object.entries(departCounts).sort((a, b) => b[1] - a[1])[0];
      const pctSameDepart = topDepart && courses.length > 0 ? Math.round((topDepart[1] / courses.length) * 100) : 0;

      const arrivees = new Set(courses.map(c => (c.quartier_arrivee || c.adresse_arrivee || '').trim()).filter(Boolean));
      const nbDestinations = arrivees.size;

      const montantTotal = courses.reduce((sum, c) => sum + (c.prix_final || c.prix_estimate || 0), 0);

      const dates = courses.map(c => c.created_date).filter(Boolean).sort();
      const derniereCourse = dates.length > 0 ? dates[dates.length - 1] : null;
      const premiereCourse = dates.length > 0 ? dates[0] : null;

      let delaiMoyenJours = 0;
      if (dates.length >= 2) {
        let totalDelai = 0, count = 0;
        for (let i = 1; i < dates.length; i++) {
          const delai = Math.round((new Date(dates[i]) - new Date(dates[i - 1])) / 86400000);
          if (delai >= 0) { totalDelai += delai; count++; }
        }
        delaiMoyenJours = count > 0 ? Math.round(totalDelai / count) : 0;
      }

      const pctAdmin = nbCourses > 0 ? Math.round((adminCount / nbCourses) * 100) : 0;

      // ── Score ──
      let score = 0;
      const raisons = [];

      if (nbCourses >= 20) { score += 6; raisons.push('≥20 courses (+6)'); }
      else if (nbCourses >= 10) { score += 5; raisons.push('≥10 courses (+5)'); }
      else if (nbCourses >= 5) { score += 3; raisons.push('≥5 courses (+3)'); }
      else if (nbCourses >= 3) { score += 1; raisons.push('≥3 courses (+1)'); }

      if (derniereCourse) {
        const joursDepuis = Math.round((now - new Date(derniereCourse)) / 86400000);
        if (joursDepuis <= 30) { score += 3; raisons.push('course récente ≤30j (+3)'); }
        else if (joursDepuis <= 90) { score += 2; raisons.push('course ≤90j (+2)'); }
        else if (joursDepuis <= 180) { score += 1; raisons.push('course ≤180j (+1)'); }
      }

      if (nbCourses >= 3 && pctSameDepart >= 80) { score += 3; raisons.push('départ récurrent ≥80% (+3)'); }
      else if (nbCourses >= 3 && pctSameDepart >= 60) { score += 2; raisons.push('départ récurrent ≥60% (+2)'); }

      if (nbDestinations >= 5) { score += 3; raisons.push('≥5 destinations (+3)'); }
      else if (nbDestinations >= 3) { score += 2; raisons.push('≥3 destinations (+2)'); }

      if (pctAdmin === 100) { score += 3; raisons.push('100% admin (+3)'); }
      else if (pctAdmin >= 50) { score += 2; raisons.push('majorité admin (+2)'); }

      if (delaiMoyenJours > 0 && delaiMoyenJours <= 3) { score += 3; raisons.push('fréquence ≤3j (+3)'); }
      else if (delaiMoyenJours > 0 && delaiMoyenJours <= 7) { score += 2; raisons.push('fréquence ≤7j (+2)'); }

      if (montantTotal >= 50000) { score += 2; raisons.push('montant ≥50k (+2)'); }
      else if (montantTotal >= 10000) { score += 1; raisons.push('montant ≥10k (+1)'); }

      let niveau;
      if (score >= 10) niveau = 'priorite_forte';
      else if (score >= 6) niveau = 'potentiel';
      else niveau = 'occasionnel';

      pros.push({
        client_id: client.id,
        telephone: client.telephone,
        telephone_normalized: client.telephone_normalized,
        nom: `${client.prenom || ''} ${client.nom || ''}`.trim(),
        nb_courses: nbCourses,
        pct_admin: pctAdmin,
        pct_same_depart: pctSameDepart,
        top_depart: topDepart ? topDepart[0] : '—',
        nb_destinations: nbDestinations,
        montant_total: montantTotal,
        delai_moyen_jours: delaiMoyenJours,
        derniere_course: derniereCourse,
        score,
        niveau,
        raisons: raisons.join('; '),
      });
    }

    pros.sort((a, b) => b.score - a.score);

    const stats = {
      total_sans_app: sansApp.length,
      eligible: pros.length,
      priorite_forte: pros.filter(p => p.niveau === 'priorite_forte').length,
      potentiel: pros.filter(p => p.niveau === 'potentiel').length,
      occasionnel: pros.filter(p => p.niveau === 'occasionnel').length,
    };

    return Response.json({ pros, stats });
  } catch (error) {
    console.error('[getProsAutonomiser] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}