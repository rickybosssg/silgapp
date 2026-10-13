/**
 * ════════════════════════════════════════════════════════════════════════
 * RAPPEL PÉRIODIQUE — Toutes les 5 minutes
 * ════════════════════════════════════════════════════════════════════════
 *
 * Objectif : tant qu'au moins une course attend un livreur, envoyer un
 * rappel sonore push à tous les livreurs éligibles du pays, toutes les
 * 5 minutes, y compris lorsque l'application est fermée.
 *
 * INDÉPENDANT des mécanismes existants (T+5 secours V2, T+10 push général,
 * T+20 rappel). Ceux-ci ne sont ni modifiés ni supprimés.
 *
 * Fonctionnement :
 *   - Trouve les courses disponible_push + recherche_livreur sans livreur,
 *     âgées d'au moins 5 min.
 *   - Exclut les courses Éco encore en attente de regroupement.
 *   - Exclut les courses où T+10 a été envoyé il y a moins de 5 min
 *     (évite le chevauchement avec le push général T+10).
 *   - Groupe par pays.
 *   - Pour chaque pays : verrou atomique → vérifie cooldown 5 min →
 *     envoie UN SEUL push groupé par livreur → met à jour le cooldown.
 *
 * Message :
 *   1 course  → "SILGAPP — Une course attend un livreur. Ouvrez l'application pour la consulter."
 *   N courses → "SILGAPP — N courses attendent un livreur. Ouvrez l'application pour les consulter."
 *
 * Anti-doublon :
 *   - Cooldown par pays (AppConfig RAPPEL_PERIODIQUE_LAST_SENT_<CC>)
 *   - Verrou anti-concurrence (AppConfig RAPPEL_PERIODIQUE_LOCK_<CC>, TTL 2 min)
 *   - Revalidation des courses avant envoi (race condition)
 *   - envoiNotificationPushBatch avec collapse_key (remplace les notifs existantes)
 *
 * Coût : 0 crédit d'intégration. ~6 appels Base44 par pays par cycle.
 *
 * Backend uniquement — pas de rebuild APK/AAB/iOS.
 */

import { journaliserDispatch } from './dispatchUtils.ts';

const LOG_PREFIX = '[RAPPEL_PERIODIQUE]';
const DEFAULT_INTERVAL_MIN = 5;
const DEFAULT_LOCK_TTL_SEC = 120; // 2 min — plus court que l'intervalle
const COOLDOWN_APPCONFIG_PREFIX = 'RAPPEL_PERIODIQUE_LAST_SENT_';
const LOCK_APPCONFIG_PREFIX = 'RAPPEL_PERIODIQUE_LOCK_';
const APPCONFIG_INTERVAL_KEY = 'RAPPEL_PERIODIQUE_INTERVAL_MIN';

const VALID_DISPATCH_STATUSES = ['disponible_push', 'en_attente', 'propose', 'redispatch'];

function generateInvocationId() {
  return `rp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Verrou anti-concurrence par pays (compare-and-swap) ──

async function acquireCountryLock(base44: any, countryCode: string, ttlSec = DEFAULT_LOCK_TTL_SEC) {
  const lockKey = `${LOCK_APPCONFIG_PREFIX}${countryCode}`;
  const now = Date.now();
  const ttlMs = ttlSec * 1000;
  const invocationId = generateInvocationId();

  try {
    const existing = await base44.asServiceRole.entities.AppConfig.filter({ cle: lockKey });
    const current = existing?.[0];

    if (current) {
      let lockData: any = null;
      try {
        lockData = current.valeur ? JSON.parse(current.valeur) : null;
      } catch {
        const oldTs = current.valeur ? parseInt(current.valeur, 10) : 0;
        if (oldTs > 0) lockData = { owner: 'legacy', acquired_at: oldTs, expires_at: oldTs + ttlMs };
      }

      const isExpired = !lockData?.expires_at || now >= lockData.expires_at;
      if (!isExpired) return { acquired: false, invocationId };

      const newLockValue = JSON.stringify({ owner: invocationId, acquired_at: now, expires_at: now + ttlMs });
      const result = await base44.asServiceRole.entities.AppConfig.updateMany(
        { cle: lockKey, valeur: current.valeur },
        { $set: { valeur: newLockValue } }
      );
      if (result && result.updated > 0) return { acquired: true, invocationId };
      return { acquired: false, invocationId };
    }

    const newLockValue = JSON.stringify({ owner: invocationId, acquired_at: now, expires_at: now + ttlMs });
    try {
      await base44.asServiceRole.entities.AppConfig.create({ cle: lockKey, valeur: newLockValue });
      return { acquired: true, invocationId };
    } catch {
      return { acquired: false, invocationId };
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Erreur acquireCountryLock:`, err?.message || String(err));
    return { acquired: false, invocationId };
  }
}

async function releaseCountryLock(base44: any, countryCode: string, invocationId: string) {
  const lockKey = `${LOCK_APPCONFIG_PREFIX}${countryCode}`;
  try {
    const existing = await base44.asServiceRole.entities.AppConfig.filter({ cle: lockKey });
    if (!existing?.[0]) return;
    let lockData: any = null;
    try { lockData = existing[0].valeur ? JSON.parse(existing[0].valeur) : null; } catch {}
    if (lockData?.owner && lockData.owner !== invocationId) return;
    await base44.asServiceRole.entities.AppConfig.update(existing[0].id, {
      valeur: JSON.stringify({ owner: 'released', acquired_at: 0, expires_at: 0 }),
    });
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Erreur releaseCountryLock:`, err?.message || String(err));
  }
}

// ── Cooldown par pays ──

async function getCountryLastSent(base44: any, countryCode: string): Promise<number> {
  const key = `${COOLDOWN_APPCONFIG_PREFIX}${countryCode}`;
  try {
    const existing = await base44.asServiceRole.entities.AppConfig.filter({ cle: key });
    if (!existing?.[0]?.valeur) return 0;
    return parseInt(existing[0].valeur, 10) || 0;
  } catch { return 0; }
}

async function setCountryLastSent(base44: any, countryCode: string, ts: number) {
  const key = `${COOLDOWN_APPCONFIG_PREFIX}${countryCode}`;
  try {
    const existing = await base44.asServiceRole.entities.AppConfig.filter({ cle: key });
    if (existing?.[0]) {
      await base44.asServiceRole.entities.AppConfig.update(existing[0].id, { valeur: String(ts) });
    } else {
      await base44.asServiceRole.entities.AppConfig.create({ cle: key, valeur: String(ts) });
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Erreur setCountryLastSent:`, err?.message || String(err));
  }
}

// ── Configuration de l'intervalle ──

async function getIntervalMin(base44: any): Promise<number> {
  try {
    const existing = await base44.asServiceRole.entities.AppConfig.filter({ cle: APPCONFIG_INTERVAL_KEY });
    if (!existing?.[0]?.valeur) return DEFAULT_INTERVAL_MIN;
    const n = parseInt(existing[0].valeur, 10);
    return Number.isFinite(n) && n >= 3 && n <= 30 ? n : DEFAULT_INTERVAL_MIN;
  } catch { return DEFAULT_INTERVAL_MIN; }
}

// ── Livreurs destinataires (mêmes critères que gererPushGeneralT10) ──

async function getLivreursDestinataires(base44: any, countryCode: string) {
  try {
    const livreurs = await base44.asServiceRole.entities.Livreur.filter({
      country_code: countryCode,
      type_livreur: 'externe',
      actif: true,
      validation: 'valide',
      bloque_encours: false,
    }, undefined, 1000);

    // [CORRECTION 11] admin_hors_ligne retiré : un livreur bloqué par l'Admin
    // continue à recevoir le push "Nouvelle course" sans pouvoir accepter.
    const eligible = (livreurs || []).filter((l: any) => l.manual_hors_ligne !== true);
    if (eligible.length === 0) return [];

    const livreurIds = eligible.map((l: any) => l.id);
    const tokens = await base44.asServiceRole.entities.NotificationToken.filter({
      livreur_id: { $in: livreurIds },
      actif: true,
      user_type: 'livreur',
    }, undefined, 5000);

    const livreurIdsWithNativeToken = new Set<string>();
    for (const t of tokens || []) {
      if (t.token && !String(t.token).startsWith('web_')) {
        livreurIdsWithNativeToken.add(t.livreur_id);
      }
    }

    return eligible.filter((l: any) => livreurIdsWithNativeToken.has(l.id));
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Erreur getLivreursDestinataires:`, err?.message || String(err));
    return [];
  }
}

// ── Orchestrateur principal ──

export async function gererRappelPeriodique(base44: any, intervalMinOverride?: number) {
  const now = Date.now();
  const intervalMin = intervalMinOverride || await getIntervalMin(base44);
  const intervalMs = intervalMin * 60 * 1000;

  try {
    // ── 1. Récupérer les courses en recherche_livreur ──
    let coursesCandidates: any[] = [];
    try {
      coursesCandidates = await base44.asServiceRole.entities.CourseExterne.filter({
        statut: 'recherche_livreur',
      }, '-created_date', 200);
    } catch (err: any) {
      console.error(`${LOG_PREFIX} Erreur lecture courses:`, err?.message || String(err));
      return { success: false, error: 'lecture_courses_impossible' };
    }

    // ── 2. Filtrer les courses éligibles au rappel périodique ──
    const coursesEligibles: any[] = [];
    for (const course of coursesCandidates || []) {
      // Doit être en diffusion active
      if (!VALID_DISPATCH_STATUSES.includes(course.dispatch_status)) continue;

      // Ne doit pas avoir de livreur assigné
      if (course.livreur_id || course.accepted_by_livreur_id) continue;

      // [ECO] Ne pas rappeler une course Éco isolée en attente de regroupement
      if (course.delivery_mode === 'eco' && course.eco_status === 'isolated' &&
          course.eco_convert_after_at && new Date(course.eco_convert_after_at) > new Date(now)) {
        continue;
      }

      // [ECO] Ne pas rappeler une course Éco groupée tant que la mission n'est pas 'available'
      if (course.delivery_mode === 'eco' && course.eco_status === 'grouped' && course.eco_mission_id) {
        // La mission Éco gérée séparément — ne pas la proposer comme course individuelle
        continue;
      }

      // Âge minimum : 5 min (ou intervalle configuré) depuis la première diffusion
      const sollicitationTs = course.heure_sollicitation
        ? new Date(course.heure_sollicitation).getTime()
        : new Date(course.created_date).getTime();
      const ageMs = now - sollicitationTs;
      if (ageMs < intervalMs) continue;

      // Éviter le chevauchement avec T+10 (push général)
      if (course.push_general_t10_at) {
        const t10AgeMs = now - new Date(course.push_general_t10_at).getTime();
        if (t10AgeMs < intervalMs) continue;
      }

      // Éviter le chevauchement avec le cooldown T+10 (course couverte récemment)
      if (course.push_general_t10_couvert_at) {
        const couvertAgeMs = now - new Date(course.push_general_t10_couvert_at).getTime();
        if (couvertAgeMs < intervalMs) continue;
      }

      coursesEligibles.push(course);
    }

    if (coursesEligibles.length === 0) {
      return { success: true, sent: false, reason: 'no_course' };
    }

    // ── 3. Grouper par pays ──
    const coursesParPays = new Map<string, any[]>();
    for (const course of coursesEligibles) {
      const cc = course.country_code || 'UNKNOWN';
      if (!coursesParPays.has(cc)) coursesParPays.set(cc, []);
      coursesParPays.get(cc)!.push(course);
    }

    const resultats: any[] = [];

    // ── 4. Pour chaque pays ──
    for (const [countryCode, courses] of coursesParPays) {
      // a. Acquérir le lock anti-concurrence
      const lockResult = await acquireCountryLock(base44, countryCode);
      if (!lockResult.acquired) {
        resultats.push({ country_code: countryCode, status: 'lock_taken', courses: courses.length });
        continue;
      }

      try {
        // b. Vérifier le cooldown du pays
        const lastSentTs = await getCountryLastSent(base44, countryCode);
        if (lastSentTs && (now - lastSentTs) < intervalMs) {
          resultats.push({ country_code: countryCode, status: 'cooldown', courses: courses.length });
          continue;
        }

        // c. Revalider les courses (race condition — une course a pu être acceptée)
        const courseIds = courses.map((c: any) => c.id);
        const freshCourses = await base44.asServiceRole.entities.CourseExterne.filter({
          id: { $in: courseIds },
        });
        const validCourses = (freshCourses || []).filter((c: any) =>
          c.statut === 'recherche_livreur' &&
          !c.livreur_id &&
          !c.accepted_by_livreur_id
        );

        if (validCourses.length === 0) {
          resultats.push({ country_code: countryCode, status: 'no_valid_course' });
          continue;
        }

        // d. Récupérer les destinataires éligibles
        const destinataires = await getLivreursDestinataires(base44, countryCode);
        if (destinataires.length === 0) {
          resultats.push({ country_code: countryCode, status: 'no_recipient', courses: validCourses.length });
          continue;
        }

        // e. Construire le message groupé
        const titre = 'SILGAPP';
        const message = validCourses.length === 1
          ? 'Une course attend un livreur. Ouvrez l\'application pour la consulter.'
          : `${validCourses.length} courses attendent un livreur. Ouvrez l'application pour les consulter.`;

        const livreurIds = destinataires.map((l: any) => l.id);

        // f. Envoyer le push groupé via le système existant
        let pushSucces = 0;
        let pushFailed = false;
        try {
          const pushResult = await base44.asServiceRole.functions.invoke('envoiNotificationPushBatch', {
            titre,
            message,
            type: 'course_proximite',
            course_id: null,
            livreur_ids: livreurIds,
          });
          pushSucces = pushResult?.data?.succes ?? pushResult?.data?.sent_count ?? 0;
          if (pushSucces === 0 && destinataires.length > 0) pushFailed = true;
        } catch (err: any) {
          console.error(`${LOG_PREFIX} Erreur envoi push batch:`, err?.message || String(err));
          pushFailed = true;
        }

        if (pushFailed) {
          // Échec FCM : ne pas mettre à jour le cooldown — les courses restent éligibles
          resultats.push({
            country_code: countryCode,
            status: 'fcm_failed',
            courses: validCourses.length,
            recipients: destinataires.length,
          });
          continue;
        }

        // g. Mettre à jour le cooldown du pays
        await setCountryLastSent(base44, countryCode, now);

        // h. Journaliser
        journaliserDispatch(base44, {
          evenement: 'rappel_periodique_sent',
          country_code: countryCode,
          raison_passage: `courses:${validCourses.length} | recipients:${destinataires.length} | push_succes:${pushSucces}`,
          total_candidats: validCourses.length,
        });

        console.log(`${LOG_PREFIX} ✅ ${countryCode}: ${validCourses.length} courses → ${destinataires.length} livreurs (${pushSucces} push OK)`);

        resultats.push({
          country_code: countryCode,
          status: 'sent',
          courses: validCourses.length,
          recipients: destinataires.length,
          push_succes: pushSucces,
        });

      } finally {
        // i. Relâcher le lock
        await releaseCountryLock(base44, countryCode, lockResult.invocationId);
      }
    }

    return {
      success: true,
      sent: resultats.some((r: any) => r.status === 'sent'),
      details: resultats,
    };

  } catch (err: any) {
    console.error(`${LOG_PREFIX} Erreur:`, err?.message || String(err));
    return { success: false, error: err?.message || 'unknown' };
  }
}