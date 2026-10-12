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

import { haversineKm } from './geoUtils.ts';

const CITY_FLAG_PREFIX = 'CITY_DISPATCH_ENABLED';
const CITY_FLAG_CACHE_TTL_MS = 2 * 60 * 1000; // 2 min
const QUARTIER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

// ── Cache feature flag par pays ──
const CITY_FLAG_CACHE = new Map<string, { enabled: boolean; expires: number }>();

// ── Cache quartiers par pays (référentiel géographique) ──
const QUARTIER_CACHE = new Map<string, { data: any[]; expires: number }>();

/**
 * Normalise un nom de ville pour comparaison canonique.
 * "Ouagadougou", "ouagadougou", " Ouagadougou " → "ouagadougou"
 */
export function normalizeCityName(name: any): string | null {
  if (!name || typeof name !== 'string') return null;
  const normalized = name.trim().toLowerCase()
    .replace(/[éèêë]/g, 'e')
    .replace(/[àâä]/g, 'a')
    .replace(/[îï]/g, 'i')
    .replace(/[ôö]/g, 'o')
    .replace(/[ûüù]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

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
    const configs = await base44.asServiceRole.entities.AppConfig.filter({
      cle: `${CITY_FLAG_PREFIX}:${code}`,
    }, undefined, 1).catch(() => []);
    const enabled = configs?.[0]?.valeur === 'true';
    CITY_FLAG_CACHE.set(code, { enabled, expires: Date.now() + CITY_FLAG_CACHE_TTL_MS });
    return enabled;
  } catch {
    return false;
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
    }, 'nom', 500).catch(() => []);
    const data = (quartiers || []).filter((q: any) => q.latitude && q.longitude);
    QUARTIER_CACHE.set(code, { data, expires: Date.now() + QUARTIER_CACHE_TTL_MS });
    return data;
  } catch {
    return [];
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
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const quartiers = await loadQuartiersForCountry(base44, countryCode);
  if (!quartiers || quartiers.length === 0) return null;

  let nearest: any = null;
  let nearestDist = Infinity;

  for (const q of quartiers) {
    const dist = haversineKm(lat, lng, q.latitude, q.longitude);
    if (dist === null) continue;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = q;
    }
  }

  if (!nearest || nearestDist > maxDistanceKm) return null;

  return normalizeCityName(nearest.ville) || normalizeCityName(nearest.nom);
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
  if (storedCity) return storedCity;

  // 2. Résolution GPS si position récente et fiable
  const lat = Number(livreur.latitude);
  const lng = Number(livreur.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const gpsDate = livreur.derniere_position_date || livreur.last_seen_at;
  if (!gpsDate) return null;

  const gpsAgeMin = (Date.now() - new Date(gpsDate).getTime()) / 60000;
  if (gpsAgeMin > 10) return null; // GPS trop ancien

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
  if (storedCity) return storedCity;

  // 2. Résolution GPS
  const lat = Number(course.gps_depart_lat);
  const lng = Number(course.gps_depart_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return await resolveCityFromGPS(base44, lat, lng, course.country_code);
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