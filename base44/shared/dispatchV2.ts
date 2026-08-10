// ── Dispatch V2 : Fil de courses disponibles + secours ciblé ────────────────
// Nouveau système derrière le feature flag DISPATCH_V2_ENABLED.
// V1 (vagues) reste intact et utilisé quand le flag est désactivé.
// VERSION: 2026-08-09 — Correctif updateMany sans filtre livreur_id vide.

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

async function notifierLivreursEligiblesV2(base44: any, course: any) {
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
  if (dejaNotifies && dejaNotifies.length > 0) {
    dispatchLog(`[V2] ⏭️ Course ${course.id} déjà publiée (${dejaNotifies.length} notifs existantes) — skip re-notification`);
    return { notified: 0, already_published: true };
  }

  const exclus = new Set([...(dejaNotifies || []), ...(refuses || [])]);
  const candidats = (livreurs || []).filter((livreur: any) => livreur.user_email && !exclus.has(livreur.id));

  await Promise.allSettled(candidats.map(async (livreur: any) => {
    await enregistrerNotification(base44, course.id, livreur, 0, { country_code: course.country_code });
    await base44.asServiceRole.functions.invoke('envoiNotificationPush', {
      destinataire_email: livreur.user_email,
      livreur_id: livreur.id,
      titre: 'Nouvelle course SILGAPP',
      message: `${course.quartier_depart || course.adresse_depart || 'Départ'} vers ${course.quartier_arrivee || course.adresse_arrivee || 'destination'}`,
      type: 'nouvelle_course',
      course_id: course.id,
      alert_duration_seconds: 5,
      alert_interval_seconds: 5,
      dispatch_version: '2',
    });
  }));

  return { notified: candidats.length };
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

  const notificationResult = await notifierLivreursEligiblesV2(base44, course);

  dispatchLog(`[V2] 📢 Course ${course.id} publiée dans le fil (disponible_push)`);
  return { success: true, published: true, ...notificationResult };
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

  // 5. Push ciblé (pas à tous)
  for (const l of candidats) {
    base44.asServiceRole.functions.invoke('envoiNotificationPush', {
      destinataire_email: l.user_email,
      livreur_id: l.id,
      titre: '📦 Course disponible près de vous',
      message: `${course.quartier_depart || course.adresse_depart || ''} → ${course.quartier_arrivee || course.adresse_arrivee || '?'}`,
      type: 'nouvelle_course',
      course_id: course.id,
    }).catch(() => {});
  }

  dispatchLog(`[V2] 🚨 Secours: ${candidats.length} livreur(s) notifié(s) pour course ${course.id} (top ${nbLivreurs})`);

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