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
  const filterLivreur = {
    type_livreur: 'externe',
    validation: 'valide',
    actif: true,
    statut: 'disponible',
  };
  // Filtrer par pays si la course a un country_code
  if (course.country_code) {
    filterLivreur.country_code = course.country_code;
  }
  const livreurs = await base44.asServiceRole.entities.Livreur.filter(filterLivreur);

  if (!livreurs || livreurs.length === 0) return [];

  // Charger toutes les courses actives pour exclure les livreurs déjà en course
  const coursesActives = await base44.asServiceRole.entities.CourseExterne.filter({});
  const livreurIdsEnCourse = new Set(
    coursesActives
      .filter(c => ['livreur_en_route', 'colis_recupere', 'en_livraison'].includes(c.statut) && c.livreur_id)
      .map(c => c.livreur_id)
  );
  console.log(`[DISPATCH] 🚫 Livreurs déjà en course exclus: ${livreurIdsEnCourse.size}`);

  // Filtrer les livreurs avec GPS valide (coordonnées + récent < 10 min)
  const now = Date.now();
  const livreursGPS = livreurs.filter(l => {
    if (!l.latitude || !l.longitude) return false;
    if (exclusions.includes(l.id)) return false;
    if (livreurIdsEnCourse.has(l.id)) return false;
    // Exclure les livreurs mis hors ligne par l'administration
    if (l.admin_hors_ligne === true) {
      console.log(`[DISPATCH] 🚫 ${l.nom} exclu - mis hors ligne par l'administration`);
      return false;
    }
    
    // GPS récent = dernière position < 10 min
    const dt = l.derniere_position_date || l.last_seen_at;
    if (!dt) return false;
    
    // Calcul robuste : s'assurer que dt est une date valide
    const gpsDate = new Date(dt);
    if (isNaN(gpsDate.getTime())) {
      console.log(`[DISPATCH] 🚫 ${l.nom} exclu - date GPS invalide`);
      return false;
    }
    
    const ageMin = (now - gpsDate.getTime()) / 60000;
    
    // DEBUG: log tous les livreurs avec leur âge GPS
    console.log(`[DISPATCH] 📍 ${l.nom}: GPS il y a ${ageMin.toFixed(1)} min (${dt})`);
    
    const gpsValide = ageMin < 10;
    if (!gpsValide) {
      console.log(`[DISPATCH] 🚫 ${l.nom} exclu - GPS expiré (${ageMin.toFixed(1)} min)`);
    }
    return gpsValide;
  });

  console.log(`[DISPATCH] ✅ ${livreursGPS.length} livreurs avec GPS récent (< 10 min): ${livreursGPS.map(l => l.nom).join(', ')}`);

  // ⚠️ SANS GPS COURSE : retourner TOUS les livreurs avec GPS récent (pas tous les livreurs)
  if (!course.gps_depart_lat || !course.gps_depart_lng) {
    console.log(`[DISPATCH] 🌍 Course sans GPS → ${livreursGPS.length} livreurs éligibles (dispatch global)`);
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
 * Anti-doublon : vérifie si une notification "nouvelle_course" existe déjà
 * pour ce couple (course_id, destinataire_email) dans les 15 dernières minutes.
 * Retourne true si un doublon existe (ne pas recréer).
 */
async function notificationDoublonExiste(base44, courseId, livreurEmail) {
  const depuis15min = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const existantes = await base44.asServiceRole.entities.Notification.filter({
    course_id: courseId,
    destinataire_email: livreurEmail,
    type: 'nouvelle_course',
  });

  // Filtrer celles créées dans les 15 dernières minutes
  const recentes = existantes.filter(n => n.created_date > depuis15min);
  if (recentes.length > 0) {
    console.log(`[DISPATCH] 🛡️ Doublon détecté — notification déjà créée pour ${livreurEmail} course ${courseId} (${recentes.length} existante(s))`);
    return true;
  }
  return false;
}

/**
 * Propose la course à un livreur spécifique.
 */
async function proposerAuLivreur(base44, courseId, course, livreur) {
  // Calculer la distance réelle si GPS disponible des deux côtés
  let distance = 0;
  if (course.gps_depart_lat && course.gps_depart_lng && livreur.latitude && livreur.longitude) {
    distance = calculerDistance(course.gps_depart_lat, course.gps_depart_lng, livreur.latitude, livreur.longitude);
  }
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

  // Créer une Notification en base avec protection anti-doublon
  if (livreur.user_email) {
    // ⚡ PROTECTION ANTI-DOUBLON : ne créer la notif que si elle n'existe pas déjà
    const doublon = await notificationDoublonExiste(base44, courseId, livreur.user_email);
    if (!doublon) {
      const distanceLabel = distanceSafe > 0
        ? `${distanceSafe.toFixed(1)}km`
        : 'distance inconnue';

      try {
        await base44.asServiceRole.entities.Notification.create({
          titre: '🚨 Nouvelle course disponible !',
          message: `Course à ${distanceLabel} — ${course.adresse_depart} → ${course.adresse_arrivee || '?'}`,
          type: 'nouvelle_course',
          course_id: courseId,
          destinataire_email: livreur.user_email,
          lue: false,
        });
        console.log(`[DISPATCH] 🔔 Notification créée pour ${livreur.user_email}`);
      } catch (err) {
        console.error('[DISPATCH] ❌ Erreur création notification:', err.message);
      }

      // Notification push — si app ouverte
      // Si app fermée → WhatsApp en complément
      try {
        await base44.functions.invoke('envoiNotificationPush', {
          destinataire_email: livreur.user_email,
          livreur_id: livreur.id,
          titre: '🚨 Nouvelle course disponible !',
          message: `Course à ${distanceLabel} — ${course.adresse_depart} → ${course.adresse_arrivee || '?'}`,
          type: 'nouvelle_course',
          course_id: courseId,
        });
      } catch (err) {
        console.error('[DISPATCH] ❌ Erreur notif push:', err.message);
      }

      // Si l'app est fermée → envoyer aussi un WhatsApp pour ne pas rater la course
      if (!livreur.app_active && livreur.telephone) {
        try {
          await base44.functions.invoke('envoyerAlerteWhatsApp', {
            telephone: livreur.telephone,
            message: `🚨 SILGAPP — Nouvelle course disponible !\n📍 ${course.adresse_depart} → ${course.adresse_arrivee || '?'}\n📏 À ${distanceLabel} de vous\n\nOuvrez l'application SILGAPP pour accepter (60 secondes).`,
          });
          console.log(`[DISPATCH] 📱 WhatsApp envoyé à ${livreur.telephone} (app fermée)`);
        } catch (err) {
          console.warn('[DISPATCH] ⚠️ Erreur WhatsApp livreur app fermée:', err.message);
        }
      }
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

/**
 * Supprime les notifications "nouvelle_course" liées à une course
 * quand elle est acceptée, refusée ou expirée.
 */
async function supprimerNotificationsCourse(base44, courseId) {
  try {
    const notifs = await base44.asServiceRole.entities.Notification.filter({
      course_id: courseId,
      type: 'nouvelle_course',
    });
    const nonLues = notifs.filter(n => !n.lue);
    for (const n of nonLues) {
      await base44.asServiceRole.entities.Notification.update(n.id, { lue: true });
    }
    if (nonLues.length > 0) {
      console.log(`[DISPATCH] 🧹 ${nonLues.length} notification(s) archivée(s) pour course ${courseId}`);
    }
  } catch (err) {
    console.warn('[DISPATCH] ⚠️ Erreur archivage notifications:', err.message);
  }
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

      // Récupérer la course
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });
      
      // ⚠️ SANS GPS : on dispatch quand même à TOUS les livreurs disponibles (cercle infini)
      if (!course.gps_depart_lat || !course.gps_depart_lng) {
        console.warn(`[DISPATCH] ⚠️ Course ${course_id} sans GPS — dispatch global (tous livreurs)`);
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

      const { pricing_mode, manual_price } = body;

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

      // Validation prix manuel
      const PRIX_MIN = 1000;
      if (pricing_mode === 'manual') {
        const montant = Number(manual_price);
        if (!montant || montant < PRIX_MIN) {
          return Response.json({ success: false, error: `Prix minimum autorisé : ${PRIX_MIN} FCFA` }, { status: 400 });
        }
      }

      const pickupToken = generateToken();
      const deliveryToken = generateToken();
      const pickupPIN = generatePIN();
      const deliveryPIN = generatePIN();

      const isManual = pricing_mode === 'manual' && manual_price >= PRIX_MIN;

      // En mode manuel : statut reste "recherche_livreur" en attente de validation client
      // En mode auto : statut passe directement à "livreur_en_route"
      const updateData = {
        dispatch_status: isManual ? 'propose' : 'accepte',
        statut: isManual ? 'recherche_livreur' : 'livreur_en_route',
        heure_acceptation: isManual ? null : new Date().toISOString(),
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
      };

      if (isManual) {
        updateData.pricing_mode = 'manual';
        updateData.manual_price = Number(manual_price);
        updateData.manual_price_status = 'pending_client_validation';
        updateData.proposed_by_livreur_id = livreur_id;
        // Prolonger le timeout pour laisser le client répondre (5 min)
        updateData.timeout_expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      }

      await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);

      // En mode auto seulement : mettre le livreur en_course immédiatement
      if (!isManual) {
        await base44.asServiceRole.entities.Livreur.update(livreur_id, { statut: 'en_course' });
        await supprimerNotificationsCourse(base44, course_id);
        console.log(`[DISPATCH] 🎉 Course ${course_id} acceptée (auto) par ${livreur_id}`);
        return Response.json({ success: true, message: 'Course acceptée avec succès' });
      }

      // En mode manuel : notifier le CRÉATEUR de la course (pas forcément l'expéditeur)
      try {
        // Priorité : chercher le créateur via created_by_id (User), sinon fallback expediteur_client_id
        let clientEmail = null;
        if (course.created_by_id) {
          try {
            const creator = await base44.asServiceRole.entities.User.get(course.created_by_id);
            clientEmail = creator?.email || null;
          } catch (_) {}
        }
        if (!clientEmail && course.expediteur_client_id) {
          const notifDest = await base44.asServiceRole.entities.ClientExterne.filter({ id: course.expediteur_client_id });
          clientEmail = notifDest?.[0]?.user_email || null;
        }
        if (clientEmail) {
          await base44.asServiceRole.entities.Notification.create({
            titre: '💰 Prix proposé par le livreur',
            message: `Le livreur ${livreur.prenom || ''} ${livreur.nom} propose cette course à ${Number(manual_price).toLocaleString()} FCFA. Acceptez-vous ?`,
            type: 'course_acceptee',
            course_id: course_id,
            destinataire_email: clientEmail,
            lue: false,
          });
        }
      } catch (e) {
        console.warn('[DISPATCH] Erreur notif client prix manuel:', e.message);
      }

      console.log(`[DISPATCH] 💰 Prix manuel ${manual_price} proposé pour course ${course_id} par ${livreur_id} — en attente client`);
      return Response.json({ success: true, pending_client_validation: true, message: 'Prix proposé au client — en attente de sa validation' });
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

    // ─── 6. Valider le prix manuel côté client ────────────────────────────
    if (action === 'valider_prix_manuel') {
      const { accepted } = body;
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const now = new Date().toISOString();

      if (accepted) {
        const prixManuel = Number(course.manual_price);
        const commission = Math.round(prixManuel * 0.3);
        const montantLivreur = prixManuel - commission;

        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          manual_price_status: 'accepted',
          client_price_validated_at: now,
          statut: 'livreur_en_route',
          dispatch_status: 'accepte',
          heure_acceptation: now,
          prix_final: prixManuel,
          commission_silga: commission,
          montant_livreur: montantLivreur,
        });

        // Mettre le livreur en_course
        if (course.proposed_by_livreur_id) {
          await base44.asServiceRole.entities.Livreur.update(course.proposed_by_livreur_id, { statut: 'en_course' });

          // Notifier le livreur : prix accepté
          try {
            const livreurData = await base44.asServiceRole.entities.Livreur.get(course.proposed_by_livreur_id);
            if (livreurData?.user_email) {
              await base44.asServiceRole.entities.Notification.create({
                titre: '✅ Prix accepté — La course peut commencer !',
                message: `Le client a accepté votre prix de ${prixManuel.toLocaleString()} ${course.devise || 'FCFA'}. Rendez-vous au point de récupération.`,
                type: 'course_acceptee',
                course_id: course_id,
                destinataire_email: livreurData.user_email,
                lue: false,
              });
            }
          } catch (e) {
            console.warn('[DISPATCH] Erreur notif livreur prix accepté:', e.message);
          }
        }

        await supprimerNotificationsCourse(base44, course_id);
        return Response.json({ success: true, accepted: true });
      } else {
        const livreurRefuseId = course.proposed_by_livreur_id;

        // Refus client → redispatch
        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          manual_price_status: 'refused',
          client_price_refused_at: now,
          statut: 'recherche_livreur',
          dispatch_status: 'redispatch',
          livreur_id: '',
          livreur_nom: '',
          livreur_telephone: '',
          pricing_mode: 'automatic',
          manual_price: null,
          proposed_by_livreur_id: '',
        });

        // Remettre le livreur disponible
        if (livreurRefuseId) {
          await base44.asServiceRole.entities.Livreur.update(livreurRefuseId, { statut: 'disponible' });

          // Notifier le livreur : prix refusé
          try {
            const livreurData = await base44.asServiceRole.entities.Livreur.get(livreurRefuseId);
            if (livreurData?.user_email) {
              await base44.asServiceRole.entities.Notification.create({
                titre: '❌ Prix refusé — Vous êtes de nouveau disponible',
                message: `Le client a refusé votre prix. Vous redevenez disponible pour d'autres courses. Cette course peut vous être reproposée plus tard.`,
                type: 'course_refusee',
                course_id: course_id,
                destinataire_email: livreurData.user_email,
                lue: false,
              });
            }
          } catch (e) {
            console.warn('[DISPATCH] Erreur notif livreur prix refusé:', e.message);
          }
        }

        // ⚠️ Ne pas exclure le livreur du redispatch — il peut être reproposé plus tard
        const result = await lancerDispatch(base44, course_id, []);
        return Response.json({ success: true, accepted: false, redispatched: !result.noLivreur });
      }
    }

    return Response.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (error) {
    console.error('[DISPATCH] Erreur fatale:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});