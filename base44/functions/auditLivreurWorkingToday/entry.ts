import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

/**
 * auditLivreurWorkingToday — Lecture seule, ne modifie rien.
 *
 * Identifie les livreurs ayant effectué au moins une course aujourd'hui,
 * puis vérifie si leur heartbeat/GPS est figé (plus ancien que leur dernière course).
 *
 * Ne touche à rien : pas de statut, pas de dispatch, pas de FCM, pas de GPS natif.
 */
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    // 1. Récupérer les courses livrées
    const courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { statut: 'livree' },
      '-heure_livraison',
      500
    );

    const coursesToday = courses.filter(c => {
      const d = c.heure_livraison ? new Date(c.heure_livraison) : null;
      return d && d >= startOfToday && d <= now;
    });

    const coursesByLivreur = new Map();
    for (const c of coursesToday) {
      const lid = c.livreur_financier_id || c.livreur_id;
      if (!lid) continue;
      if (!coursesByLivreur.has(lid)) coursesByLivreur.set(lid, []);
      coursesByLivreur.get(lid).push(c);
    }

    // 2. Récupérer les livreurs
    const livreurs = await base44.asServiceRole.entities.Livreur.list('-last_seen_at', 500);
    const livreurMap = new Map();
    for (const l of livreurs) {
      livreurMap.set(l.id, l);
    }

    // 3. Récupérer les tokens FCM
    const tokens = await base44.asServiceRole.entities.NotificationToken.filter(
      { user_type: 'livreur', actif: true },
      '-derniere_utilisation',
      500
    );
    const tokenByLivreurId = new Set();
    for (const t of tokens) {
      if (t.livreur_id && t.token) tokenByLivreurId.add(t.livreur_id);
    }

    // 4. Analyser chaque livreur
    const results = [];
    let heartbeatNormal = 0;
    let courseApresFigement = 0;
    let plusGrandEcartMin = 0;
    let plusGrandEcartNom = '';

    for (const [lid, coursesLivr] of coursesByLivreur) {
      const livreur = livreurMap.get(lid);
      if (!livreur) continue;

      const coursesSorted = coursesLivr.sort((a, b) =>
        new Date(b.heure_livraison).getTime() - new Date(a.heure_livraison).getTime()
      );
      const derniereCourse = coursesSorted[0];
      const derniereCourseTime = new Date(derniereCourse.heure_livraison).getTime();

      const lastSeen = livreur.last_seen_at ? new Date(livreur.last_seen_at).getTime() : null;
      const lastGps = livreur.derniere_position_date ? new Date(livreur.derniere_position_date).getTime() : null;

      const heartbeatFigee = lastSeen !== null && lastSeen < derniereCourseTime;
      const gpsFigee = lastGps !== null && lastGps < derniereCourseTime;

      let ecartMin = null;
      if (lastSeen !== null) {
        ecartMin = Math.round((derniereCourseTime - lastSeen) / 60000);
      }

      const isCourseApresFigement = heartbeatFigee || gpsFigee;
      if (!isCourseApresFigement) heartbeatNormal++;
      if (isCourseApresFigement) courseApresFigement++;

      if (ecartMin !== null && ecartMin > plusGrandEcartMin) {
        plusGrandEcartMin = ecartMin;
        plusGrandEcartNom = (livreur.prenom || '') + ' ' + (livreur.nom || '');
        plusGrandEcartNom = plusGrandEcartNom.trim();
      }

      results.push({
        id: livreur.id,
        nom: (livreur.prenom || '') + ' ' + (livreur.nom || ''),
        telephone: livreur.telephone,
        statut_metier: livreur.statut,
        nb_courses_aujourdhui: coursesLivr.length,
        derniere_course_at: derniereCourse.heure_livraison,
        last_seen_at: livreur.last_seen_at,
        derniere_position_date: livreur.derniere_position_date,
        heartbeat_figee: heartbeatFigee,
        gps_figee: gpsFigee,
        ecart_course_heartbeat_min: ecartMin,
        token_fcm_valide: tokenByLivreurId.has(livreur.id),
        course_apres_figement: isCourseApresFigement,
        background_active: livreur.background_active,
        app_active: livreur.app_active,
      });
    }

    results.sort((a, b) => (b.ecart_course_heartbeat_min ?? -1) - (a.ecart_course_heartbeat_min ?? -1));

    const nomsFigement = results
      .filter(r => r.course_apres_figement)
      .map(r => r.nom);

    return Response.json({
      generated_at: now.toISOString(),
      date_jour: startOfToday.toISOString().split('T')[0],
      summary: {
        livreurs_ayant_travaille_aujourdhui: results.length,
        heartbeat_gps_normal_pendant_travail: heartbeatNormal,
        course_effectuee_apres_figement: courseApresFigement,
        plus_grand_ecart_entre_course_et_heartbeat_min: plusGrandEcartMin,
        plus_grand_ecart_nom: plusGrandEcartNom,
      },
      noms_livreurs_figement: nomsFigement,
      details: results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}