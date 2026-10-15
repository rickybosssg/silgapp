// ═══════════════════════════════════════════════════════════════════════════
// GPS CITY RESOLVER — Réplique frontend des règles backend de résolution ville
// ═══════════════════════════════════════════════════════════════════════════
// Utilisé UNIQUEMENT par la vue Super Admin « Dispatch par Ville ».
// Ne modifie ni le dispatch, ni les notifications, ni l'acceptation.
// Réutilise les mêmes seuils que cityResolution.ts / operationalZones.ts :
//   - GPS accuracy > 100m → ignoré
//   - GPS age > 10 min → stale
//   - Distance max quartier = 30km
//   - Priorité résolution: ville_operationnelle > ville > nom
// ═══════════════════════════════════════════════════════════════════════════

const GPS_ACCURACY_THRESHOLD_M = 100;
const GPS_FRESHNESS_THRESHOLD_MIN = 10;
const MAX_DISTANCE_KM = 30;

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function normalizeCityName(name) {
  if (!name || typeof name !== 'string') return null;
  const n = name.trim().toLowerCase()
    .replace(/[éèêë]/g, 'e').replace(/[àâä]/g, 'a').replace(/[îï]/g, 'i')
    .replace(/[ôö]/g, 'o').replace(/[ûüù]/g, 'u').replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();
  return n || null;
}

export function getGpsAgeMin(livreur) {
  const d = livreur?.derniere_position_date || livreur?.last_seen_at;
  if (!d) return null;
  return (Date.now() - new Date(d).getTime()) / 60000;
}

export function isGpsReliable(livreur) {
  if (!livreur) return false;
  const lat = Number(livreur.latitude);
  const lng = Number(livreur.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const age = getGpsAgeMin(livreur);
  if (age === null || age > GPS_FRESHNESS_THRESHOLD_MIN) return false;
  const acc = livreur.gps_accuracy;
  if (acc != null && Number.isFinite(Number(acc)) && Number(acc) > GPS_ACCURACY_THRESHOLD_M) return false;
  return true;
}

export function resolveCityFromGPS(lat, lng, quartiers) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!quartiers || quartiers.length === 0) return null;
  let nearest = null, nearestDist = Infinity;
  for (const q of quartiers) {
    if (!q.latitude || !q.longitude) continue;
    const d = haversineKm(lat, lng, q.latitude, q.longitude);
    if (d < nearestDist) { nearestDist = d; nearest = q; }
  }
  if (!nearest || nearestDist > MAX_DISTANCE_KM) return null;
  return normalizeCityName(nearest.ville_operationnelle) || normalizeCityName(nearest.ville) || normalizeCityName(nearest.nom);
}

export function resolveProfileCity(profileCity, quartiers) {
  const normalized = normalizeCityName(profileCity);
  if (!normalized) return null;
  const matching = (quartiers || []).find(q =>
    normalizeCityName(q.ville) === normalized && q.ville_operationnelle
  );
  if (matching) return normalizeCityName(matching.ville_operationnelle) || normalized;
  return normalized;
}

/**
 * Classifie un livreur selon son GPS.
 * Retourne: { gpsStatus, resolvedCity, profileCity, resolvedProfileCity, gpsAgeMin, gpsAccuracy }
 * gpsStatus: 'located' | 'stale' | 'out_of_zone'
 */
export function classifyLivreurGPS(livreur, quartiers) {
  const profileCity = normalizeCityName(livreur?.ville);
  const resolvedProfileCity = resolveProfileCity(livreur?.ville, quartiers);
  const gpsAgeMin = getGpsAgeMin(livreur);
  const gpsReliable = isGpsReliable(livreur);
  const gpsAccuracy = livreur?.gps_accuracy;

  if (!gpsReliable) {
    return { gpsStatus: 'stale', resolvedCity: null, profileCity, resolvedProfileCity, gpsAgeMin, gpsAccuracy };
  }

  const lat = Number(livreur.latitude);
  const lng = Number(livreur.longitude);
  const resolvedCity = resolveCityFromGPS(lat, lng, quartiers);

  if (!resolvedCity) {
    return { gpsStatus: 'out_of_zone', resolvedCity: null, profileCity, resolvedProfileCity, gpsAgeMin, gpsAccuracy };
  }

  return { gpsStatus: 'located', resolvedCity, profileCity, resolvedProfileCity, gpsAgeMin, gpsAccuracy };
}