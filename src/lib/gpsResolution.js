/**
 * ═══════════════════════════════════════════════════════════════════
 * GPS RESOLUTION — Résolution des coordonnées GPS pour les courses
 * ═══════════════════════════════════════════════════════════════════
 *
 * Ordre de priorité pour la résolution GPS :
 * A — GPS exact (téléphone ou carte) → source = "exact"
 * B — GPS du quartier reconnu     → source = "quartier"
 * C — Géocodage d'adresse fiable   → source = "geocodage"
 * D — Aucun résultat fiable         → null (blocage avant dispatch)
 *
 * Ne jamais utiliser : 0,0, une coordonnée arbitraire, le centre de Ouagadougou,
 * ou une ancienne position sans rapport avec la saisie.
 * ═══════════════════════════════════════════════════════════════════
 */

import { resolveQuartier } from "@/lib/quartierResolver";

/**
 * Résout les coordonnées GPS pour un point (départ ou arrivée) d'une course.
 *
 * @param {Object} params
 * @param {number|null} params.exactLat - Latitude GPS exacte (téléphone ou carte)
 * @param {number|null} params.exactLng - Longitude GPS exacte
 * @param {string} params.quartierName - Nom du quartier saisi
 * @param {Array} params.quartiers - Liste des quartiers (entity Quartier) pour le pays
 * @returns {{ lat: number, lng: number, source: string } | null}
 */
export function resolveGpsForCourse({ exactLat, exactLng, quartierName, quartiers }) {
  // A — GPS exact disponible
  if (exactLat && exactLng && isFinite(exactLat) && isFinite(exactLng)) {
    return { lat: exactLat, lng: exactLng, source: "exact" };
  }

  // B — Quartier reconnu → utiliser ses coordonnées
  if (quartierName && quartiers && quartiers.length > 0) {
    const result = resolveQuartier(quartierName, quartiers);
    if (result.match && result.match.latitude && result.match.longitude) {
      return {
        lat: result.match.latitude,
        lng: result.match.longitude,
        source: "quartier",
      };
    }
  }

  // C — Géocodage d'adresse (doit être géré par l'appelant via geocodeAddress)
  // D — Aucun résultat fiable
  return null;
}

/**
 * Vérifie si des coordonnées GPS sont valides et exploitables.
 * Refuse : null, 0, 0, coordonnées hors plausibilité.
 */
export function isGpsValid(lat, lng) {
  return (
    lat != null &&
    lng != null &&
    isFinite(lat) &&
    isFinite(lng) &&
    !(lat === 0 && lng === 0) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/**
 * Message d'erreur affiché à l'utilisateur quand aucun GPS n'est disponible.
 */
export const GPS_BLOCK_MESSAGE =
  "Nous n'arrivons pas à localiser ce lieu. Choisissez un quartier proposé ou indiquez une position plus précise.";