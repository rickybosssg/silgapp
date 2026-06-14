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
    return { ok: false, status: 404, response: { success: false, found: false, error: 'Livreur introuvable' } };
  }
  const courseCountry = normalizeCountryCode(course?.country_code);
  const livreurCountry = normalizeCountryCode(livreur.country_code);
  if (!courseCountry || !livreurCountry || courseCountry !== livreurCountry) {
    console.error('[DISPATCH][COUNTRY_MISMATCH_BLOCKED]', { contexte, course_id: course?.id, livreur_id: livreurId, course_country_code: courseCountry || 'ABSENT', livreur_country_code: livreurCountry || 'ABSENT' });
    return { ok: false, status: 403, response: { success: false, found: false, error: 'country_mismatch', blocked_reason: 'country_mismatch' } };
  }
  return { ok: true, livreur, courseCountry, livreurCountry };
}

function reponseDejaPrise(reason, course, details = {}) {
  return {
    success: false, accepted: false, reason: 'already_taken', already_taken: true,
    error: 'Cette course a deja ete prise par un autre livreur',
    dispatch_status: course?.dispatch_status || '',
    existing_livreur_id: course?.livreur_id || '',
    accepted_by_livreur_id: course?.accepted_by_livreur_id || course?.livreur_id || '',
    details: reason, ...details,
  };
}

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
    return { nb: 3, timeout: 120 };
  }
}

/**
 * Trouve les livreurs candidats classés par priorité.
 * @param {Array} exclusions - IDs des livreurs déjà notifiés (à exclure totalement de ce cycle)
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

  const exclusionSet = new Set(exclusions);
  const now = Date.now();

  const eligibles = tousLivreurs.filter(l => {
    if (!l.latitude || !l.longitude) return false;
    if (exclusionSet.has(l.id)) return false;         // Déjà notifié pour cette course
    if (livreurIdsEnCourse.has(l.id)) return false;    // Déjà en course
    if (l.admin_hors_ligne === true) return false;
    return true;
  });

  // Classer par priorité : heartbeat récent > GPS récent > distance
  // 🕐 0-15 min = N1 (priorité max), 15-30 min = N2 (réduite), 30-60 min = N3 (faible)
  // 🚫 > 60 min = exclusion automatique + mise hors ligne
  const niveau1 = [], niveau2 = [], niveau3 = [];
  let nbMarquesHorsLigne = 0;

  eligibles.forEach(l => {
    const hbDate = l.last_seen_at || l.derniere_position_date;
    let heartbeatAgeMin = null;
    if (hbDate) {
      const hb = new Date(hbDate);
      if (!isNaN(hb.getTime())) heartbeatAgeMin = (now - hb.getTime()) / 60000;
    }

    // 🚫 Exclusion automatique : heartbeat > 60 min → hors_ligne immédiat
    if (heartbeatAgeMin !== null && heartbeatAgeMin > 60) {
      base44.asServiceRole.entities.Livreur.update(l.id, { statut: 'hors_ligne' }).catch(() => {});
      nbMarquesHorsLigne++;
      return; // exclu du dispatch
    }

    let distance = 0;
    if (course.gps_depart_lat && course.gps_depart_lng && l.latitude && l.longitude) {
      distance = calculerDistance(course.gps_depart_lat, course.gps_depart_lng, l.latitude, l.longitude);
    }

    const enriched = { ...l, distance, heartbeatAgeMin };

    if (heartbeatAgeMin === null || heartbeatAgeMin >= 30) {
      niveau3.push(enriched); // N3 : 30-60 min ou inconnu → priorité faible
    } else if (heartbeatAgeMin >= 15) {
      niveau2.push(enriched); // N2 : 15-30 min → priorité réduite
    } else {
      // N1 : 0-15 min → priorité maximale, trié par GPS puis distance
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
    // Micro-tranches GPS pour N1 : <2min idéal, <5min bon, <10min ok, >=10min dégradé
    const trancheA = gpsA < 2 ? 0 : gpsA < 5 ? 1 : gpsA < 10 ? 2 : 3;
    const trancheB = gpsB < 2 ? 0 : gpsB < 5 ? 1 : gpsB < 10 ? 2 : 3;
    if (trancheA !== trancheB) return trancheA - trancheB;
    return a.distance - b.distance;
  });
  [niveau2, niveau3].forEach(n => n.sort((a, b) => a.distance - b.distance));

  const tous = [...niveau1, ...niveau2, ...niveau3];
  if (nbMarquesHorsLigne > 0) {
    console.log(`[DISPATCH] 🚫 ${nbMarquesHorsLigne} livreur(s) marqué(s) hors_ligne (HB > 60 min)`);
  }
  console.log(`[DISPATCH] 📊 ${tous.length} candidats (exclus: ${exclusions.length}, hors_ligne: ${nbMarquesHorsLigne}) — N1:${niveau1.length} N2:${niveau2.length} N3:${niveau3.length}`);
  return tous;
}

async function notifierLivreur(base44, courseId, course, livreur, timeoutSec) {
  if (!livreur.user_email) return;

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
  const appActive = heartbeatAgeMin !== null && heartbeatAgeMin < 5; // N1: app active si HB < 5 min

  try {
    await base44.asServiceRole.entities.Notification.create({
      titre, message, type: 'nouvelle_course',
      course_id: courseId, destinataire_email: livreur.user_email, lue: false,
    });
  } catch (err) { console.error('[DISPATCH] ❌ Notif BDD:', err.message); }

  try {
    await base44.functions.invoke('envoiNotificationPush', {
      destinataire_email: livreur.user_email, livreur_id: livreur.id,
      titre, message, type: 'nouvelle_course', course_id: courseId,
    });
  } catch (err) { console.error('[DISPATCH] ❌ Push Firebase:', err.message); }

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
    } catch (err) { console.error('[DISPATCH] ❌ WhatsApp:', err.message); }
  }

  console.log(`[DISPATCH] 📤 Notifié: ${livreur.nom} (${distanceSafe}km, HB: ${heartbeatAgeMin?.toFixed(1) || '?'}min)`);
}

/**
 * DISPATCH MULTI-LIVREURS (NOUVELLE VERSION — 100% AUTOMATIQUE)
 *
 * - Sélectionne les X meilleurs candidats hors exclusions (livreurs déjà notifiés)
 * - Accumule les IDs notifiés dans dispatch_notified_ids (concaténation, pas remplacement)
 * - Si 0 candidat restant et déjà eu des notifs → cycle_epuise (attente 2 min puis reset)
 * - Si 0 candidat et jamais eu de notif → en_attente
 */
async function lancerDispatchMulti(base44, courseId, exclusions = []) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
  if (!course) return { erreur: 'Course introuvable' };

  if (['livreur_en_route', 'colis_recupere', 'en_livraison', 'livree', 'annulee'].includes(course.statut)) {
    return { ignore: true, statut: course.statut };
  }

  // Si un livreur détient le verrou actif → attendre
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

  // Trouver les meilleurs candidats hors exclusions (tous les déjà notifiés)
  const candidats = await trouverLivreursCandidats(base44, course, exclusions);

  // Récupérer les IDs déjà notifiés précédemment
  let dejaNotifies = [];
  try { dejaNotifies = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}

  if (candidats.length === 0) {
    if (dejaNotifies.length > 0) {
      // Tous les livreurs ont été sollicités → cycle épuisé
      // On vérifie si les 2 minutes d'attente sont écoulées (depuis la dernière sollicitation)
      const derniereSollicitation = course.heure_sollicitation ? new Date(course.heure_sollicitation) : null;
      const maintenant = new Date();
      const attenteEcoulee = derniereSollicitation
        ? (maintenant.getTime() - derniereSollicitation.getTime()) >= 2 * 60 * 1000
        : true;

      if (attenteEcoulee) {
        // Nouveau cycle : vider la liste des notifiés, recalculer les disponibilités
        console.log(`[DISPATCH] 🔄 Nouveau cycle — réinitialisation des notifiés pour course ${courseId}`);
        await base44.asServiceRole.entities.CourseExterne.update(courseId, {
          dispatch_status: 'en_attente',
          dispatch_notified_ids: '[]',
          livreur_id: '',
          livreur_nom: '',
        });
        // Relancer immédiatement avec exclusions vides (nouveau cycle)
        return await lancerDispatchMulti(base44, courseId, []);
      } else {
        // Encore en attente des 2 minutes
        console.log(`[DISPATCH] ⏳ Cycle épuisé — attente 2 min avant nouveau cycle pour course ${courseId}`);
        await base44.asServiceRole.entities.CourseExterne.update(courseId, {
          dispatch_status: 'cycle_epuise',
        });
        return { cycleEpuise: true };
      }
    } else {
      // Aucun livreur dispo du tout
      await base44.asServiceRole.entities.CourseExterne.update(courseId, {
        dispatch_status: 'en_attente',
        livreur_id: '',
        livreur_nom: '',
      });
      console.log(`[DISPATCH] ⚠️ Aucun livreur disponible — course ${courseId} en attente`);
      return { noLivreur: true };
    }
  }

  // Sélectionner les X meilleurs
  const selection = config.nb >= 999 ? candidats : candidats.slice(0, config.nb);
  console.log(`[DISPATCH] 🎯 Sélection de ${selection.length}/${candidats.length} livreurs pour course ${courseId}`);

  const timeoutAt = new Date(Date.now() + config.timeout * 1000).toISOString();
  const nouveauxNotifiedIds = selection.map(l => l.id);

  // ACCUMULER les IDs notifiés (concaténer, pas remplacer)
  const tousNotifies = [...dejaNotifies, ...nouveauxNotifiedIds];
  const totalNotifies = tousNotifies.length;

  await base44.asServiceRole.entities.CourseExterne.update(courseId, {
    statut: 'recherche_livreur',
    dispatch_status: 'propose',
    livreur_id: '',
    livreur_nom: '',
    livreur_telephone: '',
    heure_sollicitation: new Date().toISOString(),
    timeout_expires_at: timeoutAt,
    dispatch_notified_ids: JSON.stringify(tousNotifies),
  });

  // Notifier tous les livreurs sélectionnés en parallèle
  const notifPromises = selection.map(l => notifierLivreur(base44, courseId, course, l, config.timeout));
  await Promise.allSettled(notifPromises);

  console.log(`[DISPATCH] ✅ ${selection.length} livreur(s) notifiés (total cumulé: ${totalNotifies}) pour course ${courseId}, timeout: ${config.timeout}s`);
  return {
    propose: true,
    nb_notifies: selection.length,
    total_notifies: totalNotifies,
    livreurs: selection.map(l => ({ id: l.id, nom: `${l.prenom || ''} ${l.nom}`.trim(), distance_km: l.distance?.toFixed(1) })),
    timeout_sec: config.timeout,
  };
}

async function supprimerNotificationsCourse(base44, courseId) {
  try {
    const notifs = await base44.asServiceRole.entities.Notification.filter({ course_id: courseId, type: 'nouvelle_course' });
    const nonLues = notifs.filter(n => !n.lue);
    for (const n of nonLues) {
      await base44.asServiceRole.entities.Notification.update(n.id, { lue: true });
    }
    if (nonLues.length > 0) console.log(`[DISPATCH] 🧹 ${nonLues.length} notification(s) archivée(s)`);
  } catch (err) { console.warn('[DISPATCH] ⚠️ Erreur archivage:', err.message); }
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================
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
      if (result.cycleEpuise) return Response.json({ success: true, cycle_epuise: true });

      return Response.json({
        success: true,
        nb_notifies: result.nb_notifies,
        total_notifies: result.total_notifies,
        livreurs: result.livreurs,
        timeout_sec: result.timeout_sec,
      });
    }

    // ─── 2. Vérifier si un livreur est dans la liste notifiée ─────────────
    if (action === 'check_course_pour_livreur') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ found: false });

      const countryGuard = await verifierPaysCourseLivreur(base44, course, livreur_id, 'check_course_pour_livreur');
      if (!countryGuard.ok) return Response.json(countryGuard.response, { status: countryGuard.status });

      if (course.statut === 'annulee' || course.statut === 'livree') {
        try {
          const livreurData = countryGuard.livreur;
          if (livreurData?.user_email) {
            const notifs = await base44.asServiceRole.entities.Notification.filter({
              course_id: course_id, destinataire_email: livreurData.user_email, type: 'nouvelle_course', lue: false,
            });
            for (const n of notifs) { await base44.asServiceRole.entities.Notification.update(n.id, { lue: true }); }
          }
        } catch (_) {}
        return Response.json({ found: false, cancelled: true });
      }

      if (course.dispatch_status === 'accepte') {
        return Response.json({ found: false, already_taken: true, taken_by: course.livreur_id });
      }

      let notifiedIds = [];
      try { notifiedIds = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
      const isNotified = notifiedIds.includes(livreur_id);
      if (!isNotified) return Response.json({ found: false });

      const expired = !!(course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date());
      return Response.json({ found: true, course, expired, timeout_expires_at: course.timeout_expires_at });
    }

    // ─── 3. Accepter une course — VERROU ATOMIQUE ─────────────────────────
    if (action === 'accepter_course') {
      const { pricing_mode, manual_price } = body;

      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const countryGuard = await verifierPaysCourseLivreur(base44, course, livreur_id, 'accepter_course');
      if (!countryGuard.ok) return Response.json(countryGuard.response, { status: countryGuard.status });
      const livreur = countryGuard.livreur;

      console.log('[DISPATCH][ACCEPT_ATTEMPT]', {
        course_id, livreur_id, course_status: course.statut || '',
        dispatch_status: course.dispatch_status || '',
        existing_livreur_id: course.livreur_id || '',
        accepted_by_livreur_id: course.accepted_by_livreur_id || '',
      });

      if (course.dispatch_status === 'accepte' || course.dispatch_status === 'accepted') {
        return Response.json(reponseDejaPrise('dispatch_already_accepted', course));
      }

      if (course.livreur_id || course.accepted_by_livreur_id) {
        return Response.json(reponseDejaPrise('livreur_lock_already_set', course));
      }

      if (course.dispatch_status !== 'propose') {
        return Response.json({
          success: false, accepted: false, reason: 'not_available',
          error: "Cette course n'est plus disponible", dispatch_status: course.dispatch_status || '',
        });
      }

      let notifiedIds = [];
      try { notifiedIds = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
      const isEligible = notifiedIds.includes(livreur_id) || course.livreur_id === livreur_id;
      if (!isEligible) {
        return Response.json({ success: false, error: 'Vous n\'êtes pas éligible pour cette course', not_eligible: true });
      }

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

      // Délai de grâce anti-race
      await new Promise(resolve => setTimeout(resolve, 200));

      // Double-check locking
      const courseFinal = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      console.log('[DISPATCH][ACCEPT_FINAL_CHECK]', {
        course_id, livreur_id,
        course_status: courseFinal.statut || '',
        dispatch_status: courseFinal.dispatch_status || '',
        existing_livreur_id: courseFinal.livreur_id || '',
        accepted_by_livreur_id: courseFinal.accepted_by_livreur_id || '',
      });
      if (courseFinal.dispatch_status !== 'propose' || courseFinal.livreur_id || courseFinal.accepted_by_livreur_id) {
        return Response.json(reponseDejaPrise('final_check_already_taken', courseFinal));
      }

      const pickupToken = generateToken();
      const deliveryToken = generateToken();
      const pickupPIN = generatePIN();
      const deliveryPIN = generatePIN();

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

      // Mode manuel : notifier le client
      try {
        let clientEmail = null;
        if (course.created_by_id) {
          try { const creator = await base44.asServiceRole.entities.User.get(course.created_by_id); clientEmail = creator?.email || null; } catch (_) {}
        }
        if (!clientEmail && course.expediteur_client_id) {
          const dest = await base44.asServiceRole.entities.ClientExterne.filter({ id: course.expediteur_client_id });
          clientEmail = dest?.[0]?.user_email || null;
        }
        if (clientEmail) {
          await base44.asServiceRole.entities.Notification.create({
            titre: '💰 Prix proposé par le livreur',
            message: `${livreur.prenom || ''} ${livreur.nom} propose cette course à ${Number(manual_price).toLocaleString()} FCFA. Acceptez-vous ?`,
            type: 'generic', course_id: course_id, destinataire_email: clientEmail, lue: false,
          });
        }
      } catch (e) { console.warn('[DISPATCH] Erreur notif client prix manuel:', e.message); }

      return Response.json({ success: true, accepted: true, pending_client_validation: true, course_id, livreur_id });
    }

    // ─── 4. Refuser une course ─────────────────────────────────────────────
    if (action === 'refuser_course') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const countryGuard = await verifierPaysCourseLivreur(base44, course, livreur_id, 'refuser_course');
      if (!countryGuard.ok) return Response.json(countryGuard.response, { status: countryGuard.status });

      if (course.dispatch_status === 'accepte' && course.livreur_id !== livreur_id) {
        return Response.json({ success: true, message: 'Course déjà prise par un autre' });
      }

      const etaitVerrouillee = course.livreur_id === livreur_id;
      if (etaitVerrouillee) {
        // Libérer le verrou
        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          dispatch_status: 'redispatch',
          remarque_livreur: raison || 'Refusé',
          livreur_id: '',
          livreur_nom: '',
          livreur_telephone: '',
        });
        // Récupérer tous les déjà notifiés pour les exclure
        let dejaNotifies = [];
        try { dejaNotifies = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
        const result = await lancerDispatchMulti(base44, course_id, dejaNotifies);
        if (result.noLivreur) return Response.json({ success: true, noLivreur: true });
        if (result.cycleEpuise) return Response.json({ success: true, cycle_epuise: true });
        return Response.json({ success: true, nb_notifies: result.nb_notifies });
      }

      return Response.json({ success: true });
    }

    // ─── 5. Vérifier expiration & redispatch (avec exclusions cumulées) ──
    if (action === 'verifier_expiration') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const expired = !!(course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date());

      // Expiration du verrou actif
      if (expired && course.dispatch_status === 'propose' && course.livreur_id) {
        console.log(`[DISPATCH] ⏰ Verrou expiré course ${course_id} — redispatch`);

        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          dispatch_status: 'redispatch',
          livreur_id: '',
          livreur_nom: '',
          livreur_telephone: '',
        });

        // Passer TOUS les déjà notifiés comme exclusions
        let dejaNotifies = [];
        try { dejaNotifies = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
        const result = await lancerDispatchMulti(base44, course_id, dejaNotifies);
        return Response.json({ expired: true, redispatched: !result.noLivreur, nb_restants: result.total_notifies });
      }

      // Expiration vague multi (sans verrou)
      if (expired && course.dispatch_status === 'propose' && !course.livreur_id) {
        console.log(`[DISPATCH] ⏰ Vague expirée course ${course_id} — nouvelle sélection`);
        await base44.asServiceRole.entities.CourseExterne.update(course_id, { dispatch_status: 'redispatch' });

        let dejaNotifies = [];
        try { dejaNotifies = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
        const result = await lancerDispatchMulti(base44, course_id, dejaNotifies);
        return Response.json({ expired: true, redispatched: !result.noLivreur });
      }

      return Response.json({ expired, dispatch_status: course.dispatch_status, livreur_id: course.livreur_id });
    }

    // ─── 6. Retry courses en attente / cycle_epuise ───────────────────────
    if (action === 'retry_courses_en_attente') {
      const { country_code: filterCountry } = body;
      const filter = { statut: 'recherche_livreur' };
      if (filterCountry) filter.country_code = filterCountry;

      const courses = await base44.asServiceRole.entities.CourseExterne.filter(filter);
      const aRetenter = courses.filter(c =>
        ['en_attente', 'redispatch', 'cycle_epuise'].includes(c.dispatch_status) ||
        (c.dispatch_status === 'propose' && c.timeout_expires_at && new Date(c.timeout_expires_at) < new Date(Date.now() - 5000))
      );

      const resultats = [];
      for (const course of aRetenter) {
        let dejaNotifies = [];
        try { dejaNotifies = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}

        // Si cycle_epuise, on laisse lancerDispatchMulti gérer le reset après 2 min
        const result = await lancerDispatchMulti(base44, course.id, dejaNotifies);
        resultats.push({ course_id: course.id, ...result });
      }
      return Response.json({ success: true, retried: aRetenter.length, resultats });
    }

    // ─── 7. Valider le prix manuel côté client ────────────────────────────
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
                type: 'course_acceptee', course_id: course_id, destinataire_email: livreurData.user_email, lue: false,
              });
              try {
                await base44.functions.invoke('envoiNotificationPush', {
                  destinataire_email: livreurData.user_email, livreur_id: livreurId,
                  titre: '✅ Prix accepté !', message: `Le client a validé ${prixManuel.toLocaleString()} ${course.devise || 'FCFA'}.`,
                  type: 'course_acceptee', course_id: course_id,
                });
              } catch (_) {}
            }
          } catch (e) { console.error('[DISPATCH] ❌ Notif livreur prix accepté:', e.message); }
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
        }

        // Redispatch sans exclure (le refus était côté client, pas livreur)
        let dejaNotifies = [];
        try { dejaNotifies = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
        const result = await lancerDispatchMulti(base44, course_id, dejaNotifies);
        return Response.json({ success: true, accepted: false, redispatched: !result.noLivreur });
      }
    }

    // ─── 8. Lire la config dispatch ───────────────────────────────────────
    if (action === 'get_config') {
      const config = await chargerConfigDispatch(base44);
      return Response.json({ success: true, config });
    }

    // ─── 9. Sauvegarder la config dispatch ──────────────────────────────
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