// ── Utilitaires géographiques partagés ──────────────────────────────────────
// Utilisé par getRouteORS et maintenanceNuit (et futurs modules routing)

/**
 * Calcule la distance à vol d'oiseau entre deux points GPS (formule de Haversine).
 * @returns {number|null} Distance en km, ou null si coordonnées invalides.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  if (typeof lat1 !== "number" || typeof lon1 !== "number") return null;
  if (typeof lat2 !== "number" || typeof lon2 !== "number") return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Vérifie qu'une coordonnée GPS est valide (non nulle, dans les bornes, pas 0,0).
 */
export function isValidCoord(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    !isNaN(lat) && !isNaN(lng) &&
    isFinite(lat) && isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * ETA approximatif basé sur la distance à vol d'oiseau et une vitesse moyenne moto (25 km/h).
 * @returns {number} Minutes estimées (0 si distance invalide).
 */
export function computeFallbackEta(distKm) {
  if (!distKm || distKm <= 0) return 0;
  return Math.round((distKm / 25) * 60);
}