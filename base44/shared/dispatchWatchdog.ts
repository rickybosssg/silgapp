// ═══════════════════════════════════════════════════════════════════════════
// 📌 WATCHDOG DISPATCH V2 — RAPPEL T+5 MIN (2026-08-14)
// ═══════════════════════════════════════════════════════════════════════════
// T=0   : 1 push batch à tous les livreurs éligibles et libres (publierCourseDansFil)
// T+5min: si toujours disponible_push sans livreur → 1 push batch de rappel
//         aux meilleurs livreurs encore éligibles et non en course.
// Après acceptation : aucun push. Pas de T+20s, pas de cycle_epuise.
// ═══════════════════════════════════════════════════════════════════════════

// ── Watchdog de dispatch — détecte et corrige les anomalies de manière idempotente ──
// Ne relance pas systématiquement le dispatch. Détecte les anomalies, corrige
// uniquement l'état concerné, et relance le dispatch seulement si nécessaire.
// Les alertes admin sont dédupliquées (30 min) pour éviter le spam.

import { STATUTS_ACTIFS_COURSE, STATUTS_ACTIFS_VERIF } from './dispatchConstants.ts';
import { journaliserDispatch } from './dispatchUtils.ts';
import { getLivreursNotifies } from './dispatchNotifications.ts';
import { lancerDispatchMulti } from './dispatchEngine.ts';
import { chargerConfigDispatch, chargerConfigVaguesGPS, CYCLE_EPUISE_TIMEOUT_MS } from './dispatchConfig.ts';
import { isV2Enabled, secoursDispatchV2 } from './dispatchV2.ts';

const WATCHDOG_GRACE_MS = 2 * 60 * 1000;        // 2 min de grâce pour les automations événementielles
const PROPOSE_TIMEOUT_GRACE_MS = 5 * 60 * 1000; // 5 min de grâce après expiration du timeout
const ALERT_DEDUP_MS = 30 * 60 * 1000;           // 30 min de dédup pour les alertes admin

/** Crée une alerte admin si aucune alerte récente n'existe pour la même course. */
async function createAdminAlert(base44, titre, message, courseId) {
  try {
    const recent = await base44.asServiceRole.entities.Notification.filter({
      type: 'alerte_critique_dispatch', course_id: courseId, lue: false,
    }, '-created_date', 1);
    if (recent?.[0] && (Date.now() - new Date(recent[0].created_date).getTime()) < ALERT_DEDUP_MS) {
      return; // Alert déjà envoyée récemment — skip
    }
    await base44.asServiceRole.entities.Notification.create({
      titre, message, type: 'alerte_critique_dispatch', course_id: courseId, lue: false,
    });
  } catch (e) { console.error('[WATCHDOG] ❌ Erreur création alerte:', e.message); }
}

/**
 * Watchdog principal — détecte et corrige 7 types d'anomalies.
 * Idempotent : vérifie l'état avant de corriger, ne crée jamais de doubles notifications.
 */
export async function runWatchdog(base44, body = {}) {
  const now = new Date();
  const anomalies = [];
  const corrections = [];

  // ── Charger les courses à surveiller ──
  const coursesRecherche = await base44.asServiceRole.entities.CourseExterne.filter(
    { statut: 'recherche_livreur' }, '-created_date', 200
  );
  const coursesNouvelles = await base44.asServiceRole.entities.CourseExterne.filter(
    { statut: 'nouvelle' }, '-created_date', 200
  );
  const seenIds = new Set();
  const courses = [...coursesRecherche, ...coursesNouvelles].filter(c => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });

  // ── Pre-charger les course_ids ayant au moins une DispatchNotification ──
  const notifCourses = await base44.asServiceRole.entities.DispatchNotification.filter(
    {}, 'date_notification', 500
  ).catch(() => []);
  const courseIdsWithNotifs = new Set((notifCourses || []).map(n => n.course_id));

  // ── Pre-charger la config ──
  const cachedConfig = {
    dispatch: await chargerConfigDispatch(base44),
    gps: await chargerConfigVaguesGPS(base44),
  };

  // ═══ ANOMALIE 1: Course nouvelle jamais traitée par l'automation create ═══
  // Une course nouvelle > 2 min sans aucune notification = l'entity automation create a échoué
  for (const course of courses) {
    if (course.statut !== 'nouvelle') continue;
    const ageMs = now.getTime() - new Date(course.created_date).getTime();
    if (ageMs <= WATCHDOG_GRACE_MS) continue;
    if (courseIdsWithNotifs.has(course.id)) continue;

    const ageMin = Math.round(ageMs / 60000);
    anomalies.push({ course_id: course.id, type: 'nouvelle_jamais_traitee', severity: 'critique', description: `Course nouvelle depuis ${ageMin}min sans notification` });

    try {
      const result = await lancerDispatchMulti(base44, course.id, [], cachedConfig);
      corrections.push({ course_id: course.id, action: 'force_dispatch_nouvelle', result });
    } catch (err) {
      corrections.push({ course_id: course.id, action: 'force_dispatch_nouvelle', error: err.message });
    }

    await createAdminAlert(base44,
      '🚨 Watchdog: Course nouvelle jamais traitée',
      `Course ${course.client_nom || '?'} (${course.adresse_depart || '?'}) — nouvelle depuis ${ageMin}min sans notification. Automation create a échoué. Dispatch forcé.`,
      course.id
    );
    await new Promise(r => setTimeout(r, 100));
  }

  // ═══ ANOMALIE 2: Course en recherche_livreur sans vague active ═══
  // dispatch_status en_attente + statut recherche_livreur + > 2 min sans notification
  for (const course of courses) {
    if (course.statut !== 'recherche_livreur') continue;
    if (course.dispatch_status !== 'en_attente') continue;
    const ageMs = now.getTime() - new Date(course.updated_date).getTime();
    if (ageMs <= WATCHDOG_GRACE_MS) continue;
    if (courseIdsWithNotifs.has(course.id)) continue;

    const ageMin = Math.round(ageMs / 60000);
    anomalies.push({ course_id: course.id, type: 'recherche_sans_vague', severity: 'critique', description: `Course en_attente depuis ${ageMin}min sans vague` });

    try {
      const result = await lancerDispatchMulti(base44, course.id, [], cachedConfig);
      corrections.push({ course_id: course.id, action: 'force_dispatch_recherche', result });
    } catch (err) {
      corrections.push({ course_id: course.id, action: 'force_dispatch_recherche', error: err.message });
    }

    await createAdminAlert(base44,
      '🚨 Watchdog: Course en recherche sans vague active',
      `Course ${course.client_nom || '?'} (${course.adresse_depart || '?'}) — en_attente depuis ${ageMin}min sans vague. Automation update a échoué. Dispatch forcé.`,
      course.id
    );
    await new Promise(r => setTimeout(r, 100));
  }

  // ═══ ANOMALIE 3: Course en propose avec timeout largement dépassé ═══
  // timeout_expires_at < now - 5 min (grâce de 5 min pour l'event automation)
  for (const course of courses) {
    if (course.dispatch_status !== 'propose') continue;
    if (!course.timeout_expires_at) continue;
    const expiredMs = now.getTime() - new Date(course.timeout_expires_at).getTime();
    if (expiredMs <= PROPOSE_TIMEOUT_GRACE_MS) continue;

    const expiredMin = Math.round(expiredMs / 60000);
    anomalies.push({ course_id: course.id, type: 'propose_timeout_exceeded', severity: 'elevee', description: `Course en propose depuis ${expiredMin}min après timeout expiré` });

    if (course.livreur_id) {
      // Verrou expiré avec livreur_id (prix manuel sans réponse, ou acceptation expirée)
      await base44.asServiceRole.entities.CourseExterne.update(course.id, {
        statut: 'recherche_livreur',
        dispatch_status: 'redispatch',
        livreur_id: '', livreur_nom: '', livreur_telephone: '',
        heure_acceptation: null, accepted_by_livreur_id: '', accepted_at: null,
        pricing_mode: 'automatic', manual_price: null, manual_price_status: null,
        proposed_by_livreur_id: '', timeout_expires_at: null,
      });
    } else {
      // Vague expirée sans verrou → avancer à la prochaine vague ou cycle_epuise
      const currentWave = course.dispatch_wave || 0;
      const maxWave = cachedConfig.gps.waves.length;
      const nextWave = currentWave + 1;

      if (nextWave > maxWave) {
        const cycleEpuiseDeadline = new Date(now.getTime() + CYCLE_EPUISE_TIMEOUT_MS).toISOString();
        await base44.asServiceRole.entities.CourseExterne.update(course.id, {
          dispatch_status: 'cycle_epuise',
          dispatch_wave: maxWave,
          timeout_expires_at: cycleEpuiseDeadline,
        });
        corrections.push({ course_id: course.id, action: 'cycle_epuise' });
        continue;
      }

      await base44.asServiceRole.entities.CourseExterne.update(course.id, {
        dispatch_status: 'redispatch',
        dispatch_wave: nextWave,
      });
    }

    try {
      const result = await lancerDispatchMulti(base44, course.id, [], cachedConfig);
      corrections.push({ course_id: course.id, action: 'redispatch_propose_timeout', result });
    } catch (err) {
      corrections.push({ course_id: course.id, action: 'redispatch_propose_timeout', error: err.message });
    }
    await new Promise(r => setTimeout(r, 100));
  }

  // ═══ ANOMALIE 4: Course avec livreur_id incohérent ═══
  // livreur_id set mais dispatch_status !== 'accepte' ou statut === 'recherche_livreur'
  for (const course of courses) {
    if (!course.livreur_id) continue;
    if (course.dispatch_status === 'accepte' && course.statut !== 'recherche_livreur') continue;

    anomalies.push({ course_id: course.id, type: 'livreur_id_incoherent', severity: 'elevee', description: `livreur_id=${course.livreur_id} mais dispatch_status=${course.dispatch_status}, statut=${course.statut}` });

    if (course.statut === 'recherche_livreur' || course.dispatch_status === 'redispatch') {
      await base44.asServiceRole.entities.CourseExterne.update(course.id, {
        livreur_id: '', livreur_nom: '', livreur_telephone: '',
        accepted_by_livreur_id: '', accepted_at: null,
      });
      corrections.push({ course_id: course.id, action: 'clear_incoherent_livreur_id' });
    }
  }

  // ═══ ANOMALIE 5: Livreur en_course sans course active (statut fantôme) ═══
  const livreursEnCourse = await base44.asServiceRole.entities.Livreur.filter(
    { type_livreur: 'externe', statut: 'en_course' },
    '-updated_date', 50
  );
  if (livreursEnCourse.length > 0) {
    const livreurIdsAvecCourseActive = new Set(
      courses.filter(c => STATUTS_ACTIFS_VERIF.includes(c.statut) && c.livreur_id).map(c => c.livreur_id)
    );
    const livreursFantomes = livreursEnCourse.filter(l => !livreurIdsAvecCourseActive.has(l.id));
    for (const l of livreursFantomes) {
      const nouveauStatut = l.manual_hors_ligne === true ? 'hors_ligne' : 'disponible';
      await base44.asServiceRole.entities.Livreur.update(l.id, { statut: nouveauStatut });
      anomalies.push({ livreur_id: l.id, type: 'en_course_sans_course', severity: 'moyenne', description: `${l.prenom || ''} ${l.nom || ''} en_course sans course active → ${nouveauStatut}` });
      corrections.push({ livreur_id: l.id, action: `en_course→${nouveauStatut}` });
    }
  }

  // ═══ ANOMALIE 6: Livreur disponible avec course active ═══
  const livreursDisponibles = await base44.asServiceRole.entities.Livreur.filter(
    { type_livreur: 'externe', statut: 'disponible' },
    '-updated_date', 50
  );
  if (livreursDisponibles.length > 0) {
    const livreurIdsAvecCourseActive = new Set(
      courses.filter(c => STATUTS_ACTIFS_VERIF.includes(c.statut) && c.livreur_id).map(c => c.livreur_id)
    );
    const livreursIncoherents = livreursDisponibles.filter(l => livreurIdsAvecCourseActive.has(l.id));
    for (const l of livreursIncoherents) {
      await base44.asServiceRole.entities.Livreur.update(l.id, { statut: 'en_course' });
      anomalies.push({ livreur_id: l.id, type: 'disponible_avec_course', severity: 'elevee', description: `${l.prenom || ''} ${l.nom || ''} disponible mais a une course active → en_course` });
      corrections.push({ livreur_id: l.id, action: 'disponible→en_course' });
    }
  }

  // ═══ ANOMALIE 7: Course cycle_epuise → disponible_push → en_attente ═══
  // Phase 1: cycle_epuise avec timeout expiré → transition vers disponible_push
  //          (la course devient visible par tous les livreurs éligibles)
  // Phase 2: disponible_push avec timeout expiré → transition vers en_attente
  const DISPONIBLE_PUSH_TIMEOUT_MS = 30 * 60 * 1000; // 30 min en disponible_push

  for (const course of courses) {
    if (course.dispatch_status !== 'cycle_epuise' && course.dispatch_status !== 'disponible_push') continue;
    const deadlineMs = course.timeout_expires_at ? new Date(course.timeout_expires_at).getTime() : 0;
    if (deadlineMs > 0 && now.getTime() < deadlineMs) continue;
    // V2 : pas de timeout sur disponible_push → la logique de secours V2 ci-dessous
    // gère la progression (top3 → top5 → cycle_epuise). Ne pas passer en en_attente.
    if (deadlineMs === 0 && course.dispatch_status === 'disponible_push') continue;

    if (course.dispatch_status === 'cycle_epuise') {
      // Transition: cycle_epuise → disponible_push
      anomalies.push({ course_id: course.id, type: 'cycle_epuise_vers_disponible', severity: 'moyenne', description: `Cycle épuisé → course disponible pour tous les livreurs` });

      const pushDeadline = new Date(now.getTime() + DISPONIBLE_PUSH_TIMEOUT_MS).toISOString();
      await base44.asServiceRole.entities.CourseExterne.update(course.id, {
        dispatch_status: 'disponible_push',
        timeout_expires_at: pushDeadline,
      });
      corrections.push({ course_id: course.id, action: 'cycle_epuise_vers_disponible_push' });
    } else {
      // Transition: disponible_push → en_attente
      anomalies.push({ course_id: course.id, type: 'disponible_push_expire', severity: 'moyenne', description: `Course disponible sans acceptation — mise en attente` });

      await base44.asServiceRole.entities.CourseExterne.update(course.id, {
        statut: 'en_attente',
        dispatch_status: 'en_attente',
        notes: (course.notes || '') + ' | [EN ATTENTE] Course disponible sans acceptation pendant 30 min',
      });
      corrections.push({ course_id: course.id, action: 'disponible_push_en_attente' });
    }
  }

  // ── Journaliser toutes les anomalies ──
  for (const a of anomalies) {
    journaliserDispatch(base44, {
      course_id: a.course_id || '',
      evenement: 'watchdog_anomalie',
      raison_blocage: a.type,
      raison_passage: `severity:${a.severity} | ${a.description || ''}`,
    });
  }

  // ═══ V2 SECOURS : rappel ciblé à T+5 min si la course n'est pas acceptée ═══
  // T=0   : 1 push batch à tous les livreurs éligibles et libres (publierCourseDansFil)
  // T+5min: si toujours disponible_push sans livreur → 1 push batch de rappel aux
  //         meilleurs livreurs encore éligibles et non en course.
  // Après acceptation : aucun push (la course n'est plus disponible_push).
  // Pas de T+20s, pas de priorité temporelle, pas de cycle_epuise.
  const v2Enabled = await isV2Enabled(base44);
  if (v2Enabled) {
    const coursesFil = courses.filter(c => c.dispatch_status === 'disponible_push' && c.statut === 'recherche_livreur');

    for (const course of coursesFil) {
      const secoursPhase = Number(course.dispatch_v2_secours_phase || 0);
      if (secoursPhase >= 1) continue; // Rappel déjà envoyé — ne pas re-notifier

      // Garde : ne rien faire si la course a déjà un livreur (acceptation concurrente)
      if (course.livreur_id || course.accepted_by_livreur_id) continue;

      const sollicitationMs = course.heure_sollicitation
        ? new Date(course.heure_sollicitation).getTime()
        : new Date(course.created_date).getTime();
      const ageMin = (now.getTime() - sollicitationMs) / 60000;

      if (ageMin >= 5) {
        // T+5 min : envoyer un push batch de rappel aux meilleurs livreurs encore éligibles
        // secoursDispatchV2 exclut déjà les livreurs en course, refusés et déjà notifiés.
        const result = await secoursDispatchV2(base44, course, 10, { excludeAlreadyNotified: false });
        await base44.asServiceRole.entities.CourseExterne.update(course.id, {
          dispatch_v2_secours_phase: 1,
        });
        corrections.push({ course_id: course.id, action: 'secours_v2_rappel_t5min', pushed: result.pushed });
      }
    }
  }

  console.log(`[WATCHDOG] 📋 ${anomalies.length} anomalie(s) détectée(s), ${corrections.length} correction(s) appliquée(s)`);

  return {
    success: true,
    anomalies_count: anomalies.length,
    corrections_count: corrections.length,
    anomalies: anomalies.slice(0, 20),
    corrections: corrections.slice(0, 20),
  };
}