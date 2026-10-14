// ═══════════════════════════════════════════════════════════════════════════
// CITY RESOLUTION — Résolution automatique de la ville opérationnelle
// ═══════════════════════════════════════════════════════════════════════════
// Solution hybride Ville + GPS pour le dispatch par ville.
//
// PRINCIPES :
// 1. Réutilise le champ `ville` existant sur Livreur, CourseExterne, Quartier.
// 2. Aucune API cartographique payante — utilise les Quartiers en base comme référentiel.
// 3. Feature flag par pays (OFF par défaut) — activation progressive contrôlée.
// 4. Graceful degradation : si ville vide/indisponible → pas de filtre (comportement actuel).
// 5. Cache en mémoire des quartiers par pays (TTL 10 min).
// ═══════════════════════════════════════════════════════════════════════════

import { normalizeCityName, resolveOperationalName } from './cityNames.js';
export { normalizeCityName } from './cityNames.js';

import { haversineKm } from './geoUtils.ts';

const CITY_FLAG_CACHE_TTL_MS = 30 * 1000; // 30 sec — délai court pour désactivation immédiate
const QUARTIER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

// ── Seuils de sécurité pour la détection automatique de ville ──
// GPS avec précision > ce seuil → ignoré (position trop imprécise pour identifier une ville)
const GPS_ACCURACY_THRESHOLD_M = 100;
// Hystérésis anti-flicker : si le livreur est à moins de cette distance d'un quartier
// de sa ville actuelle, ne pas changer de ville (évite les basculements intempestifs
// aux limites de villes et lors d'erreurs GPS ponctuelles)
const CITY_CHANGE_HYSTERESIS_KM = 5;

// ── Cache feature flag par pays ──
const CITY_FLAG_CACHE = new Map<string, { enabled: boolean; expires: number }>();

// ── Cache quartiers par pays (référentiel géographique) ──
const QUARTIER_CACHE = new Map<string, { data: any[]; expires: number }>();

/**
 * Normalise un nom de ville pour comparaison canonique.
 * "Ouagadougou", "ouagadougou", " Ouagadougou " → "ouagadougou"
 */

/**
 * Vérifie si le filtrage par ville est activé pour un pays.
 * OFF par défaut — doit être activé explicitement via AppConfig.
 *
 * Clé AppConfig: CITY_DISPATCH_ENABLED:<COUNTRY_CODE>
 * Valeur: "true" pour activer, tout le reste = désactivé.
 */
export async function isCityDispatchEnabled(base44: any, countryCode: string): Promise<boolean> {
  const code = String(countryCode || '').toUpperCase();
  if (!code) return false;

  const cached = CITY_FLAG_CACHE.get(code);
  if (cached && Date.now() < cached.expires) return cached.enabled;

  try {
    const { hasAnyActiveCity } = await import('./operationalZones.ts');
    const enabled = await hasAnyActiveCity(base44, code);
    CITY_FLAG_CACHE.set(code, { enabled, expires: Date.now() + CITY_FLAG_CACHE_TTL_MS });
    return enabled;
  } catch {
    throw new Error('city_configuration_unavailable');
  }
}

/**
 * Charge tous les quartiers actifs d'un pays avec leurs coordonnées GPS.
 * Utilisé comme référentiel pour la résolution de ville par GPS.
 * Cache TTL 10 min pour éviter les requêtes répétées.
 */
export async function loadQuartiersForCountry(base44: any, countryCode: string): Promise<any[]> {
  const code = String(countryCode || '').toUpperCase();
  if (!code) return [];

  const cached = QUARTIER_CACHE.get(code);
  if (cached && Date.now() < cached.expires) return cached.data;

  try {
    const quartiers = await base44.asServiceRole.entities.Quartier.filter({
      country_code: code,
      actif: true,
    }, 'nom', 500);
    const data = (quartiers || []).filter((q: any) => normalizeCityName(q.ville_operationnelle) || normalizeCityName(q.ville));
    QUARTIER_CACHE.set(code, { data, expires: Date.now() + QUARTIER_CACHE_TTL_MS });
    return data;
  } catch {
    throw new Error('city_reference_unavailable');
  }
}

/**
 * Résout la ville à partir de coordonnées GPS en trouvant le quartier le plus proche.
 * Aucune API externe — utilise uniquement les Quartiers en base.
 *
 * @param base44 - Instance SDK
 * @param lat - Latitude du livreur
 * @param lng - Longitude du livreur
 * @param countryCode - Code pays ISO 2 lettres
 * @param maxDistanceKm - Distance maximale pour associer un quartier (défaut 30km)
 * @returns Nom de la ville normalisé, ou null si aucun quartier trouvé dans le rayon.
 */
export async function resolveCityFromGPS(
  base44: any,
  lat: number,
  lng: number,
  countryCode: string,
  maxDistanceKm = 30,
): Promise<string | null> {
  if (!validCoordinates(lat, lng)) {
    return null;
  }

  const quartiers = await loadQuartiersForCountry(base44, countryCode);
  if (!quartiers || quartiers.length === 0) return null;

  let nearest: any = null;
  let nearestDist = Infinity;

  for (const q of quartiers) {
    if (!validCoordinates(q.latitude, q.longitude)) continue;
    const dist = haversineKm(lat, lng, q.latitude, q.longitude);
    if (dist === null) continue;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = q;
    }
  }

  if (!nearest || nearestDist > maxDistanceKm) return null;

  return normalizeCityName(nearest.ville_operationnelle) || normalizeCityName(nearest.ville);
}

/**
 * Détermine la ville opérationnelle d'un livreur.
 *
 * Logique :
 * 1. Si livreur.ville est renseigné → l'utiliser (priorité à la saisie manuelle).
 * 2. Sinon, si GPS récent (< 10 min) et fiable → résoudre depuis les quartiers.
 * 3. Sinon → null (pas de filtre ville, comportement actuel).
 *
 * @returns Nom de ville normalisé, ou null si indéterminé.
 */
export async function getDriverOperationalCity(base44: any, livreur: any): Promise<string | null> {
  if (!livreur) return null;

  // 1. Ville déjà renseignée sur le profil
  const storedCity = normalizeCityName(livreur.ville);
  if (storedCity) {
    // Vérifier si c'est un nom administratif qui mappe vers une zone opérationnelle
    // Ex: "Saaba" → "ouagadougou" si le quartier a ville_operationnelle="Ouagadougou"
    const quartiers = await loadQuartiersForCountry(base44, livreur.country_code);
    const { loadOperationalCities } = await import('./operationalZones.ts');
    const cities = await loadOperationalCities(base44, livreur?.country_code);
    return resolveOperationalName(storedCity, cities, quartiers);
  }

  // 2. Résolution GPS si position récente et fiable
  if (!validCoordinates(livreur.latitude, livreur.longitude)) return null;
  const lat = Number(livreur.latitude);
  const lng = Number(livreur.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const gpsDate = livreur.derniere_position_date;
  if (!gpsDate) return null;

  const gpsAgeMin = (Date.now() - new Date(gpsDate).getTime()) / 60000;
  if (!Number.isFinite(gpsAgeMin) || gpsAgeMin < 0 || gpsAgeMin > 10 || (livreur.gps_accuracy != null && (!Number.isFinite(Number(livreur.gps_accuracy)) || Number(livreur.gps_accuracy) < 0 || Number(livreur.gps_accuracy) > GPS_ACCURACY_THRESHOLD_M))) return null; // GPS trop ancien

  return await resolveCityFromGPS(base44, lat, lng, livreur.country_code);
}

/**
 * Détermine la ville de départ d'une course.
 *
 * Logique :
 * 1. Si course.ville_depart est renseigné → l'utiliser.
 * 2. Sinon, si GPS de départ disponible → résoudre depuis les quartiers.
 * 3. Sinon → null (pas de filtre ville).
 */
export async function getCourseDepartureCity(base44: any, course: any): Promise<string | null> {
  if (!course) return null;

  // 1. Ville déjà renseignée
  const storedCity = normalizeCityName(course.ville_depart);
  if (storedCity) {
    // Vérifier si c'est un nom administratif qui mappe vers une zone opérationnelle
    // Ex: "Saaba" → "ouagadougou" si le quartier a ville_operationnelle="Ouagadougou"
    const quartiers = await loadQuartiersForCountry(base44, course.country_code);
    const { loadOperationalCities } = await import('./operationalZones.ts');
    const cities = await loadOperationalCities(base44, course?.country_code);
    return resolveOperationalName(storedCity, cities, quartiers);
  }

  // 2. Résolution GPS
  if (!validCoordinates(course.gps_depart_lat, course.gps_depart_lng)) return null;
  const lat = Number(course.gps_depart_lat);
  const lng = Number(course.gps_depart_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return await resolveCityFromGPS(base44, lat, lng, course.country_code);
}

/**
 * Devrait-on mettre à jour la ville opérationnelle du livreur ?
 *
 * Règles anti-flicker et de sécurité :
 * 1. Ne jamais changer pendant une mission (statut = en_course) — le livreur
 *    est en transit, son GPS peut être sur une route interurbaine.
 * 2. Ignorer les GPS avec précision > GPS_ACCURACY_THRESHOLD_M (100m) — trop imprécis.
 * 3. Si la ville résolue == ville actuelle → pas de changement.
 * 4. Si la ville actuelle est déjà définie → hystérésis : ne changer que si le
 *    livreur est clairement dans la nouvelle ville (à plus de
 *    CITY_CHANGE_HYSTERESIS_KM de tout quartier de sa ville actuelle).
 * 5. Si la ville résolue est null → ne pas effacer la ville existante.
 *
 * @returns { shouldUpdate, newCity?, reason? }
 */
export async function shouldUpdateDriverCity(
  base44: any,
  livreur: any,
  lat: number,
  lng: number,
  accuracyM?: number,
): Promise<{ shouldUpdate: boolean; newCity?: string; reason?: string }> {
  // 1. Ne jamais changer pendant une mission
  if (livreur?.statut === 'en_course') {
    return { shouldUpdate: false, reason: 'driver_in_mission' };
  }

  // 2. Ignorer les GPS trop imprécis
  if (accuracyM == null || !Number.isFinite(Number(accuracyM)) || Number(accuracyM) < 0 || Number(accuracyM) > GPS_ACCURACY_THRESHOLD_M) {
    return { shouldUpdate: false, reason: 'gps_accuracy_too_low' };
  }

  if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return { shouldUpdate: false, reason: 'invalid_gps_coordinates' };
  }

  if (!validCoordinates(lat, lng)) return { shouldUpdate: false, reason: 'too_far_from_any_quartier' };

  // 3. Charger les quartiers du pays
  const quartiers = await loadQuartiersForCountry(base44, livreur?.country_code);
  if (!quartiers || quartiers.length === 0) {
    return { shouldUpdate: false, reason: 'no_quartiers_available' };
  }

  // 4. Trouver le quartier le plus proche
  let nearest: any = null;
  let nearestDist = Infinity;
  for (const q of quartiers) {
    if (!validCoordinates(q.latitude, q.longitude)) continue;
    const dist = haversineKm(lat, lng, q.latitude, q.longitude);
    if (dist === null) continue;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = q;
    }
  }

  if (!nearest || nearestDist > 30) {
    return { shouldUpdate: false, reason: 'too_far_from_any_quartier' };
  }

  // Priorité: ville_operationnelle > ville > nom
  const resolvedCity = normalizeCityName(nearest.ville_operationnelle) || normalizeCityName(nearest.ville);
  if (!resolvedCity) {
    return { shouldUpdate: false, reason: 'city_name_unresolved' };
  }

  // 5. Comparer avec la ville actuelle
  const currentCity = normalizeCityName(livreur?.ville);
  // Résoudre la zone opérationnelle actuelle du livreur (ex: "Saaba" → "ouagadougou")
  let currentOperationalCity = currentCity;
  if (currentCity) {
    const matchingQ = (quartiers || []).find((q: any) =>
      normalizeCityName(q.ville) === currentCity && q.ville_operationnelle
    );
    if (matchingQ) {
      currentOperationalCity = normalizeCityName(matchingQ.ville_operationnelle) || currentCity;
    }
  }
  if (resolvedCity === currentOperationalCity || resolvedCity === currentCity) {
    return { shouldUpdate: false, reason: 'same_city' };
  }

  // 6. Anti-flicker : si la ville actuelle est définie, vérifier l'hystérésis
  if (currentOperationalCity) {
    let currentCityMinDist = Infinity;
    for (const q of quartiers) {
      const qCity = normalizeCityName(q.ville_operationnelle) || normalizeCityName(q.ville);
      if (qCity === currentOperationalCity) {
        if (!validCoordinates(q.latitude, q.longitude)) continue;
    const dist = haversineKm(lat, lng, q.latitude, q.longitude);
        if (dist !== null && dist < currentCityMinDist) {
          currentCityMinDist = dist;
        }
      }
    }
    // Si le livreur est encore proche d'un quartier de sa ville actuelle,
    // ne pas changer (évite le flicker aux limites de villes)
    if (currentCityMinDist < CITY_CHANGE_HYSTERESIS_KM) {
      return { shouldUpdate: false, reason: 'within_hysteresis_zone_of_current_city' };
    }
  }

  return { shouldUpdate: true, newCity: resolvedCity, reason: 'city_changed' };
}

/**
 * Vérifie si deux villes sont compatibles pour le dispatch.
 * Deux villes normalisées identiques → compatibles.
 * Si l'une est null → compatible (pas de filtre, comportement actuel).
 */
export function areCitiesCompatible(cityA: string | null, cityB: string | null): boolean {
  if (!cityA || !cityB) return true; // Graceful degradation
  return cityA === cityB;
}

/**
 * Invalide le cache des quartiers pour un pays (utile après modification des quartiers).
 */
export function invalidateQuartierCache(countryCode?: string): void {
  if (countryCode) {
    QUARTIER_CACHE.delete(String(countryCode).toUpperCase());
  } else {
    QUARTIER_CACHE.clear();
  }
}

/**
 * Invalide le cache du feature flag pour un pays.
 */
export function invalidateCityFlagCache(countryCode?: string): void {
  if (countryCode) {
    CITY_FLAG_CACHE.delete(String(countryCode).toUpperCase());
  } else {
    CITY_FLAG_CACHE.clear();
  }
}

function validCoordinates(lat: any, lng: any): boolean {
  return lat !== null && lat !== undefined && lat !== '' && lng !== null && lng !== undefined && lng !== '' &&
    Number.isFinite(Number(lat)) && Math.abs(Number(lat)) <= 90 && Number.isFinite(Number(lng)) && Math.abs(Number(lng)) <= 180;
}

