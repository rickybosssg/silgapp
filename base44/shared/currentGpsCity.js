import { haversineKm } from './geoUtils.ts';
import { normalizeCityName, resolveOperationalName } from './cityNames.js';

// Reuse the existing heartbeat city-change limits. The previous 10-minute
// profile fallback is deliberately not an authorization source for new work.
export const CITY_GPS_MAX_AGE_MS = 120000;
export const CITY_GPS_MAX_ACCURACY_M = 100;
export const CITY_GPS_MAX_QUARTIER_DISTANCE_KM = 30;

export function gpsFixTime(value) {
  return typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
}

export function currentGpsFix(driver, now = Date.now()) {
  if (driver?.gps_fix_valid !== true) return null;
  const time = gpsFixTime(driver.gps_fix_date);
  const accuracy = driver.gps_accuracy;
  const lat = driver.latitude, lng = driver.longitude;
  if (lat == null || lat === '' || lng == null || lng === '' ||
      !Number.isFinite(Number(lat)) || Math.abs(Number(lat)) > 90 ||
      !Number.isFinite(Number(lng)) || Math.abs(Number(lng)) > 180 ||
      typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > CITY_GPS_MAX_ACCURACY_M ||
      !Number.isFinite(time) || time > now || now - time > CITY_GPS_MAX_AGE_MS) return null;
  return { latitude: Number(lat), longitude: Number(lng), time, accuracy };
}

export function resolveGpsOperationalCity(lat, lng, countryCode, cities, quartiers, maxDistanceKm = CITY_GPS_MAX_QUARTIER_DISTANCE_KM) {
  if (lat == null || lat === '' || lng == null || lng === '' ||
      !Number.isFinite(Number(lat)) || Math.abs(Number(lat)) > 90 ||
      !Number.isFinite(Number(lng)) || Math.abs(Number(lng)) > 180) return null;
  const country = String(countryCode || '').toUpperCase();
  if (!country) return null;
  const scopedCities = cities.filter(c => !c.country_code || String(c.country_code).toUpperCase() === country);
  const scopedQuartiers = quartiers.filter(q => !q.country_code || String(q.country_code).toUpperCase() === country);
  let nearest = null, distance = Infinity;
  for (const q of scopedQuartiers) {
    if (q.actif === false || (q.country_code && String(q.country_code).toUpperCase() !== country)) continue;
    if (q.latitude == null || q.latitude === '' || q.longitude == null || q.longitude === '' ||
        !Number.isFinite(Number(q.latitude)) || Math.abs(Number(q.latitude)) > 90 ||
        !Number.isFinite(Number(q.longitude)) || Math.abs(Number(q.longitude)) > 180) continue;
    if (!normalizeCityName(q.ville_operationnelle) && !normalizeCityName(q.ville)) continue;
    const km = haversineKm(Number(lat), Number(lng), Number(q.latitude), Number(q.longitude));
    if (km !== null && km < distance) { distance = km; nearest = q; }
  }
  if (!nearest || distance > maxDistanceKm) return null;
  // Explicit aliases (including Saaba) also apply when a quartier has no
  // ville_operationnelle. A quartier name never invents a city.
  return resolveOperationalName(nearest.ville_operationnelle || nearest.ville, scopedCities, scopedQuartiers);
}

export function currentDriverGpsCity(driver, cities, quartiers, now = Date.now()) {
  const fix = currentGpsFix(driver, now);
  return fix ? resolveGpsOperationalCity(fix.latitude, fix.longitude, driver.country_code, cities, quartiers) : null;
}

export function currentGpsCityQuery(city, now = Date.now()) {
  return {
    gps_operational_city: normalizeCityName(city),
    gps_fix_valid: true,
    gps_fix_date: { $gte: new Date(now - CITY_GPS_MAX_AGE_MS).toISOString(), $lte: new Date(now).toISOString() },
    gps_accuracy: { $gte: 0, $lte: CITY_GPS_MAX_ACCURACY_M },
  };
}
