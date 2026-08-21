// ═══════════════════════════════════════════════════════════════════════════
// CALCULER DISTANCE TARIFAIRE — Source unique de la distance de référence
// ═══════════════════════════════════════════════════════════════════════════
//
// RÈGLE ABSOLUE (validée Phase 1) :
//   Une fois la course créée et la distance tarifaire validée,
//   CourseExterne.distance_tarifaire_km devient la distance de référence.
//   Le scan du colis ou la position ultérieure du livreur NE DOIT PAS
//   changer rétroactivement la distance tarifaire.
//
// Source prioritaire : ORS (route réelle) avec fallback Haversine (vol d'oiseau).
// Haversine reste disponible pour : proximité, dispatch, affichage approximatif.
// ═══════════════════════════════════════════════════════════════════════════

import { haversineKm } from './geoUtils.ts';

/**
 * Calcule la distance tarifaire d'une course.
 *
 * Si la course a déjà une distance_tarifaire_km persistée, la retourne telle quelle
 * (distance de référence — ne JAMAIS recalculer).
 *
 * Sinon, calcule via ORS (route réelle) avec fallback Haversine, puis persiste le résultat.
 *
 * @param base44 Instance Base44
 * @param courseId ID de la course (optionnel — si fourni, persiste le résultat)
 * @param fromLat Latitude de départ
 * @param fromLng Longitude de départ
 * @param toLat Latitude d'arrivée
 * @param toLng Longitude d'arrivée
 * @param countryCode Code pays (pour routing ORS)
 * @returns { distanceKm, source } source = 'ors' | 'haversine_fallback' | 'persisted'
 */
export async function calculerDistanceTarifaire(
  base44: any,
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  countryCode?: string,
  courseId?: string
): Promise<{ distanceKm: number; source: string }> {
  // 1. Si un courseId est fourni, vérifier si la distance est déjà persistée
  if (courseId) {
    try {
      const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
      if (course?.distance_tarifaire_km && Number(course.distance_tarifaire_km) > 0) {
        return {
          distanceKm: Number(course.distance_tarifaire_km),
          source: 'persisted',
        };
      }
    } catch {
      // Course introuvable ou erreur — continuer avec le calcul
    }
  }

  // 2. Valider les coordonnées
  if (!fromLat || !fromLng || !toLat || !toLng) {
    return { distanceKm: 0, source: 'haversine_fallback' };
  }

  // 3. Tentative ORS (route réelle)
  try {
    const orsResult = await base44.asServiceRole.functions.invoke('getRouteORS', {
      from_lat: fromLat,
      from_lng: fromLng,
      to_lat: toLat,
      to_lng: toLng,
      country_code: countryCode,
      phase: 'tarification',
      ...(courseId ? { course_id: courseId } : {}),
    });

    const data = orsResult?.data || orsResult;
    const dist = Number(data?.distanceKm);

    if (data?.source === 'ors' && dist > 0) {
      // Persister la distance de référence
      if (courseId) {
        await base44.asServiceRole.entities.CourseExterne.update(courseId, {
          distance_tarifaire_km: Math.round(dist * 10) / 10,
          distance_tarifaire_source: 'ors',
        }).catch(() => {});
      }
      return { distanceKm: dist, source: 'ors' };
    }

    // ORS a retourné un fallback Haversine
    if (dist > 0) {
      if (courseId) {
        await base44.asServiceRole.entities.CourseExterne.update(courseId, {
          distance_tarifaire_km: Math.round(dist * 10) / 10,
          distance_tarifaire_source: 'haversine_fallback',
        }).catch(() => {});
      }
      return { distanceKm: dist, source: 'haversine_fallback' };
    }
  } catch (err) {
    console.warn('[DIST_TARIF] ORS indisponible:', (err as any)?.message || err);
  }

  // 4. Fallback Haversine local (vol d'oiseau)
  const havDist = haversineKm(fromLat, fromLng, toLat, toLng) ?? 0;

  if (courseId) {
    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      distance_tarifaire_km: Math.round(havDist * 10) / 10,
      distance_tarifaire_source: 'haversine_fallback',
    }).catch(() => {});
  }

  return { distanceKm: havDist, source: 'haversine_fallback' };
}