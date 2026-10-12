// ═══════════════════════════════════════════════════════════════════════════
// OPTIMISEUR D'ITINÉRAIRES SILGAPP ÉCO — APPROCHE HYBRIDE
// ═══════════════════════════════════════════════════════════════════════════
// Détermine le meilleur ordre de récupérations/livraisons pour une mission Éco
// en prenant en compte la position GPS réelle du livreur.
//
// STRATÉGIE :
// 1. Générer toutes les permutations valides (récupération avant livraison).
// 2. Calculer la distance Haversine totale depuis la position du livreur.
// 3. Sélectionner l'itinéraire le plus court.
// 4. (Optionnel) Valider avec ORS Matrix si l'écart entre les 2 meilleurs est faible.
//
// COÛT :
// - 0 appel ORS pour 2 courses (Haversine pur, 6 permutations).
// - 0 appel Base44 supplémentaire (utilise les données déjà lues).
//
// SÉCURITÉ :
// - Si GPS indisponible → retourne null (l'appelant conserve l'itinéraire provisoire).
// - Si coordonnées invalides → retourne null.
// - Ne modifie jamais les étapes déjà terminées.
// - Ne réordonne jamais une livraison avant sa récupération.
// ═══════════════════════════════════════════════════════════════════════════

import { haversineKm, isValidCoord } from './geoUtils.ts';

// ── Seuil pour décider si une validation ORS est nécessaire ──
// Si l'écart entre les 2 meilleurs itinéraires Haversine est < ce seuil (en km),
// on pourrait appeler ORS pour départager. Pour l'instant, Haversine seul suffit
// pour 2 courses — ce seuil est documenté pour une future extension.
const ORS_VALIDATION_THRESHOLD_KM = 0.5;

// ── Âge maximum du GPS pour être considéré comme fiable (10 minutes) ──
const GPS_MAX_AGE_MINUTES = 10;

// ── Précision GPS minimum (mètres) ──
const GPS_MIN_ACCURACY_M = 100;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface RouteStep {
  type: 'pickup' | 'delivery';
  course_id: string;
  order: number;
  status: string;
  lat: number | null;
  lng: number | null;
}

interface Permutation {
  steps: RouteStep[];
  totalDistanceKm: number;
  driverToFirstKm: number;
  isValid: boolean;
}

interface DriverGPS {
  lat: number;
  lng: number;
  accuracyM?: number;
  timestamp: string;
  isReliable: boolean;
  reason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION DU GPS DU LIVREUR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extrait et valide la position GPS du livreur.
 *
 * Règles :
 * 1. Coordonnées doivent être valides (non nulles, dans les bornes).
 * 2. Le GPS doit avoir moins de 10 minutes.
 * 3. La précision (si disponible) doit être < 100m.
 *
 * @returns Objet DriverGPS ou null si indisponible.
 */
export function extractDriverGPS(livreur: any): DriverGPS | null {
  if (!livreur) return null;

  const lat = Number(livreur.latitude);
  const lng = Number(livreur.longitude);

  if (!isValidCoord(lat, lng)) {
    return {
      lat: 0,
      lng: 0,
      timestamp: '',
      isReliable: false,
      reason: 'invalid_coordinates',
    };
  }

  const gpsDate = livreur.derniere_position_date || livreur.last_seen_at;
  if (!gpsDate) {
    return {
      lat,
      lng,
      timestamp: '',
      isReliable: false,
      reason: 'no_timestamp',
    };
  }

  const gpsAgeMin = (Date.now() - new Date(gpsDate).getTime()) / 60000;
  if (gpsAgeMin > GPS_MAX_AGE_MINUTES) {
    return {
      lat,
      lng,
      timestamp: gpsDate,
      isReliable: false,
      reason: 'gps_too_old',
    };
  }

  const accuracyM = Number(livreur.gps_accuracy);
  if (Number.isFinite(accuracyM) && accuracyM > GPS_MIN_ACCURACY_M) {
    return {
      lat,
      lng,
      accuracyM,
      timestamp: gpsDate,
      isReliable: false,
      reason: 'gps_accuracy_too_low',
    };
  }

  return {
    lat,
    lng,
    accuracyM: Number.isFinite(accuracyM) ? accuracyM : undefined,
    timestamp: gpsDate,
    isReliable: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GÉNÉRATION DES PERMUTATIONS VALIDES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génère toutes les permutations valides d'étapes pour un ensemble de courses.
 *
 * Contrainte absolue : la récupération d'une course doit toujours précéder sa livraison.
 *
 * Pour 2 courses : 6 permutations valides (parmi 4! = 24 permutations totales).
 * Pour 3 courses : 90 permutations valides (parmi 6! = 720).
 *
 * Algorithme : générer toutes les permutations des 2N étapes (pickups + deliveries),
 * puis filtrer celles qui violent la contrainte "pickup avant delivery" pour chaque course.
 *
 * Les 6 permutations valides pour 2 courses (A, B) sont :
 * 1. PA → PB → LA → LB   (tout récupérer, livrer A puis B)
 * 2. PA → PB → LB → LA   (tout récupérer, livrer B puis A)
 * 3. PA → LA → PB → LB   (récupérer A, livrer A, puis B)
 * 4. PB → PA → LA → LB   (inverse de #1)
 * 5. PB → PA → LB → LA   (inverse de #2)
 * 6. PB → LB → PA → LA   (inverse de #3)
 *
 * @param courses Tableau de courses (chacune avec gps_depart_lat/lng, gps_arrivee_lat/lng)
 * @returns Tableau de permutations, chacune contenant un tableau d'étapes ordonnées.
 */
export function generateValidPermutations(courses: any[]): RouteStep[][] {
  if (!courses || courses.length === 0) return [];

  const n = courses.length;
  const validPermutations: RouteStep[][] = [];

  // ── Construire la liste des 2N étapes (N pickups + N deliveries) ──
  const allSteps: { type: 'pickup' | 'delivery'; courseIdx: number; course_id: string; lat: number | null; lng: number | null }[] = [];
  for (let i = 0; i < n; i++) {
    const course = courses[i];
    allSteps.push({
      type: 'pickup',
      courseIdx: i,
      course_id: course.id,
      lat: course.gps_depart_lat ?? null,
      lng: course.gps_depart_lng ?? null,
    });
    allSteps.push({
      type: 'delivery',
      courseIdx: i,
      course_id: course.id,
      lat: course.gps_arrivee_lat ?? null,
      lng: course.gps_arrivee_lng ?? null,
    });
  }

  // ── Générer toutes les permutations des indices [0, 1, ..., 2N-1] ──
  const indices = Array.from({ length: 2 * n }, (_, i) => i);
  const allIndexPermutations = permuteArray(indices);

  // ── Filtrer les permutations valides (pickup avant delivery pour chaque course) ──
  const seenSignatures = new Set<string>();

  for (const perm of allIndexPermutations) {
    let isValid = true;

    for (let courseIdx = 0; courseIdx < n; courseIdx++) {
      const pickupPos = perm.findIndex((stepIdx) => {
        const step = allSteps[stepIdx];
        return step.courseIdx === courseIdx && step.type === 'pickup';
      });
      const deliveryPos = perm.findIndex((stepIdx) => {
        const step = allSteps[stepIdx];
        return step.courseIdx === courseIdx && step.type === 'delivery';
      });

      if (pickupPos > deliveryPos) {
        isValid = false;
        break;
      }
    }

    if (!isValid) continue;

    // ── Construire les étapes ordonnées ──
    const steps: RouteStep[] = perm.map((stepIdx, order) => {
      const step = allSteps[stepIdx];
      return {
        type: step.type,
        course_id: step.course_id,
        order: order + 1,
        status: 'pending',
        lat: step.lat,
        lng: step.lng,
      };
    });

    // ── Déduplication par signature (ordre des course_ids + types) ──
    const signature = steps.map((s) => `${s.course_id}:${s.type}`).join('|');
    if (seenSignatures.has(signature)) continue;
    seenSignatures.add(signature);

    validPermutations.push(steps);
  }

  return validPermutations;
}

/**
 * Génère toutes les permutations d'un tableau (algorithme de Heap).
 */
function permuteArray<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];

  const result: T[][] = [];

  function generate(k: number, current: T[]) {
    if (k === 1) {
      result.push([...current]);
      return;
    }

    for (let i = 0; i < k; i++) {
      generate(k - 1, current);
      if (k % 2 === 0) {
        [current[i], current[k - 1]] = [current[k - 1], current[i]];
      } else {
        [current[0], current[k - 1]] = [current[k - 1], current[0]];
      }
    }
  }

  generate(arr.length, [...arr]);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// CALCUL DE DISTANCE D'UN ITINÉRAIRE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcule la distance Haversine totale d'un itinéraire depuis la position du livreur.
 *
 * Distance = driver_pos → step1 → step2 → ... → stepN
 *
 * @param steps Étapes ordonnées de l'itinéraire
 * @param driverLat Latitude du livreur
 * @param driverLng Longitude du livreur
 * @returns Distance totale en km, ou null si coordonnées invalides
 */
export function computeRouteDistance(
  steps: RouteStep[],
  driverLat: number,
  driverLng: number,
): { totalKm: number; driverToFirstKm: number } | null {
  if (!steps || steps.length === 0) return null;

  let totalKm = 0;
  let prevLat = driverLat;
  let prevLng = driverLng;
  let driverToFirstKm = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.lat == null || step.lng == null) return null;

    const dist = haversineKm(prevLat, prevLng, step.lat, step.lng);
    if (dist === null) return null;

    totalKm += dist;
    if (i === 0) driverToFirstKm = dist;

    prevLat = step.lat;
    prevLng = step.lng;
  }

  return { totalKm, driverToFirstKm };
}

// ═══════════════════════════════════════════════════════════════════════════
// SÉLECTION DU MEILLEUR ITINÉRAIRE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Évalue toutes les permutations et sélectionne la meilleure.
 *
 * @param courses Courses de la mission
 * @param driverGPS Position GPS validée du livreur
 * @returns La meilleure permutation avec sa distance, ou null si impossible
 */
export function selectBestRoute(
  courses: any[],
  driverGPS: DriverGPS,
): Permutation | null {
  if (!driverGPS.isReliable) return null;

  const permutations = generateValidPermutations(courses);
  if (permutations.length === 0) return null;

  let best: Permutation | null = null;

  for (const steps of permutations) {
    // Vérifier que toutes les étapes ont des coordonnées valides
    const allCoordsValid = steps.every(
      (s) => isValidCoord(s.lat as number, s.lng as number),
    );
    if (!allCoordsValid) continue;

    const dist = computeRouteDistance(steps, driverGPS.lat, driverGPS.lng);
    if (!dist) continue;

    const perm: Permutation = {
      steps,
      totalDistanceKm: dist.totalKm,
      driverToFirstKm: dist.driverToFirstKm,
      isValid: true,
    };

    if (!best || perm.totalDistanceKm < best.totalDistanceKm) {
      best = perm;
    }
  }

  return best;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSION EN ROUTE_PLAN_JSON COMPATIBLE APK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Construit un route_plan_json au format attendu par l'APK 1.0.129.
 *
 * Format :
 * [
 *   { type: 'pickup', course_id: '...', order: 1, status: 'pending', lat: ..., lng: ... },
 *   { type: 'pickup', course_id: '...', order: 2, status: 'pending', lat: ..., lng: ... },
 *   { type: 'delivery', course_id: '...', order: 3, status: 'pending', lat: ..., lng: ... },
 *   { type: 'delivery', course_id: '...', order: 4, status: 'pending', lat: ..., lng: ... },
 * ]
 *
 * @param permutation La permutation sélectionnée
 * @returns Chaîne JSON du route_plan
 */
export function buildRoutePlanJSON(permutation: Permutation): string {
  return JSON.stringify(permutation.steps);
}

// ═══════════════════════════════════════════════════════════════════════════
// FONCTION PRINCIPALE — OPTIMISATION À L'ACCEPTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Optimise l'itinéraire d'une mission Éco en prenant en compte la position GPS du livreur.
 *
 * Cette fonction est appelée APRÈS l'acceptation atomique de la mission.
 * Elle ne bloque pas l'acceptation — si elle échoue, l'itinéraire provisoire est conservé.
 *
 * Étapes :
 * 1. Valider la position GPS du livreur.
 * 2. Si GPS non fiable → conserver l'itinéraire existant (fallback).
 * 3. Générer toutes les permutations valides.
 * 4. Calculer la distance Haversine de chaque permutation depuis le livreur.
 * 5. Sélectionner l'itinéraire le plus court.
 * 6. Retourner le nouveau route_plan_json.
 *
 * @param base44 Instance SDK
 * @param courses Courses de la mission (déjà chargées)
 * @param livreur Profil livreur (déjà chargé)
 * @param existingRoutePlanJSON route_plan_json actuel (fallback)
 * @returns Nouveau route_plan_json ou l'existant si optimisation impossible
 */
export async function optimizeEcoRouteWithDriverGPS(
  base44: any,
  courses: any[],
  livreur: any,
  existingRoutePlanJSON: string | null,
): Promise<{ routePlanJSON: string; optimized: boolean; reason: string; distanceKm?: number }> {
  // 1. Extraire et valider la position GPS
  const driverGPS = extractDriverGPS(livreur);

  if (!driverGPS || !driverGPS.isReliable) {
    console.log(`[ecoRouteOptimizer] GPS non fiable, conservation de l'itinéraire provisoire. Raison: ${driverGPS?.reason || 'unknown'}`);
    return {
      routePlanJSON: existingRoutePlanJSON || JSON.stringify(buildFallbackRoutePlan(courses)),
      optimized: false,
      reason: driverGPS?.reason || 'gps_unavailable',
    };
  }

  // 2. Sélectionner le meilleur itinéraire
  const best = selectBestRoute(courses, driverGPS);

  if (!best) {
    console.log('[ecoRouteOptimizer] Aucune permutation valide trouvée, conservation de l\'itinéraire provisoire');
    return {
      routePlanJSON: existingRoutePlanJSON || JSON.stringify(buildFallbackRoutePlan(courses)),
      optimized: false,
      reason: 'no_valid_permutation',
    };
  }

  // 3. Construire le route_plan_json
  const routePlanJSON = buildRoutePlanJSON(best);

  console.log(`[ecoRouteOptimizer] Itinéraire optimisé: ${best.totalDistanceKm.toFixed(2)} km (livreur→premier: ${best.driverToFirstKm.toFixed(2)} km)`);

  return {
    routePlanJSON,
    optimized: true,
    reason: 'optimized_with_driver_gps',
    distanceKm: best.totalDistanceKm,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ITINÉRAIRE DE SECOURS (FALLBACK)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Construit un itinéraire de secours simple (ordre de création).
 * Utilisé quand aucune optimisation n'est possible.
 */
function buildFallbackRoutePlan(courses: any[]): RouteStep[] {
  const steps: RouteStep[] = [];
  let order = 1;

  for (const course of courses) {
    steps.push({
      type: 'pickup',
      course_id: course.id,
      order: order++,
      status: 'pending',
      lat: course.gps_depart_lat ?? null,
      lng: course.gps_depart_lng ?? null,
    });
  }

  for (const course of courses) {
    steps.push({
      type: 'delivery',
      course_id: course.id,
      order: order++,
      status: 'pending',
      lat: course.gps_arrivee_lat ?? null,
      lng: course.gps_arrivee_lng ?? null,
    });
  }

  return steps;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRÉSERVATION DES ÉTAPES TERMINÉES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Réoptimise un itinéraire en préservant les étapes déjà terminées.
 *
 * Utilisé pour les propositions sur trajet où le livreur a déjà des colis en cours.
 *
 * @param courses Courses de la mission (y compris celles déjà en cours)
 * @param livreur Profil livreur
 * @param existingRoutePlanJSON route_plan_json existant (contient les statuts des étapes)
 * @returns Nouveau route_plan_json ou l'existant si impossible
 */
export async function optimizeEcoRoutePreservingCompleted(
  base44: any,
  courses: any[],
  livreur: any,
  existingRoutePlanJSON: string | null,
): Promise<{ routePlanJSON: string; optimized: boolean; reason: string; distanceKm?: number }> {
  // 1. Parser le route_plan existant
  let existingSteps: RouteStep[] = [];
  try {
    existingSteps = existingRoutePlanJSON ? JSON.parse(existingRoutePlanJSON) : [];
  } catch {
    existingSteps = [];
  }

  // 2. Identifier les étapes terminées et celles en cours
  const completedSteps = existingSteps.filter((s) => s.status === 'completed');
  const cancelledSteps = existingSteps.filter((s) => s.status === 'cancelled');
  const pendingSteps = existingSteps.filter((s) => s.status === 'pending');

  // 3. S'il n'y a pas d'étape en cours ou terminée, optimiser normalement
  if (completedSteps.length === 0 && cancelledSteps.length === 0) {
    return optimizeEcoRouteWithDriverGPS(base44, courses, livreur, existingRoutePlanJSON);
  }

  // 4. Extraire les courses dont les étapes ne sont pas terminées
  const completedCourseIds = new Set(completedSteps.map((s) => s.course_id));
  const remainingCourses = courses.filter((c) => !completedCourseIds.has(c.id));

  // 5. S'il reste moins de 2 courses, pas besoin d'optimiser
  if (remainingCourses.length < 2) {
    return {
      routePlanJSON: existingRoutePlanJSON || JSON.stringify(buildFallbackRoutePlan(courses)),
      optimized: false,
      reason: 'less_than_two_remaining_courses',
    };
  }

  // 6. Optimiser uniquement les courses restantes
  const driverGPS = extractDriverGPS(livreur);
  if (!driverGPS || !driverGPS.isReliable) {
    return {
      routePlanJSON: existingRoutePlanJSON || JSON.stringify(buildFallbackRoutePlan(courses)),
      optimized: false,
      reason: driverGPS?.reason || 'gps_unavailable',
    };
  }

  const best = selectBestRoute(remainingCourses, driverGPS);
  if (!best) {
    return {
      routePlanJSON: existingRoutePlanJSON || JSON.stringify(buildFallbackRoutePlan(courses)),
      optimized: false,
      reason: 'no_valid_permutation',
    };
  }

  // 7. Fusionner : étapes terminées + nouvelles étapes optimisées
  const mergedSteps: RouteStep[] = [
    ...completedSteps.map((s, i) => ({ ...s, order: i + 1 })),
    ...best.steps.map((s, i) => ({ ...s, order: completedSteps.length + i + 1 })),
  ];

  return {
    routePlanJSON: JSON.stringify(mergedSteps),
    optimized: true,
    reason: 'optimized_preserving_completed',
    distanceKm: best.totalDistanceKm,
  };
}