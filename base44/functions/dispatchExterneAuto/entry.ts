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
    console.warn('[DISPATCH] âš ï¸ Impossible de charger config dispatch, valeurs par dÃ©faut utilisÃ©es:', err.message);
    return { nb: 3, timeout: 120 };
  }
}

async function chargerConfigVaguesGPS(base44) {
  try {
    const configs = await base44.asServiceRole.entities.DispatchWaveConfig.filter({});
    const cfg = configs[0];
    if (!cfg) {
      return {
        gps_waves_enabled: true,
        waves: [
          { size: 3, timeout_sec: 60 },
          { size: 5, timeout_sec: 60 },
          { size: 999, timeout_sec: 60 },
        ],
      };
    }
    const waves = JSON.parse(cfg.waves_json || '[]');
    return {
      gps_waves_enabled: cfg.gps_waves_enabled !== false,
      waves: waves.length > 0 ? waves : [
        { size: 3, timeout_sec: 60 },
        { size: 5, timeout_sec: 60 },
        { size: 999, timeout_sec: 60 },
      ],
    };
  } catch (err) {
    console.warn('[DISPATCH] âš ï¸ Impossible de charger config vagues GPS, dÃ©faut utilisÃ©:', err.message);
    return {
      gps_waves_enabled: true,
      waves: [
        { size: 3, timeout_sec: 60 },
        { size: 5, timeout_sec: 60 },
        { size: 999, timeout_sec: 60 },
      ],
    };
  }
}

/**
 * Trouve les livreurs candidats classÃ©s par prioritÃ©.
 * @param {Array} exclusions - IDs des livreurs dÃ©jÃ  notifiÃ©s (Ã  exclure totalement de ce cycle)
 */
async function trouverLivreursCandidats(base44, course, exclusions = []) {
  if (!course.country_code) {
    console.error(`[DISPATCH] âŒ BLOQUÃ‰ â€” course ${course.id} sans country_code`);
    return { tous: [], niveau1: [], niveau2: [], niveau3: [], pickupSource: 'none' };
  }

  const tousLivreurs = await base44.asServiceRole.entities.Livreur.filter({
    type_livreur: 'externe',
    validation: 'valide',
    actif: true,
    statut: 'disponible',
    country_code: course.country_code,
    bloque_encours: false,
  });

  if (!tousLivreurs || tousLivreurs.length === 0) return [];

  // ðŸ›¡ï¸ Le filtre statut: 'disponible' ci-dessus exclut dÃ©jÃ  les livreurs en_course.
  // Pas besoin de tÃ©lÃ©charger toutes les courses du pays (causait le rate limit).
  const livreurIdsEnCourse = new Set();

  const exclusionSet = new Set(exclusions);
  const now = Date.now();

  const eligibles = tousLivreurs.filter(l => {
    if (!l.latitude || !l.longitude) return false;
    if (exclusionSet.has(l.id)) return false;         // DÃ©jÃ  notifiÃ© pour cette course
    if (livreurIdsEnCourse.has(l.id)) return false;    // DÃ©jÃ  en course
    if (l.admin_hors_ligne === true) return false;
    return true;
  });

  // Classer par prioritÃ© : heartbeat rÃ©cent > GPS rÃ©cent > distance
  // ðŸ• 0-15 min = N1 (prioritÃ© max), 15-30 min = N2 (rÃ©duite), 30-60 min = N3 (faible)
  // ðŸš« > 60 min = exclusion automatique + mise hors ligne
  const niveau1 = [], niveau2 = [], niveau3 = [];
  let nbMarquesHorsLigne = 0;

  // ðŸ§  RÃ©soudre les coordonnÃ©es de pickup : GPS > quartier > fallback large
  let pickupLat = course.gps_depart_lat;
  let pickupLng = course.gps_depart_lng;
  let pickupSource = 'gps';

  if ((!pickupLat || !pickupLng) && course.quartier_depart) {
    try {
      const quartiers = await base44.asServiceRole.entities.Quartier.filter({
        country_code: course.country_code, nom: course.quartier_depart, actif: true,
      });
      if (quartiers?.[0]?.latitude && quartiers[0]?.longitude) {
        pickupLat = quartiers[0].latitude;
        pickupLng = quartiers[0].longitude;
        pickupSource = 'quartier';
        console.log(`[DISPATCH] ðŸ“ Fallback quartier: ${course.quartier_depart} (${pickupLat}, ${pickupLng})`);
      }
    } catch (_) {}
  }

  // Ni GPS ni quartier â†’ marquer explicitement pour le mode vagues
  if ((!pickupLat || !pickupLng) && pickupSource === 'gps') {
    pickupSource = 'none';
  }

  eligibles.forEach(l => {
    const hbDate = l.last_seen_at || l.derniere_position_date;
    let heartbeatAgeMin = null;
    if (hbDate) {
      const hb = new Date(hbDate);
      if (!isNaN(hb.getTime())) heartbeatAgeMin = (now - hb.getTime()) / 60000;
    }

    // ðŸš« Exclusion automatique : heartbeat > 60 min â†’ hors_ligne immÃ©diat
    if (heartbeatAgeMin !== null && heartbeatAgeMin > 60) {
      base44.asServiceRole.entities.Livreur.update(l.id, { statut: 'hors_ligne' }).catch(() => {});
      nbMarquesHorsLigne++;
      return; // exclu du dispatch
    }

    // distance = null quand ni GPS ni quartier â†’ pas de calcul fictif
    let distance = null;
    if (pickupLat && pickupLng && l.latitude && l.longitude) {
      distance = calculerDistance(pickupLat, pickupLng, l.latitude, l.longitude);
    }

    const enriched = { ...l, distance, heartbeatAgeMin };

    if (heartbeatAgeMin === null || heartbeatAgeMin >= 30) {
      niveau3.push(enriched); // N3 : 30-60 min ou inconnu â†’ prioritÃ© faible
    } else if (heartbeatAgeMin >= 15) {
      niveau2.push(enriched); // N2 : 15-30 min â†’ prioritÃ© rÃ©duite
    } else {
      // N1 : 0-15 min â†’ prioritÃ© maximale, triÃ© par GPS puis distance
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
    // distance peut Ãªtre null (ni GPS ni quartier)
    if (a.distance === null && b.distance === null) return 0;
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;
    return a.distance - b.distance;
  });
  [niveau2, niveau3].forEach(n => n.sort((a, b) => {
    if (a.distance === null && b.distance === null) return 0;
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;
    return a.distance - b.distance;
  }));

  const tous = [...niveau1, ...niveau2, ...niveau3];
  if (nbMarquesHorsLigne > 0) {
    console.log(`[DISPATCH] ðŸš« ${nbMarquesHorsLigne} livreur(s) marquÃ©(s) hors_ligne (HB > 60 min)`);
  }
  console.log(`[DISPATCH] ðŸ“Š ${tous.length} candidats (exclus: ${exclusions.length}, hors_ligne: ${nbMarquesHorsLigne}) â€” N1:${niveau1.length} N2:${niveau2.length} N3:${niveau3.length} â€” pickup: ${pickupSource}${pickupSource === 'quartier' ? ` (${course.quartier_depart})` : ''}`);
  return { tous, niveau1, niveau2, niveau3, pickupSource };
}

async function notifierLivreur(base44, courseId, course, livreur, timeoutSec) {
  if (!livreur.user_email) return;

  // ðŸ›¡ï¸ ANTI-DOUBLON PERMANENT â€” une seule notification par course par livreur
  const existantes = await base44.asServiceRole.entities.Notification.filter({
    course_id: courseId,
    destinataire_email: livreur.user_email,
    type: 'nouvelle_course',
  });
  if (existantes.length > 0) {
    console.log(`[DISPATCH] ðŸ›¡ï¸ Anti-doublon permanent â€” ${existantes.length} notif(s) existante(s) pour course ${courseId} / livreur ${livreur.user_email}`);
    // Si une notif non-lue existe, pas besoin d'en crÃ©er une nouvelle
    const nonLue = existantes.find(n => !n.lue);
    if (nonLue) {
      console.log(`[DISPATCH] ðŸ›¡ï¸ Notif non-lue dÃ©jÃ  existante (id=${nonLue.id}) â€” skip`);
      return;
    }
    // Si toutes sont lues, on peut en crÃ©er une nouvelle (re-dispatch aprÃ¨s reset)
    console.log(`[DISPATCH] ðŸ“¤ Toutes les notifs sont lues â€” nouvelle notif autorisÃ©e`);
  }

  const distanceSafe = livreur.distance ? Number(livreur.distance).toFixed(1) : '?';
  const titre = 'ðŸš¨ Nouvelle course disponible !';
  const message = `Course Ã  ${distanceSafe}km â€” ${course.adresse_depart} â†’ ${course.adresse_arrivee || '?'}`;

  const heartbeatAgeMin = livreur.heartbeatAgeMin;
  // N'envoyer WhatsApp que si le livreur n'a ni app ouverte ni foreground service actif
  const appOrBgActive = (livreur.app_active === true || livreur.background_active === true);
  const appActive = heartbeatAgeMin !== null && heartbeatAgeMin < 5 && appOrBgActive;

  try {
    await base44.asServiceRole.entities.Notification.create({
      titre, message, type: 'nouvelle_course',
      course_id: courseId, destinataire_email: livreur.user_email, lue: false,
    });
  } catch (err) { console.error('[DISPATCH] âŒ Notif BDD:', err.message); }

  try {
    await base44.functions.invoke('envoiNotificationPush', {
      destinataire_email: livreur.user_email, livreur_id: livreur.id,
      titre, message, type: 'nouvelle_course', course_id: courseId,
    });
  } catch (err) { console.error('[DISPATCH] âŒ Push Firebase:', err.message); }

  if (!appActive && livreur.telephone) {
    try {
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const fromRaw = Deno.env.get('TWILIO_WHATSAPP_FROM') || '';
      if (accountSid && authToken && fromRaw) {
        const INDICATIFS = { BF: '+226', CI: '+225', TG: '+228', BJ: '+229', SN: '+221', ML: '+223', GN: '+224', NE: '+227', GH: '+233' };
        const indicatif = INDICATIFS[livreur.country_code] || '+226';
        let tel = livreur.telephone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
        if (!tel.startsWith('+')) tel = indicatif + tel;

        if (livreur.whatsapp_opt_in !== false || livreur.whatsapp_opt_in_date) {
          const fromNumber = fromRaw.startsWith('whatsapp:') ? fromRaw : `whatsapp:${fromRaw}`;
          const formData = new URLSearchParams();
          formData.append('From', fromNumber);
          formData.append('To', `whatsapp:${tel}`);
          formData.append('Body', `ðŸ“¦ *Nouvelle course disponible !*\nOuvrez SILGAPP pour accepter ou refuser.`);

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
    } catch (err) { console.error('[DISPATCH] âŒ WhatsApp:', err.message); }
  }

  console.log(`[DISPATCH] ðŸ“¤ NotifiÃ©: ${livreur.nom} (${distanceSafe}km, HB: ${heartbeatAgeMin?.toFixed(1) || '?'}min)`);
}

/**
 * DISPATCH MULTI-LIVREURS (NOUVELLE VERSION â€” 100% AUTOMATIQUE)
 *
 * - SÃ©lectionne les X meilleurs candidats hors exclusions (livreurs dÃ©jÃ  notifiÃ©s)
 * - Accumule les IDs notifiÃ©s dans dispatch_notified_ids (concatÃ©nation, pas remplacement)
 * - Si 0 candidat restant et dÃ©jÃ  eu des notifs â†’ cycle_epuise (attente 2 min puis reset)
 * - Si 0 candidat et jamais eu de notif â†’ en_attente
 */
async function lancerDispatchMulti(base44, courseId, exclusions = []) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
  if (!course) return { erreur: 'Course introuvable' };

  if (['livreur_en_route', 'colis_recupere', 'en_livraison', 'livree', 'annulee'].includes(course.statut)) {
    return { ignore: true, statut: course.statut };
  }

  // ðŸ›¡ï¸ Fusionner les exclusions passÃ©es en paramÃ¨tre AVEC les IDs dÃ©jÃ  notifiÃ©s
  // stockÃ©s sur la course (dispatch_notified_ids). Cela garantit qu'un livreur
  // ayant annulÃ© ou dÃ©jÃ  Ã©tÃ© notifiÃ© ne soit JAMAIS re-sollicitÃ© pour cette course.
  let dejaNotifiesFusion = [];
  try { dejaNotifiesFusion = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
  exclusions = [...new Set([...exclusions, ...dejaNotifiesFusion])];

  // Si un livreur dÃ©tient le verrou actif â†’ attendre
  if (course.dispatch_status === 'propose' && course.livreur_id && course.timeout_expires_at) {
    const expires = new Date(course.timeout_expires_at);
    if (expires > new Date()) {
      const remaining = Math.round((expires - Date.now()) / 1000);
      console.log(`[DISPATCH] â³ Verrou actif sur course ${courseId} (livreur ${course.livreur_id}), expire dans ${remaining}s`);
      return { en_attente: true, remaining };
    }
  }

  // ðŸ›¡ï¸ Garde anti-double-traitement : course en vague active non expirÃ©e â†’ ne pas retraiter
  if (course.dispatch_status === 'propose' && !course.livreur_id && course.timeout_expires_at) {
    const expires = new Date(course.timeout_expires_at);
    if (expires > new Date()) {
      const remaining = Math.round((expires - Date.now()) / 1000);
      console.log(`[DISPATCH] ðŸ›¡ï¸ Vague active sur course ${courseId} (${remaining}s restantes) â€” pas de retraitement`);
      return { en_attente: true, remaining, wave_active: true };
    }
  }

  const config = await chargerConfigDispatch(base44);
  console.log(`[DISPATCH] âš™ï¸ Config: ${config.nb} livreurs, ${config.timeout}s`);

  // Trouver les meilleurs candidats hors exclusions (tous les dÃ©jÃ  notifiÃ©s)
  const resultat = await trouverLivreursCandidats(base44, course, exclusions);
  const { tous: candidatsTous, niveau1, niveau2, niveau3, pickupSource } = resultat;

  // ðŸ§  Charger la config vagues GPS
  const gpsConfig = await chargerConfigVaguesGPS(base44);
  const useGPSWaves = pickupSource === 'gps' && gpsConfig.gps_waves_enabled;

  // ðŸ“ Mode vagues GPS (distance + heartbeat N1/N2/N3) â€” courses AVEC GPS
  // ðŸŒŠ Mode vagues heartbeat (N1/N2/N3) â€” courses SANS GPS (quartier/none, non-admin)
  // âš¡ Mode direct (tous simultanÃ©s) â€” admin courses sans GPS waves actif
  const modeVaguesHeartbeat = !useGPSWaves && pickupSource !== 'gps' && course.source !== 'admin';
  let wave = modeVaguesHeartbeat
    ? (course.dispatch_wave || 1)      // heartbeat: 1=N1, 2=N2, 3=N3
    : useGPSWaves
      ? (course.dispatch_wave || 1)    // GPS: 1=N1, 2=N1+N2, 3=N1+N2+N3
      : 0;                              // direct: pas de vagues

  let candidats;
  if (modeVaguesHeartbeat) {
    if (wave === 1) candidats = niveau1;
    else if (wave === 2) candidats = niveau2;
    else if (wave === 3) candidats = niveau3;
    else candidats = [];
    console.log(`[DISPATCH] ðŸŒŠ Mode vagues heartbeat â€” vague ${wave} (N${wave}: ${candidats.length} candidats)`);
  } else if (useGPSWaves) {
    // ðŸŽ¯ GPS waves respectent les niveaux heartbeat N1/N2/N3
    // N1 = HB 0-15min (triÃ©s GPS recency â†’ distance), N2 = 15-30min, N3 = 30-60min
    if (wave === 1) candidats = niveau1;
    else if (wave === 2) candidats = [...niveau1, ...niveau2];
    else if (wave === 3) candidats = candidatsTous;
    else candidats = [];
    console.log(`[DISPATCH] ðŸ“ Mode vagues GPS + heartbeat â€” vague ${wave}/${gpsConfig.waves.length} â†’ N1:${niveau1.length} N2:${niveau2.length} N3:${niveau3.length} = ${candidats.length} candidats`);
  } else {
    candidats = candidatsTous;
  }

  // RÃ©cupÃ©rer les IDs dÃ©jÃ  notifiÃ©s prÃ©cÃ©demment
  let dejaNotifies = [];
  try { dejaNotifies = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}

  if (candidats.length === 0) {
    // ðŸŒŠ Heartbeat: vague 3 Ã©puisÃ©e â†’ cycle_epuise
    if (modeVaguesHeartbeat && wave >= 3) {
      console.log(`[DISPATCH] ðŸŒŠ Vague 3 heartbeat Ã©puisÃ©e â€” cycle_epuise pour course ${courseId}`);
      await base44.asServiceRole.entities.CourseExterne.update(courseId, {
        dispatch_status: 'cycle_epuise',
        dispatch_wave: 3,
      });
      return { cycleEpuise: true };
    }
    // ðŸ“ GPS waves: derniÃ¨re vague Ã©puisÃ©e â†’ cycle_epuise
    if (useGPSWaves && wave > gpsConfig.waves.length) {
      console.log(`[DISPATCH] ðŸ“ Vague GPS ${wave} Ã©puisÃ©e (derniÃ¨re: ${gpsConfig.waves.length}) â€” cycle_epuise pour course ${courseId}`);
      await base44.asServiceRole.entities.CourseExterne.update(courseId, {
        dispatch_status: 'cycle_epuise',
        dispatch_wave: gpsConfig.waves.length,
      });
      return { cycleEpuise: true };
    }
    if (dejaNotifies.length > 0) {
      // Tous les livreurs ont Ã©tÃ© sollicitÃ©s â†’ cycle Ã©puisÃ©
      // On vÃ©rifie si les 2 minutes d'attente sont Ã©coulÃ©es (depuis la derniÃ¨re sollicitation)
      const derniereSollicitation = course.heure_sollicitation ? new Date(course.heure_sollicitation) : null;
      const maintenant = new Date();
      const attenteEcoulee = derniereSollicitation
        ? (maintenant.getTime() - derniereSollicitation.getTime()) >= 2 * 60 * 1000
        : true;

      if (attenteEcoulee) {
        // Nouveau cycle : vider la liste des notifiÃ©s, recalculer les disponibilitÃ©s
        console.log(`[DISPATCH] ðŸ”„ Nouveau cycle â€” rÃ©initialisation des notifiÃ©s pour course ${courseId}`);
        await base44.asServiceRole.entities.CourseExterne.update(courseId, {
          dispatch_status: 'en_attente',
          dispatch_notified_ids: '[]',
          dispatch_wave: 0,
          livreur_id: '',
          livreur_nom: '',
        });
        // ðŸ›¡ï¸ Ne pas relancer rÃ©cursivement â€” le prochain tick du scheduler s'en chargera.
        // L'appel rÃ©cursif doubling la charge API et cause le rate limit.
        return { cycleReset: true };
      } else {
        // Encore en attente des 2 minutes
        console.log(`[DISPATCH] â³ Cycle Ã©puisÃ© â€” attente 2 min avant nouveau cycle pour course ${courseId}`);
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
      console.log(`[DISPATCH] âš ï¸ Aucun livreur disponible â€” course ${courseId} en attente`);
      return { noLivreur: true };
    }
  }

  // SÃ©lectionner les X meilleurs selon le mode
  let selection, timeoutSec, waveLabel;
  if (useGPSWaves) {
    const waveIndex = wave - 1; // 0-based
    const waveCfg = gpsConfig.waves[waveIndex];
    const maxSize = waveCfg.size >= 999 ? candidats.length : waveCfg.size;
    selection = candidats.slice(0, maxSize);
    timeoutSec = waveCfg.timeout_sec;
    waveLabel = `GPS vague ${wave}/${gpsConfig.waves.length}`;
  } else {
    selection = config.nb >= 999 ? candidats : candidats.slice(0, config.nb);
    timeoutSec = config.timeout;
    waveLabel = modeVaguesHeartbeat ? `heartbeat N${wave}` : 'direct';
  }
  console.log(`[DISPATCH] ðŸŽ¯ ${waveLabel} â€” ${selection.length}/${candidats.length} livreurs pour course ${courseId}`);

  const timeoutAt = new Date(Date.now() + timeoutSec * 1000).toISOString();
  const nouveauxNotifiedIds = selection.map(l => l.id);

  // ACCUMULER les IDs notifiÃ©s (concatÃ©ner + dÃ©doublonner)
  const tousNotifies = [...new Set([...dejaNotifies, ...nouveauxNotifiedIds])];
  const totalNotifies = tousNotifies.length;

  await base44.asServiceRole.entities.CourseExterne.update(courseId, {
    statut: 'recherche_livreur',
    dispatch_status: 'propose',
    dispatch_wave: wave, // 0 = mode normal, 1/2/3 = vague en cours
    livreur_id: '',
    livreur_nom: '',
    livreur_telephone: '',
    heure_sollicitation: new Date().toISOString(),
    timeout_expires_at: timeoutAt,
    dispatch_notified_ids: JSON.stringify(tousNotifies),
  });

  // ðŸ§¹ Nettoyer les notifications de la vague prÃ©cÃ©dente avant la nouvelle vague
  // Seulement si on avance dans les vagues (wave > 1) â€” Ã©vite de supprimer en N1
  if (wave > 1) {
    await supprimerNotificationsCourse(base44, courseId);
    console.log(`[DISPATCH] ðŸ§¹ Notifications vague prÃ©cÃ©dente archivÃ©es pour course ${courseId} (vague ${wave})`);
  }

  // Notifier tous les livreurs sÃ©lectionnÃ©s SÃ‰QUENTIELLEMENT (Ã©vite rate limit)
  for (const l of selection) {
    try {
      await notifierLivreur(base44, courseId, course, l, timeoutSec);
    } catch (err) {
      console.error(`[DISPATCH] âŒ Erreur notif livreur ${l.id}:`, err.message);
    }
    // Petit dÃ©lai entre chaque notification pour Ã©viter le rate limit API
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`[DISPATCH] âœ… ${selection.length} livreur(s) notifiÃ©s (total cumulÃ©: ${totalNotifies}) pour course ${courseId}, timeout: ${timeoutSec}s`);
  return {
    propose: true,
    nb_notifies: selection.length,
    total_notifies: totalNotifies,
    livreurs: selection.map(l => ({ id: l.id, nom: `${l.prenom || ''} ${l.nom}`.trim(), distance_km: l.distance?.toFixed(1) })),
    timeout_sec: timeoutSec,
  };
}

async function supprimerNotificationsCourse(base44, courseId) {
  try {
    const notifs = await base44.asServiceRole.entities.Notification.filter({ course_id: courseId, type: 'nouvelle_course' });
    const nonLues = notifs.filter(n => !n.lue);
    for (const n of nonLues) {
      await base44.asServiceRole.entities.Notification.update(n.id, { lue: true });
    }
    if (nonLues.length > 0) console.log(`[DISPATCH] ðŸ§¹ ${nonLues.length} notification(s) archivÃ©e(s)`);
  } catch (err) { console.warn('[DISPATCH] âš ï¸ Erreur archivage:', err.message); }
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    let { action, course_id, livreur_id, raison } = body;

    // DÃ©clenchement depuis automation entity
    if (!action && body.event?.entity_id) {
      action = 'lancer_recherche_auto';
      course_id = body.event.entity_id;
    }

    // â”€â”€â”€ 1. Lancer la recherche automatique (multi-livreurs) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (action === 'lancer_recherche_auto') {
      if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });

      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      if (!course.gps_depart_lat || !course.gps_depart_lng) {
        console.warn(`[DISPATCH] âš ï¸ Course ${course_id} sans GPS`);
      }

      const result = await lancerDispatchMulti(base44, course_id, []);
      if (result.erreur) return Response.json({ error: result.erreur }, { status: 404 });
      if (result.ignore) return Response.json({ success: true, message: `Dispatch ignorÃ©: ${result.statut}` });
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

    // â”€â”€â”€ 2. VÃ©rifier si un livreur est dans la liste notifiÃ©e â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (action === 'check_course_pour_livreur') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ found: false });

      const countryGuard = await verifierPaysCourseLivreur(base44, course, livreur_id, 'check_course_pour_livreur');
      if (!countryGuard.ok) return Response.json(countryGuard.response, { status: countryGuard.status });

      // ðŸš« VÃ©rifier blocage encours du livreur
    if (countryGuard.ok && countryGuard.livreur?.bloque_encours) {
      return Response.json({
        found: false, bloque_encours: true,
        error: 'Votre plafond d\'encours SILGAPP a Ã©tÃ© atteint.',
      });
    }

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

      // ðŸš« VÃ©rifier blocage encours du livreur
      const livreurCheck = countryGuard.livreur;
      if (livreurCheck?.bloque_encours) {
        return Response.json({
          found: false, bloque_encours: true,
          error: 'Votre plafond d\'encours SILGAPP a Ã©tÃ© atteint. Veuillez effectuer votre dÃ©pÃ´t auprÃ¨s de SILGAPP afin de rÃ©activer votre compte.',
        });
      }

      if (course.dispatch_status === 'accepte') {
        // ðŸ”§ CORRECTION : distinguer "j'ai acceptÃ©" vs "un autre a acceptÃ©"
        if (String(course.livreur_id) === String(livreur_id) || String(course.accepted_by_livreur_id) === String(livreur_id)) {
          return Response.json({ found: false, you_accepted: true, taken_by: course.livreur_id });
        }
        return Response.json({ found: false, already_taken: true, taken_by: course.livreur_id });
      }

      let notifiedIds = [];
      try { notifiedIds = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
      const isNotified = notifiedIds.includes(livreur_id);
      if (!isNotified) return Response.json({ found: false });

      const expired = !!(course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date());
      return Response.json({ found: true, course, expired, timeout_expires_at: course.timeout_expires_at });
    }

    // â”€â”€â”€ 3. Accepter une course â€” VERROU ATOMIQUE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (action === 'accepter_course') {
      const { pricing_mode, manual_price, override_pricing_mode } = body;

      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const countryGuard = await verifierPaysCourseLivreur(base44, course, livreur_id, 'accepter_course');
      if (!countryGuard.ok) return Response.json(countryGuard.response, { status: countryGuard.status });
      const livreur = countryGuard.livreur;

      // ðŸš« VÃ©rifier blocage encours
      if (livreur.bloque_encours) {
        return Response.json({
          success: false, accepted: false, reason: 'bloque_encours',
          error: 'Votre plafond d\'encours SILGAPP a Ã©tÃ© atteint. Veuillez effectuer votre dÃ©pÃ´t auprÃ¨s de SILGAPP afin de rÃ©activer votre compte.',
        });
      }

      // ðŸ›¡ï¸ VÃ©rification anti-courses multiples : le livreur ne peut pas accepter
      // une nouvelle course s'il en a dÃ©jÃ  une active en cours.
      const STATUTS_ACTIFS = ['livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque', 'pris_en_charge', 'en_livraison'];
      const coursesActivesLivreur = await base44.asServiceRole.entities.CourseExterne.filter({
        livreur_id: livreur_id,
      });
      const courseActiveExistante = coursesActivesLivreur.find(c =>
        STATUTS_ACTIFS.includes(c.statut) && c.id !== course_id
      );
      if (courseActiveExistante) {
        console.warn(`[DISPATCH] ðŸš« Livreur ${livreur_id} a dÃ©jÃ  la course ${courseActiveExistante.id} active (${courseActiveExistante.statut}) â€” acceptation refusÃ©e`);
        return Response.json({
          success: false, accepted: false, reason: 'deja_en_course',
          error: 'Vous avez dÃ©jÃ  une course en cours. Terminez-la avant d\'en accepter une nouvelle.',
          course_active_id: courseActiveExistante.id,
          course_active_statut: courseActiveExistante.statut,
        });
      }

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
        return Response.json({ success: false, error: 'Vous n\'Ãªtes pas Ã©ligible pour cette course', not_eligible: true });
      }

      if (course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date()) {
        return Response.json({ success: false, error: 'Course expirÃ©e', expired: true });
      }

      // Prix minimum dynamique selon le pays
      let PRIX_MIN = 1000; // default FCFA
      try {
        const countryConfig = await base44.asServiceRole.entities.Country.filter({ code: course.country_code, actif: true });
        if (countryConfig?.[0]?.prix_minimum) {
          PRIX_MIN = countryConfig[0].prix_minimum;
        }
      } catch (_) { /* fallback 1000 FCFA */ }
      const deviseMin = course.devise || 'FCFA';

      if (pricing_mode === 'manual') {
        const montant = Number(manual_price);
        if (!montant || montant < PRIX_MIN) {
          return Response.json({ success: false, error: `Prix minimum : ${PRIX_MIN} ${deviseMin}` }, { status: 400 });
        }
      }

      const isManual = pricing_mode === 'manual' && manual_price >= PRIX_MIN;

      // DÃ©lai de grÃ¢ce anti-race
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

      // ðŸ”§ CORRECTION : si le verrou est dÃ©jÃ  posÃ© mais par CE MÃŠME livreur â†’ succÃ¨s (requÃªte concurrente du mÃªme client)
      const dejaVerrouilleParMoi =
        (courseFinal.livreur_id && String(courseFinal.livreur_id) === String(livreur_id)) ||
        (courseFinal.accepted_by_livreur_id && String(courseFinal.accepted_by_livreur_id) === String(livreur_id));

      if (dejaVerrouilleParMoi) {
        console.log(`[DISPATCH] ðŸ”’ Course ${course_id} dÃ©jÃ  verrouillÃ©e par le mÃªme livreur ${livreur_id} â€” succÃ¨s confirmÃ©`);
        return Response.json({
          success: true, accepted: true, course_id, livreur_id,
          already_accepted: true,
        });
      }

      if (courseFinal.dispatch_status !== 'propose' || courseFinal.livreur_id || courseFinal.accepted_by_livreur_id) {
        return Response.json(reponseDejaPrise('final_check_already_taken', courseFinal));
      }

      // ðŸ” PrÃ©server les tokens/PINs existants â€” ne JAMAIS les regÃ©nÃ©rer
      // (gÃ©nÃ©rÃ©s une fois Ã  la crÃ©ation de la course pour garantir l'unicitÃ© partout)
      const pickupToken = course.pickup_qr_token || generateToken();
      const deliveryToken = course.delivery_qr_token || generateToken();
      const pickupPIN = course.pickup_code_4_digits || generatePIN();
      const deliveryPIN = course.delivery_code_4_digits || generatePIN();
      const tokensOntEteGeneres = !!(course.pickup_qr_token && course.pickup_code_4_digits);
      if (!tokensOntEteGeneres) {
        console.log(`[DISPATCH] ðŸ” GÃ©nÃ©ration nouveaux tokens/PINs pour course ${course_id} (absents Ã  la crÃ©ation)`);
      } else {
        console.log(`[DISPATCH] ðŸ”’ Conservation tokens/PINs existants pour course ${course_id}`);
      }

      const updateData = {
        dispatch_status: isManual ? 'propose' : 'accepte',
        statut: isManual ? 'recherche_livreur' : 'livreur_en_route',
        heure_acceptation: isManual ? null : new Date().toISOString(),
        ...(override_pricing_mode === 'automatic' ? { pricing_mode: 'automatic' } : {}),
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
        console.log(`[DISPATCH] ðŸŽ‰ Course ${course_id} verrouillÃ©e (auto) par ${livreur_id}`);
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
          const prixMessage = `${livreur.prenom || ''} ${livreur.nom} propose cette course Ã  ${Number(manual_price).toLocaleString()} ${course.devise || 'FCFA'}. Acceptez-vous ?`;
          await base44.asServiceRole.entities.Notification.create({
            titre: 'ðŸ’° Prix proposÃ© par le livreur',
            message: prixMessage,
            type: 'generic', course_id: course_id, destinataire_email: clientEmail, lue: false,
          });
          // ðŸ“¤ Push notification â€” le client n'est pas forcÃ©ment dans l'app
          try {
            await base44.asServiceRole.functions.invoke('envoiNotificationPush', {
              destinataire_email: clientEmail,
              titre: 'ðŸ’° Prix proposÃ© par le livreur',
              message: prixMessage,
              type: 'prix_manuel_propose',
              course_id: course_id,
              user_type: 'client',
            });
          } catch (e) { console.error('[DISPATCH] âŒ Push client prix manuel:', e.message); }
        }
      } catch (e) { console.warn('[DISPATCH] Erreur notif client prix manuel:', e.message); }

      return Response.json({ success: true, accepted: true, pending_client_validation: true, course_id, livreur_id });
    }

    // â”€â”€â”€ 4. Refuser une course â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (action === 'refuser_course') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const countryGuard = await verifierPaysCourseLivreur(base44, course, livreur_id, 'refuser_course');
      if (!countryGuard.ok) return Response.json(countryGuard.response, { status: countryGuard.status });

      if (course.dispatch_status === 'accepte' && course.livreur_id !== livreur_id) {
        return Response.json({ success: true, message: 'Course dÃ©jÃ  prise par un autre' });
      }

      // ðŸš« Ajouter le livreur aux exclus dÃ©finitifs (tous les cycles)
      let dejaNotifies = [];
      try { dejaNotifies = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
      if (!dejaNotifies.includes(livreur_id)) {
        dejaNotifies.push(livreur_id);
        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          dispatch_notified_ids: JSON.stringify(dejaNotifies),
        });
        console.log(`[DISPATCH] ðŸš« Livreur ${livreur_id} ajoutÃ© aux exclus dÃ©finitifs â€” course ${course_id}`);
      }

      // ðŸ§¹ Marquer les notifications "nouvelle_course" comme lues pour ce livreur
      // â€” empÃªche la course de rÃ©apparaÃ®tre via le fetching par notification
      try {
        const livreurData = await base44.asServiceRole.entities.Livreur.get(livreur_id);
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
          if (notifs.length > 0) {
            console.log(`[DISPATCH] ðŸ§¹ ${notifs.length} notification(s) marquÃ©e(s) lue(s) pour livreur ${livreur_id} â€” course ${course_id}`);
          }
        }
      } catch (e) { console.warn('[DISPATCH] Erreur archivage notifs refus:', e.message); }

      const etaitVerrouillee = course.livreur_id === livreur_id;
      if (etaitVerrouillee) {
        // LibÃ©rer le verrou
        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          dispatch_status: 'redispatch',
          remarque_livreur: raison || 'RefusÃ©',
          livreur_id: '',
          livreur_nom: '',
          livreur_telephone: '',
        });
        const result = await lancerDispatchMulti(base44, course_id, dejaNotifies);
        if (result.noLivreur) return Response.json({ success: true, noLivreur: true });
        if (result.cycleEpuise) return Response.json({ success: true, cycle_epuise: true });
        return Response.json({ success: true, nb_notifies: result.nb_notifies });
      }

      return Response.json({ success: true, exclu_definitif: true });
    }

    // â”€â”€â”€ 5. VÃ©rifier expiration & redispatch (avec exclusions cumulÃ©es) â”€â”€
    if (action === 'verifier_expiration') {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const expired = !!(course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date());

      // Expiration du verrou actif
      if (expired && course.dispatch_status === 'propose' && course.livreur_id) {
        console.log(`[DISPATCH] â° Verrou expirÃ© course ${course_id} â€” redispatch`);

        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          dispatch_status: 'redispatch',
          livreur_id: '',
          livreur_nom: '',
          livreur_telephone: '',
        });

        // Passer TOUS les dÃ©jÃ  notifiÃ©s comme exclusions
        let dejaNotifies = [];
        try { dejaNotifies = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
        const result = await lancerDispatchMulti(base44, course_id, dejaNotifies);
        return Response.json({ expired: true, redispatched: !result.noLivreur, nb_restants: result.total_notifies });
      }

      // Expiration vague multi (sans verrou)
      if (expired && course.dispatch_status === 'propose' && !course.livreur_id) {
        const currentWave = course.dispatch_wave || 0;
        if (currentWave > 0) {
          // DÃ©terminer si GPS waves ou heartbeat (via pickupSource)
          const pickupLat = course.gps_depart_lat;
          const pickupLng = course.gps_depart_lng;
          const hasGPS = !!(pickupLat && pickupLng);
          const gpsCfg = hasGPS ? await chargerConfigVaguesGPS(base44) : null;
          const isGPSWave = hasGPS && gpsCfg?.gps_waves_enabled;

          const nextWave = currentWave + 1;
          const maxWave = isGPSWave ? gpsCfg.waves.length : 3;

          if (nextWave > maxWave) {
            console.log(`[DISPATCH] ${isGPSWave ? 'ðŸ“ GPS' : 'ðŸŒŠ Heartbeat'} vague ${currentWave} expirÃ©e (max: ${maxWave}) â€” cycle_epuise pour course ${course_id}`);
            await base44.asServiceRole.entities.CourseExterne.update(course_id, {
              dispatch_status: 'cycle_epuise',
              dispatch_wave: maxWave,
            });
            return Response.json({ expired: true, wave_epuise: true });
          }
          console.log(`[DISPATCH] ${isGPSWave ? 'ðŸ“ GPS' : 'ðŸŒŠ Heartbeat'} avancement vague ${currentWave} â†’ ${nextWave} pour course ${course_id}`);
          await base44.asServiceRole.entities.CourseExterne.update(course_id, {
            dispatch_status: 'redispatch',
            dispatch_wave: nextWave,
          });
        } else {
          // Mode normal (pas de vagues)
          console.log(`[DISPATCH] â° Vague expirÃ©e course ${course_id} â€” nouvelle sÃ©lection`);
          await base44.asServiceRole.entities.CourseExterne.update(course_id, { dispatch_status: 'redispatch' });
        }

        let dejaNotifies = [];
        try { dejaNotifies = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
        const result = await lancerDispatchMulti(base44, course_id, dejaNotifies);
        return Response.json({ expired: true, redispatched: !result.noLivreur });
      }

      return Response.json({ expired, dispatch_status: course.dispatch_status, livreur_id: course.livreur_id });
    }

    // â”€â”€â”€ 6. Avancer les vagues expirÃ©es (N1â†’N2â†’N3â†’cycle_epuiseâ†’N1) â”€â”€
    if (action === 'avancer_vagues_expirees') {
      const { country_code: filterCountry } = body;
      const filter = { statut: 'recherche_livreur' };
      if (filterCountry) filter.country_code = filterCountry;

      const courses = await base44.asServiceRole.entities.CourseExterne.filter(filter);
      const now = new Date();
      const resultats = [];

      const MAX_COURSES_PER_TICK = 4; // Limite anti-rate-limit stricte
      const coursesToProcess = courses.slice(0, MAX_COURSES_PER_TICK);
      if (courses.length > MAX_COURSES_PER_TICK) {
        console.log(`[DISPATCH] âš¡ ${courses.length} courses Ã  traiter â€” limitation Ã  ${MAX_COURSES_PER_TICK}/tick pour Ã©viter rate limit`);
      }

      // ðŸ“¦ Cache config â€” charger UNE SEULE FOIS par tick au lieu de par course
      const cachedDispatchConfig = await chargerConfigDispatch(base44);
      const cachedGpsConfig = await chargerConfigVaguesGPS(base44);

      for (const course of coursesToProcess) {
        try {
          // ðŸ”„ cycle_epuise : aprÃ¨s 2 min d'attente â†’ reset et retour N1
          if (course.dispatch_status === 'cycle_epuise') {
            const derniereSollicitation = course.heure_sollicitation ? new Date(course.heure_sollicitation) : null;
            const deuxMinutesPassees = derniereSollicitation
              ? (now.getTime() - derniereSollicitation.getTime()) >= 2 * 60 * 1000
              : true;

            if (deuxMinutesPassees) {
              console.log(`[DISPATCH] ðŸ”„ Cycle Ã©puisÃ© â†’ reset N1 pour course ${course.id}`);
              await base44.asServiceRole.entities.CourseExterne.update(course.id, {
                dispatch_status: 'en_attente',
                dispatch_notified_ids: '[]',
                dispatch_wave: 0,
                livreur_id: '',
                livreur_nom: '',
              });
              const result = await lancerDispatchMulti(base44, course.id, []);
              resultats.push({ course_id: course.id, wave: 'resetâ†’N1', ...result });
            }
            continue;
          }

          // ðŸ“Œ Courses en attente / redispatch (hors vagues) â†’ relancer
          if (['en_attente', 'redispatch'].includes(course.dispatch_status)) {
            let dejaNotifies = [];
            try { dejaNotifies = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
            const result = await lancerDispatchMulti(base44, course.id, dejaNotifies);
            resultats.push({ course_id: course.id, wave: 'retry', ...result });
            continue;
          }

          // ðŸŒŠ/ðŸ“ Vagues expirÃ©es (propose sans verrou, mode vagues heartbeat ou GPS)
          const expired = !!(course.timeout_expires_at && new Date(course.timeout_expires_at) < now);
          if (!expired || course.dispatch_status !== 'propose' || course.livreur_id) continue;

          const currentWave = course.dispatch_wave || 0;
          if (currentWave > 0) {
            // DÃ©tecter le type de vagues (utiliser le cache du tick)
            const hasGPS = !!(course.gps_depart_lat && course.gps_depart_lng);
            const isGPSWave = hasGPS && cachedGpsConfig.gps_waves_enabled;
            const maxWave = isGPSWave ? cachedGpsConfig.waves.length : 3;

            const nextWave = currentWave + 1;
            if (nextWave > maxWave) {
              console.log(`[DISPATCH] ${isGPSWave ? 'ðŸ“ GPS' : 'ðŸŒŠ Heartbeat'} vague ${currentWave} expirÃ©e (max: ${maxWave}) â€” cycle_epuise pour course ${course.id}`);
              await base44.asServiceRole.entities.CourseExterne.update(course.id, {
                dispatch_status: 'cycle_epuise',
                dispatch_wave: maxWave,
              });
              resultats.push({ course_id: course.id, wave: `${currentWave}â†’epuise` });
              continue;
            }
            console.log(`[DISPATCH] ${isGPSWave ? 'ðŸ“ GPS' : 'ðŸŒŠ Heartbeat'} avancement vague ${currentWave} â†’ ${nextWave} pour course ${course.id}`);
            await base44.asServiceRole.entities.CourseExterne.update(course.id, {
              dispatch_status: 'redispatch',
              dispatch_wave: nextWave,
            });
          }

          let dejaNotifies = [];
          try { dejaNotifies = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
          const result = await lancerDispatchMulti(base44, course.id, dejaNotifies);
          resultats.push({ course_id: course.id, wave: `${currentWave}â†’${currentWave + 1}`, ...result });
        } catch (err) {
          console.error(`[DISPATCH] âŒ Erreur sur course ${course.id}:`, err.message);
          resultats.push({ course_id: course.id, error: err.message });
        }
        // DÃ©lai entre chaque course pour Ã©viter le rate limit API
        await new Promise(r => setTimeout(r, 300));
      }

      // ðŸš¨ DÃ©tection des courses bloquÃ©es > 10 min (dispatch en panne)
      const stuckCourses = courses.filter(c => {
        if (c.dispatch_status !== 'propose') return false;
        if (!c.timeout_expires_at) return false;
        const expiredTime = new Date(c.timeout_expires_at);
        return expiredTime < now && (now.getTime() - expiredTime.getTime()) > 10 * 60 * 1000;
      });
      for (const course of stuckCourses) {
        try {
          const existingAlerts = await base44.asServiceRole.entities.Notification.filter({
            course_id: course.id, type: 'alerte_critique_dispatch', lue: false,
          });
          if (existingAlerts.length === 0) {
            const stuckMin = Math.round((now.getTime() - new Date(course.timeout_expires_at).getTime()) / 60000);
            await base44.asServiceRole.entities.Notification.create({
              titre: 'ðŸš¨ Course bloquÃ©e â€” dispatch en panne ?',
              message: `Course ${course.adresse_depart || '?'} â†’ ${course.adresse_arrivee || '?'} â€” bloquÃ©e depuis ${stuckMin} min sans relance automatique. Le moteur de dispatch semble ne pas fonctionner.`,
              type: 'alerte_critique_dispatch', course_id: course.id, lue: false,
            });
            console.error(`[DISPATCH] ðŸš¨ ALERTE ADMIN: Course ${course.id} bloquÃ©e depuis ${stuckMin} min â€” dispatch en panne`);
          }
        } catch (e) { console.error('[DISPATCH] Erreur crÃ©ation alerte bloquÃ©e:', e.message); }
      }

      return Response.json({ success: true, traitees: resultats.length, resultats: resultats.slice(0, 20) });
    }

    // â”€â”€â”€ 7. Retry courses en attente / redispatch (hors vagues) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (action === 'retry_courses_en_attente') {
      const { country_code: filterCountry } = body;
      const filter = { statut: 'recherche_livreur' };
      if (filterCountry) filter.country_code = filterCountry;

      const courses = await base44.asServiceRole.entities.CourseExterne.filter(filter);
      const aRetenter = courses.filter(c =>
        ['en_attente', 'redispatch', 'cycle_epuise'].includes(c.dispatch_status)
      );

      const resultats = [];
      for (const course of aRetenter) {
        try {
          let dejaNotifies = [];
          try { dejaNotifies = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}

          // Si cycle_epuise, on laisse lancerDispatchMulti gÃ©rer le reset aprÃ¨s 2 min
          const result = await lancerDispatchMulti(base44, course.id, dejaNotifies);
          resultats.push({ course_id: course.id, ...result });
        } catch (err) {
          console.error(`[DISPATCH] âŒ Erreur retry course ${course.id}:`, err.message);
          resultats.push({ course_id: course.id, error: err.message });
        }
      }
      return Response.json({ success: true, retried: aRetenter.length, resultats });
    }

    // â”€â”€â”€ 7. Valider le prix manuel cÃ´tÃ© client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (action === 'valider_prix_manuel') {
      const { accepted } = body;
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
      if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

      const now = new Date().toISOString();

      if (accepted) {
        const prixManuel = Number(course.manual_price);
        // ðŸŽ¯ Commission dynamique du pays de la course
        let commissionPct = 30; // fallback
        try {
          if (course.country_code) {
            const countries = await base44.asServiceRole.entities.Country.filter({ code: course.country_code, actif: true });
            if (countries?.[0]?.commission_pct) commissionPct = countries[0].commission_pct;
          }
        } catch (_) {}
        const commission = Math.round(prixManuel * (commissionPct / 100));
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
                titre: 'âœ… Prix acceptÃ© â€” La course peut commencer !',
                message: `Le client a acceptÃ© votre prix de ${prixManuel.toLocaleString()} ${course.devise || 'FCFA'}.`,
                type: 'course_acceptee', course_id: course_id, destinataire_email: livreurData.user_email, lue: false,
              });
              try {
                await base44.functions.invoke('envoiNotificationPush', {
                  destinataire_email: livreurData.user_email, livreur_id: livreurId,
                  titre: 'âœ… Prix acceptÃ© !', message: `Le client a validÃ© ${prixManuel.toLocaleString()} ${course.devise || 'FCFA'}.`,
                  type: 'course_acceptee', course_id: course_id,
                });
              } catch (_) {}
            }
          } catch (e) { console.error('[DISPATCH] âŒ Notif livreur prix acceptÃ©:', e.message); }
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

        // Redispatch sans exclure (le refus Ã©tait cÃ´tÃ© client, pas livreur)
        let dejaNotifies = [];
        try { dejaNotifies = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
        const result = await lancerDispatchMulti(base44, course_id, dejaNotifies);
        return Response.json({ success: true, accepted: false, redispatched: !result.noLivreur });
      }
    }

    // â”€â”€â”€ 8. Lire la config dispatch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (action === 'get_config') {
      const config = await chargerConfigDispatch(base44);
      return Response.json({ success: true, config });
    }

    // â”€â”€â”€ 9. Sauvegarder la config dispatch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        await upsert('DISPATCH_NB_LIVREURS', nb_livreurs, 'Nombre de livreurs notifiÃ©s par vague de dispatch');
      }
      if (timeout_sec !== undefined) {
        await upsert('DISPATCH_TIMEOUT_SEC', timeout_sec, 'DÃ©lai de rÃ©ponse par vague (secondes)');
      }

      return Response.json({ success: true, message: 'Configuration dispatch sauvegardÃ©e' });
    }

    // â”€â”€â”€ 10. Lire la config vagues GPS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (action === 'get_wave_config') {
      const cfg = await chargerConfigVaguesGPS(base44);
      return Response.json({ success: true, config: cfg });
    }

    // â”€â”€â”€ 11. Sauvegarder la config vagues GPS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (action === 'set_wave_config') {
      const { gps_waves_enabled, waves } = body;
      const configs = await base44.asServiceRole.entities.DispatchWaveConfig.filter({});
      const wavesJson = JSON.stringify(waves || []);

      if (configs[0]) {
        await base44.asServiceRole.entities.DispatchWaveConfig.update(configs[0].id, {
          gps_waves_enabled: gps_waves_enabled !== false,
          waves_json: wavesJson,
        });
      } else {
        await base44.asServiceRole.entities.DispatchWaveConfig.create({
          gps_waves_enabled: gps_waves_enabled !== false,
          waves_json: wavesJson,
        });
      }

      return Response.json({ success: true, message: 'Configuration vagues GPS sauvegardÃ©e' });
    }

    // â”€â”€â”€ 12. Diagnostic anti-doublon notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (action === 'diagnostic_notifications') {
      const toutes = await base44.asServiceRole.entities.Notification.filter({ type: 'nouvelle_course' }, '-created_date', 500);

      // Grouper par course_id + destinataire_email
      const grouped = {};
      for (const n of toutes) {
        const key = `${n.course_id || '?'}::${n.destinataire_email || '?'}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(n);
      }

      const doublons = Object.entries(grouped)
        .filter(([, notifs]) => notifs.length > 1)
        .map(([key, notifs]) => ({
          key,
          count: notifs.length,
          non_lues: notifs.filter(n => !n.lue).length,
          lues: notifs.filter(n => n.lue).length,
          derniere: notifs[0]?.created_date,
          premiere: notifs[notifs.length - 1]?.created_date,
        }));

      const stats = {
        total_notifications: toutes.length,
        total_combinaisons: Object.keys(grouped).length,
        combinaisons_avec_doublons: doublons.length,
        total_doublons_en_surplus: doublons.reduce((s, d) => s + d.count - 1, 0),
        doublons_non_lus: doublons.filter(d => d.non_lues > 0).length,
        doublons_detail: doublons.slice(0, 30),
      };

      console.log(`[DIAGNOSTIC NOTIFS] ${stats.total_notifications} notifs, ${stats.combinaisons_avec_doublons} combinaisons avec doublons, ${stats.total_doublons_en_surplus} notifs en surplus`);
      return Response.json({ success: true, stats });
    }

    return Response.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (error) {
    console.error('[DISPATCH] Erreur fatale:', error);
    try {
      const base44 = createClientFromRequest(req);
      // ðŸ›¡ï¸ Anti-spam : ne crÃ©er une alerte que si aucune alerte rÃ©cente (< 5 min) n'existe
      const recentAlerts = await base44.asServiceRole.entities.Notification.filter({
        type: 'alerte_critique_dispatch', lue: false,
      }, '-created_date', 1);
      const hasRecent = recentAlerts?.[0] && (Date.now() - new Date(recentAlerts[0].created_date).getTime()) < 5 * 60 * 1000;
      if (!hasRecent) {
        await base44.asServiceRole.entities.Notification.create({
          titre: 'ðŸš¨ Erreur fatale â€” dispatch automatique',
          message: `Le moteur de dispatch a crashÃ©: ${error.message}. Les courses ne sont plus relancÃ©es automatiquement. Intervention requise.`,
          type: 'alerte_critique_dispatch', lue: false,
        });
      }
    } catch (_) {}
    return Response.json({ error: error.message }, { status: 500 });
  }
});
