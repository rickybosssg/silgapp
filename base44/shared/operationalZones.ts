// ═══════════════════════════════════════════════════════════════════════════
// OPERATIONAL ZONES — Zones opérationnelles SILGAPP
// ═══════════════════════════════════════════════════════════════════════════
// Une zone opérationnelle SILGAPP n'est PAS nécessairement une commune
// administrative. Ex: Saaba est rattachée à la zone opérationnelle de
// Ouagadougou.
//
// STRUCTURE : Pays → Ville opérationnelle → Quartiers/Zones rattachés
// → Livreurs et courses
//
// ACTIVATION INDIVIDUELLE :
// Chaque ville opérationnelle possède son propre interrupteur ON/OFF.
// Le Super Admin active les villes une par une depuis le dashboard.
// Aucune ville n'est activée automatiquement.
//
// RÈGLES DE COEXISTENCE :
// - Course en zone activée → visible/acceptable uniquement par les livreurs
//   de cette même zone.
// - Course en zone non activée → comportement historique (tous les livreurs
//   éligibles peuvent la voir et l'accepter).
// - Les livreurs d'une zone non activée ne peuvent PAS accepter les courses
//   d'une zone activée.
//
// DÉTECTION GPS AUTOMATIQUE :
// Le système résout la zone opérationnelle du livreur depuis sa position GPS
// en utilisant le champ ville_operationnelle des quartiers. Si vide, fallback
// sur le champ ville.
// ═══════════════════════════════════════════════════════════════════════════

import {
  normalizeCityName,
  loadQuartiersForCountry,
  invalidateCityFlagCache,
  resolveCityFromGPS,
  getDriverOperationalCity as resolveDriverCity,
  getCourseDepartureCity,
  shouldUpdateDriverCity,
} from './cityResolution.ts';


import { operationalCityAliases } from './cityNames.js';

const OP_CITY_CACHE_TTL_MS = 30 * 1000; // 30 sec — propagation rapide des changements
const OP_CITY_CACHE = new Map<string, { data: any[]; expires: number }>();

// ── Seuils de sécurité (réutilisés depuis cityResolution) ──

/**
 * Charge toutes les villes opérationnelles d'un pays.
 * Cache TTL 30s pour propagation rapide des activations/désactivations.
 */
export async function loadOperationalCities(base44: any, countryCode: string): Promise<any[]> {
  const code = String(countryCode || '').toUpperCase();
  if (!code) return [];

  const cached = OP_CITY_CACHE.get(code);
  if (cached && Date.now() < cached.expires) return cached.data;

  try {
    const cities = await base44.asServiceRole.entities.OperationalCity.filter({
      country_code: code,
    }, 'nom_affichage', 100);
    const data = cities || [];
    OP_CITY_CACHE.set(code, { data, expires: Date.now() + OP_CITY_CACHE_TTL_MS });
    return data;
  } catch {
    throw new Error('city_configuration_unavailable');
  }
}

/**
 * Vérifie si une ville opérationnelle spécifique est activée.
 * @param cityName - Nom normalisé de la ville opérationnelle (ex: "ouagadougou")
 */
export async function isOperationalCityActive(
  base44: any,
  countryCode: string,
  cityName: string | null,
): Promise<boolean> {
  if (!cityName) return false;
  const code = String(countryCode || '').toUpperCase();
  if (!code) return false;

  const normalized = normalizeCityName(cityName);
  if (!normalized) return false;

  const cities = await loadOperationalCities(base44, code);
  return cities.some((c: any) => c.actif === true && normalizeCityName(c.nom) === normalized);
}

/**
 * Vérifie si au moins une ville opérationnelle est activée dans le pays.
 * Utilisé pour déterminer si le filtrage par zone doit s'appliquer.
 */
export async function hasAnyActiveCity(base44: any, countryCode: string): Promise<boolean> {
  const code = String(countryCode || '').toUpperCase();
  if (!code) return false;

  const cities = await loadOperationalCities(base44, code);
  return cities.some((c: any) => c.actif === true);
}

/**
 * Résout la zone opérationnelle à partir de coordonnées GPS.
 * Utilise le champ ville_operationnelle du quartier le plus proche.
 * Si ville_operationnelle est vide, fallback sur ville.
 *
 * Aucune API externe — utilise uniquement les Quartiers en base.
 */
export async function resolveOperationalCity(base44: any, lat: number, lng: number, countryCode: string, maxDistanceKm = 30): Promise<string | null> {
  return resolveCityFromGPS(base44, lat, lng, countryCode, maxDistanceKm);
}

/**
 * Résout la zone opérationnelle d'un livreur.
 *
 * 1. Si livreur.ville est renseigné → vérifier s'il correspond à un quartier
 *    avec ville_operationnelle (ex: "Saaba" → "ouagadougou").
 * 2. Sinon, si GPS récent et fiable → résoudre depuis les quartiers.
 * 3. Sinon → null (pas de filtre, comportement historique).
 */
export async function getDriverOperationalCity(base44: any, livreur: any): Promise<string | null> {
  return resolveDriverCity(base44, livreur);
}

/**
 * Résout la zone opérationnelle de départ d'une course.
 *
 * 1. Si course.ville_depart est renseigné → vérifier s'il correspond à un quartier
 *    avec ville_operationnelle (ex: "Saaba" → "ouagadougou").
 * 2. Sinon, si GPS de départ disponible → résoudre depuis les quartiers.
 * 3. Sinon → null (pas de filtre, comportement historique).
 */
export async function getCourseOperationalCity(base44: any, course: any): Promise<string | null> {
  return getCourseDepartureCity(base44, course);
}

/**
 * Récupère tous les noms de communes administratives rattachées à une zone
 * opérationnelle.
 *
 * Ex: pour la zone "ouagadougou", retourne ["Ouagadougou", "Saaba"].
 * Inclut également le nom normalisé de la zone opérationnelle elle-même.
 *
 * Utilisé pour construire les filtres MongoDB $in sur le champ ville/ville_depart.
 */
export async function getOperationalZoneCityNames(
  base44: any,
  countryCode: string,
  operationalCity: string,
): Promise<string[]> {
  const quartiers = await loadQuartiersForCountry(base44, countryCode);
  const normalized = normalizeCityName(operationalCity);
  if (!normalized) return [];

  const cities = await loadOperationalCities(base44, countryCode);
  const record = cities.find(c => normalizeCityName(c.nom) === normalized);
  const cityNames = new Set<string>(record ? operationalCityAliases(record, quartiers) : []);
  // Inclure le nom normalisé de la zone opérationnelle elle-même
  cityNames.add(normalized);

  for (const q of quartiers || []) {
    const qOpCity = normalizeCityName(q.ville_operationnelle) || normalizeCityName(q.ville);
    if (qOpCity === normalized && q.ville) {
      cityNames.add(q.ville);
      // Aussi ajouter la version normalisée (minuscules sans accents)
      const normalizedVille = normalizeCityName(q.ville);
      if (normalizedVille) cityNames.add(normalizedVille);
    }
  }
  return Array.from(cityNames);
}

/**
 * Récupère tous les noms de communes administratives des zones activées,
 * à l'exclusion de la zone du livreur.
 *
 * Utilisé pour construire le filtre $nin qui exclut les courses des autres
 * zones activées de la liste "Disponibles" du livreur.
 *
 * Si aucune ville n'est activée → retourne un tableau vide (pas de filtre).
 */
export async function getActivatedZoneCityNames(
  base44: any,
  countryCode: string,
  excludeCity?: string | null,
): Promise<string[]> {
  const code = String(countryCode || '').toUpperCase();
  if (!code) return [];

  const cities = await loadOperationalCities(base44, code);
  const activeCities = cities.filter((c: any) => c.actif === true);
  if (activeCities.length === 0) return [];

  const excludeNormalized = excludeCity ? normalizeCityName(excludeCity) : null;

  const allCityNames = new Set<string>();
  for (const city of activeCities) {
    const cityNormalized = normalizeCityName(city.nom);
    if (excludeNormalized && cityNormalized === excludeNormalized) continue;

    const zoneCityNames = await getOperationalZoneCityNames(base44, code, city.nom);
    for (const name of zoneCityNames) {
      allCityNames.add(name);
    }
  }
  return Array.from(allCityNames);
}

/**
 * Devrait-on mettre à jour la zone opérationnelle du livreur ?
 *
 * Règles anti-flicker et de sécurité :
 * 1. Ne jamais changer pendant une mission (statut = en_course).
 * 2. Ignorer les GPS avec précision > 100m.
 * 3. Hystérésis anti-flicker (5km) aux limites de zones.
 * 4. Ne jamais effacer une zone existante par une position incertaine.
 *
 * @returns { shouldUpdate, newCity?, reason? }
 */
export async function shouldUpdateDriverOperationalCity(base44: any, livreur: any, lat: number, lng: number, accuracyM?: number): Promise<{ shouldUpdate: boolean; newCity?: string; reason?: string }> {
  return shouldUpdateDriverCity(base44, livreur, lat, lng, accuracyM);
}

/**
 * Invalide le cache des villes opérationnelles.
 */
export function invalidateOperationalCityCache(countryCode?: string): void {
  invalidateCityFlagCache(countryCode);
  if (countryCode) {
    OP_CITY_CACHE.delete(String(countryCode).toUpperCase());
  } else {
    OP_CITY_CACHE.clear();
  }
}
