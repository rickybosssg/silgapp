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

/**
 * Trouve les livreurs dans un rayon donné (rayon km)
 */
async function trouverLivreursProches(base44, course, rayonKm) {
  const livreurs = await base44.asServiceRole.entities.Livreur.filter({
    type_livreur: 'externe',
    validation: 'valide',
    actif: true,
    statut: 'disponible',
    app_active: true,
  });

  if (!livreurs || livreurs.length === 0) {
    return [];
  }

  const livreursGPS = livreurs.filter(l =>
    l.latitude && l.longitude && l.derniere_position_date &&
    new Date(l.derniere_position_date).getTime() > Date.now() - 300000
  );

  const livreursProches = livreursGPS.filter(l => {
    const dist = calculerDistance(
      course.gps_depart_lat, course.gps_depart_lng,
      l.latitude, l.longitude
    );
    return dist <= rayonKm;
  });

  return livreursProches.sort((a, b) => {
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
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, course_id, livreur_id, raison, force_redispatch } = body;

    // 1. Lancer la recherche automatique avec rayon progressif
    if (action === 'lancer_recherche_auto') {
      console.log(`[DISPATCH] Démarrage dispatch pour course ${course_id}`);
      
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) {
        console.error('[DISPATCH] Course introuvable');
        return Response.json({ error: 'Course introuvable' }, { status: 404 });
      }

      if (course.statut !== 'recherche_livreur') {
        console.log(`[DISPATCH] Course déjà en traitement (statut: ${course.statut})`);
        return Response.json({ error: 'Course déjà en cours de traitement' }, { status: 400 });
      }

      // Recherche progressive : 3km → 5km → 8km
      let livreursTries = [];
      for (const rayon of [3, 5, 8]) {
        console.log(`[DISPATCH] Recherche dans rayon ${rayon}km`);
        livreursTries = await trouverLivreursProches(base44, course, rayon);
        if (livreursTries.length > 0) {
          console.log(`[DISPATCH] ${livreursTries.length} livreurs trouvés dans rayon ${rayon}km`);
          break;
        }
      }

      if (livreursTries.length === 0) {
        console.warn('[DISPATCH] Aucun livreur trouvé');
        return Response.json({ 
          success: false, 
          message: 'Aucun livreur disponible dans un rayon de 8km' 
        });
      }

      // Assigner au livreur le plus proche
      const livreurProche = livreursTries[0];
      const distance = calculerDistance(
        course.gps_depart_lat, course.gps_depart_lng,
        livreurProche.latitude, livreurProche.longitude
      );

      console.log(`[DISPATCH] Assignment au livreur ${livreurProche.id} (${livreurProche.nom}) à ${distance.toFixed(1)}km`);

      // Mise à jour atomique avec vérification
      const courseUpdate = {
        livreur_id: livreurProche.id,
        livreur_nom: `${livreurProche.prenom || ''} ${livreurProche.nom}`.trim(),
        livreur_photo_url: livreurProche.photo_url,
        livreur_telephone: livreurProche.telephone,
        statut: 'recherche_livreur', // Reste en recherche jusqu'à acceptation
        dispatch_status: 'propose',
        heure_sollicitation: new Date().toISOString(),
        timeout_expires_at: new Date(Date.now() + 60000).toISOString(), // 60s
      };

      await base44.asServiceRole.entities.CourseExterne.update(course_id, courseUpdate);

      // Notification push au livreur
      try {
        await base44.functions.invoke('envoiNotificationPush', {
          email: livreurProche.user_email,
          titre: '🚨 Nouvelle course disponible !',
          message: `Course à ${distance.toFixed(1)}km - ${course.adresse_depart} → ${course.adresse_arrivee}`,
          type: 'nouvelle_course',
          course_id: course_id,
        });
      } catch (err) {
        console.error('[DISPATCH] Erreur notification push:', err);
      }

      console.log(`[DISPATCH] Course proposée au livreur ${livreurProche.id}`);

      return Response.json({
        success: true,
        livreur: {
          id: livreurProche.id,
          nom: `${livreurProche.prenom || ''} ${livreurProche.nom}`.trim(),
          distance_km: distance.toFixed(1),
        },
        message: `Livreur trouvé à ${distance.toFixed(1)} km`,
        expires_in: 60,
      });
    }

    // 2. Accepter une course (transaction atomique)
    if (action === 'accepter_course') {
      console.log(`[DISPATCH] Livreur ${livreur_id} accepte course ${course_id}`);

      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) {
        return Response.json({ error: 'Course introuvable' }, { status: 404 });
      }

      // Vérifier que la course n'est pas déjà prise
      if (course.livreur_id && course.livreur_id !== livreur_id) {
        console.warn(`[DISPATCH] Course déjà prise par ${course.livreur_id}`);
        return Response.json({ 
          success: false, 
          error: 'Course déjà prise par un autre livreur',
          already_taken: true 
        });
      }

      // Vérifier timeout
      if (course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date()) {
        console.warn('[DISPATCH] Course expirée');
        return Response.json({ 
          success: false, 
          error: 'Course expirée',
          expired: true 
        });
      }

      const livreur = await base44.asServiceRole.entities.Livreur.get(livreur_id);
      if (!livreur) {
        return Response.json({ error: 'Livreur introuvable' }, { status: 404 });
      }

      // Mise à jour atomique
      await base44.asServiceRole.entities.CourseExterne.update(course_id, {
        statut: 'livreur_en_route',
        dispatch_status: 'accepte',
        heure_acceptation: new Date().toISOString(),
        livreur_id: livreur_id,
        livreur_nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(),
        livreur_photo_url: livreur.photo_url,
        livreur_telephone: livreur.telephone,
      });

      await base44.asServiceRole.entities.Livreur.update(livreur_id, {
        statut: 'en_course',
      });

      console.log(`[DISPATCH] Course ${course_id} acceptée par livreur ${livreur_id}`);

      return Response.json({
        success: true,
        message: 'Course acceptée avec succès',
      });
    }

    // 3. Refuser une course
    if (action === 'refuser_course') {
      console.log(`[DISPATCH] Livreur ${livreur_id} refuse course ${course_id} (raison: ${raison})`);

      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) {
        return Response.json({ error: 'Course introuvable' }, { status: 404 });
      }

      // Remettre en recherche
      await base44.asServiceRole.entities.CourseExterne.update(course_id, {
        livreur_id: '',
        livreur_nom: '',
        dispatch_status: 'recherche_livreur',
        remarque_livreur: raison || 'Course refusée',
      });

      // Relancer le dispatch vers le prochain livreur
      const livreursRestants = await trouverLivreursProches(base44, course, 8);
      const prochainLivreur = livreursRestants.find(l => l.id !== livreur_id);

      if (prochainLivreur) {
        const distance = calculerDistance(
          course.gps_depart_lat, course.gps_depart_lng,
          prochainLivreur.latitude, prochainLivreur.longitude
        );

        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          livreur_id: prochainLivreur.id,
          livreur_nom: `${prochainLivreur.prenom || ''} ${prochainLivreur.nom}`.trim(),
          livreur_photo_url: prochainLivreur.photo_url,
          livreur_telephone: prochainLivreur.telephone,
          dispatch_status: 'propose',
          heure_sollicitation: new Date().toISOString(),
          timeout_expires_at: new Date(Date.now() + 60000).toISOString(),
        });

        try {
          await base44.functions.invoke('envoiNotificationPush', {
            email: prochainLivreur.user_email,
            titre: '🚨 Nouvelle course disponible !',
            message: `Course à ${distance.toFixed(1)}km`,
            type: 'nouvelle_course',
            course_id: course_id,
          });
        } catch (err) {
          console.error('[DISPATCH] Erreur notification push:', err);
        }

        console.log(`[DISPATCH] Course proposée au prochain livreur ${prochainLivreur.id}`);
      }

      return Response.json({
        success: true,
        message: 'Course refusée, recherche du prochain livreur...',
      });
    }

    // 4. Vérifier expiration (appelé par polling frontend)
    if (action === 'verifier_expiration') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) {
        return Response.json({ error: 'Course introuvable' }, { status: 404 });
      }

      const expired = course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date();
      
      if (expired && course.dispatch_status === 'propose') {
        console.log(`[DISPATCH] Course ${course_id} expirée, redispatch...`);
        
        // Trouver prochain livreur
        const livreursRestants = await trouverLivreursProches(base44, course, 8);
        const prochainLivreur = livreursRestants.find(l => l.id !== course.livreur_id);

        if (prochainLivreur) {
          const distance = calculerDistance(
            course.gps_depart_lat, course.gps_depart_lng,
            prochainLivreur.latitude, prochainLivreur.longitude
          );

          await base44.asServiceRole.entities.CourseExterne.update(course_id, {
            livreur_id: prochainLivreur.id,
            livreur_nom: `${prochainLivreur.prenom || ''} ${prochainLivreur.nom}`.trim(),
            livreur_photo_url: prochainLivreur.photo_url,
            livreur_telephone: prochainLivreur.telephone,
            dispatch_status: 'propose',
            heure_sollicitation: new Date().toISOString(),
            timeout_expires_at: new Date(Date.now() + 60000).toISOString(),
          });

          try {
            await base44.functions.invoke('envoiNotificationPush', {
              email: prochainLivreur.user_email,
              titre: '🚨 Nouvelle course disponible !',
              message: `Course à ${distance.toFixed(1)}km`,
              type: 'nouvelle_course',
              course_id: course_id,
            });
          } catch (err) {
            console.error('[DISPATCH] Erreur notification push:', err);
          }

          console.log(`[DISPATCH] Redispatch au livreur ${prochainLivreur.id}`);
        } else {
          console.warn('[DISPATCH] Aucun autre livreur disponible pour redispatch');
        }
      }

      return Response.json({
        expired,
        dispatch_status: course.dispatch_status,
        livreur_id: course.livreur_id,
      });
    }

    return Response.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (error) {
    console.error('[DISPATCH] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});