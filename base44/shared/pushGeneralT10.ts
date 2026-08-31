/**
 * ── PUSH GÉNÉRAL T+10 MIN — Rappel aux livreurs inactifs ─────────────
 *
 * OBJECTIF
 *   Lorsqu'une course reste sans livreur 10 minutes après sa première
 *   diffusion (heure_sollicitation), envoyer UNE SEULE notification push
 *   générale aux livreurs du même pays pour les inviter à rouvrir l'app.
 *
 *   Ce n'est PAS du dispatch : aucune DispatchNotification créée, aucun
 *   statut livreur modifié, aucune éligibilité impactée. C'est un rappel.
 *
 * ANTI-DOUBLON (par course)
 *   - push_general_t10_envoye (boolean) : la course a réellement participé
 *     à un envoi de push général.
 *   - push_general_t10_at (date) : date de cet envoi.
 *   - push_general_t10_couvert_at (date) : la course a été couverte par un
 *     push général récent du même pays (cooldown), SANS déclencher d'envoi.
 *
 *   Un watchdog à T+20 ne renverra jamais le push car la course est soit
 *   `envoye=true` (a participé), soit `couvert_at` récent (< cooldown).
 *
 * ANTI-SPAM MULTI-COURSES (par pays)
 *   Cooldown global par pays via AppConfig `PUSH_GENERAL_T10_LAST_SENT_<CC>`.
 *   Si un push a déjà été envoyé pour ce pays dans les `cooldownMin` (15 min),
 *   on marque les courses `couvert_at` mais on n'envoie pas de nouveau push.
 *
 * ANTI-CONCURRENCE (2 watchdogs simultanés)
 *   Verrou atomique par pays via AppConfig `PUSH_GENERAL_T10_LOCK_<CC>`.
 *   - Lecture-modification-écriture en une seule opération updateMany avec
 *     condition sur l'ancienne valeur (compare-and-swap).
 *   - Si le lock est pris par un autre watchdog, on skip sans envoyer.
 *   - Le lock a un TTL (5 min) pour éviter un blocage permanent en cas de crash.
 *
 * PROTECTION
 *   Ne modifie pas : Dispatch V2, accepterCourseV2, Livreur.statut,
 *   dispatch_status, règles d'éligibilité, Country, TarifZone, commissions.
 *   Ne crée aucune DispatchNotification.
 *
 * Backend uniquement — pas de rebuild APK nécessaire.
 */

import { journaliserDispatch } from './dispatchUtils.ts';

const LOG_PREFIX = '[PUSH_GENERAL_T10]';

const DEFAULT_T10_DELAY_MIN = 10;
const DEFAULT_COOLDOWN_MIN = 15;
const DEFAULT_LOCK_TTL_SEC = 300; // 5 min
const COOLDOWN_APPCONFIG_PREFIX = 'PUSH_GENERAL_T10_LAST_SENT_';
const LOCK_APPCONFIG_PREFIX = 'PUSH_GENERAL_T10_LOCK_';

const LOG_PUSH_GENERAL_T10_SENT = 'PUSH_GENERAL_T10_SENT';
const LOG_PUSH_GENERAL_T10_COOLDOWN = 'PUSH_GENERAL_T10_COOLDOWN';
const LOG_PUSH_GENERAL_T10_NO_COURSE = 'PUSH_GENERAL_T10_NO_COURSE';
const LOG_PUSH_GENERAL_T10_NO_RECIPIENT = 'PUSH_GENERAL_T10_NO_RECIPIENT';
const LOG_PUSH_GENERAL_T10_ALREADY_HANDLED = 'PUSH_GENERAL_T10_ALREADY_HANDLED';

/**
 * Tente d'acquérir un verrou anti-concurrence pour un pays donné.
 * Compare-and-swap atomique sur AppConfig : si le lock existant est plus
 * récent que TTL_MS, on ne l'acquiert pas (un autre watchdog le détient).
 *
 * @returns true si le lock est acquis, false sinon.
 */
async function acquireCountryLock(base44, countryCode, ttlSec = DEFAULT_LOCK_TTL_SEC) {
  const lockKey = `${LOCK_APPCONFIG_PREFIX}${countryCode}`;
  const now = Date.now();
  const ttlMs = ttlSec * 1000;

  try {
    // ── APPROCHE COMPARE-AND-SWAP (semi-atomique) ──
    // Base44 ne supporte pas les transactions ACID ni les contraintes UNIQUE.
    // On utilise updateMany avec un filtre conditionnel sur l'ancienne valeur :
    // la BDD garantit que le filtre est évalué au moment de l'update.
    //
    // 1. Tenter updateMany({ cle, valeur: oldValue }, { $set: { valeur: now } })
    //    → Si 1 record modifié, le lock est acquis.
    //    → Si 0 record modifié, soit le lock est pris, soit le record n'existe pas.
    //
    // 2. Si 0 modifié, vérifier si un lock valide existe (lecture).
    //    → Si lock valide → return false (un autre watchdog le détient).
    //    → Si aucun record → créer (race possible ici, mais très improbable
    //      car les watchdogs sont décalés de 2.5 min).
    //
    // LIMITATION : Le cas "aucun record + create" n'est PAS atomique.
    // Deux watchdogs pourraient créer 2 records de lock simultanément.
    // En pratique, le décalage de 2.5 min entre automations rend ce cas extrêmement
    // improbable. Le cooldown par pays (15 min) est un second filet de sécurité.

    // Étape 1 : Tenter un compare-and-swap sur un lock expiré (valeur ancienne)
    const existing = await base44.asServiceRole.entities.AppConfig.filter({ cle: lockKey });
    const current = existing?.[0];

    if (current) {
      const lockTs = current.valeur ? parseInt(current.valeur, 10) : 0;
      const isExpired = !lockTs || (now - lockTs) >= ttlMs;

      if (!isExpired) {
        // Lock encore valide — un autre watchdog le détient
        return false;
      }

      // Lock expiré — compare-and-swap atomique via updateMany conditionnel
      const result = await base44.asServiceRole.entities.AppConfig.updateMany(
        { cle: lockKey, valeur: current.valeur },  // filtre : ancienne valeur exacte
        { $set: { valeur: String(now) } }
      );

      // Si au moins 1 record modifié, on a acquis le lock atomiquement
      if (result && result.modified_count > 0) {
        return true;
      }

      // 0 modifié → un autre watchdog vient de le prendre entre notre lecture et notre update
      return false;
    }

    // Aucun record de lock — création
    // ⚠️ LIMITATION : cette création n'est PAS atomique. Deux watchdogs pourraient
    // créer 2 records simultanément. Le cooldown par pays (15 min) mitige ce risque.
    try {
      await base44.asServiceRole.entities.AppConfig.create({
        cle: lockKey,
        valeur: String(now),
      });
      return true;
    } catch (createErr) {
      // Si la création échoue (ex: race condition), un autre watchdog a probablement créé le lock
      return false;
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur acquireCountryLock(${countryCode}):`, err?.message || String(err));
    // En cas d'erreur, on NE prend pas le risque d'envoyer un doublon
    return false;
  }
}

/**
 * Relâche le verrou d'un pays (optionnel — le TTL suffit, mais on nettoie).
 */
async function releaseCountryLock(base44, countryCode) {
  const lockKey = `${LOCK_APPCONFIG_PREFIX}${countryCode}`;
  try {
    const existing = await base44.asServiceRole.entities.AppConfig.filter({ cle: lockKey });
    if (existing?.[0]) {
      await base44.asServiceRole.entities.AppConfig.update(existing[0].id, {
        valeur: '0', // libéré
      });
    }
  } catch {
    // Non bloquant — le TTL expirera de lui-même
  }
}

/**
 * Vérifie si un push général a été envoyé récemment pour ce pays (cooldown).
 */
async function getCountryLastSent(base44, countryCode) {
  const key = `${COOLDOWN_APPCONFIG_PREFIX}${countryCode}`;
  try {
    const existing = await base44.asServiceRole.entities.AppConfig.filter({ cle: key });
    if (!existing?.[0]?.valeur) return 0;
    return parseInt(existing[0].valeur, 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Enregistre la date du dernier push envoyé pour un pays.
 */
async function setCountryLastSent(base44, countryCode, ts) {
  const key = `${COOLDOWN_APPCONFIG_PREFIX}${countryCode}`;
  try {
    const existing = await base44.asServiceRole.entities.AppConfig.filter({ cle: key });
    if (existing?.[0]) {
      await base44.asServiceRole.entities.AppConfig.update(existing[0].id, {
        valeur: String(ts),
      });
    } else {
      await base44.asServiceRole.entities.AppConfig.create({
        cle: key,
        valeur: String(ts),
      });
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur setCountryLastSent(${countryCode}):`, err?.message || String(err));
  }
}

/**
 * Marque une course comme ayant participé à un envoi réel de push général.
 */
async function marquerCourseEnvoyee(base44, courseId, ts) {
  try {
    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      push_general_t10_envoye: true,
      push_general_t10_at: new Date(ts).toISOString(),
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur marquerCourseEnvoyee(${courseId}):`, err?.message || String(err));
  }
}

/**
 * Marque une course comme couverte par un push récent (cooldown) sans envoi propre.
 */
async function marquerCourseCouverte(base44, courseId, ts) {
  try {
    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      push_general_t10_couvert_at: new Date(ts).toISOString(),
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur marquerCourseCouverte(${courseId}):`, err?.message || String(err));
  }
}

/**
 * Journalise un événement T+10 à la fois en console.log ET en DispatchLog persistant.
 * Permet de tracer exactement à quelle étape le flux s'arrête pour chaque course.
 */
function logEvent(event, data) {
  const ts = new Date().toISOString();
  console.log(`${LOG_PREFIX} ${event}`, {
    country_code: data.country_code,
    nombre_courses: data.nombre_courses,
    nombre_destinataires: data.nombre_destinataires,
    nombre_push_succes: data.nombre_push_succes,
    timestamp: ts,
    ...(data.course_ids ? { course_ids: data.course_ids } : {}),
    ...(data.step ? { step: data.step } : {}),
    ...(data.message ? { message: data.message } : {}),
  });

  // ── Journalisation persistante dans DispatchLog ──
  try {
    journaliserDispatch(null, {
      course_id: data.course_ids?.[0] || '',
      evenement: event,
      raison_passage: [
        `country:${data.country_code || 'ALL'}`,
        `step:${data.step || event}`,
        `courses:${data.nombre_courses || 0}`,
        `destinataires:${data.nombre_destinataires || 0}`,
        `push_succes:${data.nombre_push_succes || 0}`,
        ...(data.message ? [`msg:${data.message}`] : []),
        ...(data.course_ids ? [`ids:${data.course_ids.join(',')}`] : []),
      ].join(' | '),
      country_code: data.country_code || '',
      total_candidats: data.nombre_courses || 0,
    });
  } catch (logErr) {
    console.error(`${LOG_PREFIX} Erreur journalisation persistante:`, logErr?.message);
  }
}

/**
 * Journalise une exception T+10 avec le step exact et le message d'erreur.
 */
function logException(base44, step, message, countryCode, courseIds) {
  logEvent('PUSH_GENERAL_T10_EXCEPTION', {
    country_code: countryCode || 'ALL',
    step,
    message: message || '',
    course_ids: courseIds || [],
    nombre_courses: courseIds?.length || 0,
    nombre_destinataires: 0,
    nombre_push_succes: 0,
  });
}

/**
 * Récupère les livreurs destinataires d'un push général pour un pays.
 *
 * Critères :
 *   - type_livreur = "externe"
 *   - country_code = course.country_code
 *   - actif = true
 *   - validation = "valide"
 *   - bloque_encours = false
 *   - admin_hors_ligne != true
 *   - manual_hors_ligne != true
 *   - possède au moins un token FCM natif (pas web_)
 *
 * Aucun filtre GPS/heartbeat.
 */
async function getLivreursDestinataires(base44, countryCode) {
  try {
    const livreurs = await base44.asServiceRole.entities.Livreur.filter({
      country_code: countryCode,
      type_livreur: 'externe',
      actif: true,
      validation: 'valide',
      bloque_encours: false,
    }, undefined, 1000);

    const eligible = (livreurs || []).filter(l =>
      l.admin_hors_ligne !== true && l.manual_hors_ligne !== true
    );
    if (eligible.length === 0) return [];

    const livreurIds = eligible.map(l => l.id);

    // Récupérer les tokens FCM natifs actifs
    const tokens = await base44.asServiceRole.entities.NotificationToken.filter({
      livreur_id: { $in: livreurIds },
      actif: true,
      user_type: 'livreur',
    }, undefined, 5000);

    // Filtrer les tokens natifs (pas web_)
    const livreurIdsWithNativeToken = new Set();
    for (const t of tokens || []) {
      if (t.token && !String(t.token).startsWith('web_')) {
        livreurIdsWithNativeToken.add(t.livreur_id);
      }
    }

    return eligible.filter(l => livreurIdsWithNativeToken.has(l.id));
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur getLivreursDestinataires(${countryCode}):`, err?.message || String(err));
    return [];
  }
}

/**
 * Orchestre le push général T+10 pour toutes les courses éligibles.
 *
 * Étapes :
 *   1. Identifier les courses éligibles (disponible_push, sans livreur, ≥ T+10 min).
 *   2. Grouper par pays.
 *   3. Pour chaque pays : acquérir le lock anti-concurrence.
 *      a. Vérifier le cooldown global.
 *      b. Revalider l'état des courses (acceptation/annulation concurrente).
 *      c. Récupérer les destinataires.
 *      d. Envoyer le push via envoiNotificationPushBatch.
 *      e. Marquer les courses `envoye=true` OU `couvert_at` selon le cas.
 *      f. Mettre à jour le last_sent du pays.
 *      g. Relâcher le lock.
 *
 * @param {object} base44 - Client Base44 (asServiceRole).
 * @param {number} delayMin - Délai T+10 (défaut 10).
 * @param {number} cooldownMin - Cooldown global par pays (défaut 15).
 * @returns {Promise<object>} - Rapport d'exécution.
 */
export async function gererPushGeneralT10(base44, delayMin = DEFAULT_T10_DELAY_MIN, cooldownMin = DEFAULT_COOLDOWN_MIN) {
  const now = Date.now();
  const delayMs = delayMin * 60 * 1000;
  const cooldownMs = cooldownMin * 60 * 1000;

  // ── 1. Récupérer les courses potentiellement éligibles ──
  // On prend les courses en recherche_livreur ET disponible_push
  let coursesCandidates = [];
  try {
    coursesCandidates = await base44.asServiceRole.entities.CourseExterne.filter({
      statut: 'recherche_livreur',
    }, '-created_date', 200);
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur lecture courses:`, err?.message || String(err));
    return { success: false, error: 'lecture_courses_impossible' };
  }

  // ── 2. Filtrer les courses éligibles au T+10 ──
  const coursesEligibles = [];
  for (const course of coursesCandidates) {
    // Déjà traitée (envoyé ou couverte récemment)
    if (course.push_general_t10_envoye === true) {
      continue;
    }
    // Si couvert récemment (< cooldown), skip
    if (course.push_general_t10_couvert_at) {
      const couvertAgeMs = now - new Date(course.push_general_t10_couvert_at).getTime();
      if (couvertAgeMs < cooldownMs) {
        continue;
      }
    }

    // Doit être en diffusion active (disponible_push ou en_attente/propose sans livreur)
    const validDispatchStatus = ['disponible_push', 'propose', 'en_attente', 'redispatch'];
    if (!validDispatchStatus.includes(course.dispatch_status)) {
      continue;
    }

    // Ne doit pas avoir de livreur assigné
    if (course.livreur_id || course.accepted_by_livreur_id) {
      continue;
    }

    // Calculer l'âge depuis la première diffusion
    const sollicitationTs = course.heure_sollicitation
      ? new Date(course.heure_sollicitation).getTime()
      : new Date(course.created_date).getTime();
    const ageMs = now - sollicitationTs;

    if (ageMs < delayMs) {
      continue;
    }

    coursesEligibles.push(course);
  }

  if (coursesEligibles.length === 0) {
    logEvent(LOG_PUSH_GENERAL_T10_NO_COURSE, {
      country_code: 'ALL',
      nombre_courses: 0,
      nombre_destinataires: 0,
      nombre_push_succes: 0,
    });
    return { success: true, sent: false, reason: 'no_course' };
  }

  // ── 3. Grouper par pays ──
  const coursesParPays = new Map();
  for (const course of coursesEligibles) {
    const cc = course.country_code || 'UNKNOWN';
    if (!coursesParPays.has(cc)) coursesParPays.set(cc, []);
    coursesParPays.get(cc).push(course);
  }

  const resultats = [];

  // ── 4. Pour chaque pays ──
  for (const [countryCode, courses] of coursesParPays) {
    // ── 4a. Acquérir le lock anti-concurrence ──
    const lockAcquired = await acquireCountryLock(base44, countryCode);
    if (!lockAcquired) {
      logEvent(LOG_PUSH_GENERAL_T10_LOCK_FAILED, {
        country_code: countryCode,
        step: 'lock_failed',
        nombre_courses: courses.length,
        nombre_destinataires: 0,
        nombre_push_succes: 0,
        course_ids: courses.map(c => c.id),
      });
      resultats.push({ country_code: countryCode, status: 'lock_taken', courses: courses.length });
      continue;
    }

    logEvent('PUSH_GENERAL_T10_LOCK_ACQUIRED', {
      country_code: countryCode,
      step: 'lock_acquired',
      nombre_courses: courses.length,
      nombre_destinataires: 0,
      nombre_push_succes: 0,
      course_ids: courses.map(c => c.id),
    });

    try {
      // ── 4b. Vérifier le cooldown global du pays ──
      const lastSentTs = await getCountryLastSent(base44, countryCode);
      const cooldownElapsed = now - lastSentTs;

      if (lastSentTs && cooldownElapsed < cooldownMs) {
        // Cooldown actif — marquer les courses comme couvertes, pas d'envoi
        for (const course of courses) {
          await marquerCourseCouverte(base44, course.id, now);
        }
        logEvent(LOG_PUSH_GENERAL_T10_COOLDOWN, {
          country_code: countryCode,
          nombre_courses: courses.length,
          nombre_destinataires: 0,
          nombre_push_succes: 0,
          course_ids: courses.map(c => c.id),
        });
        resultats.push({
          country_code: countryCode,
          status: 'cooldown',
          courses: courses.length,
          last_sent_age_min: Math.round(cooldownElapsed / 60000),
        });
        continue;
      }

      // ── 4c. Revalider l'état des courses (race condition) ──
      // Une course a pu être acceptée/annulée entre la lecture initiale et maintenant
      const courseIds = courses.map(c => c.id);
      const freshCourses = await base44.asServiceRole.entities.CourseExterne.filter({
        id: { $in: courseIds },
      });
      const validCourses = (freshCourses || []).filter(c =>
        c.statut === 'recherche_livreur' &&
        !c.livreur_id &&
        !c.accepted_by_livreur_id &&
        c.push_general_t10_envoye !== true
      );

      if (validCourses.length === 0) {
        logEvent(LOG_PUSH_GENERAL_T10_NO_COURSE, {
          country_code: countryCode,
          nombre_courses: 0,
          nombre_destinataires: 0,
          nombre_push_succes: 0,
        });
        resultats.push({ country_code: countryCode, status: 'no_valid_course' });
        continue;
      }

      // ── 4d. Récupérer les destinataires ──
      const destinataires = await getLivreursDestinataires(base44, countryCode);

      if (destinataires.length === 0) {
        logEvent(LOG_PUSH_GENERAL_T10_NO_RECIPIENT, {
          country_code: countryCode,
          nombre_courses: validCourses.length,
          nombre_destinataires: 0,
          nombre_push_succes: 0,
        });
        resultats.push({ country_code: countryCode, status: 'no_recipient', courses: validCourses.length });
        continue;
      }

      // ── 4e. Construire le message ──
      const titre = 'COURSES DISPONIBLES';
      const message = validCourses.length === 1
        ? 'Des courses sont disponibles sur SILGAPP. Ouvrez l\'application pour les consulter.'
        : 'Plusieurs courses sont disponibles sur SILGAPP. Ouvrez l\'application pour les consulter.';

      const livreurIds = destinataires.map(l => l.id);

      // ── 4f. Envoyer le push via le système existant ──
      let pushResult = null;
      let pushSucces = 0;
      let pushFailed = false;
      try {
        pushResult = await base44.asServiceRole.functions.invoke('envoiNotificationPushBatch', {
          titre,
          message,
          type: 'course_proximite',
          course_id: null,
          livreur_ids: livreurIds,
        });
        // Vérifier le résultat réel du push
        // ── FIX : envoiNotificationPushBatch retourne { succes, echecs, destinataires } ──
        // Anciennement on lisait sent_count/success_count qui n'existent pas → toujours 0.
        pushSucces = pushResult?.data?.succes ?? pushResult?.data?.sent_count ?? pushResult?.data?.success_count ?? 0;
        const pushEchec = pushResult?.data?.echecs ?? 0;
        // Si 0 push réussi ET qu'il y avait des destinataires, considérer comme échec
        if (pushSucces === 0 && destinataires.length > 0) {
          pushFailed = true;
          console.error(`${LOG_PREFIX} Échec push batch: 0/${destinataires.length} push réussis pour ${countryCode}`);
        }

        logEvent('PUSH_GENERAL_T10_FCM_RESULT', {
          country_code: countryCode,
          step: 'fcm_result',
          nombre_courses: validCourses.length,
          nombre_destinataires: destinataires.length,
          nombre_push_succes: pushSucces,
          course_ids: validCourses.map(c => c.id),
          message: `push_succes:${pushSucces} | push_echec:${pushEchec} | destinataires:${destinataires.length}`,
        });
      } catch (err) {
        console.error(`${LOG_PREFIX} Erreur envoi push batch:`, err?.message || String(err));
        pushFailed = true;
      }

      // ── 4g. Marquer les courses selon le résultat du push ──
      if (pushFailed) {
        // ÉCHEC FCM : NE PAS marquer push_general_t10_envoye=true
        // Les courses pourront être retentées au prochain tick (sous réserve du cooldown).
        // On ne met PAS à jour le last_sent du pays non plus, car aucun push n'a été envoyé.
        logEvent(LOG_PUSH_GENERAL_T10_NO_RECIPIENT, {
          country_code: countryCode,
          nombre_courses: validCourses.length,
          nombre_destinataires: destinataires.length,
          nombre_push_succes: 0,
          course_ids: validCourses.map(c => c.id),
        });
        resultats.push({
          country_code: countryCode,
          status: 'fcm_failed',
          courses: validCourses.length,
          recipients: destinataires.length,
          push_succes: 0,
        });
        continue;  // Skip le marquage — les courses restent éligibles pour un retry
      }

      // SUCCÈS FCM : marquer les courses comme ayant réellement participé à un envoi
      for (const course of validCourses) {
        await marquerCourseEnvoyee(base44, course.id, now);
      }

      // ── 4h. Mettre à jour le last_sent du pays ──
      await setCountryLastSent(base44, countryCode, now);

      // ── 4i. Journaliser ──
      logEvent(LOG_PUSH_GENERAL_T10_SENT, {
        country_code: countryCode,
        nombre_courses: validCourses.length,
        nombre_destinataires: destinataires.length,
        nombre_push_succes: pushSucces,
        course_ids: validCourses.map(c => c.id),
      });

      for (const course of validCourses) {
        journaliserDispatch(base44, {
          course_id: course.id,
          evenement: 'push_general_t10_sent',
          raison_passage: `country:${countryCode} | recipients:${destinataires.length} | push_succes:${pushSucces}`,
        });
      }

      resultats.push({
        country_code: countryCode,
        status: 'sent',
        courses: validCourses.length,
        recipients: destinataires.length,
        push_succes: pushSucces,
      });

    } finally {
      // ── 4j. Relâcher le lock ──
      await releaseCountryLock(base44, countryCode);
    }
  }

  return {
    success: true,
    sent: resultats.some(r => r.status === 'sent'),
    details: resultats,
  };
}