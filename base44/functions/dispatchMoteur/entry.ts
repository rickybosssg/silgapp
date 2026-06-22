import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * MOTEUR DE DISPATCH AUTOMATIQUE — SILGA INTERNE UNIQUEMENT
 *
 * Règles :
 * - Uniquement livreurs internes (type_livreur === "interne")
 * - Jamais de livreurs OFF (statut !== "hors_ligne")
 * - GPS obligatoire (sauf alerte admin)
 * - Timeout 90 secondes par livreur
 * - Max 10 cycles puis arrêt avec alerte admin
 * - Cycle 1 : disponible + GPS + app_active
 * - Cycle 2 : en_course + GPS + app_active (si Cycle 1 échoue)
 */

const TIMEOUT_SECONDES = 90;
const MAX_CYCLES = 10;
const VERIFICATION_INTERVAL_MS = 10000;

/** Haversine distance */
function calculerDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 999999;
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
 * Trouve les livreurs internes éligibles
 * cycle: 1 = disponible, 2 = en_course
 */
async function trouverLivreursCandidats(base44, course, cycle = 1, exclusions = []) {
  const filtreStatut = cycle === 1 ? 'disponible' : 'en_course';

  const livreurs = await base44.asServiceRole.entities.Livreur.filter({
    type_livreur: 'interne',
    validation: 'valide',
    actif: true,
    statut: filtreStatut,
  });

  if (!livreurs || livreurs.length === 0) return [];

  // Filtrer GPS obligatoire
  const avecGPS = livreurs.filter(l =>
    l.latitude &&
    l.longitude &&
    l.app_active === true &&
    !exclusions.includes(l.id)
  );

  // Silga Interne : pas de tri par distance, retour aléatoire parmi les candidats GPS valides
  return avecGPS.sort(() => Math.random() - 0.5);
}

/**
 * Propose la course à un livreur spécifique
 */
async function proposerAuLivreur(base44, courseId, course, livreur, cycle) {
  await base44.asServiceRole.entities.Course.update(courseId, {
    livreur_id: livreur.id,
    livreur_nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(),
    livreur_photo_url: livreur.photo_url || '',
    livreur_telephone: livreur.telephone,
    statut: 'en_attente_livreur',
    dispatch_status: 'propose',
    heure_sollicitation: new Date().toISOString(),
    timeout_expires_at: new Date(Date.now() + (TIMEOUT_SECONDES * 1000)).toISOString(),
    dispatch_mode: 'automatique',
  });

  // Mettre à jour DispatchConfig pour le monitor
  await base44.asServiceRole.entities.DispatchConfig.update('dispatch_config', {
    mode: 'automatique',
    moteur_actif: true,
    course_en_dispatch_id: courseId,
    livreur_sollicite_id: livreur.id,
    livreur_sollicite_nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(),
    heure_sollicitation: new Date().toISOString(),
    timeout_secondes: TIMEOUT_SECONDES,
    dispatch_cycle: cycle,
  });

  // Notification push + WhatsApp via Notification entity
  if (livreur.user_email) {
    try {
      await base44.asServiceRole.entities.Notification.create({
        titre: ' Nouvelle course disponible !',
        message: `Course : ${course.adresse_depart} → ${course.adresse_arrivee || '?'}`,
        type: 'nouvelle_course',
        course_id: courseId,
        destinataire_email: livreur.user_email,
        lue: false,
      });
      console.log(`[DISPATCH INTERNE] Notification créée pour ${livreur.user_email}`);
    } catch (err) {
      console.error('[DISPATCH INTERNE] Erreur création notification:', err.message);
    }

    try {
      await base44.functions.invoke('envoiNotificationPush', {
        destinataire_email: livreur.user_email,
        livreur_id: livreur.id,
        titre: ' Nouvelle course disponible !',
        message: `Course : ${course.adresse_depart} → ${course.adresse_arrivee || '?'}`,
        type: 'nouvelle_course',
        course_id: courseId,
      });
    } catch (err) {
      console.error('[DISPATCH INTERNE] Erreur notif push:', err.message);
    }
  }

  console.log(`[DISPATCH INTERNE] Course ${courseId} proposée à ${livreur.nom} (cycle ${cycle})`);
  return 0;
}

/**
 * Logique principale de dispatch
 * Retourne { propose: bool, livreur?, noLivreur: bool, maxCyclesAtteint: bool }
 */
async function lancerDispatch(base44, courseId, exclusions = [], cycle = 1) {
  const course = await base44.asServiceRole.entities.Course.get(courseId);
  if (!course) return { erreur: 'Course introuvable' };

  // Ne pas dispatcher si déjà acceptée/livrée/annulée
  if (['acceptee', 'colis_recupere', 'en_livraison', 'livree', 'annulee'].includes(course.statut)) {
    console.log(`[DISPATCH INTERNE] Course ${courseId} statut=${course.statut} → dispatch ignoré`);
    return { ignore: true, statut: course.statut };
  }

  // GPS optionnel — si absent, on cherche tous les livreurs avec GPS
  const hasGPS = course.gps_depart_lat && course.gps_depart_lng;
  if (!hasGPS) {
    console.log(`[DISPATCH INTERNE] ℹ Course ${courseId} sans GPS — recherche tous les livreurs`);
  }

  // Cycle 1 : disponible + GPS + app_active
  let candidats = await trouverLivreursCandidats(base44, course, 1, exclusions);

  // Cycle 2 : en_course + GPS + app_active (si Cycle 1 vide)
  if (candidats.length === 0 && cycle >= 2) {
    candidats = await trouverLivreursCandidats(base44, course, 2, exclusions);
  }

  if (candidats.length === 0) {
    // Aucun livreur trouvé
    await base44.asServiceRole.entities.Course.update(courseId, {
      dispatch_status: 'en_attente_admin',
      livreur_id: '',
      livreur_nom: '',
    });
    // Réinitialiser DispatchConfig
    await base44.asServiceRole.entities.DispatchConfig.update('dispatch_config', {
      mode: 'manuel',
      moteur_actif: false,
      course_en_dispatch_id: '',
      livreur_sollicite_id: '',
      livreur_sollicite_nom: '',
      heure_sollicitation: '',
      dispatch_cycle: 0,
    });
    console.log(`[DISPATCH INTERNE] Aucun livreur interne disponible — course ${courseId} en attente admin`);
    return { noLivreur: true };
  }

  const livreur = candidats[0];
  await proposerAuLivreur(base44, courseId, course, livreur, cycle);
  return {
    propose: true,
    livreur: {
      id: livreur.id,
      nom: `${livreur.prenom || ''} ${livreur.nom}`.trim()
    }
  };
}

/**
 * Vérifie l'expiration et passe au livreur suivant
 */
async function verifierExpiration(base44, courseId) {
  const course = await base44.asServiceRole.entities.Course.get(courseId);
  if (!course) return { erreur: 'Course introuvable' };

  if (course.dispatch_status !== 'propose') {
    return { dispatch_status: course.dispatch_status, deja_traite: true };
  }

  const expired = !!(course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date());
  if (!expired) {
    const remaining = Math.round((new Date(course.timeout_expires_at) - Date.now()) / 1000);
    return { expired: false, remaining };
  }

  console.log(`[DISPATCH INTERNE] ⏰ Timeout expiré pour course ${courseId} — livreur ${course.livreur_id}`);

  // Exclure le livreur actuel
  const exclusions = course.livreur_id ? [course.livreur_id] : [];

  // Déterminer le cycle actuel
  const cycle = course.dispatch_cycle || 1;
  const nextCycle = exclusions.length > 0 ? Math.ceil(exclusions.length / 10) + 1 : 1;

  if (nextCycle > MAX_CYCLES) {
    // Max cycles atteint → alerte admin
    await base44.asServiceRole.entities.Course.update(courseId, {
      dispatch_status: 'en_attente_admin',
      livreur_id: '',
      livreur_nom: '',
      remarque_livreur: `Aucun livreur n'a accepté après ${MAX_CYCLES} cycles — intervention admin requise`,
    });
    // Réinitialiser DispatchConfig
    await base44.asServiceRole.entities.DispatchConfig.update('dispatch_config', {
      mode: 'manuel',
      moteur_actif: false,
      course_en_dispatch_id: '',
      livreur_sollicite_id: '',
      livreur_sollicite_nom: '',
      heure_sollicitation: '',
      dispatch_cycle: 0,
    });
    console.log(`[DISPATCH INTERNE] MAX CYCLES (${MAX_CYCLES}) atteint pour course ${courseId}`);
    return {
      expired: true,
      maxCyclesAtteint: true,
      message: `Aucun livreur n'a accepté après ${MAX_CYCLES} cycles — intervention admin requise`
    };
  }

  // Redispatcher au suivant
  const result = await lancerDispatch(base44, courseId, exclusions, nextCycle);

  if (result.noLivreur) {
    return { expired: true, noLivreur: true, message: 'Aucun livreur interne disponible' };
  }

  await base44.asServiceRole.entities.Course.update(courseId, {
    dispatch_cycle: nextCycle,
  });

  return {
    expired: true,
    redispatched: true,
    livreur: result.livreur,
    cycle: nextCycle
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    let { action, course_id, livreur_id, raison } = body;

    // Support automation entity
    if (!action && body.event?.entity_id) {
      action = 'lancer_auto';
      course_id = body.event.entity_id;
    }

    // ─── 1. Lancer dispatch automatique ───────────────────────────────────────
    if (action === 'lancer_auto') {
      console.log(`[DISPATCH INTERNE] Démarrage dispatch pour course ${course_id}`);

      if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });

      const course = await base44.asServiceRole.entities.Course.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

  // Le mode dispatch peut être mis à jour si l'utilisateur clique sur "Auto"
  // Pas de blocage pour dispatch_mode='manuel' — on permet le dispatch auto

      const result = await lancerDispatch(base44, course_id, [], 1);

      if (result.erreur) return Response.json({ error: result.erreur }, { status: 404 });
      if (result.ignore) return Response.json({ success: true, message: `Dispatch ignoré : ${result.statut}` });
      if (result.noLivreur) {
        return Response.json({
          success: false,
          noLivreur: true,
          message: result.missing_gps
            ? 'Course sans GPS — veuillez ajouter la position de départ'
            : 'Aucun livreur interne disponible',
          missing_gps: result.missing_gps
        });
      }

      return Response.json({
        success: true,
        livreur: result.livreur,
        message: `Course proposée à ${result.livreur.nom}`,
        timeout_secondes: TIMEOUT_SECONDES,
      });
    }

    // ─── 2. Vérifier expiration ───────────────────────────────────────────────
    if (action === 'verifier_expiration') {
      if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });
      const result = await verifierExpiration(base44, course_id);
      return Response.json(result);
    }

    // ─── 3. Refuser course (depuis LivreurApp) ────────────────────────────────
    if (action === 'refuser_course') {
      console.log(`[DISPATCH INTERNE] Livreur ${livreur_id} refuse course ${course_id}`);

      const course = await base44.asServiceRole.entities.Course.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      if (course.dispatch_status === 'accepte') {
        return Response.json({ success: false, message: 'Course déjà acceptée par un autre livreur' });
      }

      // Exclure ce livreur
      const exclusions = livreur_id ? [livreur_id] : [];
      const cycle = course.dispatch_cycle || 1;

      const result = await lancerDispatch(base44, course_id, exclusions, cycle);

      if (result.noLivreur) {
        return Response.json({
          success: true,
          noLivreur: true,
          message: 'Aucun autre livreur interne disponible'
        });
      }

      return Response.json({
        success: true,
        message: `Course redispatchée vers ${result.livreur?.nom || 'un autre livreur'}`
      });
    }

    // ─── 4. Accepter course (depuis LivreurApp) ───────────────────────────────
    if (action === 'accepter_course') {
      console.log(`[DISPATCH INTERNE] Livreur ${livreur_id} accepte course ${course_id}`);

      const course = await base44.asServiceRole.entities.Course.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      // Course déjà prise ?
      if (course.dispatch_status === 'accepte' && course.livreur_id !== livreur_id) {
        return Response.json({ success: false, error: 'Course déjà prise', already_taken: true });
      }

      // Timeout expiré ?
      if (course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date()) {
        return Response.json({ success: false, error: 'Course expirée', expired: true });
      }

      const livreur = await base44.asServiceRole.entities.Livreur.get(livreur_id);
      if (!livreur) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });

      await base44.asServiceRole.entities.Course.update(course_id, {
        statut: 'acceptee',
        dispatch_status: 'accepte',
        heure_acceptation: new Date().toISOString(),
        livreur_id: livreur_id,
        livreur_nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(),
        livreur_photo_url: livreur.photo_url || '',
        livreur_telephone: livreur.telephone,
      });

      await base44.asServiceRole.entities.Livreur.update(livreur_id, { statut: 'en_course' });

      // Réinitialiser DispatchConfig
      await base44.asServiceRole.entities.DispatchConfig.update('dispatch_config', {
        mode: 'manuel',
        moteur_actif: false,
        course_en_dispatch_id: '',
        livreur_sollicite_id: '',
        livreur_sollicite_nom: '',
        heure_sollicitation: '',
        dispatch_cycle: 0,
      });

      console.log(`[DISPATCH INTERNE] Course ${course_id} acceptée par ${livreur_id}`);
      return Response.json({ success: true, message: 'Course acceptée avec succès' });
    }

    return Response.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (error) {
    console.error('[DISPATCH INTERNE] Erreur fatale:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
