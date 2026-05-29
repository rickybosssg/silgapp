import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/** Génère un token UUID simplifié */
function generateToken() {
  return crypto.randomUUID().replace(/-/g, '');
}

/** Génère un code PIN à 4 chiffres */
function generatePIN() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Haversine */
function calculerDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Trouve les livreurs disponibles, triés par distance.
 * Exclure les IDs déjà essayés.
 */
async function trouverLivreursCandidats(base44, course, rayonKm, exclusions = []) {
  const livreurs = await base44.asServiceRole.entities.Livreur.filter({
    type_livreur: 'externe',
    validation: 'valide',
    actif: true,
    statut: 'disponible',
  });

  if (!livreurs || livreurs.length === 0) return [];

  // Charger toutes les courses actives pour exclure les livreurs déjà en course
  const coursesActives = await base44.asServiceRole.entities.CourseExterne.filter({});
  const livreurIdsEnCourse = new Set(
    coursesActives
      .filter(c => ['livreur_en_route', 'colis_recupere', 'en_livraison'].includes(c.statut) && c.livreur_id)
      .map(c => c.livreur_id)
  );
  console.log(`[DISPATCH] 🚫 Livreurs déjà en course exclus: ${livreurIdsEnCourse.size}`);

  // GPS valide = coordonnées présentes (peu importe la date de mise à jour)
  const livreursGPS = livreurs.filter(l =>
    l.latitude && l.longitude &&
    !exclusions.includes(l.id) &&
    !livreurIdsEnCourse.has(l.id)
  );

  if (!course.gps_depart_lat || !course.gps_depart_lng) {
    // Pas de GPS course → retourner tous les candidats GPS valides (hors exclusions)
    return livreursGPS;
  }

  const proches = livreursGPS.filter(l => {
    const dist = calculerDistance(course.gps_depart_lat, course.gps_depart_lng, l.latitude, l.longitude);
    return dist <= rayonKm;
  });

  return proches.sort((a, b) => {
    const dA = calculerDistance(course.gps_depart_lat, course.gps_depart_lng, a.latitude, a.longitude);
    const dB = calculerDistance(course.gps_depart_lat, course.gps_depart_lng, b.latitude, b.longitude);
    return dA - dB;
  });
}

/**
 * Propose la course à un livreur spécifique.
 */
async function proposerAuLivreur(base44, courseId, course, livreur) {
  const distance = (course.gps_depart_lat && livreur.latitude)
    ? calculerDistance(course.gps_depart_lat, course.gps_depart_lng, livreur.latitude, livreur.longitude)
    : 0;
  const distanceSafe = Number(distance || 0);

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

  // Créer une Notification en base → déclenche l'automation WhatsApp
  if (livreur.user_email) {
    try {
      await base44.asServiceRole.entities.Notification.create({
        titre: '🚨 Nouvelle course disponible !',
        message: `Course à ${distanceSafe.toFixed(1)}km — ${course.adresse_depart} → ${course.adresse_arrivee || '?'}`,
        type: 'nouvelle_course',
        course_id: courseId,
        destinataire_email: livreur.user_email,
        lue: false,
      });
      console.log(`[DISPATCH] 🔔 Notification créée pour ${livreur.user_email} → déclenchement WhatsApp si hors app`);
    } catch (err) {
      console.error('[DISPATCH] ❌ Erreur création notification:', err.message);
    }

    // Notification push (en plus)
    try {
      await base44.functions.invoke('envoiNotificationPush', {
        email: livreur.user_email,
        titre: '🚨 Nouvelle course disponible !',
        message: `Course à ${distanceSafe.toFixed(1)}km — ${course.adresse_depart} → ${course.adresse_arrivee || '?'}`,
        type: 'nouvelle_course',
        course_id: courseId,
      });
    } catch (err) {
      console.error('[DISPATCH] ❌ Erreur notif push:', err.message);
    }
  }

  console.log(`[DISPATCH] 📤 Course ${courseId} proposée à ${livreur.nom} (${distanceSafe.toFixed(1)}km)`);
  return distanceSafe;
}

/**
 * Logique principale de dispatch : cherche un livreur disponible et propose la course.
 * Recherche progressive 3km → 5km → 8km → tous.
 * Retourne { proposé: bool, livreur?, noLivreur: bool }
 */
async function lancerDispatch(base44, courseId, exclusions = []) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
  if (!course) return { erreur: 'Course introuvable' };

  // Ne pas dispatcher si la course est déjà acceptée, livrée ou annulée
  if (['livreur_en_route', 'colis_recupere', 'en_livraison', 'livree', 'annulee'].includes(course.statut)) {
    console.log(`[DISPATCH] ⛔ Course ${courseId} statut=${course.statut} → dispatch ignoré`);
    return { ignore: true, statut: course.statut };
  }

  // Si déjà en "propose" et pas encore expiré → attendre
  if (course.dispatch_status === 'propose' && course.timeout_expires_at) {
    const expires = new Date(course.timeout_expires_at);
    if (expires > new Date()) {
      const remaining = Math.round((expires - Date.now()) / 1000);
      console.log(`[DISPATCH] ⏳ Course ${courseId} déjà proposée, expire dans ${remaining}s`);
      return { en_attente: true, remaining };
    }
  }

  let candidats = [];
  let rayonUtilise = 0;

  for (const rayon of [3, 5, 8]) {
    candidats = await trouverLivreursCandidats(base44, course, rayon, exclusions);
    if (candidats.length > 0) {
      rayonUtilise = rayon;
      console.log(`[DISPATCH] ✅ ${candidats.length} candidats dans ${rayon}km`);
      break;
    }
    console.log(`[DISPATCH] ⚪ 0 candidat dans ${rayon}km`);
  }

  // Aucun dans 8km → essayer tous les livreurs disponibles
  if (candidats.length === 0) {
    candidats = await trouverLivreursCandidats(base44, course, 99999, exclusions);
    rayonUtilise = 9999;
    console.log(`[DISPATCH] 🌍 Recherche globale : ${candidats.length} candidats`);
  }

  if (candidats.length === 0) {
    // Mettre la course en attente visible (pas de livreur en ce moment)
    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      dispatch_status: 'en_attente',
      livreur_id: '',
      livreur_nom: '',
    });
    console.log(`[DISPATCH] ⚠️ Aucun livreur disponible — course ${courseId} en attente`);
    return { noLivreur: true };
  }

  const livreur = candidats[0];
  const dist = await proposerAuLivreur(base44, courseId, course, livreur);
  return { propose: true, livreur: { id: livreur.id, nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(), distance_km: dist.toFixed(1) }, rayon: rayonUtilise };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // L'automation entity passe { event, data } — extraire course_id
    // L'appel direct passe { action, course_id, livreur_id, raison }
    let { action, course_id, livreur_id, raison } = body;

    // ─── Déclenchement depuis automation entity ────────────────────────────
    // L'automation passe event.entity_id et data directement
    if (!action && body.event?.entity_id) {
      action = 'lancer_recherche_auto';
      course_id = body.event.entity_id;
      console.log(`[DISPATCH] 🤖 Automation entity → course ${course_id}`);
    }

    // ─── 1. Lancer la recherche automatique ───────────────────────────────
    if (action === 'lancer_recherche_auto') {
      console.log(`[DISPATCH] 🚀 Démarrage dispatch pour course ${course_id}`);

      if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });

      // Vérifier si la course a un GPS valide
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });
      
      if (!course.gps_depart_lat || !course.gps_depart_lng) {
        console.warn(`[DISPATCH] ⚠️ Course ${course_id} sans GPS — dispatch ignoré`);
        return Response.json({ 
          success: false, 
          noLivreur: true, 
          message: 'Course sans GPS — veuillez ajouter la position de départ',
          missing_gps: true
        });
      }

      const result = await lancerDispatch(base44, course_id, []);

      if (result.erreur) return Response.json({ error: result.erreur }, { status: 404 });
      if (result.ignore) return Response.json({ success: true, message: `Dispatch ignoré : ${result.statut}` });
      if (result.noLivreur) return Response.json({ success: false, noLivreur: true, message: 'Aucun livreur disponible pour le moment — réessai automatique prévu' });
      if (result.en_attente) return Response.json({ success: true, en_attente: true, message: `Déjà proposée, expire dans ${result.remaining}s` });

      return Response.json({
        success: true,
        livreur: result.livreur,
        message: `Course proposée à ${result.livreur.nom} (${result.livreur.distance_km}km)`,
        expires_in: 60,
      });
    }

    // ─── 2. Accepter une course ────────────────────────────────────────────
    if (action === 'accepter_course') {
      console.log(`[DISPATCH] ✅ Livreur ${livreur_id} accepte course ${course_id}`);

      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      // Course déjà acceptée par quelqu'un d'autre ?
      if (course.dispatch_status === 'accepte' && course.livreur_id !== livreur_id) {
        return Response.json({ success: false, error: 'Course déjà prise', already_taken: true });
      }

      // Timeout dépassé ?
      if (course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date()) {
        return Response.json({ success: false, error: 'Course expirée — un autre livreur sera trouvé', expired: true });
      }

      const livreur = await base44.asServiceRole.entities.Livreur.get(livreur_id);
      if (!livreur) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });

      const pickupToken = generateToken();
      const deliveryToken = generateToken();
      const pickupPIN = generatePIN();
      const deliveryPIN = generatePIN();

      await base44.asServiceRole.entities.CourseExterne.update(course_id, {
        statut: 'livreur_en_route',
        dispatch_status: 'accepte',
        heure_acceptation: new Date().toISOString(),
        livreur_id: livreur_id,
        livreur_nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(),
        livreur_photo_url: livreur.photo_url || '',
        livreur_telephone: livreur.telephone,
        livreur_vehicule: livreur.vehicule || livreur.type_vehicule || 'moto',
        livreur_note_moyenne: livreur.note_moyenne || 0,
        livreur_nombre_avis: livreur.nombre_avis || 0,
        pickup_qr_token: pickupToken,
        pickup_code_4_digits: pickupPIN,
        delivery_qr_token: deliveryToken,
        delivery_code_4_digits: deliveryPIN,
      });

      // Mettre le livreur en_course ET disponible=false (statut suffit pour l'exclusion dispatch)
      await base44.asServiceRole.entities.Livreur.update(livreur_id, { statut: 'en_course' });

      console.log(`[DISPATCH] 🎉 Course ${course_id} acceptée par ${livreur_id}`);
      return Response.json({ success: true, message: 'Course acceptée avec succès' });
    }

    // ─── 3. Refuser une course (ou timeout expiré côté livreur) ───────────
    if (action === 'refuser_course') {
      console.log(`[DISPATCH] 🚫 Livreur ${livreur_id} refuse course ${course_id} (raison: ${raison})`);

      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      // Course déjà acceptée → ne pas redispatcher
      if (course.dispatch_status === 'accepte') {
        return Response.json({ success: false, message: 'Course déjà acceptée par un autre livreur' });
      }

      // Remettre en recherche active
      await base44.asServiceRole.entities.CourseExterne.update(course_id, {
        dispatch_status: 'redispatch',
        remarque_livreur: raison || 'Refusé',
        livreur_id: '',
        livreur_nom: '',
        livreur_telephone: '',
      });

      // Redispatcher en excluant le livreur qui refuse
      const result = await lancerDispatch(base44, course_id, [livreur_id]);

      if (result.noLivreur) {
        console.warn(`[DISPATCH] ⚠️ Aucun autre livreur — course ${course_id} reste en attente`);
        return Response.json({ success: true, noLivreur: true, message: 'Aucun autre livreur disponible — réessai automatique prévu' });
      }

      return Response.json({ success: true, message: `Course redispatchée vers ${result.livreur?.nom || 'un autre livreur'}` });
    }

    // ─── 4. Vérifier expiration & redispatch automatique ──────────────────
    if (action === 'verifier_expiration') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const expired = !!(course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date());

      if (expired && course.dispatch_status === 'propose') {
        console.log(`[DISPATCH] ⏰ Timeout expiré pour course ${course_id} — redispatch`);

        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          dispatch_status: 'redispatch',
          livreur_id: '',
          livreur_nom: '',
          livreur_telephone: '',
        });

        // Exclure le livreur qui n'a pas répondu
        const exclusions = course.livreur_id ? [course.livreur_id] : [];
        const result = await lancerDispatch(base44, course_id, exclusions);

        if (result.noLivreur) {
          console.warn(`[DISPATCH] ⚠️ Aucun livreur pour redispatch expiré — course ${course_id} en attente`);
        }

        return Response.json({
          expired: true,
          redispatched: !result.noLivreur,
          noLivreur: result.noLivreur || false,
          livreur: result.livreur || null,
          dispatch_status: course.dispatch_status,
        });
      }

      return Response.json({
        expired,
        dispatch_status: course.dispatch_status,
        livreur_id: course.livreur_id,
      });
    }

    // ─── 5. Retry courses en attente (appelé par un scheduled job) ────────
    // Cherche toutes les courses en recherche sans livreur proposé et les redispatche
    if (action === 'retry_courses_en_attente') {
      console.log('[DISPATCH] 🔄 Retry courses en attente...');

      const courses = await base44.asServiceRole.entities.CourseExterne.filter({
        statut: 'recherche_livreur',
      });

      const aRetenter = courses.filter(c =>
        ['en_attente', 'redispatch', 'expire'].includes(c.dispatch_status) ||
        // Ou expiré depuis > 30s sans redispatch
        (c.dispatch_status === 'propose' && c.timeout_expires_at && new Date(c.timeout_expires_at) < new Date(Date.now() - 5000))
      );

      console.log(`[DISPATCH] 🔄 ${aRetenter.length} courses à retenter`);

      const resultats = [];
      for (const course of aRetenter) {
        const exclusions = course.livreur_id ? [course.livreur_id] : [];
        const result = await lancerDispatch(base44, course.id, exclusions);
        resultats.push({ course_id: course.id, ...result });
      }

      return Response.json({ success: true, retried: aRetenter.length, resultats });
    }

    return Response.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (error) {
    console.error('[DISPATCH] Erreur fatale:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});