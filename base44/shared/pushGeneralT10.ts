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
 * Génère un identifiant unique par invocation (owner token du lock).
 */
function generateInvocationId() {
  return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Tente d'acquérir un verrou anti-concurrence pour un pays donné.
 *
 * FORMAT DU LOCK (JSON stringifié dans AppConfig.valeur) :
 *   { owner: invocation_id, acquired_at: ms, expires_at: ms }
 *
 * Le lock est expiré si now >= expires_at. Un lock expiré est récupérable.
 * Le compare-and-swap utilise updateMany avec filtre sur l'ancienne valeur exacte.
 *
 * BUG HISTORIQUE CORRIGÉ : le SDK Base44 retourne { updated: N }, pas
 * { modified_count: N }. L'ancien code lisait result.modified_count (toujours
 * undefined) → le CAS échouait silencieusement à chaque tick après le 1er push.
 *
 * @returns { acquired: boolean, invocationId: string } — acquired=true si le lock est pris.
 */
async function acquireCountryLock(base44, countryCode, ttlSec = DEFAULT_LOCK_TTL_SEC) {
  const lockKey = `${LOCK_APPCONFIG_PREFIX}${countryCode}`;
  const now = Date.now();
  const ttlMs = ttlSec * 1000;
  const invocationId = generateInvocationId();

  try {
    // Étape 1 : Lire le lock existant
    const existing = await base44.asServiceRole.entities.AppConfig.filter({ cle: lockKey });
    const current = existing?.[0];

    // Logging avant tentative (persistant — base44 disponible)
    logLockAttempt(base44, {
      country_code: countryCode,
      lock_key: lockKey,
      invocation_id: invocationId,
      existing_value: current?.valeur || 'NONE',
      existing_id: current?.id || '',
      now_ms: now,
      ttl_ms: ttlMs,
    });

    if (current) {
      // Parser le lock existant
      let lockData = null;
      try {
        lockData = current.valeur ? JSON.parse(current.valeur) : null;
      } catch {
        // Ancien format (timestamp brut) — backward compatible
        const oldTs = current.valeur ? parseInt(current.valeur, 10) : 0;
        if (oldTs > 0) {
          lockData = { owner: 'legacy', acquired_at: oldTs, expires_at: oldTs + ttlMs };
        }
      }

      const expiresAt = lockData?.expires_at || 0;
      const isExpired = !expiresAt || now >= expiresAt;
      const ageMs = lockData?.acquired_at ? now - lockData.acquired_at : 0;
      const existingOwner = lockData?.owner || 'unknown';

      if (!isExpired) {
        // Lock encore valide — un autre watchdog le détient
        logLockRejected(base44, {
          country_code: countryCode,
          lock_key: lockKey,
          invocation_id: invocationId,
          reason: 'lock_active',
          existing_owner: existingOwner,
          existing_timestamp: lockData?.acquired_at || 0,
          age_ms: ageMs,
          ttl_ms: ttlMs,
        });
        return { acquired: false, invocationId };
      }

      // Lock expiré — compare-and-swap atomique via updateMany conditionnel
      const newLockValue = JSON.stringify({
        owner: invocationId,
        acquired_at: now,
        expires_at: now + ttlMs,
      });

      const result = await base44.asServiceRole.entities.AppConfig.updateMany(
        { cle: lockKey, valeur: current.valeur },  // filtre : ancienne valeur exacte
        { $set: { valeur: newLockValue } }
      );

      // BUG FIX : le SDK retourne { updated: N }, pas { modified_count: N }
      if (result && result.updated > 0) {
        logLockAcquired(base44, {
          country_code: countryCode,
          lock_key: lockKey,
          invocation_id: invocationId,
          acquired_at: now,
          expires_at: now + ttlMs,
          previous_owner: existingOwner,
        });
        return { acquired: true, invocationId };
      }

      // 0 modifié → un autre watchdog vient de le prendre entre notre lecture et notre update
      logLockRejected(base44, {
        country_code: countryCode,
        lock_key: lockKey,
        invocation_id: invocationId,
        reason: 'cas_race_condition',
        existing_owner: existingOwner,
        existing_timestamp: lockData?.acquired_at || 0,
        age_ms: ageMs,
        ttl_ms: ttlMs,
      });
      return { acquired: false, invocationId };
    }

    // Aucun record de lock — création
    const newLockValue = JSON.stringify({
      owner: invocationId,
      acquired_at: now,
      expires_at: now + ttlMs,
    });

    try {
      await base44.asServiceRole.entities.AppConfig.create({
        cle: lockKey,
        valeur: newLockValue,
      });
      logLockAcquired(base44, {
        country_code: countryCode,
        lock_key: lockKey,
        invocation_id: invocationId,
        acquired_at: now,
        expires_at: now + ttlMs,
        previous_owner: 'none',
      });
      return { acquired: true, invocationId };
    } catch (createErr) {
      // Si la création échoue (ex: race condition), un autre watchdog a probablement créé le lock
      logLockRejected(base44, {
        country_code: countryCode,
        lock_key: lockKey,
        invocation_id: invocationId,
        reason: 'create_race_condition',
        existing_owner: 'unknown',
        existing_timestamp: 0,
        age_ms: 0,
        ttl_ms: ttlMs,
      });
      return { acquired: false, invocationId };
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur acquireCountryLock(${countryCode}):`, err?.message || String(err));
    logLockRejected(base44, {
      country_code: countryCode,
      lock_key: lockKey,
      invocation_id: invocationId,
      reason: `exception:${err?.message || 'unknown'}`,
      existing_owner: 'unknown',
      existing_timestamp: 0,
      age_ms: 0,
      ttl_ms: ttlMs,
    });
    return { acquired: false, invocationId };
  }
}

/**
 * Relâche le verrou d'un pays — OWNER-SAFE.
 * Ne supprime le lock QUE si owner === invocationId.
 * Une invocation expirée ne peut PAS libérer le lock d'une nouvelle invocation.
 */
async function releaseCountryLock(base44, countryCode, invocationId) {
  const lockKey = `${LOCK_APPCONFIG_PREFIX}${countryCode}`;
  try {
    const existing = await base44.asServiceRole.entities.AppConfig.filter({ cle: lockKey });
    if (!existing?.[0]) return;

    // Parser le lock pour vérifier l'owner
    let lockData = null;
    try {
      lockData = existing[0].valeur ? JSON.parse(existing[0].valeur) : null;
    } catch {
      // Ancien format (timestamp brut) — libérer sans vérification owner
    }

    // Owner-safe : ne libérer QUE si on est le propriétaire
    // (ou si le lock est dans l'ancien format = pas d'owner)
    if (lockData && lockData.owner && lockData.owner !== invocationId) {
      console.log(`${LOG_PREFIX} releaseCountryLock(${countryCode}): SKIP — owner mismatch (lock=${lockData.owner}, invocation=${invocationId})`);
      return;
    }

    const releasedValue = JSON.stringify({
      owner: 'released',
      acquired_at: 0,
      expires_at: 0,
    });

    await base44.asServiceRole.entities.AppConfig.update(existing[0].id, {
      valeur: releasedValue,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur releaseCountryLock(${countryCode}):`, err?.message || String(err));
    // Non bloquant — le TTL expirera de lui-même
  }
}

/**
 * Journalise une tentative de lock (avant acquisition).
 */
function logLockAttempt(base44, data) {
  console.log(`${LOG_PREFIX} LOCK_ATTEMPT`, data);
  journaliserDispatch(base44, {
    evenement: 'PUSH_GENERAL_T10_LOCK_ATTEMPT',
    raison_passage: `country:${data.country_code} | lock:${data.lock_key} | inv:${data.invocation_id} | existing:${data.existing_value.substring(0, 80)} | age_ms:${data.now_ms - (parseInt(data.existing_value, 10) || 0)} | ttl_ms:${data.ttl_ms}`,
    country_code: data.country_code || '',
    total_candidats: 0,
  });
}

/**
 * Journalise une acquisition réussie de lock.
 */
function logLockAcquired(base44, data) {
  console.log(`${LOG_PREFIX} LOCK_ACQUIRED`, data);
  journaliserDispatch(base44, {
    evenement: 'PUSH_GENERAL_T10_LOCK_ACQUIRED',
    raison_passage: `country:${data.country_code} | lock:${data.lock_key} | inv:${data.invocation_id} | acquired_at:${data.acquired_at} | expires_at:${data.expires_at} | prev_owner:${data.previous_owner}`,
    country_code: data.country_code || '',
    total_candidats: 0,
  });
}

/**
 * Journalise un refus de lock (échec d'acquisition).
 */
function logLockRejected(base44, data) {
  console.log(`${LOG_PREFIX} LOCK_REJECTED`, data);
  journaliserDispatch(base44, {
    evenement: 'PUSH_GENERAL_T10_LOCK_REJECTED',
    raison_passage: `country:${data.country_code} | lock:${data.lock_key} | inv:${data.invocation_id} | reason:${data.reason} | existing_owner:${data.existing_owner} | existing_ts:${data.existing_timestamp} | age_ms:${data.age_ms} | ttl_ms:${data.ttl_ms}`,
    country_code: data.country_code || '',
    total_candidats: 0,
  });
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

  // ── EXCEPTION GUARD : englobe tout le flux pour ne jamais masquer une erreur ──
  try {
    logEvent('PUSH_GENERAL_T10_START', {
      country_code: 'ALL',
      step: 'start',
      nombre_courses: 0,
      nombre_destinataires: 0,
      nombre_push_succes: 0,
    });

    // ── 1. Récupérer les courses potentiellement éligibles ──
    // On prend les courses en recherche_livreur ET disponible_push
    let coursesCandidates = [];
    try {
      coursesCandidates = await base44.asServiceRole.entities.CourseExterne.filter({
        statut: 'recherche_livreur',
      }, '-created_date', 200);
    } catch (err) {
      logException(base44, 'lecture_courses', err?.message || String(err), 'ALL', []);
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

      // Calculer l'âge depuis la première diffusion (heure_sollicitation en priorité)
      const sollicitationTs = course.heure_sollicitation
        ? new Date(course.heure_sollicitation).getTime()
        : new Date(course.created_date).getTime();
      const ageMs = now - sollicitationTs;

      if (ageMs < delayMs) {
        continue;
      }

      coursesEligibles.push(course);
    }

    logEvent('PUSH_GENERAL_T10_ELIGIBLE_COURSES', {
      country_code: 'ALL',
      step: 'eligible_courses',
      nombre_courses: coursesEligibles.length,
      nombre_destinataires: 0,
      nombre_push_succes: 0,
      course_ids: coursesEligibles.map(c => c.id),
    });

    if (coursesEligibles.length === 0) {
      logEvent(LOG_PUSH_GENERAL_T10_NO_COURSE, {
        country_code: 'ALL',
        step: 'no_course',
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
      const lockResult = await acquireCountryLock(base44, countryCode);
      if (!lockResult.acquired) {
        logEvent(LOG_PUSH_GENERAL_T10_ALREADY_HANDLED, {
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

      const invocationId = lockResult.invocationId;
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
            step: 'cooldown',
            nombre_courses: courses.length,
            nombre_destinataires: 0,
            nombre_push_succes: 0,
            course_ids: courses.map(c => c.id),
            message: `last_sent_age_min:${Math.round(cooldownElapsed / 60000)}`,
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
            step: 'no_valid_course_after_revalidation',
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
            step: 'no_recipient',
            nombre_courses: validCourses.length,
            nombre_destinataires: 0,
            nombre_push_succes: 0,
            course_ids: validCourses.map(c => c.id),
          });
          resultats.push({ country_code: countryCode, status: 'no_recipient', courses: validCourses.length });
          continue;
        }

        logEvent('PUSH_GENERAL_T10_RECIPIENTS_FOUND', {
          country_code: countryCode,
          step: 'recipients_found',
          nombre_courses: validCourses.length,
          nombre_destinataires: destinataires.length,
          nombre_push_succes: 0,
          course_ids: validCourses.map(c => c.id),
        });

        // ── 4e. Construire le message ──
        const titre = 'COURSES DISPONIBLES';
        const message = validCourses.length === 1
          ? 'Des courses sont disponibles sur SILGAPP. Ouvrez l\'application pour les consulter.'
          : 'Plusieurs courses sont disponibles sur SILGAPP. Ouvrez l\'application pour les consulter.';

        const livreurIds = destinataires.map(l => l.id);

        // ── 4f. Envoyer le push via le système existant ──
        logEvent('PUSH_GENERAL_T10_FCM_START', {
          country_code: countryCode,
          step: 'fcm_start',
          nombre_courses: validCourses.length,
          nombre_destinataires: destinataires.length,
          nombre_push_succes: 0,
          course_ids: validCourses.map(c => c.id),
        });

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
          logEvent('PUSH_GENERAL_T10_FCM_FAILED', {
            country_code: countryCode,
            step: 'fcm_failed',
            nombre_courses: validCourses.length,
            nombre_destinataires: destinataires.length,
            nombre_push_succes: 0,
            course_ids: validCourses.map(c => c.id),
            message: `0/${destinataires.length} push réussis`,
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
          step: 'sent',
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
        // ── 4j. Relâcher le lock (owner-safe) ──
        await releaseCountryLock(base44, countryCode, invocationId);
      }
    }

    return {
      success: true,
      sent: resultats.some(r => r.status === 'sent'),
      details: resultats,
    };

  } catch (outerErr) {
    // ── EXCEPTION GUARD : ne jamais masquer une erreur sans trace persistante ──
    logException(base44, 'gererPushGeneralT10_outer', outerErr?.message || String(outerErr), 'ALL', []);
    return { success: false, error: outerErr?.message || 'exception_inconnue' };
  }
}