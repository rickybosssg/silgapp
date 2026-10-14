// ═══════════════════════════════════════════════════════════════════════════
// CITY DISPATCH FILTER — Filtrage MongoDB par zone opérationnelle
// ═══════════════════════════════════════════════════════════════════════════
// Construit les filtres MongoDB pour le dispatch par zone opérationnelle.
//
// RÈGLES DE COEXISTENCE (asymétriques) :
// 1. Course en zone activée → visible/acceptable UNIQUEMENT par les livreurs
//    de cette même zone.
// 2. Course en zone non activée → comportement historique (tous les livreurs
//    éligibles peuvent la voir et l'accepter).
// 3. Les livreurs d'une zone non activée ne peuvent PAS accepter les courses
//    d'une zone activée.
//
// IMPLÉMENTATION :
// - buildLivreurCityFilter : filtre les livreurs pour une course.
//   Si la zone de la course est activée → $in avec les noms de communes
//   de cette zone. Sinon → pas de filtre.
// - buildCourseCityFilterForLivreur : filtre les courses pour le fil
//   "Disponibles" d'un livreur. Exclut les courses des autres zones
//   activées via $nin.
// - verifyCityCompatibility : vérifie la compatibilité pour l'acceptation.
//   Asymétrique : bloque seulement si la zone de la course est activée.
// ═══════════════════════════════════════════════════════════════════════════

import { cityNamesPattern } from './cityNames.js';

import {
  isCityDispatchEnabled,
  getCourseDepartureCity,
  getDriverOperationalCity,
  areCitiesCompatible,
} from './cityResolution.ts';
import {
  isOperationalCityActive,
  getActivatedZoneCityNames,
  getOperationalZoneCityNames,
} from './operationalZones.ts';

/**
 * Construit le filtre MongoDB à ajouter à Livreur.filter() pour le dispatch
 * par zone opérationnelle.
 *
 * Si la zone de la course est activée → filtre les livreurs par les noms de
 * communes rattachées à cette zone (ex: ["Ouagadougou", "Saaba", "ouagadougou"]).
 * Sinon → pas de filtre (comportement historique).
 */
export async function buildLivreurCityFilter(base44: any, course: any): Promise<Record<string, any>> {
  const countryCode = String(course?.country_code || '').toUpperCase();
  if (!countryCode || !await isCityDispatchEnabled(base44, countryCode)) return {};

  // Résoudre la zone opérationnelle de la course
  const courseCity = await getCourseDepartureCity(base44, course);
  if (!courseCity) return { id: { $in: [] } }; // Unknown origin cannot invite drivers to an unacceptably scoped course.

  // Vérifier si cette zone est activée
  const isActive = await isOperationalCityActive(base44, countryCode, courseCity);
  if (!isActive) return {}; // Zone non activée → comportement historique

  // Récupérer tous les noms de communes rattachées à cette zone
  const zoneCityNames = await getOperationalZoneCityNames(base44, countryCode, courseCity);
  if (zoneCityNames.length === 0) {
    // Fallback: filtrer par le nom de la zone elle-même
    return { ville: { $regex: cityNamesPattern([courseCity]), $options: 'i' } };
  }

  return { ville: { $regex: cityNamesPattern(zoneCityNames), $options: 'i' } };

}

/**
 * Construit le filtre MongoDB à ajouter à CourseExterne.filter() pour le fil
 * "Disponibles" du livreur (côté frontend).
 *
 * Exclut les courses des autres zones activées via $nin.
 * Si aucune zone n'est activée → pas de filtre (comportement historique).
 */
export async function buildCourseCityFilterForLivreur(base44: any, livreur: any): Promise<Record<string, any>> {
  const countryCode = String(livreur?.country_code || '').toUpperCase();
  if (!countryCode || !await isCityDispatchEnabled(base44, countryCode)) return {};

  // Vérifier si au moins une zone est activée dans le pays
  const hasActive = await isCityDispatchEnabled(base44, countryCode);
  if (!hasActive) return {}; // Aucune zone activée → comportement historique

  // Résoudre la zone opérationnelle du livreur
  const livreurCity = await getDriverOperationalCity(base44, livreur);

  // Récupérer les noms de communes des autres zones activées (excluant la zone du livreur)
  const otherZoneCityNames = await getActivatedZoneCityNames(base44, countryCode, livreurCity);
  if (otherZoneCityNames.length === 0) return {};

  // Exclure les courses des autres zones activées
  return { ville_depart: { $not: { $regex: cityNamesPattern(otherZoneCityNames), $options: 'i' } } };

}

/**
 * Vérifie la compatibilité de zone entre une course et un livreur.
 * Utilisé comme garde de défense en profondeur dans l'acceptation backend.
 *
 * RÈGLE ASYMÉTRIQUE :
 * - Si la zone de la course est activée → le livreur doit être dans la même zone.
 * - Si la zone de la course n'est pas activée → toujours compatible (historique).
 */
export async function verifyCityCompatibility(base44: any, course: any, livreur: any): Promise<{
  compatible: boolean;
  reason?: string;
  courseCity?: string | null;
  livreurCity?: string | null;
}> {
  const countryCode = String(course?.country_code || '').toUpperCase();
  if (!countryCode || !await isCityDispatchEnabled(base44, countryCode)) return { compatible: true };

  const courseCity = await getCourseDepartureCity(base44, course);
  if (!courseCity) return { compatible: false, courseCity: null, reason: 'course_city_unknown' };

  // Vérifier si cette zone est activée
  const isActive = await isOperationalCityActive(base44, countryCode, courseCity);
  if (!isActive) return { compatible: true, courseCity, reason: 'zone_not_activated' };

  // La zone est activée → le livreur doit être dans la même zone
  const livreurCity = await getDriverOperationalCity(base44, livreur);
  if (!livreurCity) return { compatible: false, courseCity, livreurCity, reason: 'livreur_city_unknown' };

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
 * Si la zone de référence est activée → filtre par les noms de communes de cette zone.
 * Sinon → pas de filtre (comportement historique).
 */
export async function buildCourseCityFilterFromCourse(base44: any, course: any): Promise<Record<string, any>> {
  const countryCode = String(course?.country_code || '').toUpperCase();
  if (!countryCode || !await isCityDispatchEnabled(base44, countryCode)) return {};

  const courseCity = await getCourseDepartureCity(base44, course);
  if (!courseCity) return { id: { $in: [] } };

  const isActive = await isOperationalCityActive(base44, countryCode, courseCity);
  if (!isActive) {
    // An inactive reference course must not pull parcels out of another protected zone.
    const protectedNames = await getActivatedZoneCityNames(base44, countryCode, courseCity);
    return protectedNames.length
      ? { ville_depart: { $not: { $regex: cityNamesPattern(protectedNames), $options: 'i' } } } : {};
  }

  const zoneCityNames = await getOperationalZoneCityNames(base44, countryCode, courseCity);
  if (zoneCityNames.length === 0) {
    return { ville_depart: { $regex: cityNamesPattern([courseCity]), $options: 'i' } };
  }

  return { ville_depart: { $regex: cityNamesPattern(zoneCityNames), $options: 'i' } };
}

