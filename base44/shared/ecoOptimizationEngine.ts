import { normalizeEnterpriseId } from './enterpriseFinance.ts';
import {
  evaluerAvantageCommission,
  figerCommissionAcceptation,
} from './commissionAvantage.ts';
import { chargerConfigPays, normalizeCommissionPct } from './dispatchConstants.ts';
import {
  champsLockCommission,
  verifierCoherenceLock,
} from './commissionLock.ts';
import { marquerAccepte } from './dispatchNotifications.ts';
import { claimCourseForLivreur } from './courseAcceptanceLock.ts';

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
const DEFAULT_CONVERT_DELAY_MIN = 45;
const DEFAULT_MAX_COURSES = 2;
const DEFAULT_PROPOSAL_EXPIRATION_SEC = 300;
const DEFAULT_MAX_DETOUR_KM = 6;
const DEFAULT_MIN_GAIN = 0;
const ECO_PREFIX = 'ECO';

// ── Seuils configurables pour la chaîne de destination ──
// Ces valeurs sont des DÉFAUTS. Chaque pays peut les surcharger via AppConfig
// (clés ECO:<COUNTRY>:CHAIN_*). Elles ne doivent jamais être codées en dur
// dans la logique de regroupement — toujours lues depuis le config.
const DEFAULT_CHAIN_MAX_PICKUP_KM = 8;
const DEFAULT_CHAIN_MAX_DROP_KM = 2.5;
const DEFAULT_CHAIN_MIN_GAIN_FCFA = 1000;
const DEFAULT_CHAIN_COST_PER_KM = 75;
const DEFAULT_CHAIN_MAX_TIME_DIFF_HOURS = 2;

function key(countryCode: string, name: string) {
  return `${ECO_PREFIX}:${String(countryCode || '').toUpperCase()}:${name}`;
}

function parseBool(value: any, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function parseNumber(value: any, fallback: number, min = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

function isPublicCourse(course: any) {
  return normalizeEnterpriseId(course?.enterprise_id) === null;
}

function normalizeDeliveryMode(value: any) {
  return String(value || '').toLowerCase() === 'eco' ? 'eco' : 'standard';
}

function prixCourse(course: any) {
  return Number(course?.prix_final || course?.prix_propose_client || course?.prix_propose_admin || course?.prix_estimate || 0) || 0;
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

function hasUsableRoutePoints(course: any) {
  return Number.isFinite(Number(course?.gps_depart_lat)) &&
    Number.isFinite(Number(course?.gps_depart_lng)) &&
    Number.isFinite(Number(course?.gps_arrivee_lat)) &&
    Number.isFinite(Number(course?.gps_arrivee_lng));
}

function routeDistanceKm(course: any) {
  if (!hasUsableRoutePoints(course)) return null;
  return calculerDistance(course.gps_depart_lat, course.gps_depart_lng, course.gps_arrivee_lat, course.gps_arrivee_lng);
}

function detourViaPickupKm(activeCourse: any, candidate: any) {
  if (!hasUsableRoutePoints(activeCourse) || !hasUsableRoutePoints(candidate)) return null;
  const directKm = routeDistanceKm(activeCourse);
  const toCandidatePickupKm = calculerDistance(
    activeCourse.gps_depart_lat,
    activeCourse.gps_depart_lng,
    candidate.gps_depart_lat,
    candidate.gps_depart_lng,
  );
  const candidatePickupToActiveDropKm = calculerDistance(
    candidate.gps_depart_lat,
    candidate.gps_depart_lng,
    activeCourse.gps_arrivee_lat,
    activeCourse.gps_arrivee_lng,
  );
  if ([directKm, toCandidatePickupKm, candidatePickupToActiveDropKm].some((v) => v == null || !Number.isFinite(Number(v)))) return null;
  return Math.max(0, Number(toCandidatePickupKm) + Number(candidatePickupToActiveDropKm) - Number(directKm));
}

function destinationChainKm(activeCourse: any, candidate: any) {
  if (!hasUsableRoutePoints(activeCourse) || !hasUsableRoutePoints(candidate)) return null;
  return calculerDistance(
    activeCourse.gps_arrivee_lat,
    activeCourse.gps_arrivee_lng,
    candidate.gps_depart_lat,
    candidate.gps_depart_lng,
  );
}

function evaluateOnRouteCompatibility(activeCourses: any[], candidate: any, config: any) {
  if (!hasUsableRoutePoints(candidate)) return null;
  const maxDetourKm = Number(config?.maxDetourKm) || DEFAULT_MAX_DETOUR_KM;
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

export async function loadEcoConfig(base44: any, countryCode: string) {
  const code = String(countryCode || '').toUpperCase();
  const configs = await base44.asServiceRole.entities.AppConfig.filter({
    cle: { $in: [
      key(code, 'ENABLED'),
      key(code, 'GROUPING_ENABLED'),
      key(code, 'ON_ROUTE_ENABLED'),
      key(code, 'CONVERT_DELAY_MIN'),
      key(code, 'MAX_COURSES_PER_MISSION'),
      key(code, 'PROPOSAL_EXPIRATION_SEC'),
      key(code, 'MAX_DETOUR_KM'),
      key(code, 'MIN_DRIVER_GAIN'),
      key(code, 'CHAIN_MAX_PICKUP_KM'),
      key(code, 'CHAIN_MAX_DROP_KM'),
      key(code, 'CHAIN_MIN_GAIN_FCFA'),
      key(code, 'CHAIN_COST_PER_KM'),
      key(code, 'CHAIN_MAX_TIME_DIFF_HOURS'),
      key(code, 'EMERGENCY_STOP'),
    ] },
  }, undefined, 25).catch(() => []);
  const map = new Map((configs || []).map((c: any) => [c.cle, c.valeur]));
  const emergencyStop = parseBool(map.get(key(code, 'EMERGENCY_STOP')), false);

  // ── Charger le taux de commission du pays pour calculer le gain NET livreur ──
  // Le gain réel du livreur = prix - commission. Sans ce taux, on ne peut pas
  // évaluer la rentabilité réelle d'un regroupement (Pass/Happy Hour s'appliquent
  // à l'acceptation, pas au regroupement — on utilise le taux normal ici).
  let commissionPct: number | null = null;
  try {
    const countryConfig = await chargerConfigPays(base44, code);
    commissionPct = countryConfig?.commission_pct == null ? null : normalizeCommissionPct(countryConfig.commission_pct);
  } catch {
    // Si on ne peut pas charger le taux, on ne bloque pas le regroupement —
    // on utilise le prix brut comme fallback (comportement historique).
  }

  return {
    countryCode: code,
    enabled: !emergencyStop && parseBool(map.get(key(code, 'ENABLED')), false),
    groupingEnabled: !emergencyStop && parseBool(map.get(key(code, 'GROUPING_ENABLED')), false),
    onRouteEnabled: !emergencyStop && parseBool(map.get(key(code, 'ON_ROUTE_ENABLED')), false),
    convertDelayMin: parseNumber(map.get(key(code, 'CONVERT_DELAY_MIN')), DEFAULT_CONVERT_DELAY_MIN, 1),
    maxCoursesPerMission: Math.max(2, Math.min(4, parseNumber(map.get(key(code, 'MAX_COURSES_PER_MISSION')), DEFAULT_MAX_COURSES, 2))),
    proposalExpirationSec: parseNumber(map.get(key(code, 'PROPOSAL_EXPIRATION_SEC')), DEFAULT_PROPOSAL_EXPIRATION_SEC, 15),
    maxDetourKm: parseNumber(map.get(key(code, 'MAX_DETOUR_KM')), DEFAULT_MAX_DETOUR_KM, 0),
    minDriverGain: parseNumber(map.get(key(code, 'MIN_DRIVER_GAIN')), DEFAULT_MIN_GAIN, 0),
    // ── Seuils chaîne de destination (configurables par pays) ──
    chainMaxPickupKm: parseNumber(map.get(key(code, 'CHAIN_MAX_PICKUP_KM')), DEFAULT_CHAIN_MAX_PICKUP_KM, 0),
    chainMaxDropKm: parseNumber(map.get(key(code, 'CHAIN_MAX_DROP_KM')), DEFAULT_CHAIN_MAX_DROP_KM, 0),
    chainMinGainFcfa: parseNumber(map.get(key(code, 'CHAIN_MIN_GAIN_FCFA')), DEFAULT_CHAIN_MIN_GAIN_FCFA, 0),
    chainCostPerKm: parseNumber(map.get(key(code, 'CHAIN_COST_PER_KM')), DEFAULT_CHAIN_COST_PER_KM, 0),
    chainMaxTimeDiffHours: parseNumber(map.get(key(code, 'CHAIN_MAX_TIME_DIFF_HOURS')), DEFAULT_CHAIN_MAX_TIME_DIFF_HOURS, 0),
    // ── Taux de commission du pays (pour calcul du gain NET livreur) ──
    commissionPct,
    emergencyStop,
  };
}

export async function prepareEcoCreationFields(base44: any, rawCourseData: any) {
  const countryCode = String(rawCourseData?.country_code || '').toUpperCase();
  const requestedMode = normalizeDeliveryMode(rawCourseData?.delivery_mode);
  if (requestedMode !== 'eco') {
    return {
      delivery_mode: 'standard',
      eco_status: 'none',
      eco_mission_id: null,
    };
  }

  const config = await loadEcoConfig(base44, countryCode);
  const publicOnly = normalizeEnterpriseId(rawCourseData?.enterprise_id) === null;
  const price = Number(rawCourseData?.prix_propose_client || rawCourseData?.prix_propose_admin || rawCourseData?.prix_estimate || 0) || 0;

  if (!config.enabled || !publicOnly) {
    return {
      delivery_mode: 'standard',
      eco_status: config.enabled && publicOnly ? 'disabled' : 'none',
      eco_mission_id: null,
    };
  }

  const now = new Date();
  return {
    delivery_mode: 'eco',
    eco_status: 'isolated',
    eco_mission_id: null,
    eco_created_at: now.toISOString(),
    eco_convert_after_at: new Date(now.getTime() + config.convertDelayMin * 60000).toISOString(),
  };
}

export async function shouldHoldEcoCourseOnCreate(base44: any, course: any) {
  if (normalizeDeliveryMode(course?.delivery_mode) !== 'eco') return false;
  if (course?.eco_status !== 'isolated') return false;
  if (!isPublicCourse(course)) return false;
  const config = await loadEcoConfig(base44, course.country_code);
  return config.enabled && config.groupingEnabled;
}

function compatibilityScore(a: any, b: any, config?: any) {
  if (!hasUsableRoutePoints(a) || !hasUsableRoutePoints(b)) return null;
  const pickupKm = calculerDistance(a.gps_depart_lat, a.gps_depart_lng, b.gps_depart_lat, b.gps_depart_lng);
  const dropKm = calculerDistance(a.gps_arrivee_lat, a.gps_arrivee_lng, b.gps_arrivee_lat, b.gps_arrivee_lng);
  const crossKm = calculerDistance(a.gps_depart_lat, a.gps_depart_lng, b.gps_arrivee_lat, b.gps_arrivee_lng);
  if ([pickupKm, dropKm, crossKm].some((v) => v == null || !Number.isFinite(Number(v)))) return null;
  const directionScore = Math.max(0, 100 - Number(dropKm) * 12);
  const proximityScore = Math.max(0, 100 - Number(pickupKm) * 18);
  const detourScore = Math.max(0, 100 - Number(crossKm) * 5);
  const standardScore = Math.round(proximityScore * 0.45 + directionScore * 0.35 + detourScore * 0.20);

  // ── Chaîne de destination : départs différents mais destinations proches ──
  // Deux courses allant vers la même zone (dropKm faible) avec des départs éloignés
  // (pickupKm élevé) peuvent être rentables si le livreur enchaîne les livraisons.
  // Le livreur récupère le colis 1, le livre, puis va récupère le colis 2 et le livre.
  // Le détour supplémentaire = distance entre les deux départs (pickupKm).
  //
  // VALIDATION DE RENTABILITÉ :
  //   - Le gain NET livreur (après commission) doit justifier le détour supplémentaire.
  //   - Le détour (pickupKm) ne doit pas dépasser un seuil configurable par pays.
  //   - L'ordre des récupérations doit respecter la logique temporelle.
  //   - On ne regroupe PAS uniquement parce que les destinations sont proches :
  //     il faut aussi que le détour soit acceptable ET que le gain le justifie.
  //
  // ⚠️ TOUS les seuils sont configurables par pays via AppConfig.
  //    Aucune valeur n'est codée en dur — les défauts sont des fallbacks.
  const chainMaxPickupKm = Number(config?.chainMaxPickupKm) || DEFAULT_CHAIN_MAX_PICKUP_KM;
  const chainMaxDropKm = Number(config?.chainMaxDropKm) || DEFAULT_CHAIN_MAX_DROP_KM;
  const chainMinGainFcfa = Number(config?.chainMinGainFcfa) || DEFAULT_CHAIN_MIN_GAIN_FCFA;
  const chainCostPerKm = Number(config?.chainCostPerKm) || DEFAULT_CHAIN_COST_PER_KM;
  const chainMaxTimeDiffHours = Number(config?.chainMaxTimeDiffHours) || DEFAULT_CHAIN_MAX_TIME_DIFF_HOURS;

  if (Number(dropKm) <= chainMaxDropKm && Number(pickupKm) > 3 && Number(pickupKm) <= chainMaxPickupKm) {
    // ── Calcul du gain NET livreur (après commission) ──
    // Le regroupement ne doit être validé que si le livreur gagne réellement assez.
    // Le gain NET = prix - commission. On utilise le taux de commission du pays.
    // Note : Pass/Happy Hour s'appliquent à l'acceptation, pas au regroupement.
    //   Si commissionPct est null (taux indisponible), on fallback sur le prix brut
    //   (comportement historique — ne bloque pas le regroupement).
    const prixBrutA = prixCourse(a);
    const prixBrutB = prixCourse(b);
    const commissionPct = config?.commissionPct;
    const gainNetA = commissionPct != null
      ? Math.round(prixBrutA * (1 - Number(commissionPct) / 100))
      : prixBrutA;
    const gainNetB = commissionPct != null
      ? Math.round(prixBrutB * (1 - Number(commissionPct) / 100))
      : prixBrutB;
    const totalGainNet = gainNetA + gainNetB;
    const detourCost = Math.round(Number(pickupKm) * chainCostPerKm);

    // Si le gain NET ne justifie pas le détour, ne pas regrouper
    if (totalGainNet < chainMinGainFcfa || totalGainNet < detourCost * 2) {
      return standardScore;
    }

    // ── Vérification de l'ordre des récupérations ──
    // L'ordre doit respecter la logique temporelle : la course créée en premier
    // doit être récupérée en premier (sauf si la deuxième course a une date_souhaitee plus tôt).
    const dateA = a.date_souhaitee || a.created_date;
    const dateB = b.date_souhaitee || b.created_date;
    if (dateA && dateB) {
      const timeDiff = Math.abs(new Date(dateA).getTime() - new Date(dateB).getTime());
      const maxDiffMs = chainMaxTimeDiffHours * 60 * 60 * 1000;
      if (timeDiff > maxDiffMs) {
        return standardScore;
      }
    }

    const chainDirectionScore = Math.max(0, 100 - Number(dropKm) * 15);
    const chainDetourScore = Math.max(0, 100 - Number(pickupKm) * 8);
    const chainProfitScore = Math.min(100, Math.round((totalGainNet / Math.max(detourCost, 1)) * 20));
    const chainScore = Math.round(chainDirectionScore * 0.35 + chainDetourScore * 0.35 + chainProfitScore * 0.30);

    // Retourner le meilleur score entre standard et chaîne
    return Math.max(standardScore, chainScore);
  }

  return standardScore;
}

function buildRoutePlan(courses: any[]) {
  const pickups = courses.map((course, index) => ({
    type: 'pickup',
    course_id: course.id,
    order: index + 1,
    status: 'pending',
    lat: course.gps_depart_lat || null,
    lng: course.gps_depart_lng || null,
  }));
  const deliveries = courses.map((course, index) => ({
    type: 'delivery',
    course_id: course.id,
    order: courses.length + index + 1,
    status: 'pending',
    lat: course.gps_arrivee_lat || null,
    lng: course.gps_arrivee_lng || null,
  }));
  return [...pickups, ...deliveries];
}

function routePlanForEcoMission(courses: any[]) {
  const first = courses[0];
  const second = courses[1];
  if (!first || !second) return buildRoutePlan(courses);

  const directAllPickups = [
    { type: 'pickup', course_id: first.id, order: 1, status: 'pending', lat: first.gps_depart_lat || null, lng: first.gps_depart_lng || null },
    { type: 'pickup', course_id: second.id, order: 2, status: 'pending', lat: second.gps_depart_lat || null, lng: second.gps_depart_lng || null },
    { type: 'delivery', course_id: first.id, order: 3, status: 'pending', lat: first.gps_arrivee_lat || null, lng: first.gps_arrivee_lng || null },
    { type: 'delivery', course_id: second.id, order: 4, status: 'pending', lat: second.gps_arrivee_lat || null, lng: second.gps_arrivee_lng || null },
  ];

  const pickupFirstThenDeliverFirst = [
    { type: 'pickup', course_id: first.id, order: 1, status: 'pending', lat: first.gps_depart_lat || null, lng: first.gps_depart_lng || null },
    { type: 'delivery', course_id: first.id, order: 2, status: 'pending', lat: first.gps_arrivee_lat || null, lng: first.gps_arrivee_lng || null },
    { type: 'pickup', course_id: second.id, order: 3, status: 'pending', lat: second.gps_depart_lat || null, lng: second.gps_depart_lng || null },
    { type: 'delivery', course_id: second.id, order: 4, status: 'pending', lat: second.gps_arrivee_lat || null, lng: second.gps_arrivee_lng || null },
  ];

  const chainKm = destinationChainKm(first, second);
  const pickupKm = calculerDistance(first.gps_depart_lat, first.gps_depart_lng, second.gps_depart_lat, second.gps_depart_lng);
  return chainKm != null && pickupKm != null && chainKm < pickupKm ? pickupFirstThenDeliverFirst : directAllPickups;
}

export async function processEcoCourseCreated(base44: any, courseId: string) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId).catch(() => null);
  if (!course || !(await shouldHoldEcoCourseOnCreate(base44, course))) {
    return { success: true, handled: false, reason: 'not_eco_or_disabled' };
  }

  const config = await loadEcoConfig(base44, course.country_code);
  const candidates = await base44.asServiceRole.entities.CourseExterne.filter({
    country_code: course.country_code,
    enterprise_id: null,
    delivery_mode: 'eco',
    eco_status: 'isolated',
    dispatch_status: 'en_attente',
  }, '-created_date', 30).catch(() => []);

  let best: any = null;
  let bestScore = -1;
  for (const candidate of candidates || []) {
    if (!candidate?.id || candidate.id === course.id) continue;
    if (candidate.livreur_id || candidate.accepted_by_livreur_id || candidate.eco_mission_id) continue;
    if (TERMINAL_STATUSES.includes(candidate.statut)) continue;
    const score = compatibilityScore(course, candidate, config);
    if (score == null || score < 55) continue;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (!best) {
    return { success: true, handled: true, grouped: false, reason: 'no_compatible_candidate' };
  }

  const courses = [course, best].slice(0, config.maxCoursesPerMission);
  const now = new Date().toISOString();
  const mission = await base44.asServiceRole.entities.EcoMission.create({
    country_code: course.country_code,
    enterprise_id: null,
    course_ids: courses.map((c) => c.id),
    status: 'available',
    route_plan_json: JSON.stringify(routePlanForEcoMission(courses)),
    active_step_index: 0,
    total_price: courses.reduce((sum, c) => sum + prixCourse(c), 0),
    total_driver_amount: courses.reduce((sum, c) => sum + Math.max(0, prixCourse(c) - (Number(c.commission_silga) || 0)), 0),
    compatibility_score: bestScore,
    locked_at: now,
  });

  const claim = await base44.asServiceRole.entities.CourseExterne.updateMany(
    {
      id: { $in: courses.map((c) => c.id) },
      delivery_mode: 'eco',
      eco_status: 'isolated',
      eco_mission_id: null,
      dispatch_status: 'en_attente',
    },
    {
      $set: {
        eco_status: 'grouped',
        eco_mission_id: mission.id,
        eco_candidate_score: bestScore,
      },
    }
  );

  if (!claim || claim.updated !== courses.length) {
    await base44.asServiceRole.entities.EcoMission.update(mission.id, { status: 'invalidated' }).catch(() => null);
    return { success: false, handled: true, grouped: false, reason: 'atomic_grouping_lost' };
  }

  return { success: true, handled: true, grouped: true, mission_id: mission.id, course_ids: courses.map((c) => c.id) };
}

async function notifyConversion(base44: any, course: any) {
  const title = 'Course Eco convertie en Standard';
  const message = 'Aucun regroupement Eco disponible dans le delai prevu. Votre course passe en Standard, sans changement de prix.';
  if (course.client_user_email) {
    await base44.asServiceRole.entities.Notification.create({
      titre: title,
      message,
      type: 'generic',
      destinataire_email: course.client_user_email,
      course_id: course.id,
      lue: false,
      deduplication_key: `ECO_CONVERT_CLIENT_${course.id}`,
    }).catch(() => null);
  }
  const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' }, undefined, 100).catch(() => []);
  const notifRecords = (admins || [])
    .filter((admin: any) => admin.email)
    .map((admin: any) => ({
      titre: title,
      message: `Course ${course.id} convertie en Standard apres attente Eco. Prix conserve: ${prixCourse(course).toLocaleString()} ${course.devise || 'FCFA'}.`,
      type: 'generic',
      destinataire_email: admin.email,
      course_id: course.id,
      lue: false,
      deduplication_key: `ECO_CONVERT_ADMIN_${course.id}_${admin.email}`,
    }));
  if (notifRecords.length > 0) {
    await base44.asServiceRole.entities.Notification.bulkCreate(notifRecords).catch(() => null);
  }
}

export async function convertDueEcoCourses(base44: any, countryCode?: string, limit = 50) {
  const now = new Date().toISOString();
  const filter: any = {
    delivery_mode: 'eco',
    eco_status: 'isolated',
    enterprise_id: null,
    eco_convert_after_at: { $lte: now },
    dispatch_status: 'en_attente',
  };
  if (countryCode) filter.country_code = String(countryCode).toUpperCase();
  const courses = await base44.asServiceRole.entities.CourseExterne.filter(filter, 'eco_convert_after_at', limit).catch(() => []);
  const results = [];

  for (const course of courses || []) {
    if (!course?.id || TERMINAL_STATUSES.includes(course.statut) || course.livreur_id || course.eco_mission_id) continue;
    const claim = await base44.asServiceRole.entities.CourseExterne.updateMany(
      {
        id: course.id,
        delivery_mode: 'eco',
        eco_status: 'isolated',
        eco_mission_id: null,
        dispatch_status: 'en_attente',
      },
      {
        $set: {
          delivery_mode: 'standard',
          eco_status: 'converted',
          eco_converted_at: now,
          eco_conversion_reason: 'no_grouping_after_delay',
          statut: 'nouvelle',
        },
      }
    );
    if (claim?.updated === 1) {
      const fresh = await base44.asServiceRole.entities.CourseExterne.get(course.id).catch(() => course);
      await notifyConversion(base44, fresh);
      await base44.asServiceRole.functions.invoke('dispatchExterneAuto', {
        action: 'lancer_recherche_auto',
        course_id: course.id,
      }).catch((error: any) => {
        console.error('[Eco] dispatch after conversion failed:', error?.message || String(error));
      });
      results.push({ course_id: course.id, converted: true });
    } else {
      results.push({ course_id: course.id, converted: false, reason: 'atomic_conversion_lost' });
    }
  }
  return { success: true, checked: (courses || []).length, results };
}

export async function invalidatePendingProposals(base44: any, countryCode?: string, reason = 'engine_disabled') {
  const filter: any = { status: 'pending' };
  if (countryCode) filter.country_code = String(countryCode).toUpperCase();
  const proposals = await base44.asServiceRole.entities.EcoProposal.filter(filter, '-created_date', 200).catch(() => []);
  if (!proposals?.length) return { success: true, invalidated: 0 };
  const ids = proposals.map((p: any) => p.id);
  await base44.asServiceRole.entities.EcoProposal.updateMany(
    { id: { $in: ids }, status: 'pending' },
    { $set: { status: 'invalidated', responded_at: new Date().toISOString(), invalidation_reason: reason } }
  );
  return { success: true, invalidated: ids.length };
}

export async function expirePendingProposals(base44: any, countryCode?: string, limit = 200) {
  const filter: any = { status: 'pending', expires_at: { $lte: new Date().toISOString() } };
  if (countryCode) filter.country_code = String(countryCode).toUpperCase();
  const proposals = await base44.asServiceRole.entities.EcoProposal.filter(filter, 'expires_at', limit).catch(() => []);
  if (!proposals?.length) return { success: true, expired: 0 };
  await base44.asServiceRole.entities.EcoProposal.updateMany(
    { id: { $in: proposals.map((p: any) => p.id) }, status: 'pending' },
    { $set: { status: 'expired', responded_at: new Date().toISOString() } }
  );
  return { success: true, expired: proposals.length };
}

export async function createOnRouteProposal(base44: any, courseId: string, livreurId: string) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId).catch(() => null);
  const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
  if (!course || !livreur) return { success: false, reason: 'missing_course_or_driver' };
  const courseEnterpriseId = normalizeEnterpriseId(course.enterprise_id);
  const livreurEnterpriseId = normalizeEnterpriseId(livreur.enterprise_id);
  if (courseEnterpriseId !== livreurEnterpriseId) return { success: false, reason: 'enterprise_mismatch' };
  const config = await loadEcoConfig(base44, course.country_code);
  if (!config.enabled || !config.onRouteEnabled) return { success: false, reason: 'on_route_disabled' };
  if (TERMINAL_STATUSES.includes(course.statut) || course.livreur_id || course.accepted_by_livreur_id) {
    return { success: false, reason: 'course_unavailable' };
  }
  const activeCourses = await base44.asServiceRole.entities.CourseExterne.filter({
    livreur_id: livreurId,
    country_code: course.country_code,
  }, '-updated_date', 20).catch(() => []);
  const activeRunnableCourses = (activeCourses || []).filter((c: any) =>
    ACTIVE_STATUSES.includes(c.statut) &&
    normalizeEnterpriseId(c.enterprise_id) === courseEnterpriseId
  );
  if (activeRunnableCourses.length === 0) return { success: false, reason: 'driver_not_on_route' };

  const gainAmount = Math.max(0, prixCourse(course) - (Number(course.commission_silga) || 0));
  if (gainAmount < config.minDriverGain) return { success: false, reason: 'gain_below_threshold' };

  const compatibility = evaluateOnRouteCompatibility(activeRunnableCourses, course, config);
  if (!compatibility) return { success: false, reason: 'no_route_or_destination_match' };

  const existing = await base44.asServiceRole.entities.EcoProposal.filter({
    course_id: courseId,
    livreur_id: livreurId,
    status: 'pending',
  }, '-created_date', 1).catch(() => []);
  if (existing?.[0]) return { success: true, proposal: existing[0], idempotent: true };

  const proposal = await base44.asServiceRole.entities.EcoProposal.create({
    country_code: course.country_code,
    enterprise_id: courseEnterpriseId,
    course_id: courseId,
    livreur_id: livreurId,
    livreur_user_email: livreur.user_email || null,
    proposal_type: 'on_route_offer',
    proposal_scenario: compatibility.scenario,
    status: 'pending',
    expires_at: new Date(Date.now() + config.proposalExpirationSec * 1000).toISOString(),
    gain_amount: gainAmount,
    route_delta_json: JSON.stringify({
      source: 'prefilter',
      scenario: compatibility.scenario,
      active_course_id: compatibility.active_course_id,
      extra_km_estimate: compatibility.extra_km_estimate,
      destination_pickup_km: compatibility.destination_pickup_km,
      score: compatibility.score,
      max_detour_km: config.maxDetourKm,
      note: 'ORS reserved for top candidates only',
    }),
  });
  return { success: true, proposal };
}

export async function respondToOnRouteProposal(base44: any, proposalId: string, livreurId: string, response: 'accept' | 'refuse') {
  const proposal = await base44.asServiceRole.entities.EcoProposal.get(proposalId).catch(() => null);
  if (!proposal || proposal.status !== 'pending') return { success: false, reason: 'proposal_unavailable' };
  if (String(proposal.livreur_id) !== String(livreurId)) return { success: false, reason: 'proposal_owner_mismatch' };

  // ── [SÉCURITÉ] Vérification d'identité obligatoire avant acceptation de proposal ──
  if (response === 'accept') {
    const { verifyLivreurIdentity } = await import('./livreurIdentityGuard.ts');
    const identityCheck = await verifyLivreurIdentity(base44, livreurId);
    if (!identityCheck.verified) {
      return { success: false, reason: 'identity_mismatch', error: identityCheck.error || 'Vérification d\'identité échouée' };
    }
  }
  if (proposal.expires_at && new Date(proposal.expires_at) < new Date()) {
    await base44.asServiceRole.entities.EcoProposal.update(proposal.id, { status: 'expired', responded_at: new Date().toISOString() }).catch(() => null);
    return { success: false, reason: 'proposal_expired' };
  }
  if (response === 'refuse') {
    await base44.asServiceRole.entities.EcoProposal.update(proposal.id, { status: 'refused', responded_at: new Date().toISOString() });
    return { success: true, accepted: false };
  }

  const course = await base44.asServiceRole.entities.CourseExterne.get(proposal.course_id).catch(() => null);
  const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
  if (!course || !livreur) return { success: false, reason: 'missing_course_or_driver' };
  if (TERMINAL_STATUSES.includes(course.statut) || course.livreur_id || course.accepted_by_livreur_id) {
    await base44.asServiceRole.entities.EcoProposal.update(proposal.id, { status: 'invalidated', responded_at: new Date().toISOString() }).catch(() => null);
    return { success: false, reason: 'course_unavailable' };
  }
  if (normalizeEnterpriseId(course.enterprise_id) !== normalizeEnterpriseId(livreur.enterprise_id)) {
    return { success: false, reason: 'enterprise_mismatch' };
  }
  if (livreur.validation !== 'valide' || livreur.actif !== true || livreur.manual_hors_ligne === true || livreur.admin_hors_ligne === true || livreur.bloque_encours === true) {
    return { success: false, reason: 'livreur_indisponible' };
  }

  const now = new Date().toISOString();
  const updateData: any = {
    dispatch_status: 'accepte',
    statut: 'livreur_en_route',
    heure_acceptation: now,
    livreur_id: livreurId,
    livreur_nom: `${livreur.prenom || ''} ${livreur.nom || ''}`.trim(),
    livreur_photo_url: livreur.photo_url || '',
    livreur_telephone: livreur.telephone,
    livreur_vehicule: livreur.vehicule || livreur.type_vehicule || 'moto',
    livreur_note_moyenne: livreur.note_moyenne || 0,
    livreur_nombre_avis: livreur.nombre_avis || 0,
    livreur_user_email: livreur.user_email || null,
    accepted_by_livreur_id: livreurId,
    accepted_at: now,
  };

  let avantageAcceptation = null;
  if (normalizeEnterpriseId(course.enterprise_id) === null) {
    try {
      avantageAcceptation = await evaluerAvantageCommission(base44, livreurId, course.country_code, new Date(now));
      Object.assign(updateData, champsLockCommission(avantageAcceptation, now));
    } catch (error: any) {
      return { success: false, reason: 'commission_lookup_error', retryable: true, error: error?.message || 'PASS_LOOKUP_ERROR' };
    }
  }

  const claimProposal = await base44.asServiceRole.entities.EcoProposal.updateMany(
    { id: proposal.id, status: 'pending' },
    { $set: { status: 'accepted', responded_at: now } }
  );
  if (!claimProposal || claimProposal.updated !== 1) return { success: false, reason: 'proposal_race_lost' };

  const claimCourse = await claimCourseForLivreur(
    base44,
    course.id,
    livreurId,
    ['en_attente', 'disponible_push', 'propose'],
    updateData,
  );
  const fresh = claimCourse.course;
  if (!claimCourse.claimed) {
    await base44.asServiceRole.entities.EcoProposal.update(proposal.id, { status: 'invalidated', responded_at: now }).catch(() => null);
    return { success: false, reason: 'course_race_lost' };
  }
  if (avantageAcceptation) verifierCoherenceLock(fresh, avantageAcceptation);
  if (normalizeEnterpriseId(fresh.enterprise_id)) {
    await figerCommissionAcceptation(base44, course.id, livreurId, fresh.country_code, now).catch(() => null);
  }
  await marquerAccepte(base44, course.id, livreurId).catch(() => null);
  return { success: true, accepted: true, course_id: course.id, proposal_id: proposal.id };
}

export async function completeEcoMissionIfNeeded(base44: any, courseId: string) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId).catch(() => null);
  if (!course?.eco_mission_id) return { completed: false, reason: 'no_mission' };

  const mission = await base44.asServiceRole.entities.EcoMission.get(course.eco_mission_id).catch(() => null);
  if (!mission || ['completed', 'cancelled', 'invalidated'].includes(mission.status)) {
    return { completed: false, reason: 'mission_terminal' };
  }

  const courseIds = Array.isArray(mission.course_ids) ? mission.course_ids : [];
  if (courseIds.length === 0) return { completed: false, reason: 'no_courses' };

  const courses = await Promise.all(
    courseIds.map((id: string) => base44.asServiceRole.entities.CourseExterne.get(id).catch(() => null))
  );

  // ── Toutes les courses doivent être dans un statut terminal ──
  const allTerminal = courses.every((c: any) => c && (c.statut === 'livree' || c.statut === 'annulee'));
  if (!allTerminal) return { completed: false, reason: 'courses_pending' };

  // ── Toutes livrées → completed ──
  const allDelivered = courses.every((c: any) => c && c.statut === 'livree');
  if (allDelivered) {
    await base44.asServiceRole.entities.EcoMission.update(mission.id, {
      status: 'completed',
    }).catch(() => null);
    return { completed: true, mission_id: mission.id, final_status: 'completed' };
  }

  // ── Toutes annulées → cancelled ──
  const allCancelled = courses.every((c: any) => c && c.statut === 'annulee');
  if (allCancelled) {
    await base44.asServiceRole.entities.EcoMission.update(mission.id, {
      status: 'cancelled',
    }).catch(() => null);
    return { completed: true, mission_id: mission.id, final_status: 'cancelled' };
  }

  // ── Mixte (au moins une livrée + au moins une annulée) → cancelled ──
  // Une mission contenant des courses annulées n'est jamais déclarée "completed".
  await base44.asServiceRole.entities.EcoMission.update(mission.id, {
    status: 'cancelled',
  }).catch(() => null);
  return { completed: true, mission_id: mission.id, final_status: 'cancelled' };
}

// ── Correction 8 : Mettre à jour le route plan quand une course est livrée ──
// Met à jour les steps du route_plan_json et active_step_index quand une course
// passe en statut terminal (livree ou annulee). Les étapes terminées restent terminées.
// Gère les annulations partielles sans corrompre la mission.
export async function updateEcoMissionRouteProgress(base44: any, courseId: string) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId).catch(() => null);
  if (!course?.eco_mission_id) return { updated: false, reason: 'no_mission' };

  const mission = await base44.asServiceRole.entities.EcoMission.get(course.eco_mission_id).catch(() => null);
  if (!mission || ['completed', 'cancelled', 'invalidated'].includes(mission.status)) {
    return { updated: false, reason: 'mission_terminal' };
  }

  const courseIds = Array.isArray(mission.course_ids) ? mission.course_ids : [];
  if (courseIds.length === 0) return { updated: false, reason: 'no_courses' };

  // Récupérer toutes les courses de la mission
  const courses = await Promise.all(
    courseIds.map((id: string) => base44.asServiceRole.entities.CourseExterne.get(id).catch(() => null))
  );

  // Construire un map de statut par course_id
  const courseStatusMap = new Map<string, string>();
  for (const c of courses) {
    if (c) courseStatusMap.set(c.id, c.statut);
  }

  // Mettre à jour le route_plan_json
  let routePlan: any[] = [];
  try {
    routePlan = mission.route_plan_json ? JSON.parse(mission.route_plan_json) : [];
  } catch {
    routePlan = [];
  }

  let updated = false;
  let maxCompletedOrder = 0;

  for (const step of routePlan) {
    if (!step?.course_id) continue;
    const statut = courseStatusMap.get(step.course_id);
    if (!statut) continue;

    const isTerminal = statut === 'livree' || statut === 'annulee';
    if (isTerminal && step.status !== 'completed') {
      step.status = 'completed';
      updated = true;
    }
    if (isTerminal && step.order > maxCompletedOrder) {
      maxCompletedOrder = step.order;
    }
  }

  // Calculer active_step_index = premier step non-complété
  const firstPendingStep = routePlan.find((s: any) => s?.status !== 'completed');
  const newActiveStepIndex = firstPendingStep ? Math.max(0, (Number(firstPendingStep.order) || 1) - 1) : routePlan.length;

  if (updated || mission.active_step_index !== newActiveStepIndex) {
    await base44.asServiceRole.entities.EcoMission.update(mission.id, {
      route_plan_json: JSON.stringify(routePlan),
      active_step_index: newActiveStepIndex,
    }).catch(() => null);
    return { updated: true, mission_id: mission.id, active_step_index: newActiveStepIndex };
  }

  return { updated: false, reason: 'no_changes' };
}

// ── Correction 5 : Nettoyer les missions Éco bloquées ──
// Scanne toutes les missions non-terminales et vérifie si leurs courses
// sont toutes terminales. Si oui, met à jour le statut de la mission.
// Cette fonction est idempotente et peut être appelée par un workflow périodique.
export async function cleanupStuckEcoMissions(base44: any, countryCode?: string, limit = 50) {
  const filter: any = { status: { $in: ['accepted', 'available', 'accepting'] } };
  if (countryCode) filter.country_code = String(countryCode).toUpperCase();
  const missions = await base44.asServiceRole.entities.EcoMission.filter(filter, '-created_date', limit).catch(() => []);
  const results = [];

  for (const mission of missions || []) {
    const courseIds = Array.isArray(mission.course_ids) ? mission.course_ids : [];
    if (courseIds.length === 0) continue;

    const courses = await Promise.all(
      courseIds.map((id: string) => base44.asServiceRole.entities.CourseExterne.get(id).catch(() => null))
    );

    const allTerminal = courses.every((c: any) => c && (c.statut === 'livree' || c.statut === 'annulee'));
    if (!allTerminal) {
      results.push({ mission_id: mission.id, status: mission.status, action: 'skipped', reason: 'courses_pending' });
      continue;
    }

    const allDelivered = courses.every((c: any) => c && c.statut === 'livree');
    const allCancelled = courses.every((c: any) => c && c.statut === 'annulee');
    const finalStatus = allDelivered ? 'completed' : 'cancelled';

    await base44.asServiceRole.entities.EcoMission.update(mission.id, { status: finalStatus }).catch(() => null);

    // Libérer le livreur si la mission était acceptée
    if (mission.livreur_id && mission.status === 'accepted') {
      const livreur = await base44.asServiceRole.entities.Livreur.get(mission.livreur_id).catch(() => null);
      if (livreur && livreur.statut === 'en_course') {
        const STATUTS_ACTIFS = ['livreur_en_route', 'client_contacte', 'en_route_expediteur', 'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque', 'pris_en_charge', 'en_livraison', 'arrivee'];
        const autresCourses = await base44.asServiceRole.entities.CourseExterne.filter(
          { livreur_id: mission.livreur_id }, '-created_date', 10
        ).catch(() => []);
        const aAutreCourseActive = (autresCourses || []).some((c: any) =>
          c.id !== courseIds[0] && STATUTS_ACTIFS.includes(c.statut)
        );
        await base44.asServiceRole.entities.Livreur.update(mission.livreur_id, {
          statut: aAutreCourseActive ? 'en_course' : (livreur.manual_hors_ligne === true ? 'hors_ligne' : 'disponible'),
        }).catch(() => null);
      }
    }

    results.push({ mission_id: mission.id, status: mission.status, action: 'fixed', final_status: finalStatus });
  }

  return { success: true, checked: (missions || []).length, results };
}

export async function acceptEcoMission(base44: any, missionId: string, livreurId: string) {
  const mission = await base44.asServiceRole.entities.EcoMission.get(missionId).catch(() => null);
  if (!mission || mission.status !== 'available') return { success: false, reason: 'mission_unavailable' };

  // ── [SÉCURITÉ] Vérification d'identité obligatoire avant toute logique d'acceptation ──
  const { verifyLivreurIdentity } = await import('./livreurIdentityGuard.ts');
  const identityCheck = await verifyLivreurIdentity(base44, livreurId);
  if (!identityCheck.verified) {
    return { success: false, reason: 'identity_mismatch', error: identityCheck.error || 'Vérification d\'identité échouée' };
  }
  const livreur = identityCheck.livreur;
  if (normalizeEnterpriseId(mission.enterprise_id) !== normalizeEnterpriseId(livreur.enterprise_id)) {
    return { success: false, reason: 'enterprise_mismatch' };
  }
  if (livreur.type_livreur !== 'externe' || livreur.validation !== 'valide' || livreur.actif !== true ||
      livreur.statut !== 'disponible' || livreur.manual_hors_ligne === true ||
      livreur.admin_hors_ligne === true || livreur.bloque_encours === true) {
    return { success: false, reason: 'livreur_indisponible' };
  }

  const courseIds = Array.isArray(mission.course_ids) ? mission.course_ids : [];
  if (courseIds.length < 2) return { success: false, reason: 'mission_incomplete' };

  const courses = [];
  for (const id of courseIds) {
    const course = await base44.asServiceRole.entities.CourseExterne.get(id).catch(() => null);
    if (!course) return { success: false, reason: 'missing_course', course_id: id };
    if (normalizeEnterpriseId(course.enterprise_id) !== normalizeEnterpriseId(mission.enterprise_id)) {
      return { success: false, reason: 'enterprise_mismatch', course_id: id };
    }
    if (course.country_code !== mission.country_code || course.eco_mission_id !== mission.id ||
        course.eco_status !== 'grouped' || course.dispatch_status !== 'en_attente' ||
        TERMINAL_STATUSES.includes(course.statut) || course.livreur_id || course.accepted_by_livreur_id) {
      return { success: false, reason: 'course_not_claimable', course_id: id };
    }
    courses.push(course);
  }

  const now = new Date().toISOString();
  const claimMission = await base44.asServiceRole.entities.EcoMission.updateMany(
    { id: mission.id, status: 'available' },
    { $set: { status: 'accepting', livreur_id: livreurId, livreur_user_email: livreur.user_email || null, accepted_at: now } },
  );
  if (!claimMission || claimMission.updated !== 1) return { success: false, reason: 'mission_race_lost' };

  const updateData: any = {
    dispatch_status: 'accepte',
    statut: 'livreur_en_route',
    heure_acceptation: now,
    livreur_id: livreurId,
    livreur_nom: `${livreur.prenom || ''} ${livreur.nom || ''}`.trim(),
    livreur_photo_url: livreur.photo_url || '',
    livreur_telephone: livreur.telephone,
    livreur_vehicule: livreur.vehicule || livreur.type_vehicule || 'moto',
    livreur_note_moyenne: livreur.note_moyenne || 0,
    livreur_nombre_avis: livreur.nombre_avis || 0,
    livreur_user_email: livreur.user_email || null,
    accepted_by_livreur_id: livreurId,
    accepted_at: now,
  };

  const claimCourses = await base44.asServiceRole.entities.CourseExterne.updateMany(
    {
      id: { $in: courseIds },
      dispatch_status: 'en_attente',
      eco_status: 'grouped',
      eco_mission_id: mission.id,
    },
    { $set: updateData },
  );

  if (!claimCourses || claimCourses.updated !== courseIds.length) {
    await base44.asServiceRole.entities.EcoMission.update(mission.id, { status: 'invalidated' }).catch(() => null);
    return { success: false, reason: 'course_race_lost' };
  }

  await base44.asServiceRole.entities.EcoMission.update(mission.id, { status: 'accepted' }).catch(() => null);
  await base44.asServiceRole.entities.Livreur.update(livreurId, { statut: 'en_course' }).catch(() => null);
  await Promise.all(courseIds.map((id) => marquerAccepte(base44, id, livreurId).catch(() => null)));
  return { success: true, accepted: true, mission_id: mission.id, course_ids: courseIds, livreur_id: livreurId };
}