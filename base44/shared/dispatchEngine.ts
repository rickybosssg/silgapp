// ── Moteur de dispatch : sélection des candidats, notification, vagues ───────
// Extrait de dispatchExterneAuto pour réduire la taille du fichier principal.
// Aucune logique métier modifiée — uniquement déplacement + console.log → dispatchLog.

import { calculerDistance, INDICATIFS, STATUTS_ACTIFS_COURSE } from './dispatchConstants.ts';
import { dispatchLog, normalizeNom, supprimerNotificationsCourse, journaliserDispatch } from './dispatchUtils.ts';
import { chargerConfigDispatch, chargerLivreursEnCourse, chargerConfigVaguesGPS, CYCLE_EPUISE_TIMEOUT_MS } from './dispatchConfig.ts';
import { envoyerWhatsAppRaw } from './twilioWhatsApp.ts';
import { notifierRedispatchClient } from './venusRedispatchNotifier.ts';

/**
 * Trouve les livreurs candidats classés par priorité.
 */
export async function trouverLivreursCandidats(base44, course, exclusions = [], options = {}) {
  const { skipGpsFilter = false } = options;
  if (!course.country_code) {
    console.error(`[DISPATCH] ❌ BLOQUÉ — course ${course.id} sans country_code`);
    return { tous: [], niveau1: [], niveau2: [], niveau3: [], pickupSource: 'none' };
  }

  const tousLivreurs = await base44.asServiceRole.entities.Livreur.filter({
    type_livreur: 'externe',
    validation: 'valide',
    actif: true,
    statut: 'disponible',
    country_code: course.country_code,
    bloque_encours: false,
    manual_hors_ligne: { $ne: true },
  }, '-last_seen_at', 50);

  if (!tousLivreurs || tousLivreurs.length === 0) {
    return { tous: [], niveau1: [], niveau2: [], niveau3: [], pickupSource: 'none', raisonsExclusion: [] };
  }

  const livreurIdsEnCourse = await chargerLivreursEnCourse(base44, course.country_code);

  // 🛡️ VÉRIFICATION FRAICHE PAR LIVREUR — ne pas se fier uniquement au statut
  // du livreur ni au cache. Pour chaque candidat restant, vérifier directement
  // s'il possède une course active en base. Cette vérification élimine tout
  // décalage de synchronisation ou race condition.
  const tousLivreursIds = tousLivreurs.map(l => l.id);
  const livreurIdsAvecCourseActive = new Set<string>(livreurIdsEnCourse);

  // Requête directe: courses actives pour les livreur_ids candidats
  if (tousLivreursIds.length > 0) {
    try {
      const coursesActives = await base44.asServiceRole.entities.CourseExterne.filter(
        { country_code: course.country_code },
        '-created_date', 200
      );
      for (const c of coursesActives || []) {
        if (c.livreur_id && tousLivreursIds.includes(c.livreur_id) && STATUTS_ACTIFS_COURSE.includes(c.statut)) {
          livreurIdsAvecCourseActive.add(c.livreur_id);
        }
      }
    } catch (err) {
      dispatchLog(`[DISPATCH] ⚠️ Erreur vérification fraiche courses actives: ${err.message}`);
    }
  }

  const exclusionSet = new Set(exclusions);
  const now = Date.now();
  const raisonsExclusion = [];

  const eligibles = tousLivreurs.filter(l => {
    const nomComplet = `${l.prenom || ''} ${l.nom || ''}`.trim();
    if (!skipGpsFilter && (!l.latitude || !l.longitude)) { raisonsExclusion.push({ livreur_id: l.id, nom: nomComplet, raison: 'sans_gps' }); return false; }
    if (exclusionSet.has(l.id)) { raisonsExclusion.push({ livreur_id: l.id, nom: nomComplet, raison: 'deja_notifie_ou_refuse' }); return false; }
    if (livreurIdsAvecCourseActive.has(l.id)) { raisonsExclusion.push({ livreur_id: l.id, nom: nomComplet, raison: 'en_course' }); return false; }
    if (l.admin_hors_ligne === true) { raisonsExclusion.push({ livreur_id: l.id, nom: nomComplet, raison: 'admin_hors_ligne' }); return false; }
    if (l.manual_hors_ligne === true) { raisonsExclusion.push({ livreur_id: l.id, nom: nomComplet, raison: 'manual_hors_ligne' }); return false; }
    return true;
  });

  const candidats = [];
  const GPS_EXPIRE_SEUIL_MIN = 30;
  const TIEBREAKER_DISTANCE_M = 100;

  function gpsFreshnessTier(gpsAgeMin) {
    if (gpsAgeMin === null) return 4;
    if (gpsAgeMin < 5) return 0;
    if (gpsAgeMin < 10) return 1;
    if (gpsAgeMin < 20) return 2;
    if (gpsAgeMin < 30) return 3;
    return 4;
  }

  let pickupLat = course.gps_depart_lat;
  let pickupLng = course.gps_depart_lng;
  let pickupSource = 'gps';

  const quartierCandidate = course.quartier_depart || course.adresse_depart;
  if ((!pickupLat || !pickupLng) && quartierCandidate) {
    try {
      let quartiers = await base44.asServiceRole.entities.Quartier.filter({
        country_code: course.country_code, nom: quartierCandidate, actif: true,
      });
      if (!quartiers?.[0]?.latitude) {
        const allQuartiers = await base44.asServiceRole.entities.Quartier.filter({
          country_code: course.country_code, actif: true,
        }, 'nom', 500);
        const normalized = normalizeNom(quartierCandidate);
        const match = (allQuartiers || []).find(q => normalizeNom(q.nom) === normalized);
        if (match?.latitude && match?.longitude) quartiers = [match];
      }
      if (quartiers?.[0]?.latitude && quartiers[0]?.longitude) {
        pickupLat = quartiers[0].latitude;
        pickupLng = quartiers[0].longitude;
        pickupSource = 'quartier';
        dispatchLog(`[DISPATCH] 📍 Fallback quartier: ${quartierCandidate} (${pickupLat}, ${pickupLng})`);
      }
    } catch (_) {}
  }

  if ((!pickupLat || !pickupLng) && course.ville_depart) {
    try {
      const quartiersVille = await base44.asServiceRole.entities.Quartier.filter({
        country_code: course.country_code, ville: course.ville_depart, actif: true,
      });
      if (quartiersVille?.[0]?.latitude && quartiersVille[0]?.longitude) {
        pickupLat = quartiersVille[0].latitude;
        pickupLng = quartiersVille[0].longitude;
        pickupSource = 'ville';
        dispatchLog(`[DISPATCH] 📍 Fallback ville: ${course.ville_depart} (${pickupLat}, ${pickupLng})`);
      }
    } catch (_) {}
  }

  if ((!pickupLat || !pickupLng) && pickupSource === 'gps') {
    pickupSource = 'none';
  }

  eligibles.forEach(l => {
    const gpsDate = l.derniere_position_date || l.last_seen_at;
    let gpsAgeMin = null;
    if (gpsDate) {
      const gps = new Date(gpsDate);
      if (!isNaN(gps.getTime())) gpsAgeMin = (now - gps.getTime()) / 60000;
    }

    // ── Les livreurs prioritaires (priorite_dispatch > 0) ne sont JAMAIS exclus
    //    pour cause de GPS absent ou expiré. La priorité prime sur le GPS. ──
    const isPriority = (l.priorite_dispatch || 0) > 0;
    if (!skipGpsFilter && !isPriority && (gpsAgeMin === null || gpsAgeMin >= GPS_EXPIRE_SEUIL_MIN)) {
      raisonsExclusion.push({
        livreur_id: l.id,
        nom: `${l.prenom || ''} ${l.nom || ''}`.trim(),
        raison: gpsAgeMin === null ? 'gps_absent' : `gps_expire_${Math.round(gpsAgeMin)}min`,
      });
      return;
    }

    const hbDate = l.last_seen_at;
    let heartbeatAgeMin = null;
    if (hbDate) {
      const hb = new Date(hbDate);
      if (!isNaN(hb.getTime())) heartbeatAgeMin = (now - hb.getTime()) / 60000;
    }

    const gpsStale = gpsAgeMin === null || gpsAgeMin >= GPS_EXPIRE_SEUIL_MIN;
    let distance = null;
    if (pickupLat && pickupLng && l.latitude && l.longitude && !(skipGpsFilter && gpsStale)) {
      distance = calculerDistance(pickupLat, pickupLng, l.latitude, l.longitude);
    }

    const quartierMatch = course.quartier_depart && l.quartier
      ? (normalizeNom(course.quartier_depart) === normalizeNom(l.quartier) ? 0 : 1)
      : 1;
    const villeMatch = course.ville_depart && l.ville
      ? (normalizeNom(course.ville_depart) === normalizeNom(l.ville) ? 0 : 1)
      : 1;

    candidats.push({ ...l, distance, heartbeatAgeMin, gpsAgeMin, gpsStale, quartierMatch, villeMatch });
  });

  // ── Tri priorité dispatch : les livreurs avec priorite_dispatch > 0
  //    sont TOUJOURS notifiés en premier, peu importe la distance ou le GPS. ──
  candidats.sort((a, b) => {
    const prioA = a.priorite_dispatch || 0;
    const prioB = b.priorite_dispatch || 0;
    if (prioA !== prioB) return prioB - prioA;

    const tierA = gpsFreshnessTier(a.gpsAgeMin);
    const tierB = gpsFreshnessTier(b.gpsAgeMin);
    if (tierA !== tierB) return tierA - tierB;

    if (a.distance === null && b.distance === null) {
      if (a.quartierMatch !== b.quartierMatch) return a.quartierMatch - b.quartierMatch;
      if (a.villeMatch !== b.villeMatch) return a.villeMatch - b.villeMatch;
      const hbA = a.heartbeatAgeMin !== null ? a.heartbeatAgeMin : 999;
      const hbB = b.heartbeatAgeMin !== null ? b.heartbeatAgeMin : 999;
      return hbA - hbB;
    }
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;
    if (Math.abs(a.distance - b.distance) < TIEBREAKER_DISTANCE_M) {
      const gpsA = a.gpsAgeMin !== null ? a.gpsAgeMin : 999;
      const gpsB = b.gpsAgeMin !== null ? b.gpsAgeMin : 999;
      return gpsA - gpsB;
    }
    return a.distance - b.distance;
  });

  const tous = candidats;
  const niveau1 = candidats;
  const niveau2 = [];
  const niveau3 = [];
  dispatchLog(`[DISPATCH] 📊 ${tous.length} candidats (exclus: ${raisonsExclusion.length}) — tri par fraîcheur GPS (tiers 0-3), puis distance — pickup: ${pickupSource}`);
  return { tous, niveau1, niveau2, niveau3, pickupSource, raisonsExclusion };
}

export async function notifierLivreur(base44, courseId, course, livreur, timeoutSec) {
  if (!livreur.user_email) return;

  const distanceSafe = livreur.distance ? Number(livreur.distance).toFixed(1) : '?';
  const titre = '🚨 Nouvelle course disponible !';
  const message = `Course à ${distanceSafe}km — ${course.adresse_depart} → ${course.adresse_arrivee || '?'}`;

  const heartbeatAgeMin = livreur.heartbeatAgeMin;
  const appOrBgActive = (livreur.app_active === true || livreur.background_active === true);
  const appActive = heartbeatAgeMin !== null && heartbeatAgeMin < 5 && appOrBgActive;

  const livreurEmail = livreur.user_email;
  const livreurId = livreur.id;
  const livreurTel = livreur.telephone;
  const livreurCountry = livreur.country_code;

  base44.asServiceRole.entities.Notification.create({
    titre, message, type: 'nouvelle_course',
    course_id: courseId, destinataire_email: livreurEmail, lue: false,
  }).catch(err => console.error('[DISPATCH] ❌ Notif BDD:', err.message));

  base44.functions.invoke('envoiNotificationPush', {
    destinataire_email: livreurEmail, livreur_id: livreurId,
    titre, message, type: 'nouvelle_course', course_id: courseId,
    alert_duration_seconds: timeoutSec, alert_interval_seconds: 5,
  }).catch(err => console.error('[DISPATCH] ❌ Push Firebase:', err.message));

  if (!appActive && livreurTel) {
    const waOptIn = livreur.whatsapp_opt_in;
    const waOptInDate = livreur.whatsapp_opt_in_date;
    const waPromise = (async () => {
      try {
        if (waOptIn === false && !waOptInDate) return;
        const indicatif = INDICATIFS[livreurCountry] || '+226';
        let tel = livreurTel.replace(/\s+/g, '').replace(/[^\d+]/g, '');
        if (!tel.startsWith('+')) tel = indicatif + tel;

        const result = await envoyerWhatsAppRaw(tel, `📦 *Nouvelle course disponible !*\nOuvrez SILGAPP pour accepter ou refuser.`);
        if (result.success) {
          await base44.asServiceRole.entities.WhatsAppAlerte.create({
            livreur_id: livreurId, livreur_telephone: tel,
            notification_id: courseId, statut: 'sent',
            twilio_sid: result.sid, heure_envoi: new Date().toISOString(), canal: 'whatsapp',
          });
        } else if (result.code === 63015) {
          await base44.asServiceRole.entities.Livreur.update(livreurId, {
            whatsapp_opt_in: false, whatsapp_derniere_erreur: '63015',
            whatsapp_derniere_erreur_date: new Date().toISOString(),
          });
        }
      } catch (err) { console.error('[DISPATCH] ❌ WhatsApp:', err.message); }
    })();
    waPromise.catch(() => {});
  }

  dispatchLog(`[DISPATCH] 📤 Notifié: ${livreur.nom} (${distanceSafe}km, HB: ${heartbeatAgeMin?.toFixed(1) || '?'}min)`);
}

/**
 * DISPATCH MULTI-LIVREURS (100% AUTOMATIQUE)
 */
export async function lancerDispatchMulti(base44, courseId, exclusions = [], cachedConfig = null) {
  let course;
  try {
    course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
  } catch (e) {
    console.warn(`[DISPATCH] ⚠️ Course ${courseId} introuvable (supprimée?) — ignorée`);
    return { erreur: 'Course introuvable', ignore: true };
  }
  if (!course) return { erreur: 'Course introuvable' };

  const lockUntilMs = course.dispatch_locked_until ? new Date(course.dispatch_locked_until).getTime() : 0;
  if (lockUntilMs > Date.now()) {
    dispatchLog(`[DISPATCH] 🔒 Course ${courseId} verrouillée par un autre tick (expire dans ${Math.round((lockUntilMs - Date.now()) / 1000)}s) — skip`);
    return { locked: true };
  }
  await base44.asServiceRole.entities.CourseExterne.update(courseId, {
    dispatch_locked_until: new Date(Date.now() + 10 * 1000).toISOString(),
  });

  if (['livreur_en_route', 'colis_recupere', 'en_livraison', 'livree', 'annulee', 'en_attente'].includes(course.statut)) {
    return { ignore: true, statut: course.statut };
  }

  let dejaRefuses = [];
  try { dejaRefuses = JSON.parse(course.dispatch_refused_ids || '[]'); } catch {}
  let dejaNotifies = [];
  try { dejaNotifies = JSON.parse(course.dispatch_notified_ids || '[]'); } catch {}
  exclusions = [...new Set([...exclusions, ...dejaRefuses, ...dejaNotifies])];

  const waveNum = course.dispatch_wave || 0;
  dispatchLog(`[DISPATCH] 🔄 Vague ${waveNum + 1} — recalcul dynamique des candidats (GPS, distances, statut) pour course ${courseId}`);

  if (course.dispatch_status === 'propose' && course.livreur_id && course.timeout_expires_at) {
    const expires = new Date(course.timeout_expires_at);
    if (expires > new Date()) {
      const remaining = Math.round((expires - Date.now()) / 1000);
      dispatchLog(`[DISPATCH] ⏳ Verrou actif sur course ${courseId} (livreur ${course.livreur_id}), expire dans ${remaining}s`);
      return { en_attente: true, remaining };
    }
  }

  if (course.dispatch_status === 'propose' && !course.livreur_id && course.timeout_expires_at) {
    const expires = new Date(course.timeout_expires_at);
    if (expires > new Date()) {
      const remaining = Math.round((expires - Date.now()) / 1000);
      dispatchLog(`[DISPATCH] 🛡️ Vague active sur course ${courseId} (${remaining}s restantes) — pas de retraitement`);
      return { en_attente: true, remaining, wave_active: true };
    }
  }

  const config = cachedConfig?.dispatch || await chargerConfigDispatch(base44);
  dispatchLog(`[DISPATCH] ⚙️ Config: ${config.nb} livreurs, ${config.timeout}s`);

  const resultat = await trouverLivreursCandidats(base44, course, exclusions);
  const { tous: candidatsTous, pickupSource, raisonsExclusion } = resultat;

  const gpsConfig = cachedConfig?.gps || await chargerConfigVaguesGPS(base44);

  let wave = course.dispatch_wave || 1;

  let candidats = candidatsTous;

  dispatchLog(`[DISPATCH] 📍 Vague ${wave}/${gpsConfig.waves.length} — ${candidats.length} candidats triés par distance`);

  if (wave >= gpsConfig.waves.length) {
    const fallbackResult = await trouverLivreursCandidats(base44, course, exclusions, { skipGpsFilter: true });
    const fallbackCandidats = (fallbackResult.tous || []).filter(f => !candidats.some(c => c.id === f.id));
    if (fallbackCandidats.length > 0) {
      candidats = [...candidats, ...fallbackCandidats];
      dispatchLog(`[DISPATCH] 📍 +${fallbackCandidats.length} candidats sans GPS ajoutés (dernière vague) pour course ${courseId}`);
    }
  }

  const waveIndexFb = Math.min(wave - 1, gpsConfig.waves.length - 1);
  const waveSizeFb = gpsConfig.waves[waveIndexFb]?.size || 3;
  if (candidats.length < waveSizeFb && waveSizeFb < 999) {
    const fallbackResult = await trouverLivreursCandidats(base44, course, exclusions, { skipGpsFilter: true });
    const fallbackCandidats = (fallbackResult.tous || []).filter(f => !candidats.some(c => c.id === f.id));
    if (fallbackCandidats.length > 0) {
      candidats = [...candidats, ...fallbackCandidats];
      dispatchLog(`[DISPATCH] 📍 +${fallbackCandidats.length} candidats sans GPS frais ajoutés (vague ${wave}, besoin: ${waveSizeFb}) pour course ${courseId}`);
    }
  }

  if (candidats.length === 0) {
    if (wave > gpsConfig.waves.length) {
      dispatchLog(`[DISPATCH] 📍 Vague GPS ${wave} épuisée (dernière: ${gpsConfig.waves.length}) — cycle_epuise pour course ${courseId}`);
      await base44.asServiceRole.entities.CourseExterne.update(courseId, {
        dispatch_status: 'cycle_epuise',
        dispatch_wave: gpsConfig.waves.length,
        livreur_id: '',
        livreur_nom: '',
        livreur_telephone: '',
        livreur_photo_url: '',
        livreur_vehicule: '',
        livreur_note_moyenne: 0,
        livreur_nombre_avis: 0,
      });
      journaliserDispatch(base44, { course_id: courseId, country_code: course.country_code, vague: wave, evenement: 'cycle_epuise' });
      return { cycleEpuise: true };
    }
    if (dejaNotifies.length > 0) {
      const cycleCount = (course.dispatch_cycle_count || 0) + 1;
      if (cycleCount > 3) {
        dispatchLog(`[DISPATCH] 🛑 Course ${courseId} — ${cycleCount - 1} cycles épuisés sans livreur — auto-annulation`);
        await base44.asServiceRole.entities.CourseExterne.update(courseId, {
          statut: 'annulee',
          dispatch_status: 'expire',
          dispatch_locked_until: null,
          livreur_id: '',
          livreur_nom: '',
          livreur_telephone: '',
          livreur_photo_url: '',
          livreur_vehicule: '',
          livreur_note_moyenne: 0,
          livreur_nombre_avis: 0,
          notes: (course.notes || '') + ' | [AUTO-ANNULÉ] Cycle dispatch épuisé après 3 cycles sans livreur acceptant',
        });
        journaliserDispatch(base44, { course_id: courseId, country_code: course.country_code, vague: wave, evenement: 'cycle_epuise' });
        const messageVenus = `📍 Malgré plusieurs tentatives, aucun livreur n'est disponible pour votre course. Votre course a été annulée. Veuillez réessayer plus tard.`;
        notifierRedispatchClient({ base44, course, messageVenus, motif: 'auto_annulation' }).catch(err => console.error('[DISPATCH] ❌ VENUS notif auto-annulation:', err.message));
        return { cycleEpuise: true };
      }
      dispatchLog(`[DISPATCH] 🔄 Nouveau cycle ${cycleCount}/3 — réinitialisation des notifiés pour course ${courseId}`);
      await base44.asServiceRole.entities.CourseExterne.update(courseId, {
        dispatch_status: 'en_attente',
        dispatch_notified_ids: '[]',
        dispatch_wave_notified_ids: '[]',
        dispatch_wave: 0,
        dispatch_cycle_count: cycleCount,
        dispatch_locked_until: null,
        livreur_id: '',
        livreur_nom: '',
      });
      journaliserDispatch(base44, { course_id: courseId, country_code: course.country_code, vague: wave, evenement: 'reset' });
      return { cycleReset: true };
    } else {
      const nextWave = wave + 1;
      if (nextWave > gpsConfig.waves.length) {
        dispatchLog(`[DISPATCH] 📍 Vagues épuisées sans livreur — cycle_epuise pour course ${courseId}`);
        const cycleEpuiseDeadline = new Date(Date.now() + CYCLE_EPUISE_TIMEOUT_MS).toISOString();
        await base44.asServiceRole.entities.CourseExterne.update(courseId, {
          dispatch_status: 'cycle_epuise',
          dispatch_wave: gpsConfig.waves.length,
          timeout_expires_at: cycleEpuiseDeadline,
          livreur_id: '',
          livreur_nom: '',
          livreur_telephone: '',
          livreur_photo_url: '',
          livreur_vehicule: '',
          livreur_note_moyenne: 0,
          livreur_nombre_avis: 0,
        });
        journaliserDispatch(base44, { course_id: courseId, country_code: course.country_code, vague: wave, evenement: 'cycle_epuise' });
        const messageVenus = `📍 Nous avons sollicité tous les livreurs disponibles autour de vous, mais aucun n'a accepté votre course pour le moment.\n\nVoulez-vous que je relance la recherche ?\n\nRépondez 'oui' pour relancer ou 'non' pour annuler.`;
        notifierRedispatchClient({ base44, course, messageVenus, motif: 'cycle_epuise' }).catch(err => console.error('[DISPATCH] ❌ VENUS notif cycle_epuise:', err.message));
        return { cycleEpuise: true };
      }
      await base44.asServiceRole.entities.CourseExterne.update(courseId, {
        dispatch_status: 'en_attente',
        dispatch_wave: nextWave,
        livreur_id: '',
        livreur_nom: '',
      });
      dispatchLog(`[DISPATCH] ⚠️ Aucun livreur disponible — course ${courseId} en attente (tentative ${nextWave}/${gpsConfig.waves.length})`);
      journaliserDispatch(base44, { course_id: courseId, country_code: course.country_code, vague: nextWave, evenement: 'aucun_livreur', raisons_exclusion: raisonsExclusion });
      return { noLivreur: true };
    }
  }

  // ═══ VAGUE PRIORITAIRE — les livreurs prioritaires sont notifiés EN PREMIER ═══
  // Avant toute vague GPS, on notifie TOUS les livreurs prioritaires disponibles.
  // Une fois leur vague expirée, le dispatch passe aux vagues GPS normales.
  const priorityCandidats = candidats.filter(l => (l.priorite_dispatch || 0) > 0);
  const priorityNotYetNotified = priorityCandidats.filter(l => !dejaNotifies.includes(l.id));

  if (priorityNotYetNotified.length > 0) {
    const pTimeoutSec = (gpsConfig.waves[0]?.timeout_sec || 60);
    const pTimeoutAt = new Date(Date.now() + pTimeoutSec * 1000).toISOString();
    const pNouveauxIds = priorityNotYetNotified.map(l => l.id);
    const pTousNotifies = [...new Set([...dejaNotifies, ...pNouveauxIds])];

    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      statut: 'recherche_livreur',
      dispatch_status: 'propose',
      dispatch_wave: wave,
      livreur_id: '',
      livreur_nom: '',
      livreur_telephone: '',
      livreur_photo_url: '',
      livreur_vehicule: '',
      livreur_note_moyenne: 0,
      livreur_nombre_avis: 0,
      heure_sollicitation: new Date().toISOString(),
      timeout_expires_at: pTimeoutAt,
      dispatch_wave_started_at: new Date().toISOString(),
      dispatch_next_wave_at: pTimeoutAt,
      dispatch_notified_ids: JSON.stringify(pTousNotifies),
      dispatch_wave_notified_ids: JSON.stringify(pNouveauxIds),
    });

    if (wave > 1) {
      await supprimerNotificationsCourse(base44, courseId);
      dispatchLog(`[DISPATCH] 🧹 Notifications vague précédente archivées pour course ${courseId} (vague prioritaire)`);
    }

    for (const l of priorityNotYetNotified) {
      try {
        notifierLivreur(base44, courseId, course, l, pTimeoutSec);
      } catch (err) {
        console.error(`[DISPATCH] ❌ Erreur notif livreur prioritaire ${l.id}:`, err.message);
      }
    }

    dispatchLog(`[DISPATCH] 👑 VAGUE PRIORITAIRE — ${priorityNotYetNotified.length} livreur(s) prioritaire(s) notifié(s) pour course ${courseId} (timeout: ${pTimeoutSec}s)`);

    journaliserDispatch(base44, {
      course_id: courseId,
      country_code: course.country_code,
      vague: wave,
      vague_avant: course.dispatch_wave || 0,
      vague_apres: wave,
      wave_started_at: new Date().toISOString(),
      wave_expired_at: pTimeoutAt,
      nombre_deja_consultes: dejaNotifies.length,
      nombre_nouveaux_notifies: priorityNotYetNotified.length,
      raison_passage: 'vague_prioritaire',
      pickup_source: pickupSource,
      evenement: 'vague',
      livreurs_selectionnes: priorityNotYetNotified.map(l => ({
        id: l.id, nom: `${l.prenom || ''} ${l.nom || ''}`.trim(),
        distance_km: l.distance !== null ? Number(l.distance.toFixed(2)) : null,
        gps_age_min: l.gpsAgeMin !== null ? Number(l.gpsAgeMin.toFixed(1)) : null,
        priorite: l.priorite_dispatch || 0,
      })),
      ordre_tri_complet: candidats.map(l => ({
        id: l.id, nom: `${l.prenom || ''} ${l.nom || ''}`.trim(),
        distance_km: l.distance !== null ? Number(l.distance.toFixed(2)) : null,
        priorite: l.priorite_dispatch || 0,
      })),
      raisons_exclusion: raisonsExclusion,
      total_candidats: candidats.length,
      total_exclus: raisonsExclusion.length,
      timeout_sec: pTimeoutSec,
    });

    return {
      propose: true,
      priority_wave: true,
      nb_notifies: priorityNotYetNotified.length,
      total_notifies: pTousNotifies.length,
      livreurs: priorityNotYetNotified.map(l => ({ id: l.id, nom: `${l.prenom || ''} ${l.nom}`.trim(), distance_km: l.distance?.toFixed(1), priorite: l.priorite_dispatch || 0 })),
      timeout_sec: pTimeoutSec,
    };
  }

  // ═══ VAGUES GPS NORMALES — après épuisement de la vague prioritaire ═══
  let selection, timeoutSec, waveLabel;
  const waveIndex = Math.min(wave - 1, gpsConfig.waves.length - 1);
  const waveCfg = gpsConfig.waves[waveIndex];
  const maxSize = waveCfg.size >= 999 ? candidats.length : waveCfg.size;
  selection = candidats.slice(0, maxSize);
  timeoutSec = waveCfg.timeout_sec;
  waveLabel = `GPS vague ${wave}/${gpsConfig.waves.length}`;
  dispatchLog(`[DISPATCH] 🎯 ${waveLabel} — ${selection.length}/${candidats.length} livreurs pour course ${courseId}`);

  const timeoutAt = new Date(Date.now() + timeoutSec * 1000).toISOString();
  const nouveauxNotifiedIds = selection.map(l => l.id);

  const tousNotifies = [...new Set([...dejaNotifies, ...nouveauxNotifiedIds])];
  const totalNotifies = tousNotifies.length;

  await base44.asServiceRole.entities.CourseExterne.update(courseId, {
    statut: 'recherche_livreur',
    dispatch_status: 'propose',
    dispatch_wave: wave,
    livreur_id: '',
    livreur_nom: '',
    livreur_telephone: '',
    livreur_photo_url: '',
    livreur_vehicule: '',
    livreur_note_moyenne: 0,
    livreur_nombre_avis: 0,
    heure_sollicitation: new Date().toISOString(),
    timeout_expires_at: timeoutAt,
    dispatch_wave_started_at: new Date().toISOString(),
    dispatch_next_wave_at: timeoutAt,
    dispatch_notified_ids: JSON.stringify(tousNotifies),
    dispatch_wave_notified_ids: JSON.stringify(nouveauxNotifiedIds),
  });

  if (wave > 1) {
    await supprimerNotificationsCourse(base44, courseId);
    dispatchLog(`[DISPATCH] 🧹 Notifications vague précédente archivées pour course ${courseId} (vague ${wave})`);
  }

  for (const l of selection) {
    try {
      notifierLivreur(base44, courseId, course, l, timeoutSec);
    } catch (err) {
      console.error(`[DISPATCH] ❌ Erreur notif livreur ${l.id}:`, err.message);
    }
  }

  dispatchLog(`[DISPATCH] ✅ ${selection.length} livreur(s) notifiés (total cumulé: ${totalNotifies}) pour course ${courseId}, timeout: ${timeoutSec}s`);

  journaliserDispatch(base44, {
    course_id: courseId,
    country_code: course.country_code,
    vague: wave,
    vague_avant: course.dispatch_wave || 0,
    vague_apres: wave,
    wave_started_at: new Date().toISOString(),
    wave_expired_at: timeoutAt,
    nombre_deja_consultes: dejaNotifies.length,
    nombre_nouveaux_notifies: selection.length,
    raison_passage: wave > (course.dispatch_wave || 0) ? `vague_${course.dispatch_wave || 0}_expiree` : 'premier_lancement',
    pickup_source: pickupSource,
    evenement: 'vague',
    livreurs_selectionnes: selection.map(l => ({
      id: l.id, nom: `${l.prenom || ''} ${l.nom || ''}`.trim(),
      distance_km: l.distance !== null ? Number(l.distance.toFixed(2)) : null,
      gps_age_min: l.gpsAgeMin !== null ? Number(l.gpsAgeMin.toFixed(1)) : null,
    })),
    ordre_tri_complet: candidats.map(l => ({
      id: l.id, nom: `${l.prenom || ''} ${l.nom || ''}`.trim(),
      distance_km: l.distance !== null ? Number(l.distance.toFixed(2)) : null,
      gps_age_min: l.gpsAgeMin !== null ? Number(l.gpsAgeMin.toFixed(1)) : null,
    })),
    raisons_exclusion: raisonsExclusion,
    total_candidats: candidats.length,
    total_exclus: raisonsExclusion.length,
    timeout_sec: timeoutSec,
  });

  return {
    propose: true,
    nb_notifies: selection.length,
    total_notifies: totalNotifies,
    livreurs: selection.map(l => ({ id: l.id, nom: `${l.prenom || ''} ${l.nom}`.trim(), distance_km: l.distance?.toFixed(1) })),
    timeout_sec: timeoutSec,
  };
}