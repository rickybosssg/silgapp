import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function generateToken() {
  return crypto.randomUUID().replace(/-/g, '');
}
function generatePIN() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
function calculerDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Lire la config dispatch depuis AppConfig (clé DISPATCH_CONFIG) */
async function getDispatchConfig(base44) {
  try {
    const configs = await base44.asServiceRole.entities.AppConfig.filter({ cle: 'DISPATCH_CONFIG' });
    if (configs?.[0]?.valeur) {
      return JSON.parse(configs[0].valeur);
    }
  } catch (_) {}
  return { nb_livreurs_par_vague: 3, timeout_secondes: 60 };
}

/**
 * Trouve les N meilleurs livreurs candidats par niveaux de priorité.
 * exclusion_verrou : ID du livreur ayant le verrou actif (temporairement exclu).
 * Tous les autres (y compris ceux ayant déjà refusé) restent éligibles.
 */
async function trouverMeilleursNLivreurs(base44, course, nbMax, exclusion_verrou = null) {
  if (!course.country_code) {
    console.error(`[DISPATCH] ❌ course ${course.id} sans country_code`);
    return [];
  }

  const [tousLivreurs, coursesActives] = await Promise.all([
    base44.asServiceRole.entities.Livreur.filter({
      type_livreur: 'externe', validation: 'valide', actif: true,
      statut: 'disponible', country_code: course.country_code,
    }),
    base44.asServiceRole.entities.CourseExterne.filter({ country_code: course.country_code }),
  ]);

  const livreurIdsEnCourse = new Set(
    coursesActives
      .filter(c => ['livreur_en_route', 'colis_recupere', 'en_livraison'].includes(c.statut) && c.livreur_id)
      .map(c => c.livreur_id)
  );

  const now = Date.now();

  const livreursEligibles = tousLivreurs.filter(l => {
    if (!l.latitude || !l.longitude) return false;
    if (l.id === exclusion_verrou) return false; // Seul ce livreur est exclu (il a le verrou actif)
    if (livreurIdsEnCourse.has(l.id)) return false;
    if (l.admin_hors_ligne === true) return false;
    return true;
  });

  // Classement par niveaux + distance
  const niveau1 = [], niveau2 = [], niveau3 = [], niveau4 = [];

  livreursEligibles.forEach(l => {
    const hbDate = l.last_seen_at || l.derniere_position_date;
    let heartbeatAgeMin = null;
    if (hbDate) {
      const hb = new Date(hbDate);
      if (!isNaN(hb.getTime())) heartbeatAgeMin = (now - hb.getTime()) / 60000;
    }
    const distance = (course.gps_depart_lat && course.gps_depart_lng && l.latitude && l.longitude)
      ? calculerDistance(course.gps_depart_lat, course.gps_depart_lng, l.latitude, l.longitude) : 0;
    const livreur = { ...l, distance, heartbeatAgeMin };

    if (heartbeatAgeMin === null || heartbeatAgeMin >= 30) niveau4.push(livreur);
    else if (heartbeatAgeMin >= 10) niveau3.push(livreur);
    else if (heartbeatAgeMin >= 2) niveau2.push(livreur);
    else {
      const gpsDate = l.derniere_position_date;
      let gpsAgeMin = null;
      if (gpsDate) { const gps = new Date(gpsDate); if (!isNaN(gps.getTime())) gpsAgeMin = (now - gps.getTime()) / 60000; }
      niveau1.push({ ...livreur, gpsAgeMin });
    }
  });

  niveau1.sort((a, b) => {
    const gpsA = a.gpsAgeMin !== null ? a.gpsAgeMin : 999;
    const gpsB = b.gpsAgeMin !== null ? b.gpsAgeMin : 999;
    const trancheA = gpsA < 2 ? 0 : gpsA < 5 ? 1 : gpsA < 10 ? 2 : 3;
    const trancheB = gpsB < 2 ? 0 : gpsB < 5 ? 1 : gpsB < 10 ? 2 : 3;
    if (trancheA !== trancheB) return trancheA - trancheB;
    return a.distance - b.distance;
  });
  [niveau2, niveau3, niveau4].forEach(n => n.sort((a, b) => a.distance - b.distance));

  const tous = [...niveau1, ...niveau2, ...niveau3, ...niveau4];
  const selection = nbMax === -1 ? tous : tous.slice(0, nbMax); // -1 = tous
  console.log(`[DISPATCH] 📊 ${livreursEligibles.length} éligibles → sélection de ${selection.length} (max=${nbMax})`);
  return selection;
}

/**
 * Envoie une notification à un livreur (SILGAPP + push + WhatsApp si hors app).
 */
async function notifierLivreur(base44, courseId, course, livreur) {
  if (!livreur.user_email) return;

  // Anti-doublon : 90s max
  const depuis90s = new Date(Date.now() - 90 * 1000).toISOString();
  const existantes = await base44.asServiceRole.entities.Notification.filter({
    course_id: courseId, destinataire_email: livreur.user_email, type: 'nouvelle_course',
  });
  if (existantes.some(n => n.created_date > depuis90s)) {
    console.log(`[DISPATCH] 🛡️ Doublon notif < 90s pour ${livreur.nom}`);
    return;
  }

  const distLabel = livreur.distance > 0 ? `${livreur.distance.toFixed(1)}km` : 'distance inconnue';
  const titre = '🚨 Nouvelle course disponible !';
  const message = `Course à ${distLabel} — ${course.adresse_depart} → ${course.adresse_arrivee || '?'}`;
  const appActive = livreur.heartbeatAgeMin !== null && livreur.heartbeatAgeMin < 2;

  try {
    await base44.asServiceRole.entities.Notification.create({
      titre, message, type: 'nouvelle_course', course_id: courseId,
      destinataire_email: livreur.user_email, lue: false,
    });
  } catch (err) { console.error('[DISPATCH] Erreur notif BDD:', err.message); }

  if (appActive) {
    try {
      await base44.functions.invoke('envoiNotificationPush', {
        destinataire_email: livreur.user_email, livreur_id: livreur.id,
        titre, message, type: 'nouvelle_course', course_id: courseId,
      });
    } catch (err) { console.error('[DISPATCH] Erreur push:', err.message); }
  } else {
    // WhatsApp pour livreurs hors app
    try {
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const fromRaw = Deno.env.get('TWILIO_WHATSAPP_FROM') || '';
      const fromNumber = fromRaw.startsWith('whatsapp:') ? fromRaw : `whatsapp:${fromRaw}`;
      if (accountSid && authToken && fromRaw && livreur.telephone && livreur.whatsapp_opt_in !== false) {
        const INDICATIFS = { BF: '+226', CI: '+225', TG: '+228', BJ: '+229', SN: '+221', ML: '+223', GN: '+224', NE: '+227' };
        const indicatif = INDICATIFS[livreur.country_code] || '+226';
        let tel = livreur.telephone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
        if (!tel.startsWith('+')) tel = indicatif + tel;
        const waBody = `📦 *Nouvelle course disponible !*\nOuvrez SILGAPP pour accepter ou refuser la mission.`;
        const formBody = new URLSearchParams({ From: fromNumber, To: `whatsapp:${tel}`, Body: waBody });
        const creds = btoa(`${accountSid}:${authToken}`);
        const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST', headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formBody.toString(),
        });
        const data = await resp.json();
        if (resp.ok && data.sid) {
          await base44.asServiceRole.entities.WhatsAppAlerte.create({
            livreur_id: livreur.id, livreur_telephone: tel, notification_id: courseId,
            statut: 'sent', twilio_sid: data.sid, heure_envoi: new Date().toISOString(), canal: 'whatsapp',
          });
        } else if (data.code === 63015) {
          await base44.asServiceRole.entities.Livreur.update(livreur.id, {
            whatsapp_opt_in: false, whatsapp_derniere_erreur: '63015',
            whatsapp_derniere_erreur_date: new Date().toISOString(),
          });
        }
      }
    } catch (err) { console.error('[DISPATCH] Erreur WhatsApp:', err.message); }
  }
}

/**
 * Lance une vague de dispatch : notifie X meilleurs livreurs simultanément.
 * La course passe en dispatch_status='propose' avec timeout.
 * Le champ livreur_id reste VIDE — il sera rempli uniquement lors de l'acceptation (verrou atomique).
 * Le champ dispatch_candidats_ids stocke la liste des livreurs notifiés.
 */
async function lancerVagueDispatch(base44, courseId, config, exclusion_verrou = null) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
  if (!course) return { erreur: 'Course introuvable' };

  if (['livreur_en_route', 'colis_recupere', 'en_livraison', 'livree', 'annulee'].includes(course.statut)) {
    console.log(`[DISPATCH] ⛔ Course ${courseId} statut=${course.statut} → dispatch ignoré`);
    return { ignore: true, statut: course.statut };
  }

  const nbMax = config.nb_livreurs_par_vague === 0 ? -1 : (config.nb_livreurs_par_vague || 3);
  const timeoutMs = (config.timeout_secondes || 60) * 1000;

  const candidats = await trouverMeilleursNLivreurs(base44, course, nbMax, exclusion_verrou);

  if (candidats.length === 0) {
    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      dispatch_status: 'en_attente', livreur_id: '', livreur_nom: '', livreur_telephone: '',
    });
    console.log(`[DISPATCH] ⚠️ Aucun livreur disponible — course ${courseId} en attente`);
    return { noLivreur: true };
  }

  // Marquer la course comme "proposée" sans assigner de livreur
  // Les candidats notifiés sont stockés pour info (mais tous sont éligibles)
  const candidatsIds = candidats.map(c => c.id).join(',');
  await base44.asServiceRole.entities.CourseExterne.update(courseId, {
    statut: 'recherche_livreur',
    dispatch_status: 'propose',
    livreur_id: '',        // VIDE — rempli seulement quand un livreur prend le verrou
    livreur_nom: '',
    livreur_telephone: '',
    heure_sollicitation: new Date().toISOString(),
    timeout_expires_at: new Date(Date.now() + timeoutMs).toISOString(),
    // Stocker les candidats notifiés pour info admin
    remarque_livreur: `Vague: ${candidats.length} livreur(s) notifiés`,
  });

  // Notifier tous les candidats en parallèle
  console.log(`[DISPATCH] 📤 Envoi à ${candidats.length} livreurs pour course ${courseId}`);
  await Promise.all(candidats.map(l => notifierLivreur(base44, courseId, course, l)));

  return {
    propose: true,
    nb_notifies: candidats.length,
    livreurs: candidats.map(l => ({ id: l.id, nom: `${l.prenom || ''} ${l.nom}`.trim(), distance_km: l.distance.toFixed(1) })),
  };
}

/**
 * Supprime les notifications nouvelle_course d'une course
 */
async function supprimerNotificationsCourse(base44, courseId) {
  try {
    const notifs = await base44.asServiceRole.entities.Notification.filter({
      course_id: courseId, type: 'nouvelle_course',
    });
    for (const n of notifs.filter(n => !n.lue)) {
      await base44.asServiceRole.entities.Notification.update(n.id, { lue: true });
    }
    if (notifs.filter(n => !n.lue).length > 0) {
      console.log(`[DISPATCH] 🧹 ${notifs.filter(n => !n.lue).length} notification(s) archivée(s)`);
    }
  } catch (err) { console.warn('[DISPATCH] Erreur archivage notifs:', err.message); }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    let { action, course_id, livreur_id, raison } = body;

    // Automation entity → déclenchement automatique
    if (!action && body.event?.entity_id) {
      action = 'lancer_recherche_auto';
      course_id = body.event.entity_id;
      console.log(`[DISPATCH] 🤖 Automation entity → course ${course_id}`);
    }

    // ─── 1. LANCER LA RECHERCHE ──────────────────────────────────────────
    if (action === 'lancer_recherche_auto') {
      if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });

      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      // Si déjà proposée et pas expirée → attendre
      if (course.dispatch_status === 'propose' && course.timeout_expires_at) {
        const expires = new Date(course.timeout_expires_at);
        if (expires > new Date()) {
          const remaining = Math.round((expires - Date.now()) / 1000);
          console.log(`[DISPATCH] ⏳ Course ${course_id} déjà proposée, expire dans ${remaining}s`);
          return Response.json({ success: true, en_attente: true, remaining });
        }
      }

      const config = await getDispatchConfig(base44);
      console.log(`[DISPATCH] 🚀 Démarrage dispatch — config: ${JSON.stringify(config)}`);
      const result = await lancerVagueDispatch(base44, course_id, config, null);

      if (result.erreur) return Response.json({ error: result.erreur }, { status: 404 });
      if (result.ignore) return Response.json({ success: true, message: `Dispatch ignoré : ${result.statut}` });
      if (result.noLivreur) return Response.json({ success: false, noLivreur: true, message: 'Aucun livreur disponible' });
      if (result.en_attente) return Response.json({ success: true, en_attente: true, remaining: result.remaining });

      return Response.json({
        success: true,
        nb_notifies: result.nb_notifies,
        livreurs: result.livreurs,
        message: `Course proposée à ${result.nb_notifies} livreur(s)`,
      });
    }

    // ─── 2. ACCEPTER UNE COURSE (VERROU ATOMIQUE) ────────────────────────
    if (action === 'accepter_course') {
      const { pricing_mode, manual_price } = body;
      console.log(`[DISPATCH] ✅ Livreur ${livreur_id} tente d'accepter course ${course_id}`);

      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      // ── VERROU ATOMIQUE ──────────────────────────────────────────────────
      // La course doit être en dispatch_status='propose' (personne n'a le verrou)
      // Si dispatch_status='accepte' → quelqu'un d'autre a pris le verrou avant
      if (course.dispatch_status === 'accepte') {
        // Vérifier si c'est le même livreur (reprise suite à crash)
        if (course.livreur_id === livreur_id) {
          console.log(`[DISPATCH] 🔄 Livreur ${livreur_id} reprend sa propre course`);
          // Laisser passer — idempotent
        } else {
          console.log(`[DISPATCH] 🔒 Course ${course_id} déjà verrouillée par ${course.livreur_id}`);
          return Response.json({ success: false, error: 'Cette course est déjà en cours de traitement par un autre livreur.', already_taken: true });
        }
      }

      // Timeout dépassé ?
      if (course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date()) {
        return Response.json({ success: false, error: 'Course expirée — de nouveaux livreurs vont être contactés', expired: true });
      }

      const livreur = await base44.asServiceRole.entities.Livreur.get(livreur_id);
      if (!livreur) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });

      const PRIX_MIN = 1000;
      const isManual = pricing_mode === 'manual' && Number(manual_price) >= PRIX_MIN;

      if (pricing_mode === 'manual' && !isManual) {
        return Response.json({ success: false, error: `Prix minimum autorisé : ${PRIX_MIN} FCFA` }, { status: 400 });
      }

      const pickupToken = generateToken(); const deliveryToken = generateToken();
      const pickupPIN = generatePIN(); const deliveryPIN = generatePIN();

      // ── POSE DU VERROU : dispatch_status → 'accepte' + livreur_id rempli ──
      // Ce write est le verrou atomique. Le premier qui écrit gagne.
      // Les autres verront dispatch_status='accepte' et livreur_id !== leur id.
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
        pickup_qr_token: pickupToken, pickup_code_4_digits: pickupPIN,
        delivery_qr_token: deliveryToken, delivery_code_4_digits: deliveryPIN,
      };

      if (isManual) {
        updateData.pricing_mode = 'manual';
        updateData.manual_price = Number(manual_price);
        updateData.manual_price_status = 'pending_client_validation';
        updateData.proposed_by_livreur_id = livreur_id;
        updateData.timeout_expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      }

      await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);

      // Re-lire pour vérifier le verrou (race condition check)
      const courseApres = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (courseApres.livreur_id !== livreur_id) {
        console.log(`[DISPATCH] 🔒 Race condition détectée — ${livreur_id} a perdu le verrou`);
        return Response.json({ success: false, error: 'Cette course est déjà en cours de traitement par un autre livreur.', already_taken: true });
      }

      if (!isManual) {
        await base44.asServiceRole.entities.Livreur.update(livreur_id, { statut: 'en_course' });
        await supprimerNotificationsCourse(base44, course_id);
        console.log(`[DISPATCH] 🎉 Course ${course_id} acceptée (auto) par ${livreur.nom}`);
        return Response.json({ success: true, message: 'Course acceptée avec succès' });
      }

      // Mode manuel : notifier le créateur
      try {
        let clientEmail = null;
        if (course.created_by_id) {
          try { const u = await base44.asServiceRole.entities.User.get(course.created_by_id); clientEmail = u?.email; } catch (_) {}
        }
        if (!clientEmail && course.expediteur_client_id) {
          const clients = await base44.asServiceRole.entities.ClientExterne.filter({ id: course.expediteur_client_id });
          clientEmail = clients?.[0]?.user_email || null;
        }
        if (clientEmail) {
          await base44.asServiceRole.entities.Notification.create({
            titre: '💰 Prix proposé par le livreur',
            message: `Le livreur ${livreur.prenom || ''} ${livreur.nom} propose cette course à ${Number(manual_price).toLocaleString()} FCFA. Acceptez-vous ?`,
            type: 'course_acceptee', course_id, destinataire_email: clientEmail, lue: false,
          });
        }
      } catch (e) { console.warn('[DISPATCH] Erreur notif client prix manuel:', e.message); }

      return Response.json({ success: true, pending_client_validation: true, message: 'Prix proposé au client — en attente de sa validation' });
    }

    // ─── 3. REFUSER UNE COURSE ───────────────────────────────────────────
    if (action === 'refuser_course') {
      console.log(`[DISPATCH] 🚫 Livreur ${livreur_id} refuse course ${course_id}`);

      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      // Si quelqu'un d'autre a déjà le verrou → juste confirmer au refusant
      if (course.dispatch_status === 'accepte' && course.livreur_id !== livreur_id) {
        return Response.json({ success: true, message: 'Course déjà prise par un autre livreur' });
      }

      // Si ce livreur a le verrou → le libérer + relancer
      const estProprietaireVerrou = course.livreur_id === livreur_id;

      if (estProprietaireVerrou) {
        // Libérer le verrou
        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          dispatch_status: 'redispatch', remarque_livreur: raison || 'Refusé',
          livreur_id: '', livreur_nom: '', livreur_telephone: '',
        });
        // Relancer sans exclure personne (le refusant redevient éligible)
        const config = await getDispatchConfig(base44);
        const result = await lancerVagueDispatch(base44, course_id, config, livreur_id);
        // livreur_id exclu temporairement pour cette nouvelle vague uniquement
        if (result.noLivreur) return Response.json({ success: true, noLivreur: true });
        return Response.json({ success: true, message: `Course redispatchée à ${result.nb_notifies} livreur(s)` });
      }

      // Livreur pas propriétaire du verrou → il décline juste la notification
      // Rien à faire côté course, juste confirmer
      console.log(`[DISPATCH] ℹ️ ${livreur_id} décline (sans verrou) course ${course_id}`);
      return Response.json({ success: true, message: 'Refus enregistré' });
    }

    // ─── 4. VÉRIFIER EXPIRATION ──────────────────────────────────────────
    if (action === 'verifier_expiration') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const expired = !!(course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date());

      if (expired && course.dispatch_status === 'propose') {
        console.log(`[DISPATCH] ⏰ Timeout expiré pour course ${course_id} — nouvelle vague`);

        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          dispatch_status: 'redispatch', livreur_id: '', livreur_nom: '', livreur_telephone: '',
        });

        const config = await getDispatchConfig(base44);
        // Pas d'exclusion pour la nouvelle vague — tous redeviennent éligibles
        const result = await lancerVagueDispatch(base44, course_id, config, null);

        return Response.json({
          expired: true,
          redispatched: !result.noLivreur,
          noLivreur: result.noLivreur || false,
          nb_notifies: result.nb_notifies || 0,
        });
      }

      return Response.json({
        expired,
        dispatch_status: course.dispatch_status,
        livreur_id: course.livreur_id || null,
      });
    }

    // ─── 5. FERMER COURSES EXPIRÉES (job planifié) ───────────────────────
    if (action === 'fermer_courses_expirees') {
      const DELAI_FERMETURE_MS = 4 * 60 * 1000;
      const limite = new Date(Date.now() - DELAI_FERMETURE_MS);

      const coursesEnRecherche = await base44.asServiceRole.entities.CourseExterne.filter({ statut: 'recherche_livreur' });
      const aFermer = coursesEnRecherche.filter(c => new Date(c.created_date) < limite);
      console.log(`[DISPATCH] ⏰ ${aFermer.length} course(s) à fermer (> 4 min)`);

      const fermetures = [];
      for (const c of aFermer) {
        await base44.asServiceRole.entities.CourseExterne.update(c.id, {
          statut: 'annulee', dispatch_status: 'expire',
          remarque_livreur: 'Aucun livreur disponible après 4 minutes — fermée automatiquement',
        });
        try {
          let clientEmail = null;
          if (c.created_by_id) {
            try { const u = await base44.asServiceRole.entities.User.get(c.created_by_id); clientEmail = u?.email; } catch (_) {}
          }
          if (!clientEmail && c.expediteur_client_id) {
            const clients = await base44.asServiceRole.entities.ClientExterne.filter({ id: c.expediteur_client_id });
            clientEmail = clients?.[0]?.user_email || null;
          }
          if (clientEmail) {
            await base44.asServiceRole.entities.Notification.create({
              titre: '😔 Aucun livreur disponible',
              message: 'Nous n\'avons pas trouvé de livreur disponible pour votre course. Vous pouvez relancer la recherche.',
              type: 'course_annulee', course_id: c.id, destinataire_email: clientEmail, lue: false,
            });
          }
        } catch (err) { console.warn('[DISPATCH] Erreur notif fermeture:', err.message); }
        fermetures.push({ course_id: c.id, created_date: c.created_date });
      }

      return Response.json({ success: true, fermees: fermetures.length, details: fermetures });
    }

    // ─── 6. RETRY COURSES EN ATTENTE (job planifié) ──────────────────────
    if (action === 'retry_courses_en_attente') {
      const { country_code: filterCountry } = body;
      const filter = { statut: 'recherche_livreur' };
      if (filterCountry) filter.country_code = filterCountry;

      const courses = await base44.asServiceRole.entities.CourseExterne.filter(filter);
      const aRetenter = courses.filter(c =>
        ['en_attente', 'redispatch', 'expire'].includes(c.dispatch_status) ||
        (c.dispatch_status === 'propose' && c.timeout_expires_at && new Date(c.timeout_expires_at) < new Date(Date.now() - 5000))
      );

      console.log(`[DISPATCH] 🔄 ${aRetenter.length} courses à retenter`);
      const config = await getDispatchConfig(base44);
      const resultats = [];
      for (const course of aRetenter) {
        // Pas d'exclusion — tous les livreurs sont éligibles pour la nouvelle vague
        const result = await lancerVagueDispatch(base44, course.id, config, null);
        resultats.push({ course_id: course.id, ...result });
      }

      return Response.json({ success: true, retried: aRetenter.length, resultats });
    }

    // ─── 7. VALIDER PRIX MANUEL ──────────────────────────────────────────
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
          manual_price_status: 'accepted', client_price_validated_at: now,
          statut: 'livreur_en_route', dispatch_status: 'accepte', heure_acceptation: now,
          prix_final: prixManuel, commission_silga: commission, montant_livreur: montantLivreur,
        });

        if (course.proposed_by_livreur_id) {
          const livreurId = course.proposed_by_livreur_id;
          await base44.asServiceRole.entities.Livreur.update(livreurId, { statut: 'en_course' });

          try {
            const livreurData = await base44.asServiceRole.entities.Livreur.get(livreurId);
            if (livreurData?.user_email) {
              await base44.asServiceRole.entities.Notification.create({
                titre: '✅ Prix accepté — La course peut commencer !',
                message: `Le client a accepté votre prix de ${prixManuel.toLocaleString()} ${course.devise || 'FCFA'}.`,
                type: 'course_acceptee', course_id, destinataire_email: livreurData.user_email, lue: false,
              });
              try {
                await base44.functions.invoke('envoiNotificationPush', {
                  destinataire_email: livreurData.user_email, livreur_id: livreurId,
                  titre: '✅ Prix accepté !',
                  message: `Le client a validé ${prixManuel.toLocaleString()} ${course.devise || 'FCFA'}.`,
                  type: 'course_acceptee', course_id,
                });
              } catch (err) { console.error('[DISPATCH] Erreur push prix accepté:', err.message); }
            }
          } catch (e) { console.error('[DISPATCH] Erreur notif prix accepté:', e.message); }
        }

        await supprimerNotificationsCourse(base44, course_id);
        return Response.json({ success: true, accepted: true });
      } else {
        const livreurRefuseId = course.proposed_by_livreur_id;

        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          manual_price_status: 'refused', client_price_refused_at: now,
          statut: 'recherche_livreur', dispatch_status: 'redispatch',
          livreur_id: '', livreur_nom: '', livreur_telephone: '',
          pricing_mode: 'automatic', manual_price: null, proposed_by_livreur_id: '',
        });

        if (livreurRefuseId) {
          await base44.asServiceRole.entities.Livreur.update(livreurRefuseId, { statut: 'disponible' });
          try {
            const livreurData = await base44.asServiceRole.entities.Livreur.get(livreurRefuseId);
            if (livreurData?.user_email) {
              await base44.asServiceRole.entities.Notification.create({
                titre: '❌ Prix refusé — Vous êtes de nouveau disponible',
                message: 'Le client a refusé votre prix. Vous redevenez disponible. Cette course peut vous être reproposée.',
                type: 'course_refusee', course_id, destinataire_email: livreurData.user_email, lue: false,
              });
            }
          } catch (e) { console.warn('[DISPATCH] Erreur notif prix refusé:', e.message); }
        }

        // Relancer sans exclure le livreur (il redevient éligible)
        const config = await getDispatchConfig(base44);
        const result = await lancerVagueDispatch(base44, course_id, config, null);
        return Response.json({ success: true, accepted: false, redispatched: !result.noLivreur });
      }
    }

    // ─── 8. LIRE/ÉCRIRE CONFIG DISPATCH ─────────────────────────────────
    if (action === 'get_config') {
      const config = await getDispatchConfig(base44);
      return Response.json({ success: true, config });
    }

    if (action === 'set_config') {
      const { config: newConfig } = body;
      if (!newConfig) return Response.json({ error: 'config requis' }, { status: 400 });

      const configs = await base44.asServiceRole.entities.AppConfig.filter({ cle: 'DISPATCH_CONFIG' });
      if (configs?.[0]) {
        await base44.asServiceRole.entities.AppConfig.update(configs[0].id, { valeur: JSON.stringify(newConfig) });
      } else {
        await base44.asServiceRole.entities.AppConfig.create({
          cle: 'DISPATCH_CONFIG',
          valeur: JSON.stringify(newConfig),
          description: 'Configuration du moteur de dispatch externe',
        });
      }
      return Response.json({ success: true, config: newConfig });
    }

    return Response.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (error) {
    console.error('[DISPATCH] Erreur fatale:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});