import { base44 } from "@/api/base44Client";

/**
 * ═══════════════════════════════════════════════════════════════════
 * RÉSOLUTION GPS À PARTIR D'UNE SÉLECTION AUTOCOMPLÉTION
 * ═══════════════════════════════════════════════════════════════════
 *
 * Priorité :
 * 1. Coordonnées d'un item géocodé (adresse OSM, lieu SILGAPP, boutique, etc.)
 *    → source "geocodage" (coordonnées précises)
 * 2. Géocodage ORS de l'adresse si l'item est un quartier
 *    → source "geocodage" si succès (coordonnées précises)
 * 3. Fallback : centre du quartier
 *    → source "quartier" (coordonnées approximatives)
 *
 * Le quartier ne doit JAMAIS servir de coordonnées tarifaires sauf en fallback.
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * @param {Object} item - Item sélectionné depuis SmartAddressInput
 * @param {string} countryCode - Code pays ISO 2 lettres
 * @returns {Promise<{lat: number, lng: number, source: string, quartier?: string|null}|null>}
 */
export async function resolveGpsFromSelection(item, countryCode) {
  if (!item?.latitude || !item?.longitude) return null;

  // 1. Item non-quartier : coordonnées précises (OSM, lieu SILGAPP, boutique, etc.)
  if (item.type && item.type !== "quartier") {
    return {
      lat: Number(item.latitude),
      lng: Number(item.longitude),
      source: "geocodage",
      quartier: item.quartier || null,
    };
  }

  // 2. Item quartier : essayer de géocoder l'adresse pour des coordonnées précises
  const addressText = item.address || item.label || "";
  if (addressText.trim().length >= 3 && countryCode) {
    try {
      const res = await base44.functions.invoke("geocodeAddress", {
        query: addressText.trim(),
        country_code: countryCode,
      });
      const results = res?.data?.results || res?.results || [];
      if (results.length > 0 && results[0].latitude && results[0].longitude) {
        return {
          lat: Number(results[0].latitude),
          lng: Number(results[0].longitude),
          source: "geocodage",
          quartier: item.quartier || results[0].quartier || null,
        };
      }
    } catch (_) {
      // Geocoding échoué — fallback quartier
    }
  }

  // 3. Fallback : centre du quartier (coordonnées approximatives)
  return {
    lat: Number(item.latitude),
    lng: Number(item.longitude),
    source: "quartier",
    quartier: item.quartier || null,
  };
}