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
 * Trouve les livreurs dans un rayon donné
 */
async function trouverLivreursProches(base44, course, rayonKm) {
  const livreurs = await base44.asServiceRole.entities.Livreur.filter({
    type_livreur: 'externe',
    validation: 'valide',
    actif: true,
    statut: 'disponible',
    app_active: true,
  });

  console.log('[DISPATCH] 👥 Livreurs externes disponibles:', livreurs?.length || 0);

  if (!livreurs || livreurs.length === 0) return [];

  // GPS valide = mis à jour dans les 5 dernières minutes
  const livreursGPS = livreurs.filter(l =>
    l.latitude && l.longitude && l.derniere_position_date &&
    new Date(l.derniere_position_date).getTime() > Date.now() - 300000
  );

  console.log('[DISPATCH] 📍 Livreurs avec GPS valide:', livreursGPS.length);

  if (!course.gps_depart_lat || !course.gps_depart_lng) {
    console.error('[DISPATCH] ❌ GPS course invalide');
    return livreursGPS; // Retourner tous si pas de GPS course
  }

  const livreursProches = livreursGPS.filter(l => {
    const dist = calculerDistance(
      course.gps_depart_lat, course.gps_depart_lng,
      l.latitude, l.longitude
    );
    console.log(`[DISPATCH] 📏 ${l.nom}: ${dist.toFixed(2)}km (rayon: ${rayonKm}km)`);
    return dist <= rayonKm;
  });

  return livreursProches.sort((a, b) => {
    const distA = calculerDistance(course.gps_depart_lat, course.gps_depart_lng, a.latitude, a.longitude);
    const distB = calculerDistance(course.gps_depart_lat, course.gps_depart_lng, b.latitude, b.longitude);
    return distA - distB;
  });
}

/**
 * Assigne une course à un livreur et envoie la notification
 */
async function assignerCourse(base44, courseId, course, livreur) {
  const distance = (course.gps_depart_lat && livreur.latitude)
    ? calculerDistance(course.gps_depart_lat, course.gps_depart_lng, livreur.latitude, livreur.longitude)
    : 0;

  await base44.asServiceRole.entities.CourseExterne.update(courseId, {
    livreur_id: livreur.id,
    livreur_nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(),
    livreur_photo_url: livreur.photo_url || '',
    livreur_telephone: livreur.telephone,
    statut: 'recherche_livreur',
    dispatch_status: 'propose',
    heure_sollicitation: new Date().toISOString(),
    timeout_expires_at: new Date(Date.now() + 60000).toISOString(),
  });

  // Notification push
  if (livreur.user_email) {
    try {
      await base44.functions.invoke('envoiNotificationPush', {
        email: livreur.user_email,
        titre: '🚨 Nouvelle course disponible !',
        message: `Course à ${distance.toFixed(1)}km - ${course.adresse_depart} → ${course.adresse_arrivee || '?'}`,
        type: 'nouvelle_course',
        course_id: courseId,
      });
    } catch (err) {
      console.error('[DISPATCH] ❌ Erreur notification push:', err.message);
    }
  }

  return { livreur, distance };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, course_id, livreur_id, raison } = body;

    // ─── 1. Lancer la recherche automatique ───────────────────────────────────
    if (action === 'lancer_recherche_auto') {
      console.log(`[DISPATCH] 🚀 Démarrage dispatch pour course ${course_id}`);

      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      if (course.statut !== 'recherche_livreur') {
        return Response.json({ error: 'Course déjà en cours de traitement' }, { status: 400 });
      }

      // Recherche progressive : 3km → 5km → 8km
      let livreursTries = [];
      for (const rayon of [3, 5, 8]) {
        livreursTries = await trouverLivreursProches(base44, course, rayon);
        if (livreursTries.length > 0) {
          console.log(`[DISPATCH] ✅ ${livreursTries.length} livreurs dans rayon ${rayon}km`);
          break;
        }
      }

      if (livreursTries.length === 0) {
        return Response.json({ success: false, message: 'Aucun livreur disponible dans un rayon de 8km' });
      }

      const { livreur, distance } = await assignerCourse(base44, course_id, course, livreursTries[0]);

      return Response.json({
        success: true,
        livreur: { id: livreur.id, nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(), distance_km: distance.toFixed(1) },
        message: `Livreur trouvé à ${distance.toFixed(1)} km`,
        expires_in: 60,
      });
    }

    // ─── 2. Accepter une course ───────────────────────────────────────────────
    if (action === 'accepter_course') {
      console.log(`[DISPATCH] Livreur ${livreur_id} accepte course ${course_id}`);

      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      // Course déjà prise par un autre ?
      if (course.dispatch_status === 'accepte' && course.livreur_id !== livreur_id) {
        return Response.json({ success: false, error: 'Course déjà prise', already_taken: true });
      }

      // Timeout dépassé ?
      if (course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date()) {
        return Response.json({ success: false, error: 'Course expirée', expired: true });
      }

      const livreur = await base44.asServiceRole.entities.Livreur.get(livreur_id);
      if (!livreur) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });

      await base44.asServiceRole.entities.CourseExterne.update(course_id, {
        statut: 'livreur_en_route',
        dispatch_status: 'accepte',
        heure_acceptation: new Date().toISOString(),
        livreur_id: livreur_id,
        livreur_nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(),
        livreur_photo_url: livreur.photo_url || '',
        livreur_telephone: livreur.telephone,
      });

      await base44.asServiceRole.entities.Livreur.update(livreur_id, { statut: 'en_course' });

      console.log(`[DISPATCH] ✅ Course ${course_id} acceptée par ${livreur_id}`);
      return Response.json({ success: true, message: 'Course acceptée avec succès' });
    }

    // ─── 3. Refuser une course ────────────────────────────────────────────────
    if (action === 'refuser_course') {
      console.log(`[DISPATCH] Livreur ${livreur_id} refuse course ${course_id} (raison: ${raison})`);

      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      // Remettre en attente de dispatch
      await base44.asServiceRole.entities.CourseExterne.update(course_id, {
        livreur_id: '',
        livreur_nom: '',
        dispatch_status: 'redispatch',
        remarque_livreur: raison || 'Course refusée',
      });

      // Trouver le prochain livreur (exclure celui qui refuse)
      const livreursRestants = await trouverLivreursProches(base44, course, 8);
      const prochainLivreur = livreursRestants.find(l => l.id !== livreur_id);

      if (prochainLivreur) {
        await assignerCourse(base44, course_id, course, prochainLivreur);
        console.log(`[DISPATCH] ✅ Course proposée au prochain livreur ${prochainLivreur.id}`);
      } else {
        console.warn('[DISPATCH] ⚠️ Aucun autre livreur disponible');
      }

      return Response.json({ success: true, message: 'Course refusée, recherche du prochain livreur...' });
    }

    // ─── 4. Vérifier expiration ───────────────────────────────────────────────
    if (action === 'verifier_expiration') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const expired = !!(course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date());

      // Redispatch automatique si expiré et encore en "propose"
      // Guard : ne déclencher qu'une seule fois (dispatch_status !== 'redispatch' déjà)
      if (expired && course.dispatch_status === 'propose') {
        console.log(`[DISPATCH] ⏰ Course ${course_id} expirée, redispatch...`);

        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          dispatch_status: 'redispatch',
        });

        const livreursRestants = await trouverLivreursProches(base44, course, 8);
        const prochainLivreur = livreursRestants.find(l => l.id !== course.livreur_id);

        if (prochainLivreur) {
          await assignerCourse(base44, course_id, course, prochainLivreur);
          console.log(`[DISPATCH] ✅ Redispatch au livreur ${prochainLivreur.id}`);
        } else {
          console.warn('[DISPATCH] ⚠️ Aucun livreur pour redispatch');
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