import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Calcule la distance entre 2 points GPS (formule Haversine)
 */
function calculerDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, course_id } = body;

    // Lancer la recherche automatique pour une course externe
    if (action === 'lancer_recherche_auto') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) {
        return Response.json({ error: 'Course introuvable' }, { status: 404 });
      }

      if (course.statut !== 'recherche_livreur') {
        return Response.json({ error: 'Course déjà en cours de traitement' }, { status: 400 });
      }

      // Récupérer tous les livreurs externes validés et disponibles
      const livreurs = await base44.asServiceRole.entities.Livreur.filter({
        type_livreur: 'externe',
        validation: 'valide',
        actif: true,
        statut: 'disponible',
        app_active: true,
      });

      if (!livreurs || livreurs.length === 0) {
        return Response.json({ 
          success: false, 
          message: 'Aucun livreur externe disponible actuellement' 
        });
      }

      // Filtrer ceux qui ont le GPS actif (latitude/longitude récentes)
      const livreursGPS = livreurs.filter(l => 
        l.latitude && l.longitude && l.derniere_position_date &&
        new Date(l.derniere_position_date).getTime() > Date.now() - 300000 // 5 min
      );

      if (livreursGPS.length === 0) {
        return Response.json({ 
          success: false, 
          message: 'Aucun livreur avec GPS actif' 
        });
      }

      // Trier par proximité avec le lieu de récupération
      const livreursTries = livreursGPS.sort((a, b) => {
        const distA = calculerDistance(
          course.gps_depart_lat, course.gps_depart_lng,
          a.latitude, a.longitude
        );
        const distB = calculerDistance(
          course.gps_depart_lat, course.gps_depart_lng,
          b.latitude, b.longitude
        );
        return distA - distB;
      });

      // Proposer au livreur le plus proche
      const livreurProche = livreursTries[0];
      const distance = calculerDistance(
        course.gps_depart_lat, course.gps_depart_lng,
        livreurProche.latitude, livreurProche.longitude
      );

      // Assigner la course au livreur
      await base44.asServiceRole.entities.CourseExterne.update(course_id, {
        livreur_id: livreurProche.id,
        livreur_nom: `${livreurProche.prenom || ''} ${livreurProche.nom}`.trim(),
        livreur_photo_url: livreurProche.photo_url,
        livreur_telephone: livreurProche.telephone,
        statut: 'livreur_en_route',
        heure_acceptation: new Date().toISOString(),
      });

      // Mettre à jour le statut du livreur
      await base44.asServiceRole.entities.Livreur.update(livreurProche.id, {
        statut: 'en_course',
      });

      return Response.json({
        success: true,
        livreur: {
          id: livreurProche.id,
          nom: `${livreurProche.prenom || ''} ${livreurProche.nom}`.trim(),
          distance_km: distance.toFixed(1),
        },
        message: `Livreur trouvé à ${distance.toFixed(1)} km`
      });
    }

    return Response.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});