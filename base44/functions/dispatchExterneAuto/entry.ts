import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeCountryCode(value) {
  return String(value || '').trim().toUpperCase();
}

async function verifierPaysCourseLivreur(base44, course, livreurId, contexte) {
  const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId);
  if (!livreur) {
    return {
      ok: false,
      status: 404,
      response: { success: false, found: false, error: 'Livreur introuvable' },
    };
  }

  const courseCountry = normalizeCountryCode(course?.country_code);
  const livreurCountry = normalizeCountryCode(livreur.country_code);
  if (!courseCountry || !livreurCountry || courseCountry !== livreurCountry) {
    console.error('[DISPATCH][COUNTRY_MISMATCH_BLOCKED]', {
      contexte,
      course_id: course?.id,
      livreur_id: livreurId,
      course_country_code: courseCountry || 'ABSENT',
      livreur_country_code: livreurCountry || 'ABSENT',
    });
    return {
      ok: false,
      status: 403,
      response: {
        success: false,
        found: false,
        error: 'country_mismatch',
        blocked_reason: 'country_mismatch',
      },
    };
  }

  return { ok: true, livreur, courseCountry, livreurCountry };
}

function reponseDejaPrise(reason, course, details = {}) {
  return {
    success: false,
    accepted: false,
    reason: 'already_taken',
    already_taken: true,
    error: 'Cette course a deja ete prise par un autre livreur',
    dispatch_status: course?.dispatch_status || '',
    existing_livreur_id: course?.livreur_id || '',
    accepted_by_livreur_id: course?.accepted_by_livreur_id || course?.livreur_id || '',
    details: reason,
    ...details,
  };
}

/**
 * Charge la configuration de dispatch depuis AppConfig.
 * Clés : DISPATCH_NB_LIVREURS (défaut: 3), DISPATCH_TIMEOUT_SEC (défaut: 60)
 */
async function chargerConfigDispatch(base44) {
  try {
    const configs = await base44.asServiceRole.entities.AppConfig.filter({});
    const nbConfig = configs.find(c => c.cle === 'DISPATCH_NB_LIVREURS');
    const timeoutConfig = configs.find(c => c.cle === 'DISPATCH_TIMEOUT_SEC');
    const nb = nbConfig ? (nbConfig.valeur === 'tous' ? 999 : parseInt(nbConfig.valeur, 10) || 3) : 3;
    const timeout = timeoutConfig ? (parseInt(timeoutConfig.valeur, 10) || 60) : 60;
    return { nb, timeout };
  } catch (err) {
    console.warn('[DISPATCH] ⚠️ Impossible de charger config dispatch, valeurs par défaut utilisées:', err.message);
    return { nb: 3, timeout: 60 };
  }
}

/**
 * Trouve les livreurs candidats classés par niveaux de priorité.
 * exclusions = [livreur_id] : le livreur qui détient actuellement le verrou actif.
 */
async function trouverLivreursCandidats(base44, course, exclusions = []) {
  if (!course.country_code) {
    console.error(`[DISPATCH] ❌ BLOQUÉ — course ${course.id} sans country_code`);
    return [];
  }

  const tousLivreurs = await base44.asServiceRole.entities.Livreur.filter({
    type_livreur: 'externe',
    validation: 'valide',
    actif: true,
    statut: 'disponible',
    country_code: course.country_code,
  });

  if (!tousLivreurs || tousLivreurs.length === 0) return [];

  // Livreurs déjà en course active (même pays)
  const coursesActives = await base44.asServiceRole.entities.CourseExterne.filter({ country_code: course.country_code });
  const livreurIdsEnCourse = new Set(
    coursesActives
      .filter(c => ['livreur_en_route', 'colis_recupere', 'en_livraison'].includes(c.statut) && c.livreur_id)
      .map(c => c.livreur_id)
  );

  const now = Date.now();

  const eligibles = tousLivreurs.filter(l => {
    if (!l.latitude || !l.longitude) return false;
    if (exclusions.includes(l.id)) return false;  // Seul le détenteur du verrou actif est exclu
    if (livreurIdsEnCourse.has(l.id)) return false;
    if (l.admin_hors_ligne === true) return false;
    return true;
  });

  // Calculer heartbeat, gps age, distance pour chaque livreur
  const niveau1 = [], niveau2 = [], niveau3 = [], niveau4 = [];

  eligibles.forEach(l => {
    const hbDate = l.last_seen_at || l.derniere_position_date;
    let heartbeatAgeMin = null;
    if (hbDate) {
      const hb = new Date(hbDate);
      if (!isNaN(hb.getTime())) heartbeatAgeMin = (now - hb.getTime()) / 60000;
    }

    let distance = 0;
    if (course.gps_depart_lat && course.gps_depart_lng && l.latitude && l.longitude) {
      distance = calculerDistance(course.gps_depart_lat, course.gps_depart_lng, l.latitude, l.longitude);
    }

    const enriched = { ...l, distance, heartbeatAgeMin };

    if (heartbeatAgeMin === null || heartbeatAgeMin >= 30) {
      niveau4.push(enriched);
    } else if (heartbeatAgeMin >= 10) {
      niveau3.push(enriched);
    } else if (heartbeatAgeMin >= 2) {
      niveau2.push(enriched);
    } else {
      const gpsDate = l.derniere_position_date;
      let gpsAgeMin = null;
      if (gpsDate) {
        const gps = new Date(gpsDate);
        if (!isNaN(gps.getTime())) gpsAgeMin = (now - gps.getTime()) / 60000;
      }
      enriched.gpsAgeMin = gpsAgeMin;
      niveau1.push(enriched);
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
  console.log(`[DISPATCH] 📊 ${tous.length} candidats (N1:${niveau1.length} N2:${niveau2.length} N3:${niveau3.length} N4:${niveau4.length})`);
  return tous;
}

/**
 * Envoie une notification à un livreur (SILGAPP + push + WhatsApp si hors app).
 */
async function notifierLivreur(base44, courseId, course, livreur, timeoutSec) {
  if (!livreur.user_email) return;

  // Anti-doublon : pas de notification si envoyée dans les X secondes (timeout actuel)
  const depuis = new Date(Date.now() - timeoutSec * 1000).toISOString();
  const existantes = await base44.asServiceRole.entities.Notification.filter({
    course_id: courseId,
    destinataire_email: livreur.user_email,
    type: 'nouvelle_course',
  });
  const recentes = existantes.filter(n => n.created_date > depuis);
  if (recentes.length > 0) {
    console.log(`[DISPATCH] 🛡️ Doublon notification (< ${timeoutSec}s) pour ${livreur.user_email}`);
    return;
  }

  const distanceSafe = livreur.distance ? Number(livreur.distance).toFixed(1) : '?';
  const titre = '🚨 Nouvelle course disponible !';
  const message = `Course à ${distanceSafe}km — ${course.adresse_depart} → ${course.adresse_arrivee || '?'}`;

  const heartbeatAgeMin = livreur.heartbeatAgeMin;
  const appActive = heartbeatAgeMin !== null && heartbeatAgeMin < 2;

  // Notification BDD (toujours)
  try {
    await base44.asServiceRole.entities.Notification.create({
      titre, message, type: 'nouvelle_course',
      course_id: courseId, destinataire_email: livreur.user_email, lue: false,
    });
  } catch (err) {
    console.error('[DISPATCH] ❌ Notif BDD:', err.message);
  }

  // Push Firebase
  try {
    await base44.functions.invoke('envoiNotificationPush', {
      destinataire_email: livreur.user_email, livreur_id: livreur.id,
      titre, message, type: 'nouvelle_course', course_id: courseId,
    });
  } catch (err) {
    console.error('[DISPATCH] ❌ Push Firebase:', err.message);
  }

  // WhatsApp si hors app
  if (!appActive && livreur.telephone) {
    try {
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const fromRaw = Deno.env.get('TWILIO_WHATSAPP_FROM') || '';
      if (accountSid && authToken && fromRaw) {
        const INDICATIFS = { BF: '+226', CI: '+225', TG: '+228', BJ: '+229', SN: '+221', ML: '+223', GN: '+224', NE: '+227' };
        const indicatif = INDICATIFS[livreur.country_code] || '+226';
        let tel = livreur.telephone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
        if (!tel.startsWith('+')) tel = indicatif + tel;

        if (livreur.whatsapp_opt_in !== false || livreur.whatsapp_opt_in_date) {
          const fromNumber = fromRaw.startsWith('whatsapp:') ? fromRaw : `whatsapp:${fromRaw}`;
          const formData = new URLSearchParams();
          formData.append('From', fromNumber);
          formData.append('To', `whatsapp:${tel}`);
          formData.append('Body', `📦 *Nouvelle course disponible !*\nOuvrez SILGAPP pour accepter ou refuser.`);

          const creds = btoa(`${accountSid}:${authToken}`);
          const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
          });
          const data = await resp.json();
          if (resp.ok && data.sid) {
            await base44.asServiceRole.entities.WhatsAppAlerte.create({
              livreur_id: livreur.id, livreur_telephone: tel,
              notification_id: courseId, statut: 'sent',
              twilio_sid: data.sid, heure_envoi: new Date().toISOString(), canal: 'whatsapp',
            });
          } else if (data.code === 63015) {
            await base44.asServiceRole.entities.Livreur.update(livreur.id, {
              whatsapp_opt_in: false, whatsapp_derniere_erreur: '63015',
              whatsapp_derniere_erreur_date: new Date().toISOString(),
            });
          }
        }
      }
    } catch (err) {
      console.error('[DISPATCH] ❌ WhatsApp:', err.message);
    }
  }

  console.log(`[DISPATCH] 📤 Notifié: ${livreur.nom} (${distanceSafe}km, HB: ${heartbeatAgeMin?.toFixed(1) || '?'}min)`);
}

/**
 * DISPATCH MULTI-LIVREURS :
 * Sélectionne les X meilleurs candidats et leur envoie la course simultanément.
 * Stocke les IDs notifiés dans dispatch_notified_ids (JSON sur la course).
 * Le livreur_id principal est VIDE jusqu'à ce qu'un livreur accepte (verrou atomique).
 */
async function lancerDispatchMulti(base44, courseId, exclusions = []) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
  if (!course) return { erreur: 'Course introuvable' };

  if (['livreur_en_route', 'colis_recupere', 'en_livraison', 'livree', 'annulee'].includes(course.statut)) {
    return { ignore: true, statut: course.statut };
  }

  // Si un livreur détient le verrou (dispatch_status = 'propose') et pas encore expiré → attendre
  if (course.dispatch_status === 'propose' && course.livreur_id && course.timeout_expires_at) {
    const expires = new Date(course.timeout_expires_at);
    if (expires > new Date()) {
      const remaining = Math.round((expires - Date.now()) / 1000);
      console.log(`[DISPATCH] ⏳ Verrou actif sur course ${courseId} (livreur ${course.livreur_id}), expire dans ${remaining}s`);
      return { en_attente: true, remaining };
    }
  }

  const config = await chargerConfigDispatch(base44);
  console.log(`[DISPATCH] ⚙️ Config: ${config.nb} livreurs, ${config.timeout}s`);

  // Trouver les meilleurs candidats
  // exclusions = uniquement le livreur qui détient le verrou actif (si price refused ou expired)
  const candidats = await trouverLivreursCandidats(base44, course, exclusions);

  if (candidats.length === 0) {
    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      dispatch_status: 'en_attente',
      livreur_id: '',
      livreur_nom: '',
    });
    console.log(`[DISPATCH] ⚠️ Aucun livreur disponible — course ${courseId} en attente`);
    return { noLivreur: true };
  }

  // Sélectionner les X meilleurs (tous si config.nb >= 999)
  const selection = config.nb >= 999 ? candidats : candidats.slice(0, config.nb);
  console.log(`[DISPATCH] 🎯 Sélection de ${selection.length}/${candidats.length} livreurs pour course ${courseId}`);

  const timeoutAt = new Date(Date.now() + config.timeout * 1000).toISOString();
  const notifiedIds = selection.map(l => l.id);

  // Mettre à jour la course : pas de livreur_id fixé (verrou libre), liste des notifiés
  await base44.asServiceRole.entities.CourseExterne.update(courseId, {
    statut: 'recherche_livreur',
    dispatch_status: 'propose',  // "propose" = en attente de réponse
    livreur_id: '',              // Pas de livreur assigné avant acceptation
    livreur_nom: '',
    livreur_telephone: '',
    heure_sollicitation: new Date().toISOString(),
    timeout_expires_at: timeoutAt,
    dispatch_notified_ids: JSON.stringify(notifiedIds),
  });

  // Notifier tous les livreurs sélectionnés en parallèle
  const notifPromises = selection.map(l => notifierLivreur(base44, courseId, course, l, config.timeout));
  await Promise.allSettled(notifPromises);

  console.log(`[DISPATCH] ✅ ${selection.length} livreur(s) notifiés pour course ${courseId}, timeout: ${config.timeout}s`);
  return {
    propose: true,
    nb_notifies: selection.length,
    livreurs: selection.map(l => ({ id: l.id, nom: `${l.prenom || ''} ${l.nom}`.trim(), distance_km: l.distance?.toFixed(1) })),
    timeout_sec: config.timeout,
  };
}

/**
 * Archiver les notifications "nouvelle_course" d'une course.
 */
async function supprimerNotificationsCourse(base44, courseId) {
  try {
    const notifs = await base44.asServiceRole.entities.Notification.filter({ course_id: courseId, type: 'nouvelle_course' });
    const nonLues = notifs.filter(n => !n.lue);
    for (const n of nonLues) {
      await base44.asServiceRole.entities.Notification.update(n.id, { lue: true });
    }
    if (nonLues.length > 0) console.log(`[DISPATCH] 🧹 ${nonLues.length} notification(s) archivée(s)`);
  } catch (err) {
    console.warn('[DISPATCH] ⚠️ Erreur archivage:', err.message);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    let { action, course_id, livreur_id, raison } = body;

    // Déclenchement depuis automation entity
    if (!action && body.event?.entity_id) {
      action = 'lancer_recherche_auto';
      course_id = body.event.entity_id;
    }

    // ─── 1. Lancer la recherche automatique (multi-livreurs) ──────────────
    if (action === 'lancer_recherche_auto') {
      if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });

      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      if (!course.gps_depart_lat || !course.gps_depart_lng) {
        console.warn(`[DISPATCH] ⚠️ Course ${course_id} sans GPS`);
      }

      const result = await lancerDispatchMulti(base44, course_id, []);

      if (result.erreur) return Response.json({ error: result.erreur }, { status: 404 });
      if (result.ignore) return Response.json({ success: true, message: `Dispatch ignoré: ${result.statut}` });
      if (result.noLivreur) return Response.json({ success: false, noLivreur: true });
      if (result.en_attente) return Response.json({ success: true, en_attente: true });

      return Response.json({
        success: true,
        nb_notifies: result.nb_notifies,
        livreurs: result.livreurs,
        timeout_sec: result.timeout_sec,
      });
    }

    // ─── 2. Vérifier si un livreur est dans la liste notifiée ─────────────
    // Utilisé par le frontend livreur pour savoir si la course lui est proposée
    if (action === 'check_course_pour_livreur') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ found: false });

      const countryGuard = await verifierPaysCourseLivreur(base44, course, livreur_id, 'check_course_pour_livreur');
      if (!countryGuard.ok) return Response.json(countryGuard.response, { status: countryGuard.status });

      // Course annulée ou livrée → plus disponible, nettoyer les notifs du livreur
      if (course.statut === 'annulee' || course.statut === 'livree') {
        try {
          const livreurData = countryGuard.livreur;
          if (livreurData?.user_email) {
            const notifs = await base44.asServiceRole.entities.Notification.filter({
              course_id: course_id,
              destinataire_email: livreurData.user_email,
              type: 'nouvelle_course',
              lue: false,
            });
            for (const n of notifs) {
              await base44.asServiceRole.entities.Notification.update(n.id, { lue: true });
            }
          }
        } catch (_) {}
        return Response.json({ found: false, cancelled: true });
      }

      // Cours déjà acceptée par quelqu'un → notifier le demandeur
      if (course.dispatch_status === 'accepte') {
        return Response.json({ found: false, already_taken: true, taken_by: course.livreur_id });
      }

      // Vérifier si ce livreur est dans les notifiés
      let notifiedIds = [];
      try { notifiedIds = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
      const isNotified = notifiedIds.includes(livreur_id);

      if (!isNotified) return Response.json({ found: false });

      const expired = !!(course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date());

      return Response.json({
        found: true,
        course,
        expired,
        timeout_expires_at: course.timeout_expires_at,
      });
    }

    // ─── 3. Accepter une course — VERROU ATOMIQUE ─────────────────────────
    if (action === 'accepter_course') {
      const { pricing_mode, manual_price } = body;

      // ── VERROU ATOMIQUE RENFORCÉ ──
      // Re-fetch immédiat pour éviter race condition
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const countryGuard = await verifierPaysCourseLivreur(base44, course, livreur_id, 'accepter_course');
      if (!countryGuard.ok) return Response.json(countryGuard.response, { status: countryGuard.status });
      const livreur = countryGuard.livreur;

      console.log('[DISPATCH][ACCEPT_ATTEMPT]', {
        course_id,
        livreur_id,
        course_status: course.statut || '',
        dispatch_status: course.dispatch_status || '',
        existing_livreur_id: course.livreur_id || '',
        accepted_by_livreur_id: course.accepted_by_livreur_id || '',
      });

      // Vérification 1 : Si déjà acceptée par un autre
      if (course.dispatch_status === 'accepte' || course.dispatch_status === 'accepted') {
        return Response.json(reponseDejaPrise('dispatch_already_accepted', course));
      }

      // Vérification 2 : Si livreur_id est déjà fixé (même en propose)
      if (course.livreur_id || course.accepted_by_livreur_id) {
        return Response.json(reponseDejaPrise('livreur_lock_already_set', course));
      }

      if (course.dispatch_status !== 'propose') {
        return Response.json({
          success: false,
          accepted: false,
          reason: 'not_available',
          error: "Cette course n'est plus disponible",
          dispatch_status: course.dispatch_status || '',
        });
      }

      // Vérifier que ce livreur fait partie des notifiés
      let notifiedIds = [];
      try { notifiedIds = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
      // Rétrocompatibilité : si dispatch_notified_ids vide mais livreur_id correspond
      const isEligible = notifiedIds.includes(livreur_id) || course.livreur_id === livreur_id;
      if (!isEligible) {
        return Response.json({ success: false, error: 'Vous n\'êtes pas éligible pour cette course', not_eligible: true });
      }

      // Timeout dépassé ?
      if (course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date()) {
        return Response.json({ success: false, error: 'Course expirée', expired: true });
      }

      const PRIX_MIN = 1000;
      if (pricing_mode === 'manual') {
        const montant = Number(manual_price);
        if (!montant || montant < PRIX_MIN) {
          return Response.json({ success: false, error: `Prix minimum : ${PRIX_MIN} FCFA` }, { status: 400 });
        }
      }

      const isManual = pricing_mode === 'manual' && manual_price >= PRIX_MIN;

      // ── DELAI DE GRÂCE ANTI-RACE ──
      // Attendre 200ms pour laisser le temps à un éventuel autre livreur de verrouiller
      // Cela réduit drastiquement les doubles acceptations simultanées
      await new Promise(resolve => setTimeout(resolve, 200));

      // Re-vérification finale AVANT de verrouiller (double-check locking)
      const courseFinal = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      console.log('[DISPATCH][ACCEPT_FINAL_CHECK]', {
        course_id,
        livreur_id,
        course_status: courseFinal.statut || '',
        dispatch_status: courseFinal.dispatch_status || '',
        existing_livreur_id: courseFinal.livreur_id || '',
        accepted_by_livreur_id: courseFinal.accepted_by_livreur_id || '',
      });
      if (
        courseFinal.dispatch_status !== 'propose' ||
        courseFinal.livreur_id ||
        courseFinal.accepted_by_livreur_id
      ) {
        return Response.json(reponseDejaPrise('final_check_already_taken', courseFinal));
      }

      // Générer tokens QR/PIN
      const pickupToken = generateToken();
      const deliveryToken = generateToken();
      const pickupPIN = generatePIN();
      const deliveryPIN = generatePIN();

      // ── POSER LE VERROU ATOMIQUE ──
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
        accepted_by_livreur_id: livreur_id,
        accepted_at: isManual ? null : new Date().toISOString(),
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
        updateData.timeout_expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      }

      await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);

      if (!isManual) {
        await base44.asServiceRole.entities.Livreur.update(livreur_id, { statut: 'en_course' });
        await supprimerNotificationsCourse(base44, course_id);
        console.log(`[DISPATCH] 🎉 Course ${course_id} verrouillée (auto) par ${livreur_id}`);
        return Response.json({ success: true, accepted: true, course_id, livreur_id });
      }

      // Mode manuel : notifier le créateur de la course
      try {
        let clientEmail = null;
        if (course.created_by_id) {
          try {
            const creator = await base44.asServiceRole.entities.User.get(course.created_by_id);
            clientEmail = creator?.email || null;
          } catch (_) {}
        }
        if (!clientEmail && course.expediteur_client_id) {
          const dest = await base44.asServiceRole.entities.ClientExterne.filter({ id: course.expediteur_client_id });
          clientEmail = dest?.[0]?.user_email || null;
        }
        if (clientEmail) {
          await base44.asServiceRole.entities.Notification.create({
            titre: '💰 Prix proposé par le livreur',
            message: `${livreur.prenom || ''} ${livreur.nom} propose cette course à ${Number(manual_price).toLocaleString()} FCFA. Acceptez-vous ?`,
            type: 'generic',
            course_id: course_id,
            destinataire_email: clientEmail,
            lue: false,
          });
        }
      } catch (e) {
        console.warn('[DISPATCH] Erreur notif client prix manuel:', e.message);
      }

      return Response.json({ success: true, accepted: true, pending_client_validation: true, course_id, livreur_id });
    }

    // ─── 4. Refuser une course ─────────────────────────────────────────────
    if (action === 'refuser_course') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const countryGuard = await verifierPaysCourseLivreur(base44, course, livreur_id, 'refuser_course');
      if (!countryGuard.ok) return Response.json(countryGuard.response, { status: countryGuard.status });

      // Course déjà verrouillée par un AUTRE livreur → le refus est ignoré
      if (course.dispatch_status === 'accepte' && course.livreur_id !== livreur_id) {
        return Response.json({ success: true, message: 'Course déjà prise par un autre' });
      }

      // Si c'est ce livreur qui avait le verrou propose, on le libère
      const etaitVerrouillee = course.livreur_id === livreur_id;
      if (etaitVerrouillee) {
        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          dispatch_status: 'redispatch',
          remarque_livreur: raison || 'Refusé',
          livreur_id: '',
          livreur_nom: '',
          livreur_telephone: '',
        });
        // Redispatch sans exclure ce livreur (il peut être reproposé)
        const result = await lancerDispatchMulti(base44, course_id, []);
        if (result.noLivreur) return Response.json({ success: true, noLivreur: true });
        return Response.json({ success: true, nb_notifies: result.nb_notifies });
      }

      // Livreur dans les notifiés mais pas le verrou → juste ignorer
      return Response.json({ success: true });
    }

    // ─── 5. Vérifier expiration & redispatch ─────────────────────────────
    if (action === 'verifier_expiration') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const expired = !!(course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date());

      // Expiration du verrou (livreur en mode propose qui n'a pas répondu)
      if (expired && course.dispatch_status === 'propose' && course.livreur_id) {
        console.log(`[DISPATCH] ⏰ Verrou expiré course ${course_id} — redispatch`);
        const expiredLivreurId = course.livreur_id;

        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          dispatch_status: 'redispatch',
          livreur_id: '',
          livreur_nom: '',
          livreur_telephone: '',
        });

        const result = await lancerDispatchMulti(base44, course_id, []);
        return Response.json({ expired: true, redispatched: !result.noLivreur });
      }

      // Expiration vague multi : dispatch_status='propose' mais livreur_id vide (vague sans verrou)
      if (expired && course.dispatch_status === 'propose' && !course.livreur_id) {
        console.log(`[DISPATCH] ⏰ Vague expirée course ${course_id} — nouvelle sélection`);
        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          dispatch_status: 'redispatch',
        });
        const result = await lancerDispatchMulti(base44, course_id, []);
        return Response.json({ expired: true, redispatched: !result.noLivreur });
      }

      return Response.json({
        expired,
        dispatch_status: course.dispatch_status,
        livreur_id: course.livreur_id,
      });
    }

    // ─── 6. Retry courses en attente ─────────────────────────────────────
    if (action === 'retry_courses_en_attente') {
      const { country_code: filterCountry } = body;
      const filter = { statut: 'recherche_livreur' };
      if (filterCountry) filter.country_code = filterCountry;

      const courses = await base44.asServiceRole.entities.CourseExterne.filter(filter);
      const aRetenter = courses.filter(c =>
        ['en_attente', 'redispatch', 'expire'].includes(c.dispatch_status) ||
        (c.dispatch_status === 'propose' && c.timeout_expires_at && new Date(c.timeout_expires_at) < new Date(Date.now() - 5000))
      );

      const resultats = [];
      for (const course of aRetenter) {
        // Exclure uniquement le détenteur du verrou actif si expired
        const exclusions = [];
        if (course.livreur_id && course.dispatch_status === 'propose') exclusions.push(course.livreur_id);
        const result = await lancerDispatchMulti(base44, course.id, exclusions);
        resultats.push({ course_id: course.id, ...result });
      }
      return Response.json({ success: true, retried: aRetenter.length, resultats });
    }

    // ─── 7. Fermer courses sans réponse après délai ───────────────────────
    if (action === 'fermer_courses_expirees') {
      const config = await chargerConfigDispatch(base44);
      // Fermeture après max(4 min, 2×timeout)
      const DELAI_MS = Math.max(4 * 60 * 1000, 2 * config.timeout * 1000);
      const limite = new Date(Date.now() - DELAI_MS);

      const coursesEnRecherche = await base44.asServiceRole.entities.CourseExterne.filter({ statut: 'recherche_livreur' });
      const aFermer = coursesEnRecherche.filter(c => new Date(c.created_date) < limite);

      const fermetures = [];
      for (const c of aFermer) {
        await base44.asServiceRole.entities.CourseExterne.update(c.id, {
          statut: 'annulee',
          dispatch_status: 'expire',
          remarque_livreur: 'Aucun livreur disponible — fermée automatiquement',
        });

        try {
          let clientEmail = null;
          if (c.created_by_id) {
            try {
              const creator = await base44.asServiceRole.entities.User.get(c.created_by_id);
              clientEmail = creator?.email || null;
            } catch (_) {}
          }
          if (!clientEmail && c.expediteur_client_id) {
            const clients = await base44.asServiceRole.entities.ClientExterne.filter({ id: c.expediteur_client_id });
            clientEmail = clients?.[0]?.user_email || null;
          }
          if (clientEmail) {
            await base44.asServiceRole.entities.Notification.create({
              titre: '😔 Aucun livreur disponible',
              message: 'Nous n\'avons pas trouvé de livreur disponible. Vous pouvez relancer la recherche.',
              type: 'course_annulee',
              course_id: c.id,
              destinataire_email: clientEmail,
              lue: false,
            });
          }
        } catch (err) {
          console.warn('[DISPATCH] ⚠️ Erreur notif fermeture:', err.message);
        }

        fermetures.push({ course_id: c.id });
      }
      return Response.json({ success: true, fermees: fermetures.length });
    }

    // ─── 8. Valider le prix manuel côté client ────────────────────────────
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

        if (course.proposed_by_livreur_id) {
          const livreurId = course.proposed_by_livreur_id;
          await base44.asServiceRole.entities.Livreur.update(livreurId, { statut: 'en_course' });
          try {
            const livreurData = await base44.asServiceRole.entities.Livreur.get(livreurId);
            if (livreurData?.user_email) {
              await base44.asServiceRole.entities.Notification.create({
                titre: '✅ Prix accepté — La course peut commencer !',
                message: `Le client a accepté votre prix de ${prixManuel.toLocaleString()} ${course.devise || 'FCFA'}.`,
                type: 'course_acceptee', course_id: course_id,
                destinataire_email: livreurData.user_email, lue: false,
              });
              try {
                await base44.functions.invoke('envoiNotificationPush', {
                  destinataire_email: livreurData.user_email, livreur_id: livreurId,
                  titre: '✅ Prix accepté !',
                  message: `Le client a validé ${prixManuel.toLocaleString()} ${course.devise || 'FCFA'}.`,
                  type: 'course_acceptee', course_id: course_id,
                });
              } catch (_) {}
              if (!livreurData.app_active && livreurData.telephone) {
                try {
                  await base44.functions.invoke('envoyerAlerteWhatsApp', {
                    telephone: livreurData.telephone,
                    message: `✅ SILGAPP — Prix accepté !\nLe client a validé ${prixManuel.toLocaleString()} ${course.devise || 'FCFA'}.`,
                  });
                } catch (_) {}
              }
            }
          } catch (e) {
            console.error('[DISPATCH] ❌ Notif livreur prix accepté:', e.message);
          }
        }

        await supprimerNotificationsCourse(base44, course_id);
        return Response.json({ success: true, accepted: true });
      } else {
        // Refus client : libérer le verrou sans blacklister le livreur
        const livreurRefuseId = course.proposed_by_livreur_id;

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

        if (livreurRefuseId) {
          await base44.asServiceRole.entities.Livreur.update(livreurRefuseId, { statut: 'disponible' });
          try {
            const livreurData = await base44.asServiceRole.entities.Livreur.get(livreurRefuseId);
            if (livreurData?.user_email) {
              await base44.asServiceRole.entities.Notification.create({
                titre: '❌ Prix refusé — Vous êtes de nouveau disponible',
                message: 'Le client a refusé votre prix. Vous redevenez disponible.',
                type: 'course_refusee', course_id: course_id,
                destinataire_email: livreurData.user_email, lue: false,
              });
            }
          } catch (e) {
            console.warn('[DISPATCH] Erreur notif livreur prix refusé:', e.message);
          }
        }

        // Redispatch sans exclure le livreur (rééligible immédiatement)
        const result = await lancerDispatchMulti(base44, course_id, []);
        return Response.json({ success: true, accepted: false, redispatched: !result.noLivreur });
      }
    }

    // ─── 9. Lire la config dispatch ───────────────────────────────────────
    if (action === 'get_config') {
      const config = await chargerConfigDispatch(base44);
      return Response.json({ success: true, config });
    }

    // ─── 10. Sauvegarder la config dispatch ──────────────────────────────
    if (action === 'set_config') {
      const { nb_livreurs, timeout_sec } = body;
      const configs = await base44.asServiceRole.entities.AppConfig.filter({});

      const upsert = async (cle, valeur, description) => {
        const existing = configs.find(c => c.cle === cle);
        if (existing) {
          await base44.asServiceRole.entities.AppConfig.update(existing.id, { valeur: String(valeur) });
        } else {
          await base44.asServiceRole.entities.AppConfig.create({ cle, valeur: String(valeur), description });
        }
      };

      if (nb_livreurs !== undefined) {
        await upsert('DISPATCH_NB_LIVREURS', nb_livreurs, 'Nombre de livreurs notifiés par vague de dispatch');
      }
      if (timeout_sec !== undefined) {
        await upsert('DISPATCH_TIMEOUT_SEC', timeout_sec, 'Délai de réponse par vague (secondes)');
      }

      return Response.json({ success: true, message: 'Configuration dispatch sauvegardée' });
    }

    return Response.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (error) {
    console.error('[DISPATCH] Erreur fatale:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
