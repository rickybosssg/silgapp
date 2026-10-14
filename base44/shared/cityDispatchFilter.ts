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
//   Si l'origine est active, index de ville GPS recente, puis relecture
//   des coordonnees. Sinon, pas de nouveau filtre geographique.
// - buildCourseCityFilterForLivreur : filtre les courses pour le fil
//   "Disponibles" d'un livreur. Exclut les courses des autres zones
//   activées via $nin.
// - verifyCityCompatibility : vérifie la compatibilité pour l'acceptation.
//   Asymétrique : bloque seulement si la zone de la course est activée.
// ═══════════════════════════════════════════════════════════════════════════

import { cityNamesPattern } from './cityNames.js';
import { currentGpsCityQuery } from './currentGpsCity.js';

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
 * Une origine active utilise l'index GPS recent comme preselection ;
 * les coordonnees sont ensuite verifiees avant notification ou acceptation.
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

  return currentGpsCityQuery(courseCity);
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

/** Re-read candidates immediately before creating new-course notifications.
 * A selection made before a GPS change is not an authorization to notify.
 * Existing country/tenant checks remain independent of the city policy.
 */
export async function filterCurrentCityCandidates(base44: any, course: any, candidates: any[]): Promise<any[]> {
  const country = String(course?.country_code || '').toUpperCase();
  const tenant = (value: any) => value == null || String(value).trim() === '' ? null : String(value).trim();
  const scoped = candidates.filter(driver => String(driver.country_code || '').toUpperCase() === country && tenant(driver.enterprise_id) === tenant(course.enterprise_id));
  if (!country) return [];
  if (!await isCityDispatchEnabled(base44, country)) return scoped;
  const courseCity = await getCourseDepartureCity(base44, course);
  if (!courseCity) return [];
  if (!await isOperationalCityActive(base44, country, courseCity)) return scoped;
  const ids = [...new Set(scoped.map(c => c.id).filter(Boolean))];
  if (!ids.length) return [];
  const fresh = await base44.asServiceRole.entities.Livreur.filter({
    id: { $in: ids }, country_code: country, ...currentGpsCityQuery(courseCity),
  }, undefined, ids.length);
  const eligible = [];
  for (const driver of fresh || []) {
    if (String(driver.country_code || '').toUpperCase() !== country || tenant(driver.enterprise_id) !== tenant(course.enterprise_id)) continue;
    if ((await verifyCityCompatibility(base44, course, driver)).compatible) eligible.push(driver);
  }
  return eligible;
}

/** Recheck acquisition proof after asynchronous pricing/busy checks, at claim. */
export async function verifyCurrentCityAtClaim(base44: any, course: any, driver: any) {
  const country = String(course?.country_code || '').toUpperCase();
  if (!country || !await isCityDispatchEnabled(base44, country)) return { compatible: true };
  const city = await getCourseDepartureCity(base44, course);
  if (!city) return { compatible: false, reason: 'course_city_unknown' };
  if (!await isOperationalCityActive(base44, country, city)) return { compatible: true };
  const fresh = await base44.asServiceRole.entities.Livreur.get(driver.id);
  const tenant = (value: any) => value == null || String(value).trim() === '' ? null : String(value).trim();
  if (!fresh || fresh.user_email !== driver.user_email || String(fresh.country_code || '').toUpperCase() !== country ||
      tenant(fresh.enterprise_id) !== tenant(course.enterprise_id)) return { compatible: false, reason: 'driver_scope_mismatch' };
  return verifyCityCompatibility(base44, course, fresh);
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

