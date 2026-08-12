// ═══════════════════════════════════════════════════════════════════════════
// 📌 DISPATCH V2 — VERSION STABLE FIGÉE (2026-08-11)
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️  NE PAS MODIFIER SANS VALIDATION EXPLICITE DU RESPONSABLE PRODUIT.
//
// Ce moteur a été audité, testé et validé. Toute modification — même mineure —
// doit être signalée et validée avant application. Les optimisations automatiques
// ou refactorisations sont interdites sur ce fichier.
//
// Fonctionnement validé (à conserver) :
//   1. Course publiée dans le fil « Disponibles » (dispatch_status = disponible_push).
//   2. Tous les livreurs éligibles et libres voient la course, prioritaires ou non.
//   3. À T=0, les prioritaires (priorite_dispatch > 0) reçoivent le push en premier,
//      puis tous les non-prioritaires éligibles reçoivent également un push.
//   4. Notifications envoyées via envoiNotificationPushBatch (1 appel pour N livreurs).
//   5. Un non-prioritaire peut accepter immédiatement une course visible dans son fil.
//   6. Un livreur en course ne reçoit pas le push et ne peut pas accepter une 2e course.
//   7. Acceptation protégée par verrou atomique (updateMany conditionnel) — 1 seul gagnant.
//   8. Après acceptation, la course disparaît du fil des autres (livreur_id + WebSocket).
//   9. T+5 min sans acceptation → push batch Top 3 non-prioritaires encore éligibles.
//  10. T+10 min sans acceptation → push batch Top 5 non-prioritaires encore éligibles.
//  11. T+15 min → aucun nouveau push ; la course reste en disponible_push indéfiniment.
//
// V1 (dispatchEngine.ts) reste intact pour rollback. Feature flags et pilote
// (DISPATCH_V2_ENABLED, DISPATCH_V2_PILOT_*) inchangés.
// ═══════════════════════════════════════════════════════════════════════════

// ── Dispatch V2 : Fil de courses disponibles + secours ciblé ────────────────
// Nouveau système derrière le feature flag DISPATCH_V2_ENABLED.
// V1 (vagues) reste intact et utilisé quand le flag est désactivé.
// VERSION: 2026-08-11 — Version stable figée. Ne pas modifier sans validation.

import { STATUTS_ACTIFS_COURSE, STATUTS_TERMINAUX_COURSE, calculerDistance } from './dispatchConstants.ts';
import { dispatchLog, reponseDejaPrise, generateToken, generatePIN, journaliserDispatch } from './dispatchUtils.ts';
import { enregistrerNotification, getLivreursNotifies, getLivreursRefuses, marquerAccepte } from './dispatchNotifications.ts';

// ── Feature flag cache (TTL 2 min) ──
let V2_FLAG_CACHE: { enabled: boolean; expires: number } | null = null;
const V2_FLAG_TTL_MS = 2 * 60 * 1000;

export async function isV2Enabled(base44: any): Promise<boolean> {
  if (V2_FLAG_CACHE && Date.now() < V2_FLAG_CACHE.expires) return V2_FLAG_CACHE.enabled;
  try {
    const configs = await base44.asServiceRole.entities.AppConfig.filter({ cle: 'DISPATCH_V2_ENABLED' });
    const enabled = configs?.[0] ? configs[0].valeur !== 'false' : true;
    if (!configs?.[0]) {
      await base44.asServiceRole.entities.AppConfig.create({
        cle: 'DISPATCH_V2_ENABLED',
        valeur: 'true',
        description: 'Dispatch V2 actif par défaut - fil de courses disponibles',
      }).catch(() => null);
    }
    V2_FLAG_CACHE = { enabled, expires: Date.now() + V2_FLAG_TTL_MS };
    return enabled;
  } catch {
    return true;
  }
}

async function notifierLivreursEligiblesV2(base44: any, course: any, options: any = {}) {
  const { priorityOnly = false, skipAlreadyPublishedCheck = false } = options;
  if (!course?.id || !course?.country_code) return { notified: 0 };

  const [livreurs, dejaNotifies, refuses] = await Promise.all([
    base44.asServiceRole.entities.Livreur.filter({
      type_livreur: 'externe',
      validation: 'valide',
      actif: true,
      statut: 'disponible',
      country_code: course.country_code,
      bloque_encours: false,
      manual_hors_ligne: { $ne: true },
      admin_hors_ligne: { $ne: true },
    }, '-last_seen_at', 500).catch(() => []),
    getLivreursNotifies(base44, course.id),
    getLivreursRefuses(base44, course.id),
  ]);

  // 🛡️ Anti-race-condition : si la course a déjà des notifications, c'est qu'elle
  // a déjà été publiée dans le fil. Ne pas re-notifier (évite les 82 doublons).
  // Sauf si skipAlreadyPublishedCheck=true (appel délibéré pour la 2e vague).
  if (!skipAlreadyPublishedCheck && dejaNotifies && dejaNotifies.length > 0) {
    dispatchLog(`[V2] ⏭️ Course ${course.id} déjà publiée (${dejaNotifies.length} notifs existantes) — skip re-notification`);
    return { notified: 0, already_published: true };
  }

  const exclus = new Set([...(dejaNotifies || []), ...(refuses || [])]);
  let candidats = (livreurs || []).filter((livreur: any) => livreur.user_email && !exclus.has(livreur.id));

  // 🚫 Exclure les livreurs déjà en course (même définition que aCourseActive)
  const livreursEnCourse = await getLivreursEnCourse(base44, course.country_code);
  candidats = candidats.filter((l: any) => !livreursEnCourse.has(l.id));

  // 🎯 Priorité : si priorityOnly=true, ne notifier que les livreurs prioritaires (priorite_dispatch > 0)
  if (priorityOnly) {
    candidats = candidats.filter((l: any) => Number(l.priorite_dispatch || 0) > 0);
  }

  // Enregistrer les DispatchNotifications (bulk) pour le suivi dispatch
  await Promise.allSettled(
    candidats.map((livreur: any) => enregistrerNotification(base44, course.id, livreur, 0, { country_code: course.country_code }))
  );

  // 📤 Envoi push batch : 1 seule invocation backend pour tous les livreurs prioritaires
  if (candidats.length > 0) {
    const batchResult = await base44.asServiceRole.functions.invoke('envoiNotificationPushBatch', {
      course_id: course.id,
      livreur_ids: candidats.map((l: any) => l.id),
      titre: 'Nouvelle course SILGAPP',
      message: `${course.quartier_depart || course.adresse_depart || 'Départ'} vers ${course.quartier_arrivee || course.adresse_arrivee || 'destination'}`,
      type: 'nouvelle_course',
      alert_duration_seconds: 5,
      alert_interval_seconds: 5,
      dispatch_version: '2',
    }).catch((err: any) => {
      dispatchLog(`[V2] ⚠️ Batch push error (T=0): ${err?.message}`);
      return null;
    });

    const sent = batchResult?.succes || 0;
    dispatchLog(`[V2] 📢 Batch push T=0: ${sent} token(s) envoyé(s) pour ${candidats.length} livreur(s) prioritaire(s)`);
    return { notified: candidats.length, push_sent: sent, push_failed: batchResult?.echecs || 0 };
  }

  return { notified: 0 };
}

// ── Helper : liste des livreurs en course (même définition que aCourseActive) ──
async function getLivreursEnCourse(base44: any, countryCode: string): Promise<Set<string>> {
  if (!countryCode) return new Set();
  const [courses, coursesAccepted] = await Promise.all([
    base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: countryCode, livreur_id: { $ne: null } }, '-created_date', 200
    ).catch(() => []),
    base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: countryCode, accepted_by_livreur_id: { $ne: null } }, '-created_date', 200
    ).catch(() => []),
  ]);
  const ids = new Set<string>();
  for (const c of [...(courses || []), ...(coursesAccepted || [])]) {
    if (c.livreur_id && (STATUTS_ACTIFS_COURSE.includes(c.statut) || (c.dispatch_status === 'accepte' && !STATUTS_TERMINAUX_COURSE.includes(c.statut)))) {
      ids.add(c.livreur_id);
    }
    if (c.accepted_by_livreur_id && (STATUTS_ACTIFS_COURSE.includes(c.statut) || (c.dispatch_status === 'accepte' && !STATUTS_TERMINAUX_COURSE.includes(c.statut)))) {
      ids.add(c.accepted_by_livreur_id);
    }
  }
  return ids;
}

// ── Pilote par livreur (cache TTL 60s) ──
let PILOT_CACHE: { ids: string[]; enabled: boolean; expires: number } | null = null;
const PILOT_TTL_MS = 60 * 1000;

export async function isPilotLivreur(base44: any, livreurId: string): Promise<boolean> {
  if (!livreurId) return false;
  if (PILOT_CACHE && Date.now() < PILOT_CACHE.expires) {
    return PILOT_CACHE.enabled && PILOT_CACHE.ids.includes(livreurId);
  }
  try {
    const configs = await base44.asServiceRole.entities.AppConfig.filter(
      { cle: { $in: ['DISPATCH_V2_PILOT_ENABLED', 'DISPATCH_V2_PILOT_LIVREUR_IDS'] } }
    );
    const enabled = configs.find((c: any) => c.cle === 'DISPATCH_V2_PILOT_ENABLED')?.valeur === 'true';
    const idsStr = configs.find((c: any) => c.cle === 'DISPATCH_V2_PILOT_LIVREUR_IDS')?.valeur || '';
    const ids = idsStr.split(',').map((s: string) => s.trim()).filter(Boolean);
    PILOT_CACHE = { ids, enabled, expires: Date.now() + PILOT_TTL_MS };
    return enabled && ids.includes(livreurId);
  } catch {
    return false;
  }
}

// ── Publier une course dans le fil (V2) ──
// La course est visible immédiatement dans le fil « Disponibles » de TOUS les
// livreurs éligibles. Seuls les prioritaires (priorite_dispatch > 0) reçoivent
// une notification push à T=0. Les non-prioritaires peuvent voir et accepter la
// course depuis leur fil. Si personne n'a accepté après ~5 min, le watchdog
// déclenche les phases de secours (secoursDispatchV2) qui envoient un push
// ciblé aux meilleurs non-prioritaires restants.
export async function publierCourseDansFil(base44: any, course: any) {
  if (!course?.id) return { error: 'no_course_id' };

  await base44.asServiceRole.entities.CourseExterne.update(course.id, {
    statut: 'recherche_livreur',
    dispatch_status: 'disponible_push',
    heure_sollicitation: new Date().toISOString(),
    timeout_expires_at: null,
    dispatch_wave: 0,
    dispatch_next_wave_at: null,
    dispatch_v2_secours_phase: 0,
    livreur_id: '',
    accepted_by_livreur_id: '',
  });

  // 🎯 Push aux livreurs prioritaires EN PREMIER
  const priorityResult = await notifierLivreursEligiblesV2(base44, course, { priorityOnly: true });

  // 📢 Push à TOUS les autres livreurs éligibles non-prioritaires
  // (skipAlreadyPublishedCheck = true car la 1re vague a déjà créé des DispatchNotifications)
  const nonPriorityResult = await notifierLivreursEligiblesV2(base44, course, {
    priorityOnly: false,
    skipAlreadyPublishedCheck: true,
  });

  const totalNotified = (priorityResult.notified || 0) + (nonPriorityResult.notified || 0);
  dispatchLog(`[V2] 📢 Course ${course.id} publiée dans le fil (disponible_push) — ${priorityResult.notified} prioritaire(s) + ${nonPriorityResult.notified} non-prioritaire(s) = ${totalNotified} notifié(s) par push`);
  return { success: true, published: true, priority: priorityResult, non_priority: nonPriorityResult };
}

// ── Vérifier si un livreur a une course active (3 niveaux) ──
export async function aCourseActive(base44: any, livreurId: string, countryCode: string, excludeCourseId: string | null = null): Promise<boolean> {
  if (!livreurId || !countryCode) return false;

  const [courses, coursesAccepted] = await Promise.all([
    base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: countryCode, livreur_id: livreurId }, '-created_date', 20
    ).catch(() => []),
    base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: countryCode, accepted_by_livreur_id: livreurId }, '-created_date', 20
    ).catch(() => []),
  ]);

  const toutes = [...(courses || []), ...(coursesAccepted || [])];
  return toutes.some((c: any) =>
    c.id !== excludeCourseId && (
      STATUTS_ACTIFS_COURSE.includes(c.statut) ||
      (c.dispatch_status === 'accepte' && !STATUTS_TERMINAUX_COURSE.includes(c.statut))
    )
  );
}

// ── Acceptation V2 : updateMany conditionnel → verify → update single (WebSocket) ──
export async function accepterCourseV2(base44: any, courseId: string, livreurId: string, options: any = {}) {
  const { pricing_mode, manual_price, override_pricing_mode } = options;

  // 1. Get course
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
  if (!course) return { error: 'Course introuvable' };

  // 2. Check course still available (disponible_push V2, propose V1, en_attente = admin manuel)
  if (course.dispatch_status !== 'disponible_push' && course.dispatch_status !== 'propose' && course.dispatch_status !== 'en_attente') {
    return reponseDejaPrise('not_available', course);
  }
  // 2b. Refuser les courses en statut terminal (annulee / livree)
  if (STATUTS_TERMINAUX_COURSE.includes(course.statut)) {
    return { success: false, accepted: false, reason: 'course_terminal', error: 'Cette course n\'est plus disponible (terminée ou annulée).' };
  }
  if (course.livreur_id || course.accepted_by_livreur_id) {
    return reponseDejaPrise('already_taken', course);
  }

  // 3. Get livreur + verify country
  const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId);
  if (!livreur) return { success: false, error: 'Livreur introuvable' };

  const livreurEligible =
    livreur.type_livreur === 'externe' &&
    livreur.validation === 'valide' &&
    livreur.actif === true &&
    livreur.statut === 'disponible' &&
    livreur.bloque_encours !== true &&
    livreur.manual_hors_ligne !== true &&
    livreur.admin_hors_ligne !== true;
  if (!livreurEligible) {
    return { success: false, accepted: false, reason: 'livreur_indisponible', error: 'Livreur non disponible pour cette course.' };
  }

  const courseCountry = (course.country_code || '').trim().toUpperCase();
  const livreurCountry = (livreur.country_code || '').trim().toUpperCase();
  if (!courseCountry || !livreurCountry || courseCountry !== livreurCountry) {
    return { success: false, error: 'country_mismatch' };
  }

  // 4. Check bloque_encours
  if (livreur.bloque_encours) {
    return { success: false, accepted: false, reason: 'bloque_encours', error: 'Plafond d\'encours atteint.' };
  }

  // 5. RÈGLE ABSOLUE : pas de course active
  const hasActive = await aCourseActive(base44, livreurId, course.country_code, courseId);
  if (hasActive) {
    return { success: false, accepted: false, reason: 'deja_en_course', error: 'Vous avez déjà une course en cours.' };
  }

  // 6. Check timeout
  if (course.timeout_expires_at && new Date(course.timeout_expires_at) < new Date()) {
    return { success: false, error: 'Course expirée', expired: true };
  }

  // 7. Prix minimum
  const isManual = pricing_mode === 'manual' && manual_price && Number(manual_price) >= 1000;

  // 8. Tokens/PINs (préserver existants)
  const pickupToken = course.pickup_qr_token || generateToken();
  const deliveryToken = course.delivery_qr_token || generateToken();
  const pickupPIN = course.pickup_code_4_digits || generatePIN();
  const deliveryPIN = course.delivery_code_4_digits || generatePIN();

  // 9. Atomic lock via updateMany conditionnel
  const updateData: any = {
    dispatch_status: isManual ? 'propose' : 'accepte',
    statut: isManual ? 'recherche_livreur' : 'livreur_en_route',
    heure_acceptation: isManual ? null : new Date().toISOString(),
    livreur_id: livreurId,
    livreur_nom: `${livreur.prenom || ''} ${livreur.nom || ''}`.trim(),
    livreur_photo_url: livreur.photo_url || '',
    livreur_telephone: livreur.telephone,
    livreur_vehicule: livreur.vehicule || livreur.type_vehicule || 'moto',
    livreur_note_moyenne: livreur.note_moyenne || 0,
    livreur_nombre_avis: livreur.nombre_avis || 0,
    accepted_by_livreur_id: livreurId,
    accepted_at: isManual ? null : new Date().toISOString(),
    pickup_qr_token: pickupToken,
    pickup_code_4_digits: pickupPIN,
    delivery_qr_token: deliveryToken,
    delivery_code_4_digits: deliveryPIN,
    ...(override_pricing_mode === 'automatic' ? { pricing_mode: 'automatic' } : {}),
  };

  if (isManual) {
    updateData.pricing_mode = 'manual';
    updateData.manual_price = Number(manual_price);
    updateData.manual_price_status = 'pending_client_validation';
    updateData.proposed_by_livreur_id = livreurId;
    updateData.timeout_expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  }

  // Le statut constitue le verrou atomique. Ne pas filtrer livreur_id avec une
  // chaine vide : Base44 stocke aussi l'absence de livreur avec null, ce qui
  // empêchait toute acceptation de ces courses.
  await base44.asServiceRole.entities.CourseExterne.updateMany(
    { id: courseId, dispatch_status: { $in: ['propose', 'disponible_push', 'en_attente'] } },
    { $set: updateData }
  );

  // 10. Verify winner
  const courseVerifie = await base44.asServiceRole.entities.CourseExterne.get(courseId);
  const isMyCourse = String(courseVerifie.livreur_id) === String(livreurId) ||
                     String(courseVerifie.accepted_by_livreur_id) === String(livreurId);

  if (!isMyCourse) {
    dispatchLog(`[V2] 🏁 Race condition perdue — livreur ${livreurId} n'a pas obtenu la course ${courseId}`);
    journaliserDispatch(base44, {
      course_id: courseId,
      country_code: course.country_code,
      vague: 0,
      evenement: 'race_condition_perdue',
      livreur_acceptant_id: livreurId,
      livreur_acceptant_nom: `${livreur.prenom || ''} ${livreur.nom || ''}`.trim(),
      raison_passage: `Perdu par ${livreurId} — gagnant: ${courseVerifie.livreur_id || courseVerifie.accepted_by_livreur_id || '?'}`,
    });
    return reponseDejaPrise('race_condition_lost', courseVerifie);
  }

  // 11. V2 : Trigger WebSocket via update single (déclenche la disparition du fil)
  await base44.asServiceRole.entities.CourseExterne.update(courseId, {
    notes: `Acceptée par ${livreurId} à ${new Date().toISOString()}`,
  });

  // 12. Update livreur status
  if (!isManual) {
    await base44.asServiceRole.entities.Livreur.update(livreurId, { statut: 'en_course' });
    await marquerAccepte(base44, courseId, livreurId);

    // 13. Message code récupération + push notification (courses admin/VENUS)
    if ((course.source === 'admin' || course.created_by_venus === true) && pickupPIN) {
      const idempotencyKey = `pickup-code-${courseId}-${livreurId}`;
      try {
        const existing = await base44.asServiceRole.entities.Message.filter({ client_message_id: idempotencyKey });
        if (!existing || existing.length === 0) {
          const prixLabel = course.prix_propose_admin
            ? `Prix de la course : ${Number(course.prix_propose_admin).toLocaleString()} ${course.devise || 'FCFA'}`
            : (course.prix_estimate ? `Prix estimé : ${Number(course.prix_estimate).toLocaleString()} ${course.devise || 'FCFA'}` : '');
          const messageContent = `🔑 Code de récupération : ${pickupPIN}\n📦 Code de livraison : ${deliveryPIN}${prixLabel ? `\n💰 ${prixLabel}` : ''}`;

          await base44.asServiceRole.entities.Message.create({
            course_id: courseId,
            sender_type: 'admin',
            sender_id: 'silgapp_system',
            sender_name: 'SILGAPP',
            message_type: 'text',
            content: messageContent,
            source: 'app',
            client_message_id: idempotencyKey,
          });

          // 📤 Push notification au livreur avec PIN + prix
          if (livreur.user_email) {
            base44.asServiceRole.functions.invoke('envoiNotificationPush', {
              destinataire_email: livreur.user_email,
              livreur_id: livreurId,
              titre: '🔑 Code PIN + Prix de course',
              message: messageContent,
              type: 'nouveau_message',
              course_id: courseId,
            }).catch((err: any) => console.error('[V2] ❌ Push PIN/prix:', err?.message));
          }
        }
      } catch (err) { console.error('[V2] ⚠️ Erreur message code récupération:', err?.message); }
    }

    // 14. Suivi WhatsApp
    base44.asServiceRole.functions.invoke('envoyerSuiviWhatsApp', {
      course_id: courseId,
      evenement: 'livreur_assigne',
    }).catch((err: any) => console.error('[V2] ❌ Suivi WhatsApp:', err.message));

    // 15. Journaliser
    let tempsAcceptationSec: number | null = null;
    if (course.heure_sollicitation) {
      tempsAcceptationSec = Math.round((Date.now() - new Date(course.heure_sollicitation).getTime()) / 1000);
    }
    journaliserDispatch(base44, {
      course_id: courseId,
      country_code: course.country_code,
      vague: 0,
      evenement: 'acceptation_v2',
      livreur_acceptant_id: livreurId,
      livreur_acceptant_nom: `${livreur.prenom || ''} ${livreur.nom || ''}`.trim(),
      temps_avant_acceptation_sec: tempsAcceptationSec,
    });

    return { success: true, accepted: true, course_id: courseId, livreur_id: livreurId };
  }

  // Mode manuel : notifier le client
  return { success: true, accepted: true, pending_client_validation: true, course_id: courseId, livreur_id: livreurId };
}

// ── Score calculation pour le secours ──
export function calculerScore(livreur: any, course: any): number {
  let score = 0;

  // Distance (35%)
  if (livreur.latitude && livreur.longitude && course.gps_depart_lat) {
    const dist = calculerDistance(course.gps_depart_lat, course.gps_depart_lng, livreur.latitude, livreur.longitude);
    score += (dist !== null ? Math.max(0, 100 - dist * 10) : 50) * 0.35;
  } else {
    score += 50 * 0.35;
  }

  // GPS freshness (20%) — ne JAMAIS exclure les prioritaires
  const gpsAge = livreur.derniere_position_date
    ? (Date.now() - new Date(livreur.derniere_position_date).getTime()) / 60000
    : null;
  const gpsScore = gpsAge === null ? 0 : gpsAge < 5 ? 100 : gpsAge < 30 ? 50 : gpsAge < 120 ? 10 : 0;
  score += gpsScore * 0.20;

  // Priority (15%)
  score += (livreur.priorite_dispatch || 0) * 10 * 0.15;

  // Availability (30%)
  score += (livreur.statut === 'disponible' ? 100 : 0) * 0.30;

  return Math.round(score);
}

// ── Secours : push ciblé au top N livreurs ──
export async function secoursDispatchV2(base44: any, course: any, nbLivreurs: number) {
  if (!course?.id || !course.country_code) return { pushed: 0 };

  // 1. Get eligible livreurs
  const livreurs = await base44.asServiceRole.entities.Livreur.filter({
    type_livreur: 'externe',
    validation: 'valide',
    actif: true,
    statut: 'disponible',
    country_code: course.country_code,
    bloque_encours: false,
    manual_hors_ligne: { $ne: true },
  }, '-last_seen_at', 50);

  if (!livreurs || livreurs.length === 0) return { pushed: 0 };

  // 2. Exclude livreurs in course (fresh check)
  const coursesActives = await base44.asServiceRole.entities.CourseExterne.filter(
    { country_code: course.country_code }, '-created_date', 200
  ).catch(() => []);

  const livreursEnCourse = new Set(
    (coursesActives || [])
      .filter((c: any) => STATUTS_ACTIFS_COURSE.includes(c.statut) && c.livreur_id)
      .map((c: any) => c.livreur_id)
  );

  // 3. Exclude refused + already notified (anti-doublon)
  const [refused, dejaNotifies] = await Promise.all([
    getLivreursRefuses(base44, course.id),
    getLivreursNotifies(base44, course.id),
  ]);

  // 4. Score + sort + slice top N
  const candidats = livreurs
    .filter((l: any) => !livreursEnCourse.has(l.id) && !refused.includes(l.id) && !dejaNotifies.includes(l.id))
    .map((l: any) => ({ ...l, score: calculerScore(l, course) }))
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, nbLivreurs);

  // 5. Push batch ciblé : 1 seule invocation backend pour tous les candidats sélectionnés
  if (candidats.length > 0) {
    const batchResult = await base44.asServiceRole.functions.invoke('envoiNotificationPushBatch', {
      course_id: course.id,
      livreur_ids: candidats.map((l: any) => l.id),
      titre: '📦 Course disponible près de vous',
      message: `${course.quartier_depart || course.adresse_depart || ''} → ${course.quartier_arrivee || course.adresse_arrivee || '?'}`,
      type: 'nouvelle_course',
      dispatch_version: '2',
    }).catch((err: any) => {
      dispatchLog(`[V2] ⚠️ Batch push secours error: ${err?.message}`);
      return null;
    });

    const sent = batchResult?.succes || 0;
    dispatchLog(`[V2] 🚨 Secours batch: ${sent} token(s) envoyé(s) pour ${candidats.length} livreur(s) - course ${course.id} (top ${nbLivreurs})`);
  } else {
    dispatchLog(`[V2] 🚨 Secours: 0 candidat pour course ${course.id} (top ${nbLivreurs})`);
  }

  journaliserDispatch(base44, {
    course_id: course.id,
    country_code: course.country_code,
    vague: 0,
    evenement: 'secours_v2',
    raison_passage: `top_${nbLivreurs}`,
    nombre_nouveaux_notifies: candidats.length,
    livreurs_selectionnes: candidats.map((l: any) => ({
      id: l.id, nom: `${l.prenom || ''} ${l.nom || ''}`.trim(), score: l.score,
    })),
  });

  return { pushed: candidats.length, livreurs: candidats.map((l: any) => l.id) };
}