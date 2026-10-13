/**
 * ════════════════════════════════════════════════════════════════════════
 * CORRECTION 20 : PRIORITÉ EXCLUSIVE SUR TRAJET (15 secondes)
 * ════════════════════════════════════════════════════════════════════════
 *
 * Lorsqu'une nouvelle course est créée et qu'un livreur est déjà sur un trajet
 * compatible, il reçoit une proposition prioritaire EXCLUSIVE pendant
 * `onRoutePrioritySec` secondes (15 par défaut).
 *
 * Pendant cette fenêtre :
 * - La course est réservée à ce livreur (dispatch_status = 'en_attente')
 * - Les autres livreurs ne la voient pas dans "Disponibles"
 * - Le livreur ciblé voit la modale "Livraison sur votre trajet"
 * - Le compte à rebours commence côté BACKEND (reservation_expires_at)
 *
 * Après refus ou expiration :
 * - La réservation est libérée immédiatement
 * - La course rejoint le dispatch normal (disponible_push)
 * - Une course Éco reste soumise aux règles Éco (jamais de conversion forcée)
 *
 * Acceptation :
 * - Le mécanisme atomique existant (claimCourseForLivreur) est réutilisé
 * - Une EcoMission multi-livraisons est créée (comme avant)
 *
 * Mécanismes préservés :
 * - claimCourseForLivreur (acceptation atomique)
 * - respondToOnRouteProposal (accept/refuse/expired)
 * - Corrections 17, 18, 19 (rawRes?.data, refetch événementiel, annulation mission)
 * - Dispatch V2 (inchangé)
 * - Isolation Public/Entreprise et multi-pays
 */

import { normalizeEnterpriseId } from './enterpriseFinance.ts';
import { getMaxActiveCourses } from './livreurCapacityGuard.ts';

const ACTIVE_STATUSES = [
  'livreur_en_route',
  'client_contacte',
  'en_route_expediteur',
  'arrive_prise_en_charge',
  'colis_recupere',
  'passager_embarque',
  'pris_en_charge',
  'en_livraison',
  'arrivee',
];

const TERMINAL_STATUSES = ['livree', 'annulee', 'completed', 'delivered', 'canceled'];

function hasUsableRoutePoints(course: any) {
  return Number.isFinite(Number(course?.gps_depart_lat)) &&
    Number.isFinite(Number(course?.gps_depart_lng)) &&
    Number.isFinite(Number(course?.gps_arrivee_lat)) &&
    Number.isFinite(Number(course?.gps_arrivee_lng));
}

function calculerDistance(lat1: any, lon1: any, lat2: any, lon2: any) {
  const aLat = Number(lat1);
  const aLon = Number(lon1);
  const bLat = Number(lat2);
  const bLon = Number(lon2);
  if (![aLat, aLon, bLat, bLon].every(Number.isFinite)) return null;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function routeDistanceKm(course: any) {
  if (!hasUsableRoutePoints(course)) return null;
  return calculerDistance(course.gps_depart_lat, course.gps_depart_lng, course.gps_arrivee_lat, course.gps_arrivee_lng);
}

function detourViaPickupKm(activeCourse: any, candidate: any) {
  if (!hasUsableRoutePoints(activeCourse) || !hasUsableRoutePoints(candidate)) return null;
  const directKm = routeDistanceKm(activeCourse);
  const toCandidatePickupKm = calculerDistance(
    activeCourse.gps_depart_lat, activeCourse.gps_depart_lng,
    candidate.gps_depart_lat, candidate.gps_depart_lng,
  );
  const candidatePickupToActiveDropKm = calculerDistance(
    candidate.gps_depart_lat, candidate.gps_depart_lng,
    activeCourse.gps_arrivee_lat, activeCourse.gps_arrivee_lng,
  );
  if ([directKm, toCandidatePickupKm, candidatePickupToActiveDropKm].some((v) => v == null || !Number.isFinite(Number(v)))) return null;
  return Math.max(0, Number(toCandidatePickupKm) + Number(candidatePickupToActiveDropKm) - Number(directKm));
}

function destinationChainKm(activeCourse: any, candidate: any) {
  if (!hasUsableRoutePoints(activeCourse) || !hasUsableRoutePoints(candidate)) return null;
  return calculerDistance(
    activeCourse.gps_arrivee_lat, activeCourse.gps_arrivee_lng,
    candidate.gps_depart_lat, candidate.gps_depart_lng,
  );
}

function prixCourse(course: any) {
  return Number(course?.prix_final || course?.prix_propose_client || course?.prix_propose_admin || course?.prix_estimate || 0) || 0;
}

/**
 * Évalue la compatibilité d'un trajet actif avec une course candidate.
 * Retourne un score (0-100) et le scénario, ou null si incompatible.
 */
function evaluateOnRouteCompatibility(activeCourses: any[], candidate: any, config: any) {
  if (!hasUsableRoutePoints(candidate)) return null;
  const maxDetourKm = Number(config?.maxDetourKm) || 6;
  let best: any = null;

  for (const active of activeCourses || []) {
    if (!hasUsableRoutePoints(active)) continue;

    const onRouteDetourKm = detourViaPickupKm(active, candidate);
    if (onRouteDetourKm != null && onRouteDetourKm <= maxDetourKm) {
      const score = Math.max(1, Math.round(100 - (onRouteDetourKm / Math.max(maxDetourKm, 0.1)) * 45));
      const item = {
        scenario: 'on_route',
        active_course_id: active.id,
        extra_km_estimate: Number(onRouteDetourKm.toFixed(2)),
        destination_pickup_km: null,
        score,
      };
      if (!best || item.score > best.score) best = item;
    }

    const chainKm = destinationChainKm(active, candidate);
    if (chainKm != null && chainKm <= maxDetourKm) {
      const score = Math.max(1, Math.round(100 - (chainKm / Math.max(maxDetourKm, 0.1)) * 35));
      const item = {
        scenario: 'destination_chain',
        active_course_id: active.id,
        extra_km_estimate: Number(chainKm.toFixed(2)),
        destination_pickup_km: Number(chainKm.toFixed(2)),
        score,
      };
      if (!best || item.score > best.score) best = item;
    }
  }

  return best;
}

/**
 * Trouve le meilleur livreur compatible pour une course donnée.
 * Sélectionne le candidat avec le meilleur score de compatibilité.
 * Évite les appels ORS inutiles (Haversine uniquement en V1).
 */
export async function findBestOnRouteDriver(
  base44: any,
  course: any,
  config: any,
): Promise<{ livreurId: string; livreur: any; activeCourses: any[]; compatibility: any } | null> {
  const courseEnterpriseId = normalizeEnterpriseId(course.enterprise_id);

  // ── Trouver tous les livreurs avec des courses actives dans le même scope ──
  const activeCourses = await base44.asServiceRole.entities.CourseExterne.filter({
    country_code: course.country_code,
    statut: { $in: ACTIVE_STATUSES },
    livreur_id: { $exists: true },
  }, '-updated_date', 50).catch(() => []);

  // Grouper les courses actives par livreur
  const driverCoursesMap = new Map<string, any[]>();
  for (const ac of activeCourses || []) {
    if (!ac?.livreur_id) continue;
    if (normalizeEnterpriseId(ac.enterprise_id) !== courseEnterpriseId) continue;
    const list = driverCoursesMap.get(ac.livreur_id) || [];
    list.push(ac);
    driverCoursesMap.set(ac.livreur_id, list);
  }

  if (driverCoursesMap.size === 0) return null;

  // ── [CAPACITY GUARD] Filtrer les livreurs ayant déjà MAX courses actives ──
  // Un livreur avec 2 courses actives ne doit plus recevoir de propositions sur trajet.
  // Utilise les données déjà chargées (driverCoursesMap) — aucun appel Base44 supplémentaire.
  const maxActiveCourses = await getMaxActiveCourses(base44, course.country_code);

  let bestDriver: any = null;
  let bestScore = -1;
  let bestCompatibility: any = null;
  let bestActiveCourses: any[] = [];

  for (const [livreurId, courses] of driverCoursesMap.entries()) {
    // Skip drivers with MAX or more active courses
    if (courses.length >= maxActiveCourses) continue;

    // Récupérer le livreur
    const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
    if (!livreur) continue;
    if (livreur.validation !== 'valide' || livreur.actif !== true) continue;
    if (livreur.manual_hors_ligne === true || livreur.admin_hors_ligne === true) continue;
    if (livreur.bloque_encours === true) continue;
    if (normalizeEnterpriseId(livreur.enterprise_id) !== courseEnterpriseId) continue;

    const compatibility = evaluateOnRouteCompatibility(courses, course, config);
    if (!compatibility || compatibility.score < 1) continue;

    if (compatibility.score > bestScore) {
      bestScore = compatibility.score;
      bestDriver = livreur;
      bestCompatibility = compatibility;
      bestActiveCourses = courses;
    }
  }

  if (!bestDriver) return null;

  return {
    livreurId: bestDriver.id,
    livreur: bestDriver,
    activeCourses: bestActiveCourses,
    compatibility: bestCompatibility,
  };
}

/**
 * Crée une réservation exclusive pour le meilleur livreur compatible.
 * La course reste en dispatch_status='en_attente' (invisible des autres livreurs).
 * Retourne true si la réservation a été créée.
 */
export async function createExclusiveReservation(
  base44: any,
  course: any,
  config: any,
): Promise<{ created: boolean; livreurId?: string; proposalId?: string; reason?: string }> {
  if (!config.onRoutePriorityEnabled) {
    return { created: false, reason: 'priority_disabled' };
  }

  const best = await findBestOnRouteDriver(base44, course, config);
  if (!best) {
    return { created: false, reason: 'no_compatible_driver' };
  }

  const now = Date.now();
  const prioritySec = config.onRoutePrioritySec || 15;
  const reservationExpiresAt = new Date(now + prioritySec * 1000).toISOString();

  // ── Vérifier qu'aucune réservation active n'existe déjà pour cette course ──
  const existing = await base44.asServiceRole.entities.EcoProposal.filter({
    course_id: course.id,
    status: 'pending',
    is_exclusive: true,
  }, '-created_date', 1).catch(() => []);

  if (existing?.[0]) {
    // Une réservation existe déjà — ne pas en créer de doublon
    return { created: false, reason: 'reservation_already_exists' };
  }

  // ── Calculer le gain ──
  const gainAmount = Math.max(0, prixCourse(course) - (Number(course.commission_silga) || 0));
  if (gainAmount < (config.minDriverGain || 0)) {
    return { created: false, reason: 'gain_below_threshold' };
  }

  const courseEnterpriseId = normalizeEnterpriseId(course.enterprise_id);

  // ── Créer la proposition exclusive ──
  const proposal = await base44.asServiceRole.entities.EcoProposal.create({
    country_code: course.country_code,
    enterprise_id: courseEnterpriseId,
    course_id: course.id,
    livreur_id: best.livreurId,
    livreur_user_email: best.livreur.user_email || null,
    proposal_type: 'on_route_offer',
    proposal_scenario: best.compatibility.scenario,
    status: 'pending',
    is_exclusive: true,
    reservation_expires_at: reservationExpiresAt,
    expires_at: reservationExpiresAt,
    gain_amount: gainAmount,
    route_delta_json: JSON.stringify({
      source: 'priority_exclusive',
      scenario: best.compatibility.scenario,
      active_course_id: best.compatibility.active_course_id,
      extra_km_estimate: best.compatibility.extra_km_estimate,
      destination_pickup_km: best.compatibility.destination_pickup_km,
      score: best.compatibility.score,
      max_detour_km: config.maxDetourKm,
      priority_sec: prioritySec,
      note: 'ORS reserved for top candidates only',
    }),
  });

  // ── Notification au livreur (bannière in-app + push FCM) ──
  if (best.livreur.user_email) {
    const notifTitle = 'SILGAPP — Livraison sur votre trajet !';
    const notifMessage = 'Une nouvelle livraison compatible avec votre trajet est disponible. Vous avez 15 secondes pour accepter.';
    try {
      await base44.asServiceRole.entities.Notification.create({
        titre: notifTitle,
        message: notifMessage,
        type: 'on_route_proposal',
        destinataire_email: best.livreur.user_email,
        course_id: course.id,
        lue: false,
        deduplication_key: `ON_ROUTE_EXCLUSIVE_${proposal.id}`,
      });
    } catch (notifError: any) {
      console.error('[createExclusiveReservation] Notification record failed:', notifError?.message || String(notifError));
    }
    try {
      await base44.asServiceRole.functions.invoke('envoiNotificationPush', {
        titre: notifTitle,
        message: notifMessage,
        type: 'on_route_proposal',
        destinataire_email: best.livreur.user_email,
        livreur_id: best.livreurId,
        course_id: course.id,
        category: 'on_route_proposal',
        alert_duration_seconds: prioritySec,
      });
    } catch (pushError: any) {
      console.error('[createExclusiveReservation] FCM push failed:', pushError?.message || String(pushError));
    }
  }

  return { created: true, livreurId: best.livreurId, proposalId: proposal.id };
}

/**
 * Libère une réservation expirée individuelle et reprend le dispatch normal.
 * Factorisée pour éviter la duplication entre le workflow et le lazy cleanup.
 *
 * Étapes :
 * 1. Marque la proposition comme 'expired' (atomique, anti-double-libération)
 * 2. Vérifie que la course n'a pas été acceptée entre-temps
 * 3. Si la course est toujours disponible → la libère au dispatch normal
 *    - Course Standard → dispatch_status = 'disponible_push', trigger dispatchExterneAuto
 *    - Course Éco isolée → reste en attente Éco (pas de conversion forcée)
 *
 * Retourne true si la course a été libérée au dispatch.
 */
async function releaseSingleExpiredReservation(base44: any, proposal: any, now: string): Promise<{ released: boolean; courseReleased: boolean; error?: string }> {
  try {
    // ── Marquer la proposition comme expirée (atomique) ──
    const claim = await base44.asServiceRole.entities.EcoProposal.updateMany(
      { id: proposal.id, status: 'pending' },
      { $set: { status: 'expired', responded_at: now } },
    );
    if (!claim || claim.updated !== 1) return { released: false, courseReleased: false };

    // ── Vérifier que la course n'a pas été acceptée entre-temps ──
    const course = await base44.asServiceRole.entities.CourseExterne.get(proposal.course_id).catch(() => null);
    if (!course) return { released: true, courseReleased: false };
    if (TERMINAL_STATUSES.includes(course.statut) || course.livreur_id || course.accepted_by_livreur_id) {
      return { released: true, courseReleased: false };
    }

    // ── Course Éco isolée → reste en attente Éco (pas de conversion forcée) ──
    if (course.delivery_mode === 'eco' && course.eco_status === 'isolated') {
      return { released: true, courseReleased: false };
    }

    // ── Libérer la course au dispatch normal ──
    const releaseClaim = await base44.asServiceRole.entities.CourseExterne.updateMany(
      {
        id: course.id,
        dispatch_status: { $in: ['en_attente', 'propose'] },
        livreur_id: null,
        accepted_by_livreur_id: null,
      },
      {
        $set: {
          dispatch_status: 'disponible_push',
          statut: 'recherche_livreur',
          heure_sollicitation: now,
        },
      },
    );

    if (releaseClaim?.updated === 1) {
      // ── Déclencher le dispatch normal ──
      await base44.asServiceRole.functions.invoke('dispatchExterneAuto', {
        action: 'lancer_recherche_auto',
        course_id: course.id,
      }).catch(() => null);
      return { released: true, courseReleased: true };
    }

    return { released: true, courseReleased: false };
  } catch (e: any) {
    return { released: false, courseReleased: false, error: e?.message || String(e) };
  }
}

/**
 * LAZY CLEANUP — Libération paresseuse des réservations expirées.
 *
 * Appelée par les événements normaux du système (création de course,
 * mise à jour de course, polling du livreur) — PAS par un polling global.
 *
 * Avantages :
 * - Libération quasi-instantanée quand le système est actif
 * - Aucun coût de polling quand le système est au repos
 * - Limité à `limit` réservations par appel (défaut 10) pour rester léger
 * - Filtrable par pays pour réduire la portée
 *
 * Le workflow périodique (1 minute) reste le filet de sécurité pour les
 * périodes calmes où aucun événement ne déclencherait le lazy cleanup.
 */
export async function releaseExpiredReservationsLazy(
  base44: any,
  countryCode?: string,
  limit = 10,
): Promise<{ success: boolean; released: number; coursesReleased: number; errors?: any[] }> {
  const now = new Date().toISOString();
  const filter: any = {
    status: 'pending',
    is_exclusive: true,
    reservation_expires_at: { $lte: now },
  };
  if (countryCode) filter.country_code = String(countryCode).toUpperCase();

  const expiredProposals = await base44.asServiceRole.entities.EcoProposal.filter(filter, 'reservation_expires_at', limit).catch(() => []);
  if (!expiredProposals?.length) return { success: true, released: 0, coursesReleased: 0 };

  let released = 0;
  let coursesReleased = 0;
  const errors: any[] = [];

  for (const proposal of expiredProposals) {
    const result = await releaseSingleExpiredReservation(base44, proposal, now);
    if (result.released) released++;
    if (result.courseReleased) coursesReleased++;
    if (result.error) errors.push({ proposal_id: proposal.id, error: result.error });
  }

  return { success: true, released, coursesReleased, errors: errors.length > 0 ? errors : undefined };
}

/**
 * Libère les réservations exclusives expirées et reprend le dispatch normal.
 * Appelée par le workflow périodique (toutes les 1 minute) — filet de sécurité.
 *
 * Pour chaque réservation expirée :
 * 1. Marque la proposition comme 'expired'
 * 2. Vérifie qu'aucun autre livreur n'a accepté la course
 * 3. Si la course est toujours disponible → la libère au dispatch normal
 *    - Course Standard → dispatch_status = 'disponible_push', trigger dispatchExterneAuto
 *    - Course Éco → reste soumise aux règles Éco (pas de conversion forcée)
 */
export async function releaseExpiredOnRouteReservations(base44: any, limit = 50) {
  const now = new Date().toISOString();
  const filter: any = {
    status: 'pending',
    is_exclusive: true,
    reservation_expires_at: { $lte: now },
  };
  const expiredProposals = await base44.asServiceRole.entities.EcoProposal.filter(filter, 'reservation_expires_at', limit).catch(() => []);
  if (!expiredProposals?.length) return { success: true, released: 0, coursesReleased: 0 };

  let released = 0;
  let coursesReleased = 0;
  const errors: any[] = [];

  for (const proposal of expiredProposals) {
    const result = await releaseSingleExpiredReservation(base44, proposal, now);
    if (result.released) released++;
    if (result.courseReleased) coursesReleased++;
    if (result.error) errors.push({ proposal_id: proposal.id, error: result.error });
  }

  return { success: true, released, coursesReleased, errors: errors.length > 0 ? errors : undefined };
}

/**
 * Libère immédiatement une réservation après refus du livreur.
 * Reprend le dispatch normal sans attendre l'expiration.
 */
export async function releaseReservationAfterRefusal(base44: any, courseId: string) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId).catch(() => null);
  if (!course) return { released: false, reason: 'course_not_found' };
  if (TERMINAL_STATUSES.includes(course.statut) || course.livreur_id || course.accepted_by_livreur_id) {
    return { released: false, reason: 'course_already_assigned' };
  }

  // Course Éco isolée → reste en attente Éco
  if (course.delivery_mode === 'eco' && course.eco_status === 'isolated') {
    return { released: false, reason: 'eco_course_stays_isolated' };
  }

  const now = new Date().toISOString();
  const releaseClaim = await base44.asServiceRole.entities.CourseExterne.updateMany(
    {
      id: course.id,
      dispatch_status: { $in: ['en_attente', 'propose'] },
      livreur_id: null,
      accepted_by_livreur_id: null,
    },
    {
      $set: {
        dispatch_status: 'disponible_push',
        statut: 'recherche_livreur',
        heure_sollicitation: now,
      },
    },
  );

  if (releaseClaim?.updated === 1) {
    await base44.asServiceRole.functions.invoke('dispatchExterneAuto', {
      action: 'lancer_recherche_auto',
      course_id: course.id,
    }).catch(() => null);
    return { released: true };
  }

  return { released: false, reason: 'release_lost_race' };
}