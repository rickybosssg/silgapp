// ═══════════════════════════════════════════════════════════════════════════
// CITY DISPATCH FILTER — Helpers de filtrage MongoDB par ville
// ═══════════════════════════════════════════════════════════════════════════
// Construit les filtres MongoDB à ajouter aux requêtes Livreur.filter et
// CourseExterne.filter pour implémenter le filtrage par ville.
//
// PRINCIPES :
// 1. Si le feature flag est OFF → pas de filtre (retourne objet vide).
// 2. Si la ville de la course est indéterminée → pas de filtre (graceful degradation).
// 3. Sinon → filtre MongoDB sur le champ `ville` du livreur.
// 4. Le filtre utilise $regex pour matcher les variantes de casse/accents.
// ═══════════════════════════════════════════════════════════════════════════

import { cityNamePattern } from './cityNames.js';

import {
  isCityDispatchEnabled,
  getCourseDepartureCity,
  getDriverOperationalCity,
  areCitiesCompatible,
} from './cityResolution.ts';

/**
 * Construit le filtre MongoDB à ajouter à Livreur.filter() pour le dispatch par ville.
 *
 * @param base44 - Instance SDK
 * @param course - CourseExterne à dispatcher
 * @returns Objet à spread dans le filtre Livreur.filter (ex: { ville: { $regex: /ouagadougou/i } })
 *          ou objet vide si pas de filtre ville.
 */
export async function buildLivreurCityFilter(base44: any, course: any): Promise<Record<string, any>> {
  const countryCode = String(course?.country_code || '').toUpperCase();
  if (!countryCode) return {};

  // Vérifier le feature flag
  const enabled = await isCityDispatchEnabled(base44, countryCode);
  if (!enabled) return {};

  // Résoudre la ville de départ de la course
  const courseCity = await getCourseDepartureCity(base44, course);
  if (!courseCity) return {}; // Graceful degradation

  // Filtrer les livreurs par ville (match insensible à la casse)
  // On utilise $regex avec le nom normalisé pour matcher les variantes.
  // MongoDB $regex est indexé si l'index est créé sur `ville`.
  return { ville: { $regex: cityNamePattern(courseCity), $options: 'i' } };
}

/**
 * Construit le filtre MongoDB à ajouter à CourseExterne.filter() pour le fil
 * "Disponibles" du livreur (côté frontend).
 *
 * @param base44 - Instance SDK
 * @param livreur - Profil livreur
 * @returns Objet à spread dans le filtre CourseExterne.filter
 *          ou objet vide si pas de filtre ville.
 */
export async function buildCourseCityFilterForLivreur(base44: any, livreur: any): Promise<Record<string, any>> {
  const countryCode = String(livreur?.country_code || '').toUpperCase();
  if (!countryCode) return {};

  // Vérifier le feature flag
  const enabled = await isCityDispatchEnabled(base44, countryCode);
  if (!enabled) return {};

  // Résoudre la ville opérationnelle du livreur
  const livreurCity = await getDriverOperationalCity(base44, livreur);
  if (!livreurCity) return {}; // Graceful degradation

  return { ville_depart: { $regex: cityNamePattern(livreurCity), $options: 'i' } };
}

/**
 * Vérifie la compatibilité de ville entre une course et un livreur.
 * Utilisé comme garde de défense en profondeur dans accepterCourseV2.
 *
 * @returns true si compatibles (ou si le filtre ne s'applique pas), false si incompatibles.
 */
export async function verifyCityCompatibility(base44: any, course: any, livreur: any): Promise<{
  compatible: boolean;
  reason?: string;
  courseCity?: string | null;
  livreurCity?: string | null;
}> {
  const countryCode = String(course?.country_code || '').toUpperCase();

  // Vérifier le feature flag
  const enabled = await isCityDispatchEnabled(base44, countryCode);
  if (!enabled) return { compatible: true };

  // Résoudre les deux villes
  const [courseCity, livreurCity] = await Promise.all([
    getCourseDepartureCity(base44, course),
    getDriverOperationalCity(base44, livreur),
  ]);

  if (!courseCity || !livreurCity) return { compatible: true, courseCity, livreurCity };

  if (!areCitiesCompatible(courseCity, livreurCity)) {
    return {
      compatible: false,
      reason: 'city_mismatch',
      courseCity,
      livreurCity,
    };
  }

  return { compatible: true, courseCity, livreurCity };
}

/**
 * Construit le filtre MongoDB pour les courses actives d'un livreur
 * (utilisé dans getLivreursEnCourse et autres fonctions qui listent les courses par pays).
 *
 * @param base44 - Instance SDK
 * @param course - Course de référence (pour le pays et la ville)
 * @returns Objet à spread dans le filtre CourseExterne.filter
 */
export async function buildCourseCityFilterFromCourse(base44: any, course: any): Promise<Record<string, any>> {
  const countryCode = String(course?.country_code || '').toUpperCase();
  if (!countryCode) return {};

  const enabled = await isCityDispatchEnabled(base44, countryCode);
  if (!enabled) return {};

  const courseCity = await getCourseDepartureCity(base44, course);
  if (!courseCity) return {};

  return { ville_depart: { $regex: cityNamePattern(courseCity), $options: 'i' } };
}
