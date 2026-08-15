import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { haversineKm, isValidCoord } from '../../shared/geoUtils.ts';

/**
 * LIBÉRER LIVREUR - COURSE LIVRÉE
 *
 * Quand une course est livrée (statut: 'livree'), cette fonction :
 * 1. Remet automatiquement le livreur en statut "disponible"
 * 2. Rend le livreur dispatchable immédiatement
 *
 * Peut être appelée par :
 * - Un admin (via dashboard)
 * - Une automation entity (sans user context)
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Vérifier que c'est un admin qui appelle (sauf si appelé par automation)
    // Les automations n'ont pas de user context, donc on skip la vérification
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { course_id } = await req.json();

    if (!course_id) {
      return Response.json({ error: 'course_id requis' }, { status: 400 });
    }

    // Récupérer la course
    const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);

    if (!course) {
      return Response.json({ error: 'Course non trouvée' }, { status: 404 });
    }

    // Vérifier que la course est livrée
    const statutsFin = ["livree", "terminee", "completed"];
    if (!statutsFin.includes(course.statut)) {
      return Response.json({
        success: true,
        message: `Course pas encore terminée (statut: ${course.statut})`,
        course_id: course_id,
        statut: course.statut
      });
    }

    // ── Calculer la distance réelle si manquante ou trop petite ──
    // Privilégier la distance tarifaire (adresse départ → arrivée) car le GPS
    // livreur peut ne pas avoir bougé (PIN secours, GPS figé).
    if (!course.distance_reelle_km || course.distance_reelle_km < 0.1) {
      // 1. Distance tarifaire (adresse)
      let distKm = null;
      if (isValidCoord(course.gps_depart_lat, course.gps_depart_lng) && isValidCoord(course.gps_arrivee_lat, course.gps_arrivee_lng)) {
        distKm = haversineKm(course.gps_depart_lat, course.gps_depart_lng, course.gps_arrivee_lat, course.gps_arrivee_lng);
      }
      // 2. Fallback: GPS livreur (récupération → livraison)
      if (!distKm || distKm < 0.1) {
        const lat1 = course.latitude_recuperation ?? course.gps_depart_lat;
        const lng1 = course.longitude_recuperation ?? course.gps_depart_lng;
        const lat2 = course.latitude_livraison ?? course.latitude_arrivee_livraison ?? course.gps_arrivee_lat;
        const lng2 = course.longitude_livraison ?? course.longitude_arrivee_livraison ?? course.gps_arrivee_lng;
        if (isValidCoord(lat1, lng1) && isValidCoord(lat2, lng2)) {
          distKm = haversineKm(lat1, lng1, lat2, lng2);
        }
      }

      if (distKm && distKm >= 0.1) {
        await base44.asServiceRole.entities.CourseExterne.update(course_id, { distance_reelle_km: Number(distKm.toFixed(2)) });
        course.distance_reelle_km = Number(distKm.toFixed(2));
        console.log(`[libererLivreurCourseLivree] Distance calculée: ${distKm.toFixed(2)} km pour course ${course_id}`);
      }
    }

    // Si la course a un livreur assigné
    if (course.livreur_id) {
      console.log(`[libererLivreurCourseLivree] Course ${course_id} ${course.statut}, livreur: ${course.livreur_nom}`);

      // Récupérer le livreur pour vérifier le heartbeat
      const livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id).catch(() => null);
      if (livreur?.bloque_encours) {
        await base44.asServiceRole.entities.Livreur.update(course.livreur_id, {
          statut: 'hors_ligne',
          admin_hors_ligne: true,
        });
        return Response.json({
          success: true,
          message: 'Livreur conserve hors ligne: encours bloque',
          course_id: course_id,
          livreur_id: course.livreur_id,
          livreur_nom: course.livreur_nom,
          bloque_encours: true,
        });
      }
      // ── Vérifier si le livreur a d'AUTRES courses actives ──
      // Si oui, il doit rester "en_course" — ne pas le libérer
      const STATUTS_ACTIFS_LIVREUR = ["livreur_en_route", "client_contacte", "en_route_expediteur", "arrive_prise_en_charge", "colis_recupere", "passager_embarque", "pris_en_charge", "en_livraison", "arrivee"];
      const autresCourses = await base44.asServiceRole.entities.CourseExterne.filter(
        { livreur_id: course.livreur_id },
        "-created_date", 10
      );
      const aAutreCourseActive = (autresCourses || []).some(c =>
        c.id !== course_id && STATUTS_ACTIFS_LIVREUR.includes(c.statut)
      );
      if (aAutreCourseActive) {
        console.log(`[libererLivreurCourseLivree] Livreur ${course.livreur_nom} a une autre course active — reste "en_course"`);
        return Response.json({
          success: true,
          message: 'Livreur conserve en_course: autre course active',
          course_id: course_id,
          livreur_id: course.livreur_id,
          livreur_nom: course.livreur_nom,
        });
      }

      const heartbeatAge = livreur?.last_seen_at
        ? (Date.now() - new Date(livreur.last_seen_at).getTime()) / 60000
        : 999;
      // Heartbeat récent (< 10 min) → disponible, sinon → hors_ligne
      const nouveauStatut = livreur.manual_hors_ligne === true ? 'hors_ligne' : 'disponible';

      await base44.asServiceRole.entities.Livreur.update(course.livreur_id, { statut: nouveauStatut });

      console.log(`[libererLivreurCourseLivree] Livreur ${course.livreur_nom} remis à "${nouveauStatut}" (heartbeat: ${Math.round(heartbeatAge)}min)`);

      // ── Vérifier l'encours du livreur après libération ──
      // S'assure que la commission de cette course est comptabilisée dans l'encours
      try {
        await base44.asServiceRole.functions.invoke('verifierEncoursLivreur', { course_id });
      } catch (encoursErr) {
        console.error('[libererLivreurCourseLivree] verifierEncoursLivreur error:', encoursErr?.message || encoursErr);
      }

      return Response.json({
        success: true,
        message: 'Livreur libéré avec succès',
        course_id: course_id,
        livreur_id: course.livreur_id,
        livreur_nom: course.livreur_nom
      });
    }

    return Response.json({
      success: true,
      message: 'Aucun livreur assigné à cette course',
      course_id: course_id,
      statut: course.statut,
      livreur_id: course.livreur_id
    });

  } catch (error) {
    console.error('[libererLivreurCourseLivree] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});