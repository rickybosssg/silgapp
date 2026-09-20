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

  // 2. Item quartier : utiliser en priorité les coordonnées de référence du quartier.
  // Le géocodage ORS ne doit JAMAIS remplacer silencieusement une coordonnée de
  // quartier valide par un résultat homonyme éloigné (POI, village homonyme, etc.).
  // Les coordonnées de la table Quartier sont la source de vérité pour les quartiers.
  return {
    lat: Number(item.latitude),
    lng: Number(item.longitude),
    source: "quartier",
    quartier: item.quartier || null,
  };
}