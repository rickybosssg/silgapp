import { base44 } from "@/api/base44Client";

/**
 * Résolution GPS à partir d'une sélection d'autocomplétion.
 *
 * Un quartier sélectionné est d'abord géocodé pour obtenir des coordonnées
 * précises. Son centre ne reste qu'un fallback explicitement marqué quartier.
 */
export async function resolveGpsFromSelection(item, countryCode) {
  if (!item?.latitude || !item?.longitude) return null;

  if (item.type && item.type !== "quartier") {
    return {
      lat: Number(item.latitude),
      lng: Number(item.longitude),
      source: "geocodage",
      quartier: item.quartier || null,
    };
  }

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
      // Géocodage indisponible : fallback sur le centre du quartier.
    }
  }

  return {
    lat: Number(item.latitude),
    lng: Number(item.longitude),
    source: "quartier",
    quartier: item.quartier || null,
  };
}
