var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// frozen:base44/shared/geoUtils.ts
function haversineKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  if (typeof lat1 !== "number" || typeof lon1 !== "number") return null;
  if (typeof lat2 !== "number" || typeof lon2 !== "number") return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function isValidCoord(lat, lng) {
  return typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
}
function computeFallbackEta(distKm) {
  if (!distKm || distKm <= 0) return 0;
  return Math.round(distKm / 25 * 60);
}
var init_geoUtils = __esm({
  "frozen:base44/shared/geoUtils.ts"() {
  }
});

// frozen:base44/shared/cityResolution.ts
function normalizeCityName(name) {
  if (!name || typeof name !== "string") return null;
  const normalized = name.trim().toLowerCase().replace(/[éèêë]/g, "e").replace(/[àâä]/g, "a").replace(/[îï]/g, "i").replace(/[ôö]/g, "o").replace(/[ûüù]/g, "u").replace(/ç/g, "c").replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, " ").trim();
  return normalized || null;
}
async function isCityDispatchEnabled(base44, countryCode) {
  const code = String(countryCode || "").toUpperCase();
  if (!code) return false;
  const cached = CITY_FLAG_CACHE.get(code);
  if (cached && Date.now() < cached.expires) return cached.enabled;
  try {
    const cities = await base44.asServiceRole.entities.OperationalCity.filter({
      country_code: code,
      actif: true
    }, void 0, 1).catch(() => []);
    const enabled = (cities || []).length > 0;
    CITY_FLAG_CACHE.set(code, { enabled, expires: Date.now() + CITY_FLAG_CACHE_TTL_MS });
    return enabled;
  } catch {
    return false;
  }
}
async function loadQuartiersForCountry(base44, countryCode) {
  const code = String(countryCode || "").toUpperCase();
  if (!code) return [];
  const cached = QUARTIER_CACHE.get(code);
  if (cached && Date.now() < cached.expires) return cached.data;
  try {
    const quartiers = await base44.asServiceRole.entities.Quartier.filter({
      country_code: code,
      actif: true
    }, "nom", 500).catch(() => []);
    const data = (quartiers || []).filter((q) => q.latitude && q.longitude);
    QUARTIER_CACHE.set(code, { data, expires: Date.now() + QUARTIER_CACHE_TTL_MS });
    return data;
  } catch {
    return [];
  }
}
async function resolveCityFromGPS(base44, lat, lng, countryCode, maxDistanceKm = 30) {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const quartiers = await loadQuartiersForCountry(base44, countryCode);
  if (!quartiers || quartiers.length === 0) return null;
  let nearest = null;
  let nearestDist = Infinity;
  for (const q of quartiers) {
    const dist = haversineKm(lat, lng, q.latitude, q.longitude);
    if (dist === null) continue;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = q;
    }
  }
  if (!nearest || nearestDist > maxDistanceKm) return null;
  return normalizeCityName(nearest.ville_operationnelle) || normalizeCityName(nearest.ville) || normalizeCityName(nearest.nom);
}
async function getDriverOperationalCity(base44, livreur) {
  if (!livreur) return null;
  const storedCity = normalizeCityName(livreur.ville);
  if (storedCity) {
    const quartiers = await loadQuartiersForCountry(base44, livreur.country_code);
    const matchingQuartier = (quartiers || []).find(
      (q) => normalizeCityName(q.ville) === storedCity && q.ville_operationnelle
    );
    if (matchingQuartier) {
      return normalizeCityName(matchingQuartier.ville_operationnelle) || storedCity;
    }
    return storedCity;
  }
  const lat = Number(livreur.latitude);
  const lng = Number(livreur.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const gpsDate = livreur.derniere_position_date || livreur.last_seen_at;
  if (!gpsDate) return null;
  const gpsAgeMin = (Date.now() - new Date(gpsDate).getTime()) / 6e4;
  if (gpsAgeMin > 10) return null;
  return await resolveCityFromGPS(base44, lat, lng, livreur.country_code);
}
async function getCourseDepartureCity(base44, course) {
  if (!course) return null;
  const storedCity = normalizeCityName(course.ville_depart);
  if (storedCity) {
    const quartiers = await loadQuartiersForCountry(base44, course.country_code);
    const matchingQuartier = (quartiers || []).find(
      (q) => normalizeCityName(q.ville) === storedCity && q.ville_operationnelle
    );
    if (matchingQuartier) {
      return normalizeCityName(matchingQuartier.ville_operationnelle) || storedCity;
    }
    return storedCity;
  }
  const lat = Number(course.gps_depart_lat);
  const lng = Number(course.gps_depart_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return await resolveCityFromGPS(base44, lat, lng, course.country_code);
}
async function shouldUpdateDriverCity(base44, livreur, lat, lng, accuracyM) {
  if (livreur?.statut === "en_course") {
    return { shouldUpdate: false, reason: "driver_in_mission" };
  }
  if (accuracyM != null && Number.isFinite(Number(accuracyM)) && Number(accuracyM) > GPS_ACCURACY_THRESHOLD_M) {
    return { shouldUpdate: false, reason: "gps_accuracy_too_low" };
  }
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return { shouldUpdate: false, reason: "invalid_gps_coordinates" };
  }
  const quartiers = await loadQuartiersForCountry(base44, livreur?.country_code);
  if (!quartiers || quartiers.length === 0) {
    return { shouldUpdate: false, reason: "no_quartiers_available" };
  }
  let nearest = null;
  let nearestDist = Infinity;
  for (const q of quartiers) {
    const dist = haversineKm(lat, lng, q.latitude, q.longitude);
    if (dist === null) continue;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = q;
    }
  }
  if (!nearest || nearestDist > 30) {
    return { shouldUpdate: false, reason: "too_far_from_any_quartier" };
  }
  const resolvedCity = normalizeCityName(nearest.ville_operationnelle) || normalizeCityName(nearest.ville) || normalizeCityName(nearest.nom);
  if (!resolvedCity) {
    return { shouldUpdate: false, reason: "city_name_unresolved" };
  }
  const currentCity = normalizeCityName(livreur?.ville);
  let currentOperationalCity = currentCity;
  if (currentCity) {
    const matchingQ = (quartiers || []).find(
      (q) => normalizeCityName(q.ville) === currentCity && q.ville_operationnelle
    );
    if (matchingQ) {
      currentOperationalCity = normalizeCityName(matchingQ.ville_operationnelle) || currentCity;
    }
  }
  if (resolvedCity === currentOperationalCity || resolvedCity === currentCity) {
    return { shouldUpdate: false, reason: "same_city" };
  }
  if (currentOperationalCity) {
    let currentCityMinDist = Infinity;
    for (const q of quartiers) {
      const qCity = normalizeCityName(q.ville_operationnelle) || normalizeCityName(q.ville) || normalizeCityName(q.nom);
      if (qCity === currentOperationalCity) {
        const dist = haversineKm(lat, lng, q.latitude, q.longitude);
        if (dist !== null && dist < currentCityMinDist) {
          currentCityMinDist = dist;
        }
      }
    }
    if (currentCityMinDist < CITY_CHANGE_HYSTERESIS_KM) {
      return { shouldUpdate: false, reason: "within_hysteresis_zone_of_current_city" };
    }
  }
  return { shouldUpdate: true, newCity: resolvedCity, reason: "city_changed" };
}
function areCitiesCompatible(cityA, cityB) {
  if (!cityA || !cityB) return true;
  return cityA === cityB;
}
function invalidateQuartierCache(countryCode) {
  if (countryCode) {
    QUARTIER_CACHE.delete(String(countryCode).toUpperCase());
  } else {
    QUARTIER_CACHE.clear();
  }
}
function invalidateCityFlagCache(countryCode) {
  if (countryCode) {
    CITY_FLAG_CACHE.delete(String(countryCode).toUpperCase());
  } else {
    CITY_FLAG_CACHE.clear();
  }
}
var CITY_FLAG_PREFIX, CITY_FLAG_CACHE_TTL_MS, QUARTIER_CACHE_TTL_MS, GPS_ACCURACY_THRESHOLD_M, CITY_CHANGE_HYSTERESIS_KM, CITY_FLAG_CACHE, QUARTIER_CACHE;
var init_cityResolution = __esm({
  "frozen:base44/shared/cityResolution.ts"() {
    init_geoUtils();
    CITY_FLAG_PREFIX = "CITY_DISPATCH_ENABLED";
    CITY_FLAG_CACHE_TTL_MS = 30 * 1e3;
    QUARTIER_CACHE_TTL_MS = 10 * 60 * 1e3;
    GPS_ACCURACY_THRESHOLD_M = 100;
    CITY_CHANGE_HYSTERESIS_KM = 5;
    CITY_FLAG_CACHE = /* @__PURE__ */ new Map();
    QUARTIER_CACHE = /* @__PURE__ */ new Map();
  }
});

// frozen:base44/shared/operationalZones.ts
async function loadOperationalCities(base44, countryCode) {
  const code = String(countryCode || "").toUpperCase();
  if (!code) return [];
  const cached = OP_CITY_CACHE.get(code);
  if (cached && Date.now() < cached.expires) return cached.data;
  try {
    const cities = await base44.asServiceRole.entities.OperationalCity.filter({
      country_code: code
    }, "nom_affichage", 100).catch(() => []);
    const data = cities || [];
    OP_CITY_CACHE.set(code, { data, expires: Date.now() + OP_CITY_CACHE_TTL_MS });
    return data;
  } catch {
    return [];
  }
}
async function isOperationalCityActive(base44, countryCode, cityName) {
  if (!cityName) return false;
  const code = String(countryCode || "").toUpperCase();
  if (!code) return false;
  const normalized = normalizeCityName(cityName);
  if (!normalized) return false;
  const cities = await loadOperationalCities(base44, code);
  return cities.some((c) => c.actif === true && normalizeCityName(c.nom) === normalized);
}
async function hasAnyActiveCity(base44, countryCode) {
  const code = String(countryCode || "").toUpperCase();
  if (!code) return false;
  const cities = await loadOperationalCities(base44, code);
  return cities.some((c) => c.actif === true);
}
async function resolveOperationalCity(base44, lat, lng, countryCode, maxDistanceKm = 30) {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const quartiers = await loadQuartiersForCountry(base44, countryCode);
  if (!quartiers || quartiers.length === 0) return null;
  let nearest = null;
  let nearestDist = Infinity;
  for (const q of quartiers) {
    const dist = haversineKm(lat, lng, q.latitude, q.longitude);
    if (dist === null) continue;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = q;
    }
  }
  if (!nearest || nearestDist > maxDistanceKm) return null;
  return normalizeCityName(nearest.ville_operationnelle) || normalizeCityName(nearest.ville) || normalizeCityName(nearest.nom);
}
async function getDriverOperationalCity2(base44, livreur) {
  if (!livreur) return null;
  const storedCity = normalizeCityName(livreur.ville);
  if (storedCity) {
    const quartiers = await loadQuartiersForCountry(base44, livreur.country_code);
    const matchingQuartier = (quartiers || []).find(
      (q) => normalizeCityName(q.ville) === storedCity && q.ville_operationnelle
    );
    if (matchingQuartier) {
      return normalizeCityName(matchingQuartier.ville_operationnelle) || storedCity;
    }
    return storedCity;
  }
  const lat = Number(livreur.latitude);
  const lng = Number(livreur.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const gpsDate = livreur.derniere_position_date || livreur.last_seen_at;
  if (!gpsDate) return null;
  const gpsAgeMin = (Date.now() - new Date(gpsDate).getTime()) / 6e4;
  if (gpsAgeMin > 10) return null;
  return await resolveOperationalCity(base44, lat, lng, livreur.country_code);
}
async function getCourseOperationalCity(base44, course) {
  if (!course) return null;
  const storedCity = normalizeCityName(course.ville_depart);
  if (storedCity) {
    const quartiers = await loadQuartiersForCountry(base44, course.country_code);
    const matchingQuartier = (quartiers || []).find(
      (q) => normalizeCityName(q.ville) === storedCity && q.ville_operationnelle
    );
    if (matchingQuartier) {
      return normalizeCityName(matchingQuartier.ville_operationnelle) || storedCity;
    }
    return storedCity;
  }
  const lat = Number(course.gps_depart_lat);
  const lng = Number(course.gps_depart_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return await resolveOperationalCity(base44, lat, lng, course.country_code);
}
async function getOperationalZoneCityNames(base44, countryCode, operationalCity) {
  const quartiers = await loadQuartiersForCountry(base44, countryCode);
  const normalized = normalizeCityName(operationalCity);
  if (!normalized) return [];
  const cityNames = /* @__PURE__ */ new Set();
  cityNames.add(normalized);
  for (const q of quartiers || []) {
    const qOpCity = normalizeCityName(q.ville_operationnelle) || normalizeCityName(q.ville);
    if (qOpCity === normalized && q.ville) {
      cityNames.add(q.ville);
      const normalizedVille = normalizeCityName(q.ville);
      if (normalizedVille) cityNames.add(normalizedVille);
    }
  }
  return Array.from(cityNames);
}
async function getActivatedZoneCityNames(base44, countryCode, excludeCity) {
  const code = String(countryCode || "").toUpperCase();
  if (!code) return [];
  const cities = await loadOperationalCities(base44, code);
  const activeCities = cities.filter((c) => c.actif === true);
  if (activeCities.length === 0) return [];
  const excludeNormalized = excludeCity ? normalizeCityName(excludeCity) : null;
  const allCityNames = /* @__PURE__ */ new Set();
  for (const city of activeCities) {
    const cityNormalized = normalizeCityName(city.nom);
    if (excludeNormalized && cityNormalized === excludeNormalized) continue;
    const zoneCityNames = await getOperationalZoneCityNames(base44, code, city.nom);
    for (const name of zoneCityNames) {
      allCityNames.add(name);
    }
  }
  return Array.from(allCityNames);
}
async function shouldUpdateDriverOperationalCity(base44, livreur, lat, lng, accuracyM) {
  if (livreur?.statut === "en_course") {
    return { shouldUpdate: false, reason: "driver_in_mission" };
  }
  if (accuracyM != null && Number.isFinite(Number(accuracyM)) && Number(accuracyM) > GPS_ACCURACY_THRESHOLD_M2) {
    return { shouldUpdate: false, reason: "gps_accuracy_too_low" };
  }
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    return { shouldUpdate: false, reason: "invalid_gps_coordinates" };
  }
  const quartiers = await loadQuartiersForCountry(base44, livreur?.country_code);
  if (!quartiers || quartiers.length === 0) {
    return { shouldUpdate: false, reason: "no_quartiers_available" };
  }
  let nearest = null;
  let nearestDist = Infinity;
  for (const q of quartiers) {
    const dist = haversineKm(lat, lng, q.latitude, q.longitude);
    if (dist === null) continue;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = q;
    }
  }
  if (!nearest || nearestDist > 30) {
    return { shouldUpdate: false, reason: "too_far_from_any_quartier" };
  }
  const resolvedCity = normalizeCityName(nearest.ville_operationnelle) || normalizeCityName(nearest.ville) || normalizeCityName(nearest.nom);
  if (!resolvedCity) {
    return { shouldUpdate: false, reason: "city_name_unresolved" };
  }
  const currentCity = normalizeCityName(livreur?.ville);
  const currentOperationalCity = currentCity ? await getDriverOperationalCity2(base44, livreur) : null;
  if (resolvedCity === currentOperationalCity || resolvedCity === currentCity) {
    return { shouldUpdate: false, reason: "same_city" };
  }
  if (currentOperationalCity) {
    let currentCityMinDist = Infinity;
    for (const q of quartiers) {
      const qOpCity = normalizeCityName(q.ville_operationnelle) || normalizeCityName(q.ville);
      if (qOpCity === currentOperationalCity) {
        const dist = haversineKm(lat, lng, q.latitude, q.longitude);
        if (dist !== null && dist < currentCityMinDist) {
          currentCityMinDist = dist;
        }
      }
    }
    if (currentCityMinDist < CITY_CHANGE_HYSTERESIS_KM2) {
      return { shouldUpdate: false, reason: "within_hysteresis_zone_of_current_city" };
    }
  }
  return { shouldUpdate: true, newCity: resolvedCity, reason: "city_changed" };
}
function invalidateOperationalCityCache(countryCode) {
  if (countryCode) {
    OP_CITY_CACHE.delete(String(countryCode).toUpperCase());
  } else {
    OP_CITY_CACHE.clear();
  }
}
var OP_CITY_CACHE_TTL_MS, OP_CITY_CACHE, GPS_ACCURACY_THRESHOLD_M2, CITY_CHANGE_HYSTERESIS_KM2;
var init_operationalZones = __esm({
  "frozen:base44/shared/operationalZones.ts"() {
    init_cityResolution();
    init_geoUtils();
    OP_CITY_CACHE_TTL_MS = 30 * 1e3;
    OP_CITY_CACHE = /* @__PURE__ */ new Map();
    GPS_ACCURACY_THRESHOLD_M2 = 100;
    CITY_CHANGE_HYSTERESIS_KM2 = 5;
  }
});

// frozen:base44/shared/cityDispatchFilter.ts
var cityDispatchFilter_exports = {};
__export(cityDispatchFilter_exports, {
  buildCourseCityFilterForLivreur: () => buildCourseCityFilterForLivreur,
  buildCourseCityFilterFromCourse: () => buildCourseCityFilterFromCourse,
  buildLivreurCityFilter: () => buildLivreurCityFilter,
  verifyCityCompatibility: () => verifyCityCompatibility
});
async function buildLivreurCityFilter(base44, course) {
  const countryCode = String(course?.country_code || "").toUpperCase();
  if (!countryCode) return {};
  const courseCity = await getCourseDepartureCity(base44, course);
  if (!courseCity) return {};
  const isActive = await isOperationalCityActive(base44, countryCode, courseCity);
  if (!isActive) return {};
  const zoneCityNames = await getOperationalZoneCityNames(base44, countryCode, courseCity);
  if (zoneCityNames.length === 0) {
    return { ville: { $regex: courseCity, $options: "i" } };
  }
  return { ville: { $in: zoneCityNames } };
}
async function buildCourseCityFilterForLivreur(base44, livreur) {
  const countryCode = String(livreur?.country_code || "").toUpperCase();
  if (!countryCode) return {};
  const hasActive = await isCityDispatchEnabled(base44, countryCode);
  if (!hasActive) return {};
  const livreurCity = await getDriverOperationalCity(base44, livreur);
  const otherZoneCityNames = await getActivatedZoneCityNames(base44, countryCode, livreurCity);
  if (otherZoneCityNames.length === 0) return {};
  return { ville_depart: { $nin: otherZoneCityNames } };
}
async function verifyCityCompatibility(base44, course, livreur) {
  const countryCode = String(course?.country_code || "").toUpperCase();
  const courseCity = await getCourseDepartureCity(base44, course);
  if (!courseCity) return { compatible: true, courseCity: null };
  const isActive = await isOperationalCityActive(base44, countryCode, courseCity);
  if (!isActive) return { compatible: true, courseCity, reason: "zone_not_activated" };
  const livreurCity = await getDriverOperationalCity(base44, livreur);
  if (!livreurCity) return { compatible: true, courseCity, livreurCity, reason: "livreur_city_unknown" };
  if (!areCitiesCompatible(courseCity, livreurCity)) {
    return {
      compatible: false,
      reason: "city_mismatch",
      courseCity,
      livreurCity
    };
  }
  return { compatible: true, courseCity, livreurCity };
}
async function buildCourseCityFilterFromCourse(base44, course) {
  const countryCode = String(course?.country_code || "").toUpperCase();
  if (!countryCode) return {};
  const courseCity = await getCourseDepartureCity(base44, course);
  if (!courseCity) return {};
  const isActive = await isOperationalCityActive(base44, countryCode, courseCity);
  if (!isActive) return {};
  const zoneCityNames = await getOperationalZoneCityNames(base44, countryCode, courseCity);
  if (zoneCityNames.length === 0) {
    return { ville_depart: { $regex: courseCity, $options: "i" } };
  }
  return { ville_depart: { $in: zoneCityNames } };
}
var init_cityDispatchFilter = __esm({
  "frozen:base44/shared/cityDispatchFilter.ts"() {
    init_cityResolution();
    init_operationalZones();
  }
});

// frozen:base44/shared/livreurIdentityGuard.ts
var livreurIdentityGuard_exports = {};
__export(livreurIdentityGuard_exports, {
  verifyLivreurIdentity: () => verifyLivreurIdentity
});
async function verifyLivreurIdentity(base44, livreurId) {
  if (!livreurId) {
    return { verified: false, livreur: null, user: null, error: "livreur_id requis" };
  }
  let user;
  try {
    user = await base44.auth.me();
  } catch (_) {
    return { verified: false, livreur: null, user: null, error: "Authentification requise" };
  }
  if (!user || !user.email) {
    return { verified: false, livreur: null, user: null, error: "Utilisateur non authentifi\xE9" };
  }
  const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
  if (!livreur) {
    return { verified: false, livreur: null, user, error: "Livreur introuvable" };
  }
  const livreurUserEmail = (livreur.user_email || "").trim().toLowerCase();
  const livreurEmail = (livreur.email || "").trim().toLowerCase();
  const userEmail = (user.email || "").trim().toLowerCase();
  if (livreurUserEmail === userEmail) {
    return { verified: true, livreur, user };
  }
  if (livreurUserEmail && livreurUserEmail !== userEmail) {
    return {
      verified: false,
      livreur,
      user,
      error: "Ce profil livreur est li\xE9 \xE0 un autre compte utilisateur"
    };
  }
  if (livreurEmail && livreurEmail === userEmail) {
    await base44.asServiceRole.entities.Livreur.update(livreurId, {
      user_email: user.email
    }).catch(() => {
    });
    const livreurRelu = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
    if (livreurRelu && (livreurRelu.user_email || "").trim().toLowerCase() === userEmail) {
      return { verified: true, livreur: livreurRelu, user, auto_linked: true };
    }
    return { verified: false, livreur: livreurRelu || livreur, user, error: "\xC9chec de l'auto-liaison du profil" };
  }
  return {
    verified: false,
    livreur,
    user,
    error: "Ce profil livreur ne vous appartient pas"
  };
}
var init_livreurIdentityGuard = __esm({
  "frozen:base44/shared/livreurIdentityGuard.ts"() {
  }
});

// frozen:base44/shared/enterpriseFinance.ts
function normalizeEnterpriseId(value) {
  if (value === null || value === void 0 || value === "") return null;
  return String(value).trim();
}
function resolveEnterpriseId(user) {
  if (!user) return null;
  return user.enterprise_id || null;
}
function isEnterpriseAdmin(user) {
  if (!user) return false;
  return user.silgapp_role === "admin_entreprise" && !!user.enterprise_id;
}
function isSuperAdmin(user) {
  if (!user) return false;
  return user.role === "admin";
}
async function comptabiliserCommissionEnterprise(base44, course) {
  if (!course.enterprise_id) {
    return { success: false, skipped: "not_enterprise_course" };
  }
  if (course.enterprise_encours_comptabilise_at) {
    return {
      success: true,
      skipped: "already_comptabilised",
      montant: course.enterprise_encours_comptabilise_montant || 0
    };
  }
  if (course.statut !== "livree") {
    return { success: false, skipped: "not_delivered" };
  }
  const prixFinal = Number(course.prix_final);
  if (!Number.isFinite(prixFinal) || prixFinal <= 0) {
    return { success: false, skipped: "no_prix_final" };
  }
  const enterprises = await base44.entities.Enterprise.filter({
    enterprise_financier_id: course.enterprise_id
  });
  const enterprise = enterprises?.[0];
  if (!enterprise) {
    return { success: false, skipped: "enterprise_not_found" };
  }
  const taux = Number(course.enterprise_commission_rate_locked) >= 0 ? Number(course.enterprise_commission_rate_locked) : Number(enterprise.commission_silgapp_pct);
  const montant = Math.round(prixFinal * (taux / 100));
  const ancienSolde = Number(enterprise.montant_du_silgapp) || 0;
  const nouveauSolde = ancienSolde + montant;
  const requestId = `ENT_COMMISSION_${course.id}`;
  const existingLedger = await base44.entities.EnterpriseLedger.filter({
    request_id: requestId
  });
  if (existingLedger?.length > 0) {
    await base44.entities.CourseExterne.update(course.id, {
      enterprise_encours_comptabilise_at: existingLedger[0].created_date,
      enterprise_encours_comptabilise_montant: montant
    });
    return { success: true, skipped: "ledger_exists", montant };
  }
  await base44.entities.EnterpriseLedger.create({
    enterprise_id: enterprise.id,
    enterprise_financier_id: enterprise.enterprise_financier_id,
    course_id: course.id,
    type: "commission_course",
    montant,
    taux,
    prix_final: prixFinal,
    ancien_solde: ancienSolde,
    nouveau_solde: nouveauSolde,
    request_id: requestId
  });
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await base44.entities.CourseExterne.update(course.id, {
    enterprise_encours_comptabilise_at: now,
    enterprise_encours_comptabilise_montant: montant,
    enterprise_commission_amount: montant
  });
  await base44.entities.Enterprise.update(enterprise.id, {
    volume_courses_total: Number(enterprise.volume_courses_total || 0) + prixFinal,
    total_commissions_silgapp: Number(enterprise.total_commissions_silgapp || 0) + montant,
    montant_du_silgapp: nouveauSolde
  });
  return { success: true, montant, ancien_solde: ancienSolde, nouveau_solde: nouveauSolde };
}
async function enregistrerPaiementEnterprise(base44, enterpriseId, montant, request_id, moyen_paiement = "especes", reference, valide_par) {
  const existing = await base44.entities.EnterpriseLedger.filter({ request_id });
  if (existing?.length > 0) {
    return { success: true, skipped: "already_paid", montant: existing[0].montant };
  }
  const enterprises = await base44.entities.Enterprise.filter({ enterprise_financier_id: enterpriseId });
  const enterprise = enterprises?.[0];
  if (!enterprise) return { success: false, error: "enterprise_not_found" };
  const ancienSolde = Number(enterprise.montant_du_silgapp) || 0;
  const nouveauSolde = Math.max(0, ancienSolde - montant);
  await base44.entities.EnterpriseLedger.create({
    enterprise_id: enterprise.id,
    enterprise_financier_id: enterprise.enterprise_financier_id,
    type: "paiement",
    montant,
    ancien_solde: ancienSolde,
    nouveau_solde: nouveauSolde,
    request_id,
    moyen_paiement,
    reference,
    valide_par
  });
  await base44.entities.Enterprise.update(enterprise.id, {
    total_paiements: Number(enterprise.total_paiements || 0) + montant,
    montant_du_silgapp: nouveauSolde
  });
  return { success: true, montant, ancien_solde: ancienSolde, nouveau_solde: nouveauSolde };
}
async function modifierTauxEnterprise(base44, enterpriseId, nouveauTaux, valide_par, motif) {
  const enterprises = await base44.entities.Enterprise.filter({ enterprise_financier_id: enterpriseId });
  const enterprise = enterprises?.[0];
  if (!enterprise) return { success: false, error: "enterprise_not_found" };
  const ancienTaux = Number(enterprise.commission_silgapp_pct) || 0;
  if (ancienTaux === nouveauTaux) {
    return { success: true, skipped: "same_rate", ancien_taux: ancienTaux, nouveau_taux: nouveauTaux };
  }
  await base44.entities.Enterprise.update(enterprise.id, {
    commission_silgapp_pct: nouveauTaux
  });
  const requestId = `ENT_TAUX_${enterprise.id}_${Date.now()}`;
  await base44.entities.EnterpriseLedger.create({
    enterprise_id: enterprise.id,
    enterprise_financier_id: enterprise.enterprise_financier_id,
    type: "ajustement_admin",
    montant: 0,
    ancien_solde: Number(enterprise.montant_du_silgapp) || 0,
    nouveau_solde: Number(enterprise.montant_du_silgapp) || 0,
    request_id: requestId,
    motif: `Changement de taux: ${ancienTaux}% \u2192 ${nouveauTaux}%. ${motif || ""}`.trim(),
    taux_ancien: ancienTaux,
    taux_nouveau: nouveauTaux,
    valide_par
  });
  return { success: true, ancien_taux: ancienTaux, nouveau_taux: nouveauTaux };
}
async function checkEnterpriseActive(base44, enterpriseId) {
  if (!enterpriseId) return { active: true, suspended: false };
  try {
    const enterprises = await base44.entities.Enterprise.filter({
      enterprise_financier_id: enterpriseId
    });
    const enterprise = enterprises?.[0];
    if (!enterprise) return { active: false, suspended: false };
    const isActive = enterprise.actif === true && enterprise.statut === "actif";
    return { active: isActive, suspended: !isActive, enterprise };
  } catch {
    return { active: false, suspended: false };
  }
}
function generateEnterpriseFinancierId() {
  return "ent_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
function generateSlug(nom) {
  return nom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}
var init_enterpriseFinance = __esm({
  "frozen:base44/shared/enterpriseFinance.ts"() {
  }
});

// frozen:base44/shared/onRoutePriorityReservation.ts
var onRoutePriorityReservation_exports = {};
__export(onRoutePriorityReservation_exports, {
  createExclusiveReservation: () => createExclusiveReservation,
  findBestOnRouteDriver: () => findBestOnRouteDriver,
  releaseExpiredOnRouteReservations: () => releaseExpiredOnRouteReservations,
  releaseExpiredReservationsLazy: () => releaseExpiredReservationsLazy,
  releaseReservationAfterRefusal: () => releaseReservationAfterRefusal
});
function hasUsableRoutePoints(course) {
  return Number.isFinite(Number(course?.gps_depart_lat)) && Number.isFinite(Number(course?.gps_depart_lng)) && Number.isFinite(Number(course?.gps_arrivee_lat)) && Number.isFinite(Number(course?.gps_arrivee_lng));
}
function calculerDistance(lat1, lon1, lat2, lon2) {
  const aLat = Number(lat1);
  const aLon = Number(lon1);
  const bLat = Number(lat2);
  const bLon = Number(lon2);
  if (![aLat, aLon, bLat, bLon].every(Number.isFinite)) return null;
  const toRad = (value) => value * Math.PI / 180;
  const earthKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function routeDistanceKm(course) {
  if (!hasUsableRoutePoints(course)) return null;
  return calculerDistance(course.gps_depart_lat, course.gps_depart_lng, course.gps_arrivee_lat, course.gps_arrivee_lng);
}
function detourViaPickupKm(activeCourse, candidate) {
  if (!hasUsableRoutePoints(activeCourse) || !hasUsableRoutePoints(candidate)) return null;
  const directKm = routeDistanceKm(activeCourse);
  const toCandidatePickupKm = calculerDistance(
    activeCourse.gps_depart_lat,
    activeCourse.gps_depart_lng,
    candidate.gps_depart_lat,
    candidate.gps_depart_lng
  );
  const candidatePickupToActiveDropKm = calculerDistance(
    candidate.gps_depart_lat,
    candidate.gps_depart_lng,
    activeCourse.gps_arrivee_lat,
    activeCourse.gps_arrivee_lng
  );
  if ([directKm, toCandidatePickupKm, candidatePickupToActiveDropKm].some((v) => v == null || !Number.isFinite(Number(v)))) return null;
  return Math.max(0, Number(toCandidatePickupKm) + Number(candidatePickupToActiveDropKm) - Number(directKm));
}
function destinationChainKm(activeCourse, candidate) {
  if (!hasUsableRoutePoints(activeCourse) || !hasUsableRoutePoints(candidate)) return null;
  return calculerDistance(
    activeCourse.gps_arrivee_lat,
    activeCourse.gps_arrivee_lng,
    candidate.gps_depart_lat,
    candidate.gps_depart_lng
  );
}
function prixCourse(course) {
  return Number(course?.prix_final || course?.prix_propose_client || course?.prix_propose_admin || course?.prix_estimate || 0) || 0;
}
function evaluateOnRouteCompatibility(activeCourses, candidate, config) {
  if (!hasUsableRoutePoints(candidate)) return null;
  const maxDetourKm = Number(config?.maxDetourKm) || 6;
  let best = null;
  for (const active of activeCourses || []) {
    if (!hasUsableRoutePoints(active)) continue;
    const onRouteDetourKm = detourViaPickupKm(active, candidate);
    if (onRouteDetourKm != null && onRouteDetourKm <= maxDetourKm) {
      const score = Math.max(1, Math.round(100 - onRouteDetourKm / Math.max(maxDetourKm, 0.1) * 45));
      const item = {
        scenario: "on_route",
        active_course_id: active.id,
        extra_km_estimate: Number(onRouteDetourKm.toFixed(2)),
        destination_pickup_km: null,
        score
      };
      if (!best || item.score > best.score) best = item;
    }
    const chainKm = destinationChainKm(active, candidate);
    if (chainKm != null && chainKm <= maxDetourKm) {
      const score = Math.max(1, Math.round(100 - chainKm / Math.max(maxDetourKm, 0.1) * 35));
      const item = {
        scenario: "destination_chain",
        active_course_id: active.id,
        extra_km_estimate: Number(chainKm.toFixed(2)),
        destination_pickup_km: Number(chainKm.toFixed(2)),
        score
      };
      if (!best || item.score > best.score) best = item;
    }
  }
  return best;
}
async function findBestOnRouteDriver(base44, course, config) {
  const courseEnterpriseId = normalizeEnterpriseId(course.enterprise_id);
  const activeCourses = await base44.asServiceRole.entities.CourseExterne.filter({
    country_code: course.country_code,
    statut: { $in: ACTIVE_STATUSES },
    livreur_id: { $exists: true }
  }, "-updated_date", 50).catch(() => []);
  const driverCoursesMap = /* @__PURE__ */ new Map();
  for (const ac of activeCourses || []) {
    if (!ac?.livreur_id) continue;
    if (normalizeEnterpriseId(ac.enterprise_id) !== courseEnterpriseId) continue;
    const list = driverCoursesMap.get(ac.livreur_id) || [];
    list.push(ac);
    driverCoursesMap.set(ac.livreur_id, list);
  }
  if (driverCoursesMap.size === 0) return null;
  let bestDriver = null;
  let bestScore = -1;
  let bestCompatibility = null;
  let bestActiveCourses = [];
  for (const [livreurId, courses] of driverCoursesMap.entries()) {
    const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
    if (!livreur) continue;
    if (livreur.validation !== "valide") continue;
    if (livreur.manual_hors_ligne === true) continue;
    if (livreur.bloque_encours === true) continue;
    if (normalizeEnterpriseId(livreur.enterprise_id) !== courseEnterpriseId) continue;
    const compatibility = evaluateOnRouteCompatibility(courses, course, config);
    if (!compatibility || compatibility.score < 1) continue;
    if (compatibility.score > bestScore) {
      bestScore = compatibility.score;
      bestDriver = livreur;
      bestCompatibility = compatibility;
      bestActiveCourses = courses;
    }
  }
  if (!bestDriver) return null;
  return {
    livreurId: bestDriver.id,
    livreur: bestDriver,
    activeCourses: bestActiveCourses,
    compatibility: bestCompatibility
  };
}
async function createExclusiveReservation(base44, course, config) {
  if (!config.onRoutePriorityEnabled) {
    return { created: false, reason: "priority_disabled" };
  }
  const best = await findBestOnRouteDriver(base44, course, config);
  if (!best) {
    return { created: false, reason: "no_compatible_driver" };
  }
  const now = Date.now();
  const prioritySec = config.onRoutePrioritySec || 15;
  const reservationExpiresAt = new Date(now + prioritySec * 1e3).toISOString();
  const existing = await base44.asServiceRole.entities.EcoProposal.filter({
    course_id: course.id,
    status: "pending",
    is_exclusive: true
  }, "-created_date", 1).catch(() => []);
  if (existing?.[0]) {
    return { created: false, reason: "reservation_already_exists" };
  }
  const gainAmount = Math.max(0, prixCourse(course) - (Number(course.commission_silga) || 0));
  if (gainAmount < (config.minDriverGain || 0)) {
    return { created: false, reason: "gain_below_threshold" };
  }
  const courseEnterpriseId = normalizeEnterpriseId(course.enterprise_id);
  const proposal = await base44.asServiceRole.entities.EcoProposal.create({
    country_code: course.country_code,
    enterprise_id: courseEnterpriseId,
    course_id: course.id,
    livreur_id: best.livreurId,
    livreur_user_email: best.livreur.user_email || null,
    proposal_type: "on_route_offer",
    proposal_scenario: best.compatibility.scenario,
    status: "pending",
    is_exclusive: true,
    reservation_expires_at: reservationExpiresAt,
    expires_at: reservationExpiresAt,
    gain_amount: gainAmount,
    route_delta_json: JSON.stringify({
      source: "priority_exclusive",
      scenario: best.compatibility.scenario,
      active_course_id: best.compatibility.active_course_id,
      extra_km_estimate: best.compatibility.extra_km_estimate,
      destination_pickup_km: best.compatibility.destination_pickup_km,
      score: best.compatibility.score,
      max_detour_km: config.maxDetourKm,
      priority_sec: prioritySec,
      note: "ORS reserved for top candidates only"
    })
  });
  if (best.livreur.user_email) {
    const notifTitle = "SILGAPP \u2014 Livraison sur votre trajet !";
    const notifMessage = "Une nouvelle livraison compatible avec votre trajet est disponible. Vous avez 15 secondes pour accepter.";
    try {
      await base44.asServiceRole.entities.Notification.create({
        titre: notifTitle,
        message: notifMessage,
        type: "on_route_proposal",
        destinataire_email: best.livreur.user_email,
        course_id: course.id,
        lue: false,
        deduplication_key: `ON_ROUTE_EXCLUSIVE_${proposal.id}`
      });
    } catch (notifError) {
      console.error("[createExclusiveReservation] Notification record failed:", notifError?.message || String(notifError));
    }
    try {
      await base44.asServiceRole.functions.invoke("envoiNotificationPush", {
        titre: notifTitle,
        message: notifMessage,
        type: "on_route_proposal",
        destinataire_email: best.livreur.user_email,
        livreur_id: best.livreurId,
        course_id: course.id,
        category: "on_route_proposal",
        alert_duration_seconds: prioritySec
      });
    } catch (pushError) {
      console.error("[createExclusiveReservation] FCM push failed:", pushError?.message || String(pushError));
    }
  }
  return { created: true, livreurId: best.livreurId, proposalId: proposal.id };
}
async function releaseSingleExpiredReservation(base44, proposal, now) {
  try {
    const claim = await base44.asServiceRole.entities.EcoProposal.updateMany(
      { id: proposal.id, status: "pending" },
      { $set: { status: "expired", responded_at: now } }
    );
    if (!claim || claim.updated !== 1) return { released: false, courseReleased: false };
    const course = await base44.asServiceRole.entities.CourseExterne.get(proposal.course_id).catch(() => null);
    if (!course) return { released: true, courseReleased: false };
    if (TERMINAL_STATUSES.includes(course.statut) || course.livreur_id || course.accepted_by_livreur_id) {
      return { released: true, courseReleased: false };
    }
    if (course.delivery_mode === "eco" && course.eco_status === "isolated") {
      return { released: true, courseReleased: false };
    }
    const releaseClaim = await base44.asServiceRole.entities.CourseExterne.updateMany(
      {
        id: course.id,
        dispatch_status: { $in: ["en_attente", "propose"] },
        livreur_id: null,
        accepted_by_livreur_id: null
      },
      {
        $set: {
          dispatch_status: "disponible_push",
          statut: "recherche_livreur",
          heure_sollicitation: now
        }
      }
    );
    if (releaseClaim?.updated === 1) {
      await base44.asServiceRole.functions.invoke("dispatchExterneAuto", {
        action: "lancer_recherche_auto",
        course_id: course.id
      }).catch(() => null);
      return { released: true, courseReleased: true };
    }
    return { released: true, courseReleased: false };
  } catch (e) {
    return { released: false, courseReleased: false, error: e?.message || String(e) };
  }
}
async function releaseExpiredReservationsLazy(base44, countryCode, limit = 10) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const filter = {
    status: "pending",
    is_exclusive: true,
    reservation_expires_at: { $lte: now }
  };
  if (countryCode) filter.country_code = String(countryCode).toUpperCase();
  const expiredProposals = await base44.asServiceRole.entities.EcoProposal.filter(filter, "reservation_expires_at", limit).catch(() => []);
  if (!expiredProposals?.length) return { success: true, released: 0, coursesReleased: 0 };
  let released = 0;
  let coursesReleased = 0;
  const errors = [];
  for (const proposal of expiredProposals) {
    const result2 = await releaseSingleExpiredReservation(base44, proposal, now);
    if (result2.released) released++;
    if (result2.courseReleased) coursesReleased++;
    if (result2.error) errors.push({ proposal_id: proposal.id, error: result2.error });
  }
  return { success: true, released, coursesReleased, errors: errors.length > 0 ? errors : void 0 };
}
async function releaseExpiredOnRouteReservations(base44, limit = 50) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const filter = {
    status: "pending",
    is_exclusive: true,
    reservation_expires_at: { $lte: now }
  };
  const expiredProposals = await base44.asServiceRole.entities.EcoProposal.filter(filter, "reservation_expires_at", limit).catch(() => []);
  if (!expiredProposals?.length) return { success: true, released: 0, coursesReleased: 0 };
  let released = 0;
  let coursesReleased = 0;
  const errors = [];
  for (const proposal of expiredProposals) {
    const result2 = await releaseSingleExpiredReservation(base44, proposal, now);
    if (result2.released) released++;
    if (result2.courseReleased) coursesReleased++;
    if (result2.error) errors.push({ proposal_id: proposal.id, error: result2.error });
  }
  return { success: true, released, coursesReleased, errors: errors.length > 0 ? errors : void 0 };
}
async function releaseReservationAfterRefusal(base44, courseId) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId).catch(() => null);
  if (!course) return { released: false, reason: "course_not_found" };
  if (TERMINAL_STATUSES.includes(course.statut) || course.livreur_id || course.accepted_by_livreur_id) {
    return { released: false, reason: "course_already_assigned" };
  }
  if (course.delivery_mode === "eco" && course.eco_status === "isolated") {
    return { released: false, reason: "eco_course_stays_isolated" };
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const releaseClaim = await base44.asServiceRole.entities.CourseExterne.updateMany(
    {
      id: course.id,
      dispatch_status: { $in: ["en_attente", "propose"] },
      livreur_id: null,
      accepted_by_livreur_id: null
    },
    {
      $set: {
        dispatch_status: "disponible_push",
        statut: "recherche_livreur",
        heure_sollicitation: now
      }
    }
  );
  if (releaseClaim?.updated === 1) {
    await base44.asServiceRole.functions.invoke("dispatchExterneAuto", {
      action: "lancer_recherche_auto",
      course_id: course.id
    }).catch(() => null);
    return { released: true };
  }
  return { released: false, reason: "release_lost_race" };
}
var ACTIVE_STATUSES, TERMINAL_STATUSES;
var init_onRoutePriorityReservation = __esm({
  "frozen:base44/shared/onRoutePriorityReservation.ts"() {
    init_enterpriseFinance();
    ACTIVE_STATUSES = [
      "livreur_en_route",
      "client_contacte",
      "en_route_expediteur",
      "arrive_prise_en_charge",
      "colis_recupere",
      "passager_embarque",
      "pris_en_charge",
      "en_livraison",
      "arrivee"
    ];
    TERMINAL_STATUSES = ["livree", "annulee", "completed", "delivered", "canceled"];
  }
});

// frozen:base44/shared/ecoRouteOptimizer.ts
var ecoRouteOptimizer_exports = {};
__export(ecoRouteOptimizer_exports, {
  buildRoutePlanJSON: () => buildRoutePlanJSON,
  computeRouteDistance: () => computeRouteDistance,
  extractDriverGPS: () => extractDriverGPS,
  generateValidPermutations: () => generateValidPermutations,
  optimizeEcoRoutePreservingCompleted: () => optimizeEcoRoutePreservingCompleted,
  optimizeEcoRouteWithDriverGPS: () => optimizeEcoRouteWithDriverGPS,
  selectBestRoute: () => selectBestRoute
});
function extractDriverGPS(livreur) {
  if (!livreur) return null;
  const lat = Number(livreur.latitude);
  const lng = Number(livreur.longitude);
  if (!isValidCoord(lat, lng)) {
    return {
      lat: 0,
      lng: 0,
      timestamp: "",
      isReliable: false,
      reason: "invalid_coordinates"
    };
  }
  const gpsDate = livreur.derniere_position_date || livreur.last_seen_at;
  if (!gpsDate) {
    return {
      lat,
      lng,
      timestamp: "",
      isReliable: false,
      reason: "no_timestamp"
    };
  }
  const gpsAgeMin = (Date.now() - new Date(gpsDate).getTime()) / 6e4;
  if (gpsAgeMin > GPS_MAX_AGE_MINUTES) {
    return {
      lat,
      lng,
      timestamp: gpsDate,
      isReliable: false,
      reason: "gps_too_old"
    };
  }
  const accuracyM = Number(livreur.gps_accuracy);
  if (Number.isFinite(accuracyM) && accuracyM > GPS_MIN_ACCURACY_M) {
    return {
      lat,
      lng,
      accuracyM,
      timestamp: gpsDate,
      isReliable: false,
      reason: "gps_accuracy_too_low"
    };
  }
  return {
    lat,
    lng,
    accuracyM: Number.isFinite(accuracyM) ? accuracyM : void 0,
    timestamp: gpsDate,
    isReliable: true
  };
}
function generateValidPermutations(courses) {
  if (!courses || courses.length === 0) return [];
  const n = courses.length;
  const validPermutations = [];
  const allSteps = [];
  for (let i = 0; i < n; i++) {
    const course = courses[i];
    allSteps.push({
      type: "pickup",
      courseIdx: i,
      course_id: course.id,
      lat: course.gps_depart_lat ?? null,
      lng: course.gps_depart_lng ?? null
    });
    allSteps.push({
      type: "delivery",
      courseIdx: i,
      course_id: course.id,
      lat: course.gps_arrivee_lat ?? null,
      lng: course.gps_arrivee_lng ?? null
    });
  }
  const indices = Array.from({ length: 2 * n }, (_, i) => i);
  const allIndexPermutations = permuteArray(indices);
  const seenSignatures = /* @__PURE__ */ new Set();
  for (const perm of allIndexPermutations) {
    let isValid = true;
    for (let courseIdx = 0; courseIdx < n; courseIdx++) {
      const pickupPos = perm.findIndex((stepIdx) => {
        const step = allSteps[stepIdx];
        return step.courseIdx === courseIdx && step.type === "pickup";
      });
      const deliveryPos = perm.findIndex((stepIdx) => {
        const step = allSteps[stepIdx];
        return step.courseIdx === courseIdx && step.type === "delivery";
      });
      if (pickupPos > deliveryPos) {
        isValid = false;
        break;
      }
    }
    if (!isValid) continue;
    const steps = perm.map((stepIdx, order) => {
      const step = allSteps[stepIdx];
      return {
        type: step.type,
        course_id: step.course_id,
        order: order + 1,
        status: "pending",
        lat: step.lat,
        lng: step.lng
      };
    });
    const signature = steps.map((s) => `${s.course_id}:${s.type}`).join("|");
    if (seenSignatures.has(signature)) continue;
    seenSignatures.add(signature);
    validPermutations.push(steps);
  }
  return validPermutations;
}
function permuteArray(arr) {
  if (arr.length <= 1) return [arr];
  const result2 = [];
  function generate(k, current) {
    if (k === 1) {
      result2.push([...current]);
      return;
    }
    for (let i = 0; i < k; i++) {
      generate(k - 1, current);
      if (k % 2 === 0) {
        [current[i], current[k - 1]] = [current[k - 1], current[i]];
      } else {
        [current[0], current[k - 1]] = [current[k - 1], current[0]];
      }
    }
  }
  generate(arr.length, [...arr]);
  return result2;
}
function computeRouteDistance(steps, driverLat, driverLng) {
  if (!steps || steps.length === 0) return null;
  let totalKm = 0;
  let prevLat = driverLat;
  let prevLng = driverLng;
  let driverToFirstKm = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.lat == null || step.lng == null) return null;
    const dist = haversineKm(prevLat, prevLng, step.lat, step.lng);
    if (dist === null) return null;
    totalKm += dist;
    if (i === 0) driverToFirstKm = dist;
    prevLat = step.lat;
    prevLng = step.lng;
  }
  return { totalKm, driverToFirstKm };
}
function selectBestRoute(courses, driverGPS) {
  if (!driverGPS.isReliable) return null;
  const permutations = generateValidPermutations(courses);
  if (permutations.length === 0) return null;
  let best = null;
  for (const steps of permutations) {
    const allCoordsValid = steps.every(
      (s) => isValidCoord(s.lat, s.lng)
    );
    if (!allCoordsValid) continue;
    const dist = computeRouteDistance(steps, driverGPS.lat, driverGPS.lng);
    if (!dist) continue;
    const perm = {
      steps,
      totalDistanceKm: dist.totalKm,
      driverToFirstKm: dist.driverToFirstKm,
      isValid: true
    };
    if (!best || perm.totalDistanceKm < best.totalDistanceKm) {
      best = perm;
    }
  }
  return best;
}
function buildRoutePlanJSON(permutation) {
  return JSON.stringify(permutation.steps);
}
async function optimizeEcoRouteWithDriverGPS(base44, courses, livreur, existingRoutePlanJSON) {
  const driverGPS = extractDriverGPS(livreur);
  if (!driverGPS || !driverGPS.isReliable) {
    console.log(`[ecoRouteOptimizer] GPS non fiable, conservation de l'itin\xE9raire provisoire. Raison: ${driverGPS?.reason || "unknown"}`);
    return {
      routePlanJSON: existingRoutePlanJSON || JSON.stringify(buildFallbackRoutePlan(courses)),
      optimized: false,
      reason: driverGPS?.reason || "gps_unavailable"
    };
  }
  const best = selectBestRoute(courses, driverGPS);
  if (!best) {
    console.log("[ecoRouteOptimizer] Aucune permutation valide trouv\xE9e, conservation de l'itin\xE9raire provisoire");
    return {
      routePlanJSON: existingRoutePlanJSON || JSON.stringify(buildFallbackRoutePlan(courses)),
      optimized: false,
      reason: "no_valid_permutation"
    };
  }
  const routePlanJSON = buildRoutePlanJSON(best);
  console.log(`[ecoRouteOptimizer] Itin\xE9raire optimis\xE9: ${best.totalDistanceKm.toFixed(2)} km (livreur\u2192premier: ${best.driverToFirstKm.toFixed(2)} km)`);
  return {
    routePlanJSON,
    optimized: true,
    reason: "optimized_with_driver_gps",
    distanceKm: best.totalDistanceKm
  };
}
function buildFallbackRoutePlan(courses) {
  const steps = [];
  let order = 1;
  for (const course of courses) {
    steps.push({
      type: "pickup",
      course_id: course.id,
      order: order++,
      status: "pending",
      lat: course.gps_depart_lat ?? null,
      lng: course.gps_depart_lng ?? null
    });
  }
  for (const course of courses) {
    steps.push({
      type: "delivery",
      course_id: course.id,
      order: order++,
      status: "pending",
      lat: course.gps_arrivee_lat ?? null,
      lng: course.gps_arrivee_lng ?? null
    });
  }
  return steps;
}
async function optimizeEcoRoutePreservingCompleted(base44, courses, livreur, existingRoutePlanJSON) {
  let existingSteps = [];
  try {
    existingSteps = existingRoutePlanJSON ? JSON.parse(existingRoutePlanJSON) : [];
  } catch {
    existingSteps = [];
  }
  const completedSteps = existingSteps.filter((s) => s.status === "completed");
  const cancelledSteps = existingSteps.filter((s) => s.status === "cancelled");
  const pendingSteps = existingSteps.filter((s) => s.status === "pending");
  if (completedSteps.length === 0 && cancelledSteps.length === 0) {
    return optimizeEcoRouteWithDriverGPS(base44, courses, livreur, existingRoutePlanJSON);
  }
  const completedCourseIds = new Set(completedSteps.map((s) => s.course_id));
  const remainingCourses = courses.filter((c) => !completedCourseIds.has(c.id));
  if (remainingCourses.length < 2) {
    return {
      routePlanJSON: existingRoutePlanJSON || JSON.stringify(buildFallbackRoutePlan(courses)),
      optimized: false,
      reason: "less_than_two_remaining_courses"
    };
  }
  const driverGPS = extractDriverGPS(livreur);
  if (!driverGPS || !driverGPS.isReliable) {
    return {
      routePlanJSON: existingRoutePlanJSON || JSON.stringify(buildFallbackRoutePlan(courses)),
      optimized: false,
      reason: driverGPS?.reason || "gps_unavailable"
    };
  }
  const best = selectBestRoute(remainingCourses, driverGPS);
  if (!best) {
    return {
      routePlanJSON: existingRoutePlanJSON || JSON.stringify(buildFallbackRoutePlan(courses)),
      optimized: false,
      reason: "no_valid_permutation"
    };
  }
  const mergedSteps = [
    ...completedSteps.map((s, i) => ({ ...s, order: i + 1 })),
    ...best.steps.map((s, i) => ({ ...s, order: completedSteps.length + i + 1 }))
  ];
  return {
    routePlanJSON: JSON.stringify(mergedSteps),
    optimized: true,
    reason: "optimized_preserving_completed",
    distanceKm: best.totalDistanceKm
  };
}
var ORS_VALIDATION_THRESHOLD_KM, GPS_MAX_AGE_MINUTES, GPS_MIN_ACCURACY_M;
var init_ecoRouteOptimizer = __esm({
  "frozen:base44/shared/ecoRouteOptimizer.ts"() {
    init_geoUtils();
    ORS_VALIDATION_THRESHOLD_KM = 0.5;
    GPS_MAX_AGE_MINUTES = 10;
    GPS_MIN_ACCURACY_M = 100;
  }
});

// frozen:base44/shared/admissionCausality.js
function resolveAdmissionHead(rows) {
  const fail4 = () => {
    throw Object.assign(new Error("LOYALTY_ADMISSION_BRANCH_AMBIGUOUS"), { code: "LOYALTY_ADMISSION_BRANCH_AMBIGUOUS", status: 503 });
  };
  if (!rows.length) return null;
  const by = new Map(rows.map((r) => [r.proof_id, r]));
  if (by.size !== rows.length) fail4();
  const ancestors = /* @__PURE__ */ new Map();
  function lineage(r, visiting = /* @__PURE__ */ new Set()) {
    if (ancestors.has(r.proof_id)) return ancestors.get(r.proof_id);
    if (visiting.has(r.proof_id)) fail4();
    visiting.add(r.proof_id);
    const ids = /* @__PURE__ */ new Set([r.proof_id]), parent = r.payload.basis_proof_id;
    if (parent !== null) {
      const p = by.get(parent);
      if (!p || p.subject_id !== r.subject_id || p.kind !== "admission" || Date.parse(p.issued_at) > Date.parse(r.issued_at)) fail4();
      for (const x of lineage(p, visiting)) ids.add(x);
    }
    visiting.delete(r.proof_id);
    ancestors.set(r.proof_id, ids);
    return ids;
  }
  for (const r of rows) lineage(r);
  const barriers = rows.filter((r) => r.payload.state === "revoked");
  const candidates = rows.filter((r) => barriers.every((b) => ancestors.get(r.proof_id).has(b.proof_id)));
  const heads = candidates.filter((r) => !candidates.some((x) => x !== r && ancestors.get(x.proof_id).has(r.proof_id)));
  if (heads.length !== 1) fail4();
  return heads[0];
}

// frozen:base44/shared/loyaltyProgress.js
var LOYALTY_VERSION = 1;
var LOYALTY_TIERS = Object.freeze(["Bronze", "Argent", "Or", "Platinium"]);
function loyaltyProgress(completed) {
  if (!Number.isSafeInteger(completed) || completed < 0) throw new Error("INVALID_LOYALTY_COUNT");
  const tierIndex = Math.min(3, Math.floor(completed / 50));
  const stars = Math.min(5, Math.floor((completed - tierIndex * 50) / 10));
  return {
    completed,
    tierIndex,
    tier: LOYALTY_TIERS[tierIndex],
    stars,
    milestone: Math.min(20, Math.floor(completed / 10))
  };
}
function advanceLoyalty(previous, next) {
  const now = loyaltyProgress(next);
  if (!previous) return { highWater: now.milestone, event: null };
  const highWater = Math.max(previous.highWater, now.milestone);
  if (now.milestone <= previous.highWater) return { highWater, event: null };
  const oldTier = Math.min(3, Math.floor(previous.highWater / 5));
  return { highWater, event: now.tierIndex > oldTier ? "tier" : "star" };
}

// frozen:base44/shared/ledgerPolicy.js
var CAPTURE_BOUNDARY_SEMANTICS = "protected-epoch-open-v1";
var DRIVER_EVIDENCE_SEMANTICS = "native-driver-binding-v1";
var START = "2026-11-13T00:00:00.000Z";
var ENTITY = "ClientLoyaltyEvidence";
var branded = /* @__PURE__ */ new WeakSet();
var fail = (code) => {
  throw Object.assign(new Error(code), { code, status: 503 });
};
var iso = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
var id = (s) => typeof s === "string" && s.length > 0 && s.length <= 200 && !/\s|[\x00-\x1f\x7f]/.test(s);
var hash = (s) => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
var uuid = (s) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
function parseLedgerPolicy(raw, now = Date.now()) {
  const v = raw?.validation;
  if (!raw || raw.version !== 1 || raw.protocol !== "closed-ledger-v1" || raw.capture_boundary_semantics !== CAPTURE_BOUNDARY_SEMANTICS || raw.driver_evidence_semantics !== DRIVER_EVIDENCE_SEMANTICS || raw.entity !== ENTITY || !id(raw.policy_id) || !uuid(raw.epoch_id) || raw.programme_start_at !== START || raw.time_zone !== "Africa/Ouagadougou" || !iso(raw.capture_effective_at) || !v || v.state !== "validated" || !id(v.operator_id) || !iso(v.validated_at) || Date.parse(v.validated_at) > now || Date.parse(raw.capture_effective_at) > Date.parse(v.validated_at)) fail("LOYALTY_LEDGER_POLICY_INVALID");
  for (const name of ["schema_sha256", "published_writers_sha256", "published_finalizer_sha256", "legacy_fixed_writer_audit_sha256", "permission_test_sha256", "registry_setup_sha256"]) if (!hash(v[name])) fail("LOYALTY_LEDGER_SETUP_UNVERIFIED");
  for (const name of ["ordinary_crud_denied", "new_namespace_verified_empty", "published_writers_verified", "legacy_writers_cannot_target_registry", "native_origin_authority_verified", "native_admission_authority_verified", "protected_commit_authority_verified", "no_automation_state_to_proof", "all_public_paths_covered"]) if (v[name] !== true) fail("LOYALTY_LEDGER_SETUP_UNVERIFIED");
  const p = Object.freeze({ ...raw, validation: Object.freeze({ ...v }) });
  branded.add(p);
  return p;
}
function assertLedgerPolicy(p) {
  if (!branded.has(p)) fail("LOYALTY_LEDGER_SETUP_UNVERIFIED");
}

// frozen:base44/shared/ledger.js
var VERSION = "closed-ledger-v1";
var TYPES = /* @__PURE__ */ new Set(["CourseExterne", "CommandeBoutique", "CommandeRestaurant", "Conversation"]);
var DIRECT = { CourseExterne: "direct", CommandeBoutique: "order", CommandeRestaurant: "order", Conversation: "pharmacy" };
var f = (code = "LOYALTY_PROOF_INCOMPLETE") => {
  throw Object.assign(new Error(code), { code, status: code === "AUTH_REQUIRED" ? 401 : ["AUTH_FORBIDDEN", "LOYALTY_PROFILE_FORBIDDEN"].includes(code) ? 403 : code === "INVALID_REQUEST" ? 400 : 503 });
};
var empty = (x) => x === null || x === void 0 || x === "";
var publicRow = (x) => x && !x.enterprise_id;
var cancelled = (x) => x.statut === "annulee" || ["annulation_user_id", "date_annulation", "annulation_source", "annulation_event_at"].some((k) => !empty(x[k]));
var stable = (x) => JSON.stringify(x);
function checkConversation(row, clientId, userId, pharmacyId) {
  let parts;
  try {
    parts = JSON.parse(row?.participants);
  } catch {
    f();
  }
  if (!publicRow(row) || !Array.isArray(parts) || parts.length !== 2 || parts.filter((p) => p?.type === "client" && p.id === clientId).length !== 1 || parts.filter((p) => p?.type === "partenaire" && p.id === pharmacyId).length !== 1 || !Array.isArray(row.participant_user_ids) || !row.participant_user_ids.includes(userId)) f();
}
var deliveryTime = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)) return NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === value.slice(0, 19) ? ms : NaN;
};
var FIELDS = ["version", "epoch_id", "proof_id", "kind", "subject_type", "subject_id", "country_code", "issued_at", "actor_user_id", "beneficiary_user_id", "payload"];
var PAYLOAD = {
  admission: ["evidence_semantics", "native_user_id", "subject_email", "tenant_key", "state", "approval_reference", "profile_revision", "basis_proof_id", "mutation_target"],
  origin: ["beneficiary_user_id", "client_profile_id", "source_kind", "parent_proof_id", "request_id", "pharmacy_partner_id"],
  admin_unlinked: ["creation_semantics", "grant_action", "reason", "request_id", "tenant_key"],
  delivery: ["state", "beneficiary_user_id", "client_profile_id", "driver_profile_id", "origin_proof_id", "admission_proof_id", "operation_id", "completed_at", "request_id"]
};
var exact = (x, keys) => x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length === keys.length && keys.every((k) => Object.hasOwn(x, k));
function valid(r, p) {
  if (!exact(r, FIELDS) || r.version !== VERSION || r.epoch_id !== p.epoch_id || !uuid(r.proof_id) || !PAYLOAD[r.kind] || !exact(r.payload, r.kind === "origin" && r.payload?.source_kind === "admin_delegated" ? [...PAYLOAD.origin, "delegation_snapshot"] : PAYLOAD[r.kind]) || !id(r.subject_id) || !id(r.actor_user_id) || !iso(r.issued_at) || Date.parse(r.issued_at) < Date.parse(p.capture_effective_at) || !/^[A-Z]{2}$/.test(r.country_code)) f();
  const q = r.payload;
  if (r.beneficiary_user_id !== (["admission", "admin_unlinked"].includes(r.kind) ? null : q.beneficiary_user_id)) f();
  if (r.kind === "admission") {
    if (q.evidence_semantics !== DRIVER_EVIDENCE_SEMANTICS || r.subject_type !== "Livreur" || !(id(q.native_user_id) || q.state === "revoked" && q.native_user_id === null) || !(id(q.subject_email) || q.state === "revoked" && q.subject_email === null) || !(q.tenant_key === "public" || q.state === "revoked" && typeof q.tenant_key === "string" && q.tenant_key.startsWith("enterprise:") && id(q.tenant_key.slice(11))) || !["admitted", "revoked"].includes(q.state) || !id(q.approval_reference) || !id(q.profile_revision) || !(q.basis_proof_id === null || uuid(q.basis_proof_id)) || !(q.mutation_target === null || q.state === "revoked" && exact(q.mutation_target, ["user_email", "country_code", "enterprise_id"]) && id(q.mutation_target.user_email) && /^[A-Z]{2}$/.test(q.mutation_target.country_code) && (q.mutation_target.enterprise_id === null || id(q.mutation_target.enterprise_id)))) f();
  } else if (r.kind === "admin_unlinked") {
    if (r.subject_type !== "CourseExterne" || q.creation_semantics !== "authorized-admin-create-v1" || q.grant_action !== "creerCourseAdmin" || !["legacy_no_tuple", "explicit_unlinked"].includes(q.reason) || !(q.request_id === null || id(q.request_id)) || !(q.tenant_key === "public" || typeof q.tenant_key === "string" && q.tenant_key.startsWith("enterprise:") && id(q.tenant_key.slice(11)))) f();
  } else if (r.kind === "origin") {
    if (q.source_kind === "pharmacy" ? !id(q.pharmacy_partner_id) : q.pharmacy_partner_id !== null) f();
    if (!TYPES.has(r.subject_type) || !id(q.beneficiary_user_id) || !id(q.client_profile_id) || q.source_kind !== DIRECT[r.subject_type] && !(r.subject_type === "CourseExterne" && ["order", "pharmacy", "admin_delegated"].includes(q.source_kind)) || !(q.parent_proof_id === null || uuid(q.parent_proof_id)) || !(q.request_id === null || id(q.request_id)) || /^(guest_|guest-v1:)/.test(q.request_id || "")) f();
    if (q.parent_proof_id === null && q.source_kind !== "admin_delegated" && r.actor_user_id !== q.beneficiary_user_id) f();
    if (q.source_kind === "admin_delegated") {
      const d = q.delegation_snapshot;
      if (r.subject_type !== "CourseExterne" || !exact(d, ["version", "profile_id", "profile_updated_date", "native_user_id", "native_user_snapshot_sha256", "country_code", "enterprise_id", "normalized_phone", "actor_user_id", "grant_action"]) || d.version !== 1 || d.profile_id !== q.client_profile_id || !id(d.profile_updated_date) || d.native_user_id !== q.beneficiary_user_id || !/^([a-f0-9]{64})$/.test(d.native_user_snapshot_sha256) || d.country_code !== r.country_code || d.enterprise_id !== null || !/^\d{7,16}$/.test(d.normalized_phone) || d.actor_user_id !== r.actor_user_id || d.grant_action !== "creerCourseAdmin") f();
    }
    if (r.subject_type !== "CourseExterne" && q.parent_proof_id !== null) f();
    if (r.subject_type === "CourseExterne" && ["direct", "admin_delegated"].includes(q.source_kind) !== (q.parent_proof_id === null)) f();
  } else {
    if (r.subject_type !== "CourseExterne" || !["confirmed", "revoked"].includes(q.state) || !(q.request_id === null || id(q.request_id))) f();
    if (q.state === "confirmed") {
      if (!id(q.beneficiary_user_id) || !id(q.client_profile_id) || !id(q.driver_profile_id) || !uuid(q.origin_proof_id) || !uuid(q.admission_proof_id) || !uuid(q.operation_id) || !iso(q.completed_at) || Date.parse(q.completed_at) > Date.parse(r.issued_at)) f();
    } else {
      for (const key2 of ["beneficiary_user_id", "client_profile_id", "driver_profile_id"]) if (q[key2] !== null && !id(q[key2])) f();
      for (const key2 of ["origin_proof_id", "admission_proof_id", "operation_id"]) if (q[key2] !== null && !uuid(q[key2])) f();
      if (q.completed_at !== null && (!iso(q.completed_at) || Date.parse(q.completed_at) > Date.parse(r.issued_at))) f();
    }
  }
  return r;
}
function createLedgerRuntime(ports, config, { clock = () => (/* @__PURE__ */ new Date()).toISOString(), randomUUID = () => crypto.randomUUID() } = {}) {
  const policy = config?.policy;
  const enabled = config?.captureEnabled === true, readerEnabled = config?.readerEnabled === true;
  if (enabled || readerEnabled) assertLedgerPolicy(policy);
  const now = () => {
    const t = clock();
    if (!iso(t)) f("LOYALTY_CLOCK_INVALID");
    return t;
  };
  const actor = async () => {
    const u = await ports.auth.me();
    if (!id(u?.id) || !id(u?.email)) f("AUTH_REQUIRED");
    return u;
  };
  const scan = async (query) => {
    const rows = [];
    let cursor = null;
    const seen = /* @__PURE__ */ new Set();
    for (let n = 0; n < 50; n++) {
      const pg = await ports.evidence.scan({ ...query, epoch_id: policy.epoch_id }, { cursor, limit: 100 });
      if (!pg || !Array.isArray(pg.items) || pg.items.length > 100 || typeof pg.has_more !== "boolean") f("LOYALTY_HISTORY_INCOMPLETE");
      for (const r of pg.items) {
        valid(r, policy);
        if (Date.parse(r.issued_at) > Date.parse(now())) f();
        if (seen.has(r.proof_id)) f("LOYALTY_READ_CHANGED");
        seen.add(r.proof_id);
        if (Object.entries(query).some(([k, v]) => (k === "beneficiary_user_id" ? r.payload.beneficiary_user_id : r[k]) !== v)) f("LOYALTY_SCOPE_INVALID");
        rows.push(r);
      }
      if (!pg.has_more) return rows;
      if (!pg.next_cursor || pg.next_cursor === cursor) f("LOYALTY_HISTORY_INCOMPLETE");
      cursor = pg.next_cursor;
    }
    f("LOYALTY_HISTORY_INCOMPLETE");
  };
  const get = async (proofId) => {
    if (!uuid(proofId)) f();
    const r = await ports.evidence.get(proofId);
    if (!r || r.proof_id !== proofId) f();
    valid(r, policy);
    if (Date.parse(r.issued_at) > Date.parse(now())) f();
    return r;
  };
  const append = async (record2) => {
    valid(record2, policy);
    try {
      await ports.evidence.append(record2);
    } catch {
    }
    const saved = await get(record2.proof_id);
    if (stable(saved) !== stable(record2)) f("LOYALTY_WRITE_UNCERTAIN");
    return saved;
  };
  const make = (kind, type, subject, country, u, payload) => ({ version: VERSION, epoch_id: policy.epoch_id, proof_id: randomUUID(), kind, subject_type: type, subject_id: subject, country_code: country, issued_at: now(), actor_user_id: u.id, beneficiary_user_id: payload.beneficiary_user_id || null, payload: kind === "admission" ? { evidence_semantics: DRIVER_EVIDENCE_SEMANTICS, ...payload } : payload });
  const uniqueOrigin = async (type, subject) => {
    const rows = await scan({ kind: "origin", subject_type: type, subject_id: subject });
    if (rows.length !== 1) f();
    return rows[0];
  };
  const admissionHead = async (profile, at = now()) => resolveAdmissionHead((await scan({ kind: "admission", subject_type: "Livreur", subject_id: profile })).filter((r) => Date.parse(r.issued_at) <= Date.parse(at)));
  const latestAdmission = async (profile, at = now()) => {
    const head = await admissionHead(profile, at);
    if (head?.payload.state !== "admitted") f();
    return head;
  };
  const currentDriverAllows = async (admission, u, country) => {
    const d = await ports.drivers.get(admission.subject_id);
    if (!d || d.id !== admission.subject_id || d.enterprise_id || d.country_code !== country || d.user_email !== u.email) f();
    const countryRow = await ports.countries.get(country);
    if (countryRow?.code !== country || countryRow.actif !== true) f();
    return d;
  };
  const capture = async (action) => {
    try {
      return { state: "recorded", proof_id: (await action()).proof_id };
    } catch {
      return { state: "incomplete" };
    }
  };
  async function createNativeOrigin({ profile_id, subject_type, pharmacy_id = null }, newCreate) {
    if (!enabled) return { result: await newCreate(), loyalty: { state: "disabled" } };
    let context;
    try {
      const u = await actor(), profile = await ports.clients.get(profile_id);
      if (!TYPES.has(subject_type) || !publicRow(u) || !publicRow(profile) || profile?.id !== profile_id || profile.user_email !== u.email || profile.actif === false || !/^[A-Z]{2}$/.test(profile.country_code) || u.country_code && u.country_code !== profile.country_code) f();
      const active = await ports.countries.get(profile.country_code);
      if (active?.code !== profile.country_code || active.actif !== true) f();
      let pharmacy = null;
      if (subject_type === "Conversation") {
        pharmacy = await ports.pharmacies.get(pharmacy_id);
        if (pharmacy?.id !== pharmacy_id || !publicRow(pharmacy) || pharmacy.actif !== true || pharmacy.pays_code !== profile.country_code) f();
      }
      context = { u, profile, pharmacy };
    } catch {
    }
    const result2 = await newCreate();
    if (!context || result2?.created !== true) return { result: result2, loyalty: { state: "incomplete" } };
    const loyalty = await capture(async () => {
      const row = result2.row, { u, profile } = context;
      if (!id(row?.id) || result2.entity !== subject_type || !publicRow(row)) f();
      if (subject_type === "Conversation") {
        checkConversation(row, profile.id, u.id, context.pharmacy.id);
        const reread = await ports.sources.get("Conversation", row.id);
        checkConversation(reread, profile.id, u.id, context.pharmacy.id);
        if (reread?.id !== row.id) f();
      } else if ((row.country_code || row.pays_code) !== profile.country_code) f();
      return append(make("origin", subject_type, row.id, profile.country_code, u, { beneficiary_user_id: u.id, client_profile_id: profile.id, source_kind: DIRECT[subject_type], pharmacy_partner_id: context.pharmacy?.id ?? null, parent_proof_id: null, request_id: empty(row.request_id) ? null : row.request_id }));
    });
    return { result: result2, loyalty };
  }
  async function createAdminUnlinkedOrigin(decision, newCreate) {
    if (!enabled) return { result: await newCreate(), loyalty: { state: "disabled" } };
    let context;
    try {
      const u = await actor();
      if (ports.approvals?.isPinnedDelegatedOrigin?.(decision, u.id) !== true) f();
      const d = ports.approvals.readDelegatedDecision(decision, u.id);
      if (d.mode !== "unlinked" || d.actor_user_id !== u.id || d.actor_email !== u.email || d.grant_action !== "creerCourseAdmin" || !["legacy_no_tuple", "explicit_unlinked"].includes(d.reason) || !/^[A-Z]{2}$/.test(d.country_code) || !(d.enterprise_id === null || id(d.enterprise_id))) f();
      context = { u, d };
    } catch {
    }
    const result2 = await newCreate();
    if (!context || result2?.created !== true) return { result: result2, loyalty: { state: "incomplete" } };
    return { result: result2, loyalty: await capture(async () => {
      const { u, d } = context, row = result2.row;
      if (result2.entity !== "CourseExterne" || !id(row?.id) || row.source !== "admin" || row.country_code !== d.country_code || (row.enterprise_id ?? null) !== d.enterprise_id || !empty(row.client_user_email)) f();
      return append(make("admin_unlinked", "CourseExterne", row.id, d.country_code, u, { creation_semantics: "authorized-admin-create-v1", grant_action: "creerCourseAdmin", reason: d.reason, request_id: empty(row.request_id) ? null : row.request_id, tenant_key: d.enterprise_id ? "enterprise:" + d.enterprise_id : "public" }));
    }) };
  }
  async function createDelegatedOrigin(decision, newCreate) {
    if (!enabled) return { result: await newCreate(), loyalty: { state: "disabled" } };
    let context;
    try {
      const u = await actor();
      if (ports.approvals?.isPinnedDelegatedOrigin?.(decision, u.id) !== true) f();
      const d = ports.approvals.readDelegatedDecision(decision, u.id);
      if (d.actor_user_id !== u.id || d.actor_email !== u.email || d.grant_action !== "creerCourseAdmin" || d.enterprise_id !== null || !id(d.beneficiary_user_id) || !id(d.beneficiary_email)) f();
      const profile = await ports.delegatedProfiles.get(d.profile_id), native = await ports.nativeUsers.get(d.beneficiary_user_id);
      if (profile?.id !== d.profile_id || profile.updated_date !== d.profile_updated_date || profile.user_email !== d.beneficiary_email || profile.country_code !== d.country_code || !publicRow(profile) || profile.actif !== true || native?.id !== d.beneficiary_user_id || native.email !== d.beneficiary_email || !publicRow(native) || native.country_code != null && native.country_code !== d.country_code) f();
      const country = await ports.countries.get(d.country_code);
      if (country?.code !== d.country_code || country.actif !== true) f();
      context = { u, d };
    } catch {
    }
    const result2 = await newCreate();
    if (!context || result2?.created !== true) return { result: result2, loyalty: { state: "incomplete" } };
    return { result: result2, loyalty: await capture(async () => {
      const { u, d } = context, row = result2.row;
      if (result2.entity !== "CourseExterne" || !id(row?.id) || row.source !== "admin" || row.country_code !== d.country_code || !publicRow(row) || row.client_user_email !== d.beneficiary_email || row.type_course === "expedier" && row.expediteur_client_id !== d.profile_id || row.type_course === "recevoir" && row.destinataire_client_id !== d.profile_id) f();
      return append(make("origin", "CourseExterne", row.id, d.country_code, u, { beneficiary_user_id: d.beneficiary_user_id, client_profile_id: d.profile_id, source_kind: "admin_delegated", pharmacy_partner_id: null, parent_proof_id: null, request_id: empty(row.request_id) ? null : row.request_id, delegation_snapshot: { ...d.candidate, actor_user_id: u.id, grant_action: d.grant_action } }));
    }) };
  }
  async function createLinkedCourse({ source_type, source_id }, newCreate) {
    if (!enabled) return { result: await newCreate(), loyalty: { state: "disabled" } };
    let context;
    try {
      if (!["CommandeBoutique", "CommandeRestaurant", "Conversation"].includes(source_type)) f();
      const u = await actor(), origin = await uniqueOrigin(source_type, source_id);
      context = { u, origin };
    } catch {
    }
    const result2 = await newCreate();
    if (!context || result2?.created !== true) return { result: result2, loyalty: { state: "incomplete" } };
    const loyalty = await capture(async () => {
      const { u, origin } = context, row = result2.row, key2 = { CommandeBoutique: "commande_boutique_id", CommandeRestaurant: "commande_restaurant_id", Conversation: "conversation_id" }[source_type];
      if (result2.entity !== "CourseExterne" || !id(row?.id) || row[key2] !== source_id || row.country_code !== origin.country_code || !publicRow(row)) f();
      const source = await ports.sources.get(source_type, source_id);
      if (!source || source.id !== source_id || source_type !== "Conversation" && source.course_id !== row.id || (source.country_code || source.pays_code ? (source.country_code || source.pays_code) !== origin.country_code : source_type !== "Conversation") || !publicRow(source) || ["annulee", "paiement_refuse"].includes(source.statut)) f();
      if (source_type === "Conversation") {
        checkConversation(source, origin.payload.client_profile_id, origin.payload.beneficiary_user_id, origin.payload.pharmacy_partner_id);
        if (row.pharmacie_id !== origin.payload.pharmacy_partner_id || row.destinataire_client_id !== origin.payload.client_profile_id) f();
        const pharmacy = await ports.pharmacies.get(origin.payload.pharmacy_partner_id);
        if (pharmacy?.id !== row.pharmacie_id || pharmacy.user_email !== u.email || pharmacy.pays_code !== origin.country_code || pharmacy.actif !== true || !publicRow(pharmacy) || !publicRow(u)) f();
      }
      const check = await uniqueOrigin(source_type, source_id);
      if (stable(check) !== stable(origin)) f();
      return append(make("origin", "CourseExterne", row.id, origin.country_code, u, { ...origin.payload, parent_proof_id: origin.proof_id, request_id: empty(row.request_id) ? null : row.request_id }));
    });
    return { result: result2, loyalty };
  }
  async function bindApprovedDriverReference(reference, approval) {
    if (!enabled) return { state: "disabled" };
    if (ports.approvals?.isPinnedReference(reference, approval) !== true) f("LOYALTY_ADMISSION_NOT_APPROVED");
    if (reference.evidence_semantics !== DRIVER_EVIDENCE_SEMANTICS || !["admitted", "revoked"].includes(reference.state)) f("LOYALTY_ADMISSION_NOT_APPROVED");
    const u = await actor();
    if (u.role !== "admin" || u.id !== approval.admin_user_id) f("AUTH_FORBIDDEN");
    if (!iso(approval.approved_at) || !iso(approval.expires_at) || Date.parse(approval.approved_at) > Date.parse(now()) || Date.parse(now()) >= Date.parse(approval.expires_at) || !id(approval.reference)) f("LOYALTY_ADMISSION_NOT_APPROVED");
    if (reference.state === "revoked") {
      const prior = await latestAdmission(reference.profile_id);
      if (prior.payload.native_user_id !== reference.native_user_id || prior.payload.subject_email !== reference.subject_email || prior.country_code !== reference.country_code) f("LOYALTY_ADMISSION_REFERENCE_CHANGED");
      return append(make("admission", "Livreur", reference.profile_id, reference.country_code, u, { ...prior.payload, basis_proof_id: prior.proof_id, mutation_target: null, state: "revoked", approval_reference: approval.reference, profile_revision: reference.expected_updated_date }));
    }
    const basis = await admissionHead(reference.profile_id);
    const driver = await ports.drivers.get(reference.profile_id), native = await ports.nativeUsers.get(reference.native_user_id);
    if (!driver || driver.id !== reference.profile_id || driver.updated_date !== reference.expected_updated_date || driver.user_email !== reference.subject_email || driver.country_code !== reference.country_code || driver.enterprise_id || native?.id !== reference.native_user_id || native.email !== reference.subject_email || native.enterprise_id || native.country_code && native.country_code !== reference.country_code) f("LOYALTY_ADMISSION_REFERENCE_CHANGED");
    const country = await ports.countries.get(reference.country_code);
    if (country?.code !== reference.country_code || country.actif !== true) f();
    return append(make("admission", "Livreur", driver.id, reference.country_code, u, { native_user_id: native.id, subject_email: native.email, tenant_key: "public", state: reference.state === "revoked" ? "revoked" : "admitted", approval_reference: approval.reference, profile_revision: driver.updated_date, basis_proof_id: basis?.proof_id ?? null, mutation_target: null }));
  }
  const CREATE_DRIVER_SOURCES = /* @__PURE__ */ new Set(["createLivreur:new", "initLivreurAuto:new", "migrerClientVersLivreur:new", "manageDriverInvitation:new", "manageEnterprise:new"]);
  const DECIDE_DRIVER_SOURCES = /* @__PURE__ */ new Set(["updateLivreur:admin_decision", "updateLivreur:self_revoke", "updateLivreur:self_identity", "manageDriverInvitation:validate_driver", "manageDriverInvitation:reactivate_driver", "manageDriverInvitation:refuse_driver", "manageDriverInvitation:suspend_driver", "manageEnterprise:toggle_livreur"]);
  async function nativeDriverContext(source, native_user_id, create, decision) {
    const u = await actor(), native = await ports.nativeUsers.get(native_user_id);
    if (!(create ? CREATE_DRIVER_SOURCES : DECIDE_DRIVER_SOURCES).has(source) || !id(native?.id) || native.id !== native_user_id || !id(native.email) || !publicRow(native) || !publicRow(u)) f();
    if (create) {
      if (u.role !== "admin" && u.id !== native.id) f();
    } else if (u.role !== "admin" && !(decision === "revoked" && source === "updateLivreur:self_revoke" && u.id === native.id)) f();
    return { u, native, source };
  }
  async function appendNativeDriverDecision(context, row, state) {
    const { u, native, source } = context;
    if (!id(row?.id) || !id(row.updated_date) || row.user_email !== native.email || !publicRow(row) || !/^[A-Z]{2}$/.test(row.country_code) || native.country_code && native.country_code !== row.country_code) f();
    const current = await ports.drivers.get(row.id);
    for (const k of ["id", "updated_date", "user_email", "country_code", "enterprise_id"]) if ((current?.[k] ?? null) !== (row[k] ?? null)) f("LOYALTY_ADMISSION_REFERENCE_CHANGED");
    const country = await ports.countries.get(row.country_code);
    if (country?.code !== row.country_code || country.actif !== true) f();
    return append(make("admission", "Livreur", row.id, row.country_code, u, { native_user_id: native.id, subject_email: native.email, tenant_key: "public", state, approval_reference: "native:" + source + ":" + randomUUID(), profile_revision: row.updated_date, basis_proof_id: context.basis?.proof_id ?? null, mutation_target: null }));
  }
  async function createNativeDriverBinding({ source, native_user_id }, newCreate) {
    if (!enabled) return { result: await newCreate(), loyalty: { state: "disabled" } };
    let context;
    try {
      context = await nativeDriverContext(source, native_user_id, true);
      context.basis = null;
    } catch {
    }
    const result2 = await newCreate();
    if (!context || result2?.created !== true) return { result: result2, loyalty: { state: "incomplete" } };
    return { result: result2, loyalty: await capture(() => appendNativeDriverDecision(context, result2.row, "admitted")) };
  }
  async function establishNativeDriverBinding({ source, profile_id, native_user_id, decision = "admitted" }, authorizedDecision) {
    if (decision !== "admitted" || !["updateLivreur:admin_decision", "manageDriverInvitation:validate_driver"].includes(source)) return { result: await authorizedDecision(), loyalty: { state: "not_identity_establishment" } };
    if (!enabled) return { result: await authorizedDecision(), loyalty: { state: "disabled" } };
    let context;
    try {
      context = await nativeDriverContext(source, native_user_id, false, "admitted");
      const before = await ports.drivers.get(profile_id);
      if (before?.id !== profile_id || before.user_email !== context.native.email || !publicRow(before)) f();
      context.before = before;
      context.basis = await admissionHead(profile_id);
    } catch {
      context = null;
    }
    const result2 = await authorizedDecision();
    if (!context || result2?.updated !== true || result2.row?.id !== profile_id) return { result: result2, loyalty: { state: "incomplete" } };
    return { result: result2, loyalty: await capture(async () => {
      for (const key2 of ["user_email", "country_code", "enterprise_id"]) if ((context.before[key2] ?? null) !== (result2.row[key2] ?? null)) f("LOYALTY_ADMISSION_REFERENCE_CHANGED");
      return appendNativeDriverDecision(context, result2.row, "admitted");
    }) };
  }
  async function guardNegativeDriverMutation({ source, profile_id, expected_updated_date, mutation, target = null, authority }, authorizedMutation) {
    if (["suspend", "refuse", "deactivate", "admin_offline"].includes(mutation)) return { result: await authorizedMutation(), loyalty: { state: "not_identity_change" } };
    if (mutation !== "identity") f("INVALID_REQUEST");
    if (!enabled) f("LOYALTY_NEGATIVE_BARRIER_UNAVAILABLE");
    const u = await actor();
    if (!DECIDE_DRIVER_SOURCES.has(source) || !["identity", "suspend", "refuse", "deactivate", "admin_offline"].includes(mutation)) f("INVALID_REQUEST");
    const before = await ports.drivers.get(profile_id);
    if (before?.id !== profile_id || !id(expected_updated_date) || before.updated_date !== expected_updated_date || !/^[A-Z]{2}$/.test(before.country_code) || !(empty(before.enterprise_id) || id(before.enterprise_id))) f("LOYALTY_ADMISSION_REFERENCE_CHANGED");
    const enterprise = empty(before.enterprise_id) ? null : before.enterprise_id;
    if (mutation === "identity") {
      if (!exact(target, ["user_email", "country_code", "enterprise_id"]) || !id(target.user_email) || !/^[A-Z]{2}$/.test(target.country_code) || !(target.enterprise_id === null || id(target.enterprise_id))) f("INVALID_REQUEST");
      if (["user_email", "country_code", "enterprise_id"].every((k) => (before[k] ?? null) === (target[k] ?? null))) f("INVALID_REQUEST");
    } else if (target !== null) f("INVALID_REQUEST");
    const bound = Object.freeze({ actor_user_id: u.id, source, profile_id, expected_updated_date, mutation, country_code: before.country_code, enterprise_id: enterprise, target: target ? Object.freeze({ ...target }) : null });
    if (!authority || ports.approvals?.isPinnedNegativeDecision?.(authority, bound) !== true) f("AUTH_FORBIDDEN");
    if (authority.kind === "general_admin") {
      if (u.role !== "admin") f("AUTH_FORBIDDEN");
    } else if (authority.kind === "enterprise_agent") {
      if (!enterprise || authority.enterprise_id !== enterprise || authority.country_code !== before.country_code) f("AUTH_FORBIDDEN");
      if (target && (target.enterprise_id !== enterprise || target.country_code !== before.country_code)) f("AUTH_FORBIDDEN");
    } else if (authority.kind === "self_owner") {
      if (source !== "updateLivreur:self_identity" || mutation !== "identity" || target === null || typeof before.user_email !== "string" || before.user_email.trim().toLowerCase() !== u.email.trim().toLowerCase()) f("AUTH_FORBIDDEN");
    } else f("AUTH_FORBIDDEN");
    const basis = await admissionHead(profile_id);
    const barrier = await append(make("admission", "Livreur", profile_id, before.country_code, u, { native_user_id: basis?.payload.native_user_id ?? null, subject_email: basis?.payload.subject_email ?? null, tenant_key: enterprise ? "enterprise:" + enterprise : "public", state: "revoked", approval_reference: "native:" + source + ":scoped-negative:" + randomUUID(), profile_revision: before.updated_date, basis_proof_id: basis?.proof_id ?? null, mutation_target: target ? { ...target } : null }));
    const result2 = await authorizedMutation();
    return { result: result2, loyalty: { state: "recorded", proof_id: barrier.proof_id } };
  }
  async function guardDriverIdentityMutation({ source, profile_id, expected_updated_date, target, authority = null }, authorizedMutation) {
    if (authority !== null) return guardNegativeDriverMutation({ source, profile_id, expected_updated_date, target, authority, mutation: "identity" }, authorizedMutation);
    if (!enabled) f("LOYALTY_IDENTITY_BARRIER_UNAVAILABLE");
    const u = await actor();
    if (u.role !== "admin" || source !== "updateLivreur:admin_decision") f("AUTH_FORBIDDEN");
    if (!exact(target, ["user_email", "country_code", "enterprise_id"]) || !id(target.user_email) || !/^[A-Z]{2}$/.test(target.country_code) || !(target.enterprise_id === null || id(target.enterprise_id))) f("INVALID_REQUEST");
    const before = await ports.drivers.get(profile_id);
    if (before?.id !== profile_id || before.updated_date !== expected_updated_date || !id(before.user_email) || !/^[A-Z]{2}$/.test(before.country_code)) f("LOYALTY_ADMISSION_REFERENCE_CHANGED");
    if (["user_email", "country_code", "enterprise_id"].every((k) => (before[k] ?? null) === (target[k] ?? null))) f("INVALID_REQUEST");
    const basis = await admissionHead(profile_id);
    const barrier = await append(make("admission", "Livreur", profile_id, before.country_code, u, { native_user_id: basis?.payload.native_user_id ?? null, subject_email: before.user_email, tenant_key: "public", state: "revoked", approval_reference: "native:" + source + ":identity-barrier:" + randomUUID(), profile_revision: before.updated_date, basis_proof_id: basis?.proof_id ?? null, mutation_target: { ...target } }));
    const result2 = await authorizedMutation();
    return { result: result2, loyalty: { state: "recorded", proof_id: barrier.proof_id } };
  }
  async function finalize({ course_id }, protectedCommit) {
    if (!enabled) return { result: await protectedCommit(), loyalty: { state: "disabled" } };
    let context;
    try {
      const u = await actor(), course = await ports.courses.get(course_id), origin = await uniqueOrigin("CourseExterne", course_id), admission = await latestAdmission(course.livreur_id);
      if (course.id !== course_id || cancelled(course) || !publicRow(course) || !["arrivee", "en_livraison", "colis_recupere", "pris_en_charge"].includes(course.statut) || course.country_code !== origin.country_code || admission.country_code !== course.country_code || admission.payload.native_user_id !== u.id || admission.payload.subject_email !== u.email || !publicRow(u) || u.country_code && u.country_code !== course.country_code) f();
      await currentDriverAllows(admission, u, course.country_code);
      if ((await scan({ kind: "delivery", subject_type: "CourseExterne", subject_id: course_id })).some((r) => r.payload.state === "revoked")) f();
      context = { u, origin, admission };
    } catch {
    }
    const result2 = await protectedCommit();
    if (!context || result2?.committed !== true) return { result: result2, loyalty: { state: "incomplete" } };
    const loyalty = await capture(async () => {
      const { u, origin, admission } = context, course = result2.course;
      if (course?.id !== course_id || course.statut !== "livree" || course.auto_completed === true || cancelled(course) || !publicRow(course) || course.country_code !== origin.country_code || course.livreur_id !== admission.subject_id || !uuid(result2.operation_id) || !iso(result2.completed_at) || Date.parse(result2.completed_at) > Date.parse(now()) || Date.parse(result2.completed_at) < Date.parse(origin.issued_at) || Date.parse(result2.completed_at) < Date.parse(admission.issued_at)) f();
      await currentDriverAllows(admission, u, course.country_code);
      if (stable(await uniqueOrigin("CourseExterne", course_id)) !== stable(origin) || stable(await latestAdmission(course.livreur_id)) !== stable(admission)) f();
      if ((await scan({ kind: "delivery", subject_type: "CourseExterne", subject_id: course_id })).some((r) => r.payload.state === "revoked")) f();
      return append(make("delivery", "CourseExterne", course_id, origin.country_code, u, { state: "confirmed", beneficiary_user_id: origin.payload.beneficiary_user_id, client_profile_id: origin.payload.client_profile_id, driver_profile_id: admission.subject_id, origin_proof_id: origin.proof_id, admission_proof_id: admission.proof_id, operation_id: result2.operation_id, completed_at: result2.completed_at, request_id: origin.payload.request_id }));
    });
    return { result: result2, loyalty };
  }
  async function cancel({ course_id }, authorizedCancel) {
    if (!enabled) return { result: await authorizedCancel(), loyalty: { state: "disabled" } };
    let context;
    try {
      const u = await actor(), course = await ports.courses.get(course_id);
      if (course?.id !== course_id || !/^[A-Z]{2}$/.test(course.country_code) || !publicRow(course)) f();
      context = { u, course, origin: null };
      try {
        context.origin = await uniqueOrigin("CourseExterne", course_id);
      } catch {
      }
    } catch {
    }
    const result2 = await authorizedCancel();
    if (!context || result2?.cancelled !== true) return { result: result2, loyalty: { state: "incomplete" } };
    return { result: result2, loyalty: await capture(() => append(make("delivery", "CourseExterne", course_id, context.course.country_code, context.u, { state: "revoked", beneficiary_user_id: context.origin?.payload.beneficiary_user_id ?? null, client_profile_id: context.origin?.payload.client_profile_id ?? null, driver_profile_id: null, origin_proof_id: context.origin?.proof_id ?? null, admission_proof_id: null, operation_id: null, completed_at: null, request_id: context.origin?.payload.request_id ?? null }))) };
  }
  async function read(body) {
    if (!exact(body, ["profile_id", "country_code"]) || !id(body.profile_id) || !/^[A-Z]{2}$/.test(body.country_code)) f("INVALID_REQUEST");
    const { profile_id, country_code } = body;
    if (!readerEnabled) f("LOYALTY_SOURCE_NOT_VERIFIED");
    const u = await actor(), profile = await ports.clients.get(profile_id);
    if (profile?.id !== profile_id || profile.country_code !== country_code || profile.user_email !== u.email || !publicRow(profile) || !publicRow(u) || profile.actif === false || !/^[A-Z]{2}$/.test(profile.country_code) || u.country_code && u.country_code !== profile.country_code) f("LOYALTY_PROFILE_FORBIDDEN");
    async function collect() {
      const origins = await scan({ kind: "origin", beneficiary_user_id: u.id, country_code: profile.country_code });
      const deliveries = await scan({ kind: "delivery", beneficiary_user_id: u.id, country_code: profile.country_code });
      const legacy = await ports.courses.listOwned(u, profile);
      if (!Array.isArray(legacy) || legacy.length > 1e4) f("LOYALTY_HISTORY_INCOMPLETE");
      const byId = /* @__PURE__ */ new Map();
      for (const c of legacy) {
        if (!id(c?.id) || c.country_code !== profile.country_code || !(c.client_user_email === u.email || c.destinataire_client_id === profile.id || c.loyalty_identity_beneficiary_user_id === u.id)) f("LOYALTY_SCOPE_INVALID");
        if (byId.has(c.id)) f("LOYALTY_READ_CHANGED");
        byId.set(c.id, c);
      }
      for (const r of [...origins.filter((r2) => r2.subject_type === "CourseExterne"), ...deliveries]) if (!byId.has(r.subject_id)) byId.set(r.subject_id, await ports.courses.get(r.subject_id));
      const rows = [...byId.values()];
      if (rows.some((c) => !c || !id(c.id))) f();
      return { origins, deliveries, rows };
    }
    const a = await collect(), eligible = [], chain = [], courseEvidence = /* @__PURE__ */ new Map(), orderAliases = /* @__PURE__ */ new Map(), originEvidence = /* @__PURE__ */ new Map();
    async function readUniqueOrigin(type, subject, required = true) {
      const query = { kind: "origin", subject_type: type, subject_id: subject }, rows = await scan(query);
      originEvidence.set(type + ":" + subject, { query, rows });
      if (rows.length > 1 || required && rows.length !== 1) f();
      return rows[0] ?? null;
    }
    async function authoritativeOrigin(course) {
      const origin = await readUniqueOrigin("CourseExterne", course.id, false);
      if (!origin) return null;
      if (origin.country_code !== course.country_code) f();
      if (origin.payload.parent_proof_id) {
        const parent = await get(origin.payload.parent_proof_id), q = origin.payload;
        if (parent.kind !== "origin" || parent.subject_type === "CourseExterne" || parent.payload.beneficiary_user_id !== q.beneficiary_user_id || parent.payload.client_profile_id !== q.client_profile_id || parent.country_code !== origin.country_code || parent.payload.source_kind !== q.source_kind || Date.parse(parent.issued_at) > Date.parse(origin.issued_at)) f();
        if (stable(await readUniqueOrigin(parent.subject_type, parent.subject_id)) !== stable(parent)) f();
        if (parent.subject_type === "Conversation" && (course.conversation_id !== parent.subject_id || course.pharmacie_id !== parent.payload.pharmacy_partner_id || q.pharmacy_partner_id !== parent.payload.pharmacy_partner_id || course.destinataire_client_id !== q.client_profile_id)) f();
        if (parent.subject_type === "CommandeBoutique" && course.commande_boutique_id !== parent.subject_id) f();
        if (parent.subject_type === "CommandeRestaurant" && course.commande_restaurant_id !== parent.subject_id) f();
        chain.push(parent);
      }
      chain.push(origin);
      return origin;
    }
    function belongsToViewer(origin, course) {
      if (origin.payload.beneficiary_user_id === u.id) {
        if (origin.payload.client_profile_id !== profile.id) f();
        return true;
      }
      if (origin.payload.client_profile_id === profile.id || course.destinataire_client_id !== profile.id) f();
      return false;
    }
    for (const course of a.rows) {
      if (course.country_code !== profile.country_code || !publicRow(course)) f("LOYALTY_SCOPE_INVALID");
      if (course.auto_completed === true || /^(guest_|guest-v1:)/.test(course.request_id || "")) continue;
      const knownProof = a.origins.some((o) => o.subject_type === "CourseExterne" && o.subject_id === course.id) || a.deliveries.some((r2) => r2.subject_id === course.id);
      const knownDates = ["delivery_confirmed_at", "heure_livraison", "colis_livre_at"].map((k) => course[k]).filter((x) => !empty(x));
      if (!knownProof && course.statut === "livree" && knownDates.length && knownDates.every((t) => Number.isFinite(deliveryTime(t)) && deliveryTime(t) < Date.parse(START))) continue;
      const receipts = await scan({ kind: "delivery", subject_type: "CourseExterne", subject_id: course.id });
      courseEvidence.set(course.id, receipts);
      const unlinkedQuery = { kind: "admin_unlinked", subject_type: "CourseExterne", subject_id: course.id };
      const unlinked2 = await scan(unlinkedQuery);
      originEvidence.set("admin_unlinked:" + course.id, { query: unlinkedQuery, rows: unlinked2 });
      if (unlinked2.length) {
        if (unlinked2.length !== 1) f();
        const proof = unlinked2[0];
        if (proof.country_code !== course.country_code || proof.payload.tenant_key !== "public" || course.source !== "admin" || proof.payload.request_id !== (empty(course.request_id) ? null : course.request_id)) f();
        const positive = await readUniqueOrigin("CourseExterne", course.id, false);
        if (positive || receipts.some((r2) => r2.payload.state === "confirmed")) f();
        chain.push(proof);
        continue;
      }
      if (receipts.some((r2) => r2.payload.state === "revoked") || cancelled(course)) continue;
      const confirmed = receipts.filter((r2) => r2.payload.state === "confirmed");
      if (!confirmed.length) {
        const origin2 = await authoritativeOrigin(course);
        if (origin2 && !belongsToViewer(origin2, course)) continue;
        const dates = ["delivery_confirmed_at", "heure_livraison", "colis_livre_at"].map((k) => course[k]).filter((x) => !empty(x));
        if (course.statut !== "livree") continue;
        if (dates.length && dates.every((t) => Number.isFinite(deliveryTime(t)) && deliveryTime(t) < Date.parse(START))) continue;
        if (origin2) f("LOYALTY_PROOF_PENDING");
        f();
      }
      const r = confirmed[0], q = r.payload;
      if (confirmed.some((x) => x.payload.operation_id !== q.operation_id || stable(x.payload) !== stable(q) || x.actor_user_id !== r.actor_user_id || x.country_code !== r.country_code)) f();
      if (Date.parse(q.completed_at) < Date.parse(START)) continue;
      if (r.country_code !== profile.country_code || Date.parse(q.completed_at) > Date.parse(now()) || course.statut !== "livree" || course.livreur_id !== q.driver_profile_id || course.delivery_confirmed_at !== q.completed_at) f();
      const origin = await authoritativeOrigin(course), admission = await get(q.admission_proof_id);
      if (!origin || origin.proof_id !== q.origin_proof_id) f();
      if (origin.kind !== "origin" || origin.subject_type !== "CourseExterne" || origin.subject_id !== course.id || origin.country_code !== r.country_code || origin.payload.beneficiary_user_id !== q.beneficiary_user_id || origin.payload.client_profile_id !== q.client_profile_id || origin.payload.request_id !== q.request_id || admission.kind !== "admission" || admission.subject_id !== q.driver_profile_id || admission.country_code !== r.country_code || admission.payload.native_user_id !== r.actor_user_id || admission.payload.state !== "admitted" || Date.parse(origin.issued_at) > Date.parse(q.completed_at) || Date.parse(admission.issued_at) > Date.parse(q.completed_at)) f();
      const activeAtCommit = await latestAdmission(q.driver_profile_id, q.completed_at);
      if (activeAtCommit.proof_id !== admission.proof_id) f();
      chain.push(admission);
      if (!belongsToViewer(origin, course)) continue;
      if (origin.payload.parent_proof_id) {
        const parent = await get(origin.payload.parent_proof_id);
        if (["CommandeBoutique", "CommandeRestaurant"].includes(parent.subject_type)) orderAliases.set(r.proof_id, parent.subject_type + ":" + parent.subject_id);
      }
      eligible.push(r);
    }
    const b = await collect();
    if (stable(a) !== stable(b)) f("LOYALTY_READ_CHANGED");
    for (const [course_id, receipts] of courseEvidence) if (stable(await scan({ kind: "delivery", subject_type: "CourseExterne", subject_id: course_id })) !== stable(receipts)) f("LOYALTY_READ_CHANGED");
    for (const { query, rows } of originEvidence.values()) if (stable(await scan(query)) !== stable(rows)) f("LOYALTY_READ_CHANGED");
    for (const proof of chain) if (stable(await get(proof.proof_id)) !== stable(proof)) f("LOYALTY_READ_CHANGED");
    const current = await ports.clients.get(profile_id);
    if (current?.id !== profile_id || current.user_email !== u.email || current.country_code !== profile.country_code || current.enterprise_id || current.actif === false) f("LOYALTY_PROFILE_FORBIDDEN");
    const aliases = /* @__PURE__ */ new Map();
    const find = (k) => {
      while (aliases.get(k) !== k) k = aliases.get(k);
      return k;
    };
    for (const r of eligible) {
      const keys = ["course:" + r.subject_id, "operation:" + r.payload.operation_id];
      if (r.payload.request_id) keys.push("request:" + r.payload.request_id);
      if (orderAliases.has(r.proof_id)) keys.push("order:" + orderAliases.get(r.proof_id));
      for (const k of keys) if (!aliases.has(k)) aliases.set(k, k);
      const root = find(keys[0]);
      for (const k of keys) aliases.set(find(k), root);
    }
    const completed = new Set(eligible.map((r) => find("course:" + r.subject_id))).size;
    return { success: true, version: 1, completeness: "complete", policy_id: policy.policy_id, user_id: u.id, profile_id: profile.id, country_code: profile.country_code, ...loyaltyProgress(completed), observed_at: now(), latest_eligible_confirmed_at: eligible.length ? eligible.map((r) => r.payload.completed_at).sort().at(-1) : null };
  }
  return Object.freeze({ createNativeOrigin, createDelegatedOrigin, createAdminUnlinkedOrigin, createLinkedCourse, bindApprovedDriverReference, createNativeDriverBinding, establishNativeDriverBinding, guardNegativeDriverMutation, guardDriverIdentityMutation, finalize, cancel, read });
}

// frozen:base44/shared/base44LedgerPorts.js
var BASE = ["version", "epoch_id", "proof_id", "kind", "subject_type", "subject_id", "country_code", "issued_at", "actor_user_id", "beneficiary_user_id"];
var STORED = [...BASE, "payload_json"];
var COURSE = ["id", "statut", "request_id", "auto_completed", "country_code", "enterprise_id", "client_user_email", "destinataire_client_id", "loyalty_identity_beneficiary_user_id", "pharmacie_id", "conversation_id", "livreur_id", "delivery_confirmed_at", "heure_livraison", "colis_livre_at", "annulation_user_id", "date_annulation", "annulation_source", "annulation_event_at"];
var CLIENT = ["id", "user_email", "country_code", "enterprise_id", "actif"];
var DRIVER = ["id", "user_email", "country_code", "enterprise_id", "actif", "validation", "admin_hors_ligne", "updated_date"];
var SOURCE = ["id", "country_code", "pays_code", "enterprise_id", "course_id", "statut"];
var META = ["id", "created_date", "updated_date", "created_by_id", "created_by", "updated_by", "updated_by_id"];
var projected = (rows, fields) => {
  if (rows.some((r) => Object.keys(r).some((k) => !fields.includes(k) && !META.includes(k)))) fail2();
  return rows;
};
var fail2 = () => {
  throw Object.assign(new Error("LOYALTY_READ_INVALID"), { code: "LOYALTY_READ_INVALID", status: 503 });
};
function decode(row) {
  if (!row || typeof row.payload_json !== "string") fail2();
  let payload;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    fail2();
  }
  return { ...Object.fromEntries(BASE.map((k) => [k, row[k] ?? null])), payload };
}
function encode(row) {
  return { ...Object.fromEntries(BASE.filter((k) => k !== "beneficiary_user_id" || row[k] != null).map((k) => [k, row[k] ?? null])), payload_json: JSON.stringify(row.payload) };
}
function createBase44LedgerPorts(api, { isPinnedReference = () => false, isPinnedNegativeDecision = () => false } = {}) {
  const service = api.asServiceRole.entities, ordinary = api.entities;
  async function one(entity, q, fields) {
    const page = await entity.filter(q, { limit: 2, sort: "id", fields });
    if (!page || !Array.isArray(page.items) || page.items.length > 1 || page.has_more === true) fail2();
    projected(page.items, fields);
    const row = page.items[0] ?? null;
    if (row && Object.entries(q).some(([k, v]) => row[k] !== v)) fail2();
    return row;
  }
  return {
    auth: api.auth,
    approvals: { isPinnedReference, isPinnedNegativeDecision },
    evidence: {
      append: (record2) => service[ENTITY].create(encode(record2)),
      get: async (proof_id) => {
        const r = await one(service[ENTITY], { proof_id }, STORED);
        return r ? decode(r) : null;
      },
      scan: async (query, { cursor, limit }) => {
        const page = cursor ? await service[ENTITY].list({ cursor, limit }) : await service[ENTITY].filter(query, { limit, sort: "proof_id", fields: STORED });
        if (!page || !Array.isArray(page.items) || typeof page.has_more !== "boolean") fail2();
        return { items: projected(page.items, STORED).map(decode), has_more: page.has_more, next_cursor: page.next_cursor };
      }
    },
    clients: { get: (id2) => one(ordinary.ClientExterne, { id: id2 }, CLIENT) },
    delegatedProfiles: { get: (id2) => one(service.ClientExterne, { id: id2 }, [...CLIENT, "updated_date"]) },
    drivers: { get: (id2) => one(service.Livreur, { id: id2 }, DRIVER) },
    nativeUsers: { get: async (id2) => {
      const rows = await service.User.filter({ id: id2 }, "id", 2, 0, ["id", "email", "country_code", "enterprise_id"]);
      if (!Array.isArray(rows) || rows.length > 1) fail2();
      projected(rows, ["id", "email", "country_code", "enterprise_id"]);
      if (rows[0] && rows[0].id !== id2) fail2();
      return rows[0] ?? null;
    } },
    countries: { get: (code) => one(service.Country, { code }, ["id", "code", "actif"]) },
    sources: { get: (type, id2) => {
      if (!["CommandeBoutique", "CommandeRestaurant", "Conversation"].includes(type)) fail2();
      return one((type === "Conversation" ? ordinary : service)[type], { id: id2 }, type === "Conversation" ? [...SOURCE, "participants", "participant_user_ids"] : SOURCE);
    } },
    pharmacies: { get: (id2) => one(service.Pharmacie, { id: id2 }, ["id", "user_email", "pays_code", "enterprise_id", "actif"]) },
    courses: {
      get: (id2) => one(service.CourseExterne, { id: id2 }, COURSE),
      listOwned: async (user, profile) => {
        const q = { country_code: profile.country_code, $or: [{ client_user_email: user.email }, { destinataire_client_id: profile.id }, { loyalty_identity_beneficiary_user_id: user.id }] };
        const rows = [];
        let cursor = null;
        for (let n = 0; n < 100; n++) {
          const page = cursor ? await service.CourseExterne.list({ cursor, limit: 100 }) : await service.CourseExterne.filter(q, { limit: 100, sort: "id", fields: COURSE });
          if (!page || !Array.isArray(page.items) || page.items.length > 100 || typeof page.has_more !== "boolean") fail2();
          rows.push(...projected(page.items, COURSE));
          if (!page.has_more) return rows;
          if (!page.next_cursor || page.next_cursor === cursor) fail2();
          cursor = page.next_cursor;
        }
        fail2();
      }
    }
  };
}

// frozen:base44/shared/ledgerConfig.js
var LEDGER_CONFIG = Object.freeze({ captureEnabled: false, readerEnabled: false, policy: null });

// frozen:base44/shared/adminPhoneCandidate.js
var scope = (x) => x?.enterprise_id ?? null;
var unlinked = (reason) => ({ state: "unlinked", reason, courseFields: {}, originEvidence: null });
function strictPhoneInCountry(phone, country) {
  if (typeof phone !== "string" || phone.length > 80 || !/^\+?[0-9 ()-]+$/.test(phone) || !country || country.actif !== true || !/^[A-Z]{2}$/.test(country.code)) return null;
  const dial = String(country.indicatif ?? "").replace(/^\+/, "");
  const length = country.phone_max_length;
  if (!/^[1-9][0-9]{0,3}$/.test(dial) || !Number.isInteger(length) || length < 6 || length > 12) return null;
  let digits = phone.replace(/[ ()-]/g, "");
  const explicit = digits.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  if (explicit) return digits.startsWith(dial) && digits.length === dial.length + length ? digits : null;
  if (digits.startsWith(dial) && digits.length === dial.length + length) return digits;
  return digits.length === length ? dial + digits : null;
}
async function resolveAdminPhoneCandidate(data, ports) {
  try {
    if (!data || !/^[A-Z]{2}$/.test(data.country_code)) return unlinked("COUNTRY_UNVERIFIED");
    const countries = await ports.countries(data.country_code);
    if (!Array.isArray(countries) || countries.length !== 1 || countries[0].code !== data.country_code) return unlinked("COUNTRY_AMBIGUOUS");
    const phone = strictPhoneInCountry(data.client_telephone, countries[0]);
    if (!phone) return unlinked("PHONE_INVALID_OR_COUNTRY_MISMATCH");
    const page = await ports.phoneProfiles({ country_code: data.country_code, enterprise_id: scope(data), telephone_normalized: phone, limit: 2 });
    if (page?.complete !== true || !Array.isArray(page.items)) return unlinked("LOOKUP_INCOMPLETE");
    if (page.items.length === 0) return unlinked("NO_REGISTERED_ACCOUNT");
    if (page.items.length !== 1) return unlinked("PROFILE_AMBIGUOUS");
    const p = page.items[0];
    if (!p?.id || p.actif !== true || p.country_code !== data.country_code || scope(p) !== scope(data) || typeof p.user_email !== "string" || !p.user_email || p.user_email.trim() !== p.user_email) return unlinked("PROFILE_UNREGISTERED_OR_SCOPE_MISMATCH");
    if (strictPhoneInCountry(p.telephone, countries[0]) !== phone || p.telephone_normalized !== phone) return unlinked("PROFILE_PHONE_CONTRADICTORY");
    const sameEmail = await ports.profilesByEmail(p.user_email, 2);
    if (!Array.isArray(sameEmail) || sameEmail.length !== 1 || sameEmail[0].id !== p.id) return unlinked("PROFILE_IDENTITY_AMBIGUOUS");
    const users = await ports.nativeUsersByEmail(p.user_email, 2);
    if (!Array.isArray(users) || users.length !== 1 || !users[0]?.id || users[0].email !== p.user_email || scope(users[0]) !== scope(data) || users[0].country_code !== data.country_code) return unlinked("NATIVE_ACCOUNT_AMBIGUOUS_OR_SCOPE_MISMATCH");
    return unlinked("NATIVE_PROFILE_PHONE_PROVENANCE_REQUIRED");
  } catch {
    return unlinked("LOOKUP_UNAVAILABLE");
  }
}

// frozen:base44/shared/adminClientLink.js
function normalizeAdminPhone(phone, country) {
  if (typeof phone !== "string" || phone.length > 80 || !/^\+?[0-9 ()-]+$/.test(phone)) return null;
  let n = phone.replace(/[ ()-]/g, "");
  if (n.startsWith("+") || n.startsWith("00")) {
    n = n.startsWith("+") ? n.slice(1) : n.slice(2);
    return /^[1-9][0-9]{6,14}$/.test(n) ? n : null;
  }
  return strictPhoneInCountry(phone, country);
}
var storedPhone = (p, country) => normalizeAdminPhone(p.telephone, country) || (/^[1-9][0-9]{6,14}$/.test(p.telephone_normalized || "") && typeof p.telephone === "string" && p.telephone.replace(/[ ()-]/g, "") === p.telephone_normalized ? p.telephone_normalized : null);
var PROFILE_FIELDS = ["id", "updated_date", "user_email", "telephone", "telephone_normalized", "country_code", "enterprise_id", "actif"];
var USER_FIELDS = ["id", "email", "full_name", "country_code", "enterprise_id"];
var tenant = (x) => x?.enterprise_id ?? null;
var exact2 = (o, keys) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));
var validId = (x) => typeof x === "string" && x.length > 0 && x.length <= 200 && x.trim() === x;
var CANDIDATE = ["version", "profile_id", "profile_updated_date", "native_user_id", "native_user_snapshot_sha256", "country_code", "enterprise_id", "normalized_phone"];
var result = (status, reason) => ({ status, reason, can_create_unlinked: true });
var hash2 = async (text) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), (x) => x.toString(16).padStart(2, "0")).join("");
var ClientLinkReviewError = class extends Error {
  constructor() {
    super("Le compte client doit \xEAtre v\xE9rifi\xE9 \xE0 nouveau avant de cr\xE9er la course.");
    this.code = "CLIENT_LINK_REVIEW_REQUIRED";
    this.status = 409;
  }
};
var decisions = /* @__PURE__ */ new WeakMap();
var readPinnedAdminDecisionMode = (decision) => decisions.get(decision)?.mode ?? null;
var isPinnedAdminDecision = (decision, actorId) => decisions.get(decision)?.actor_user_id === actorId;
function readPinnedAdminDecision(decision, actorId) {
  const d = decisions.get(decision);
  if (!d || d.actor_user_id !== actorId) throw new ClientLinkReviewError();
  return d;
}
async function boundedProfiles(api, scope2) {
  const rows = [], seen = /* @__PURE__ */ new Set();
  for (let offset = 0; offset < 2e3; offset += 100) {
    const page = await api.asServiceRole.entities.ClientExterne.filter(scope2, "id", 100, offset, PROFILE_FIELDS);
    if (!Array.isArray(page) || page.length > 100) throw Error("PROFILE_SCAN_INCOMPLETE");
    for (const p of page) {
      if (!p?.id || seen.has(p.id) || p.country_code !== scope2.country_code || tenant(p) !== (scope2.enterprise_id ?? null)) throw Error("PROFILE_SCAN_CHANGED");
      seen.add(p.id);
      rows.push(p);
    }
    if (page.length < 100) return rows;
  }
  throw Error("PROFILE_SCAN_LIMIT");
}
async function previewAdminClientAccount(api, grant, data) {
  try {
    if (!grant.country_codes.includes(data.country_code) || tenant(data) !== grant.enterprise_id) return result("unverified", "SCOPE_MISMATCH");
    const countries = await api.asServiceRole.entities.Country.filter({ code: data.country_code, actif: true }, "id", 2, 0, ["id", "code", "actif", "indicatif", "phone_max_length"]);
    if (!Array.isArray(countries) || countries.length !== 1 || countries[0].code !== data.country_code) return result("unverified", "COUNTRY_UNVERIFIED");
    const phone = normalizeAdminPhone(data.client_telephone, countries[0]);
    if (!phone) return result("unverified", "PHONE_INVALID_OR_COUNTRY_MISMATCH");
    const profiles = await boundedProfiles(api, { country_code: data.country_code, enterprise_id: grant.enterprise_id });
    const matches = profiles.filter((p2) => storedPhone(p2, countries[0]) === phone || p2.telephone_normalized === phone);
    if (matches.length === 0) return result("none", "NO_ACCOUNT");
    if (matches.length !== 1) return result("ambiguous", "PHONE_MULTIPLE_PROFILES");
    const p = matches[0];
    if (p.actif !== true || !validId(p.updated_date) || !validId(p.user_email)) return result("unverified", "PROFILE_NOT_REGISTERED_OR_CURRENT");
    if (storedPhone(p, countries[0]) !== phone || p.telephone_normalized != null && p.telephone_normalized !== "" && p.telephone_normalized !== phone) return result("unverified", "PHONE_FIELDS_CONTRADICTORY");
    if (profiles.filter((x) => x.user_email === p.user_email).length !== 1) return result("ambiguous", "ACCOUNT_MULTIPLE_PROFILES");
    const users = await api.asServiceRole.entities.User.filter({ email: p.user_email }, "id", 2, 0, USER_FIELDS);
    if (!Array.isArray(users) || users.length !== 1) return result(users?.length > 1 ? "ambiguous" : "unverified", "NATIVE_USER_NOT_UNIQUE");
    const u = users[0];
    if (!validId(u?.id) || u.email !== p.user_email || tenant(u) !== grant.enterprise_id || u.country_code != null && u.country_code !== data.country_code) return result("unverified", "NATIVE_SCOPE_MISMATCH");
    const snapshot = Object.fromEntries(USER_FIELDS.map((k) => [k, Object.hasOwn(u, k) ? { present: true, value: u[k] } : { present: false }]));
    const digest = await hash2(JSON.stringify(snapshot));
    const candidate = { version: 1, profile_id: p.id, profile_updated_date: p.updated_date, native_user_id: u.id, native_user_snapshot_sha256: digest, country_code: data.country_code, enterprise_id: grant.enterprise_id, normalized_phone: phone };
    const [local, domain] = u.email.split("@");
    const display = { name: typeof u.full_name === "string" && u.full_name.trim() ? u.full_name.trim() : "Compte inscrit", masked_email: domain ? local.slice(0, 2) + "***@" + domain : "Compte inscrit" };
    return { ...result("linked"), display, candidate, _resolved: { profile: p, user: u, phone } };
  } catch {
    return result("unverified", "LOOKUP_UNAVAILABLE_OR_INCOMPLETE");
  }
}
var publicAdminPreview = (p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== "_resolved"));
async function confirmAdminClientAccount(api, actor, grant, data, selection) {
  if (selection === void 0 || exact2(selection, ["mode"]) && selection.mode === "unlinked") {
    const decision2 = Object.freeze({});
    decisions.set(decision2, Object.freeze({ mode: "unlinked", reason: selection === void 0 ? "legacy_no_tuple" : "explicit_unlinked", actor_user_id: actor.id, actor_email: actor.email, grant_action: grant.action, country_code: data.country_code, enterprise_id: grant.enterprise_id }));
    return decision2;
  }
  if (!exact2(selection, ["mode", "candidate"]) || selection.mode !== "confirmed" || !exact2(selection.candidate, CANDIDATE)) throw new ClientLinkReviewError();
  const fresh = await previewAdminClientAccount(api, grant, data);
  if (fresh.status !== "linked" || CANDIDATE.some((k) => fresh.candidate[k] !== selection.candidate[k])) throw new ClientLinkReviewError();
  const decision = Object.freeze({});
  decisions.set(decision, Object.freeze({ mode: "linked", actor_user_id: actor.id, actor_email: actor.email, grant_action: grant.action, country_code: data.country_code, enterprise_id: grant.enterprise_id, candidate: Object.freeze({ ...fresh.candidate }), beneficiary_user_id: fresh._resolved.user.id, beneficiary_email: fresh._resolved.user.email, profile_id: fresh._resolved.profile.id, profile_updated_date: fresh._resolved.profile.updated_date }));
  return decision;
}
function adminAccountCourseFields(decision, actorId, type) {
  if (!decision) return {};
  const d = readPinnedAdminDecision(decision, actorId);
  if (d.mode === "unlinked") return {};
  return { client_user_email: d.beneficiary_email, ...type === "expedier" ? { expediteur_client_id: d.profile_id } : type === "recevoir" ? { destinataire_client_id: d.profile_id } : {} };
}

// frozen:base44/shared/adminDelegatedCapture.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.57";
async function captureAdminCourseOrigin(req, decision, create) {
  let runtime = createLedgerRuntime({}, { captureEnabled: false, readerEnabled: false, policy: null });
  if (decision && LEDGER_CONFIG.captureEnabled === true) {
    try {
      const policy = parseLedgerPolicy(LEDGER_CONFIG.policy), api = createClientFromRequest(req), user = await api.auth.me(), ports = createBase44LedgerPorts(api);
      ports.auth = { me: async () => user };
      ports.approvals.isPinnedDelegatedOrigin = isPinnedAdminDecision;
      ports.approvals.readDelegatedDecision = readPinnedAdminDecision;
      runtime = createLedgerRuntime(ports, { captureEnabled: true, readerEnabled: false, policy });
    } catch {
    }
  }
  const method = readPinnedAdminDecisionMode(decision) === "unlinked" ? "createAdminUnlinkedOrigin" : "createDelegatedOrigin";
  const r = await runtime[method](decision, async () => ({ created: true, entity: "CourseExterne", row: await create() }));
  return r.result.row;
}

// frozen:base44/shared/dispatchConstants.ts
init_geoUtils();
var STATUTS_ACTIFS_COURSE = [
  "livreur_en_route",
  "client_contacte",
  "en_route_expediteur",
  "arrive_prise_en_charge",
  "colis_recupere",
  "passager_embarque",
  "pris_en_charge",
  "en_livraison",
  "arrivee"
];
var STATUTS_ACTIFS_VERIF = STATUTS_ACTIFS_COURSE;
var STATUTS_TERMINAUX_COURSE = ["livree", "annulee"];
var INDICATIFS = {};
async function getIndicatifPays(base44, countryCode) {
  if (!countryCode) return "";
  if (INDICATIFS[countryCode]) return INDICATIFS[countryCode];
  try {
    const country = await chargerConfigPays(base44, countryCode);
    if (country?.indicatif) {
      const dial = String(country.indicatif).replace(/^\+/, "");
      INDICATIFS[countryCode] = `+${dial}`;
      return `+${dial}`;
    }
  } catch {
  }
  return "";
}
function normalizeCommissionPct(value) {
  const pct = Number(value);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return pct;
}
var TARIF_ZONE_CACHE = /* @__PURE__ */ new Map();
var TARIF_ZONE_TTL_MS = 5 * 60 * 1e3;
async function chargerTarifZone(base44, countryCode, ville) {
  if (!countryCode) return null;
  const cacheKey = `${countryCode}|${ville || ""}`;
  const cached = TARIF_ZONE_CACHE.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;
  try {
    const zones = await base44.asServiceRole.entities.TarifZone.filter({ pays_code: countryCode, actif: true }, "-date_debut", 50);
    if (!zones || zones.length === 0) return null;
    const now = /* @__PURE__ */ new Date();
    const valid2 = zones.filter((z) => {
      const debut = z.date_debut ? new Date(z.date_debut) : null;
      const fin = z.date_fin ? new Date(z.date_fin) : null;
      if (debut && now < debut) return false;
      if (fin && now > fin) return false;
      return true;
    });
    let selected = ville ? valid2.find((z) => z.ville === ville) : null;
    if (!selected) selected = valid2[0];
    if (!selected) return null;
    TARIF_ZONE_CACHE.set(cacheKey, { data: selected, expires: Date.now() + TARIF_ZONE_TTL_MS });
    return selected;
  } catch {
    return null;
  }
}
var COUNTRY_CONFIG_CACHE = /* @__PURE__ */ new Map();
var COUNTRY_CONFIG_TTL_MS = 5 * 60 * 1e3;
async function chargerConfigPays(base44, countryCode) {
  if (!countryCode) return null;
  const cached = COUNTRY_CONFIG_CACHE.get(countryCode);
  if (cached && cached.expires > Date.now()) return cached.data;
  const countries = await base44.asServiceRole.entities.Country.filter({ code: countryCode, actif: true });
  const data = countries?.[0] || null;
  if (data) {
    COUNTRY_CONFIG_CACHE.set(countryCode, { data, expires: Date.now() + COUNTRY_CONFIG_TTL_MS });
  }
  return data;
}

// frozen:base44/shared/commissionLock.ts
function isPublicCommission(course) {
  return !String(course?.enterprise_id ?? "").trim();
}
function hasZeroCommissionLock(course) {
  return isPublicCommission(course) && course?.commission_taux_applique != null && course.commission_taux_applique !== "" && Number(course.commission_taux_applique) === 0 && ["pass_zero", "happy_hour"].includes(course.commission_mode);
}
function tauxCommissionEffectif(course, fallback) {
  const locked = isPublicCommission(course) && course?.commission_taux_applique != null;
  if (!locked && isPublicCommission(course) && ["pass_zero", "happy_hour"].includes(course?.commission_mode)) {
    throw new Error("COMMISSION_LOCK_REQUIRED");
  }
  const raw = locked ? course.commission_taux_applique : fallback;
  const rate = raw == null || raw === "" ? NaN : Number(raw);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("COMMISSION_RATE_INVALID");
  return rate;
}
async function chargerTauxCommissionEffectif(course, loadFallback) {
  if (isPublicCommission(course) && course?.commission_taux_applique != null) {
    return tauxCommissionEffectif(course, null);
  }
  return tauxCommissionEffectif(course, await loadFallback());
}
function commissionComptabilisable(course) {
  return hasZeroCommissionLock(course) ? 0 : Number(course?.commission_silga) || 0;
}
function zeroCommissionFields(course) {
  return hasZeroCommissionLock(course) ? { encours_comptabilise_montant: 0 } : {};
}
function champsLockCommission(avantage, timestamp) {
  if (!avantage || !Number.isFinite(avantage.taux_applique)) throw new Error("COMMISSION_LOCK_REQUIRED");
  return {
    commission_taux_normal: avantage.taux_normal,
    commission_taux_applique: avantage.taux_applique,
    commission_mode: avantage.mode,
    pass_id: avantage.pass_id ?? "",
    happy_hour_id: avantage.happy_hour_id ?? "",
    commission_locked_at: timestamp
  };
}
function verifierCoherenceLock(course, avantage) {
  if (!course?.commission_locked_at || course.commission_taux_applique == null) throw new Error("COMMISSION_LOCK_REQUIRED");
  if (avantage && (course.commission_mode !== avantage.mode || Number(course.commission_taux_applique) !== avantage.taux_applique || avantage.mode === "pass_zero" && course.pass_id !== avantage.pass_id || avantage.mode === "happy_hour" && course.happy_hour_id !== avantage.happy_hour_id)) {
    throw new Error("COMMISSION_LOCK_MISMATCH");
  }
}

// frozen:base44/shared/commissionAvantage.ts
init_enterpriseFinance();
async function passActifAt(base44, livreurId, timestamp) {
  if (!livreurId) return { actif: false, pass_id: null };
  let achats;
  try {
    achats = await base44.asServiceRole.entities.PassAchat.filter({
      livreur_id: livreurId,
      statut: "valide",
      debut_at: { $lte: timestamp.toISOString() },
      expiration_at: { $gt: timestamp.toISOString() }
    }, "-debut_at", 100);
  } catch (error) {
    const origMsg = error?.message || String(error);
    console.error(JSON.stringify({ event: "PASS_LOOKUP_ERROR", livreur_id: livreurId, timestamp: timestamp.toISOString(), error: origMsg }));
    const isRateLimit = origMsg.toLowerCase().includes("rate limit") || origMsg.includes("429");
    throw new Error(
      isRateLimit ? `PASS_LOOKUP_ERROR: rate limit exceeded \u2014 ${origMsg}` : `PASS_LOOKUP_ERROR: v\xE9rification indisponible, r\xE9essayez (${origMsg})`
    );
  }
  for (const achat of achats || []) {
    if (!achat.debut_at || !achat.expiration_at) continue;
    const debut = new Date(achat.debut_at);
    const fin = new Date(achat.expiration_at);
    if (timestamp >= debut && timestamp < fin) {
      console.info(JSON.stringify({ event: "PASS_FOUND", livreur_id: livreurId, pass_id: achat.id, timestamp: timestamp.toISOString() }));
      return { actif: true, pass_id: achat.id };
    }
  }
  console.info(JSON.stringify({ event: "NO_ACTIVE_PASS", livreur_id: livreurId, timestamp: timestamp.toISOString() }));
  return { actif: false, pass_id: null };
}
async function happyHourActifAt(base44, countryCode, timestamp) {
  if (!countryCode) return { actif: false, config_id: null, taux_promotionnel: 0 };
  const configs = await base44.asServiceRole.entities.HappyHourConfig.filter({
    country_code: countryCode,
    actif: true
  });
  for (const config of configs || []) {
    if (!config.heure_debut || !config.heure_fin) continue;
    const tz = config.fuseau_horaire || "Africa/Ouagadougou";
    const localTime = new Date(timestamp.toLocaleString("en-US", { timeZone: tz }));
    if (config.recurrence === "hebdomadaire" && config.jour_semaine != null) {
      const jourTs = localTime.getDay();
      if (jourTs !== Number(config.jour_semaine)) continue;
    } else if (config.recurrence === "unique" && config.date_specifique) {
      const dateStr = localTime.toISOString().slice(0, 10);
      if (dateStr !== config.date_specifique) continue;
    }
    const hh = String(localTime.getHours()).padStart(2, "0");
    const mm = String(localTime.getMinutes()).padStart(2, "0");
    const timeStr = `${hh}:${mm}`;
    if (timeStr >= config.heure_debut && timeStr < config.heure_fin) {
      return {
        actif: true,
        config_id: config.id,
        taux_promotionnel: Number(config.taux_promotionnel) || 0
      };
    }
  }
  return { actif: false, config_id: null, taux_promotionnel: 0 };
}
async function evaluerAvantageCommission(base44, livreurId, countryCode, timestamp) {
  const countryConfig = await chargerConfigPays(base44, countryCode);
  const tauxNormal = countryConfig?.commission_pct == null ? null : normalizeCommissionPct(countryConfig.commission_pct);
  if (tauxNormal === null) throw new Error("COUNTRY_COMMISSION_LOOKUP_ERROR");
  const hh = await happyHourActifAt(base44, countryCode, timestamp);
  if (hh.actif && hh.config_id) {
    console.info(JSON.stringify({ event: "HAPPY_HOUR", country_code: countryCode, happy_hour_id: hh.config_id, timestamp: timestamp.toISOString() }));
    return {
      taux_normal: tauxNormal,
      taux_applique: hh.taux_promotionnel,
      mode: "happy_hour",
      pass_id: null,
      happy_hour_id: hh.config_id
    };
  }
  const pass = await passActifAt(base44, livreurId, timestamp);
  if (pass.actif && pass.pass_id) {
    return {
      taux_normal: tauxNormal,
      taux_applique: 0,
      mode: "pass_zero",
      pass_id: pass.pass_id,
      happy_hour_id: null
    };
  }
  console.info(JSON.stringify({ event: "NORMAL_CONFIRMED", livreur_id: livreurId, country_code: countryCode, timestamp: timestamp.toISOString() }));
  return {
    taux_normal: tauxNormal,
    taux_applique: tauxNormal,
    mode: "normal",
    pass_id: null,
    happy_hour_id: null
  };
}
async function figerCommissionAcceptation(base44, courseId, livreurId, countryCode, heureAcceptation) {
  if (!courseId || !livreurId || !countryCode || !heureAcceptation) {
    console.warn(`[COMMISSION_LOCK] Param\xE8tres manquants \u2014 course=${courseId || "null"} livreur=${livreurId || "null"} country=${countryCode || "null"} heure=${heureAcceptation || "null"}`);
    return null;
  }
  try {
    const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
    if (course && normalizeEnterpriseId(course.enterprise_id)) {
      if (course.enterprise_commission_rate_locked != null && course.enterprise_commission_locked_at) {
        const tauxExistant = Number(course.enterprise_commission_rate_locked);
        console.log(`[COMMISSION_LOCK] Course Enterprise ${courseId} d\xE9j\xE0 fig\xE9e \xE0 ${tauxExistant}% \u2014 skip re-figement`);
        return {
          taux_normal: tauxExistant,
          taux_applique: tauxExistant,
          mode: "normal",
          pass_id: null,
          happy_hour_id: null
        };
      }
      const enterprises = await base44.asServiceRole.entities.Enterprise.filter({
        enterprise_financier_id: normalizeEnterpriseId(course.enterprise_id)
      }).catch(() => []);
      const enterprise = enterprises?.[0];
      const tauxEnterprise = Number(enterprise?.commission_silgapp_pct);
      if (!Number.isFinite(tauxEnterprise) || tauxEnterprise < 0) {
        console.error(`[COMMISSION_LOCK] Course Enterprise ${courseId} \u2014 taux invalide sur l'entreprise, fallback normal`);
      } else {
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        await base44.asServiceRole.entities.CourseExterne.update(courseId, {
          enterprise_commission_rate_locked: tauxEnterprise,
          enterprise_commission_locked_at: nowIso,
          // commission_taux_applique = 0 pour que le livreur ne soit pas débité
          // (la commission Enterprise est payée par l'entreprise via EnterpriseLedger)
          commission_taux_normal: tauxEnterprise,
          commission_taux_applique: 0,
          commission_mode: "normal",
          pass_id: "",
          happy_hour_id: "",
          commission_locked_at: nowIso
        });
        console.log(`[COMMISSION_LOCK] Course Enterprise ${courseId} fig\xE9e: mode=normal taux_enterprise=${tauxEnterprise}% (commission_silga=0 \u2014 pay\xE9e par entreprise) livreur=${livreurId}`);
        return {
          taux_normal: tauxEnterprise,
          taux_applique: 0,
          mode: "normal",
          pass_id: null,
          happy_hour_id: null
        };
      }
    }
    if (course?.commission_locked_at && course.commission_taux_applique != null && String(course.livreur_id) === String(livreurId) && new Date(course.commission_locked_at) >= new Date(heureAcceptation)) {
      return {
        taux_normal: Number(course.commission_taux_normal),
        taux_applique: Number(course.commission_taux_applique),
        mode: course.commission_mode,
        pass_id: course.pass_id || null,
        happy_hour_id: course.happy_hour_id || null
      };
    }
    const avantage = await evaluerAvantageCommission(base44, livreurId, countryCode, new Date(heureAcceptation));
    await base44.asServiceRole.entities.CourseExterne.update(
      courseId,
      champsLockCommission(avantage, (/* @__PURE__ */ new Date()).toISOString())
    );
    const persisted = await base44.asServiceRole.entities.CourseExterne.get(courseId);
    verifierCoherenceLock(persisted, avantage);
    console.log(`[COMMISSION_LOCK] Course ${courseId} fig\xE9e: mode=${avantage.mode} taux=${avantage.taux_applique}% (normal=${avantage.taux_normal}%) livreur=${livreurId}`);
    return avantage;
  } catch (err) {
    console.error(`[COMMISSION_LOCK] \xC9CHEC figement \u2014 course=${courseId} livreur=${livreurId} country=${countryCode} heure_acceptation=${heureAcceptation} erreur="${err?.message || String(err)}"`);
    return null;
  }
}
async function verifierPassActifMaintenant(base44, livreurId) {
  if (!livreurId) return { actif: false, expiration_at: null, pass_nom: null };
  const now = /* @__PURE__ */ new Date();
  const achats = await base44.asServiceRole.entities.PassAchat.filter({
    livreur_id: livreurId,
    statut: "valide"
  }).catch(() => []);
  for (const achat of achats || []) {
    if (!achat.debut_at || !achat.expiration_at) continue;
    const debut = new Date(achat.debut_at);
    const fin = new Date(achat.expiration_at);
    if (now >= debut && now < fin) {
      return {
        actif: true,
        expiration_at: achat.expiration_at,
        pass_nom: achat.pass_offer_nom || null
      };
    }
  }
  return { actif: false, expiration_at: null, pass_nom: null };
}
async function verifierHappyHourActifMaintenant(base44, countryCode) {
  if (!countryCode) return { actif: false, fin_at: null, taux: null };
  const hh = await happyHourActifAt(base44, countryCode, /* @__PURE__ */ new Date());
  if (!hh.actif) return { actif: false, fin_at: null, taux: null };
  const configs = await base44.asServiceRole.entities.HappyHourConfig.filter({
    country_code: countryCode,
    actif: true
  }).catch(() => []);
  for (const config of configs || []) {
    if (config.id === hh.config_id && config.heure_fin) {
      const tz = config.fuseau_horaire || "Africa/Ouagadougou";
      const now = /* @__PURE__ */ new Date();
      const localTime = new Date(now.toLocaleString("en-US", { timeZone: tz }));
      const [finH, finM] = config.heure_fin.split(":").map(Number);
      localTime.setHours(finH, finM, 0, 0);
      return {
        actif: true,
        fin_at: localTime.toISOString(),
        taux: hh.taux_promotionnel
      };
    }
  }
  return { actif: true, fin_at: null, taux: hh.taux_promotionnel };
}

// frozen:base44/shared/dispatchNotifications.ts
async function getLivreursNotifies(base44, courseId) {
  try {
    const notifs = await base44.asServiceRole.entities.DispatchNotification.filter(
      { course_id: courseId },
      "-date_notification",
      500
    );
    return (notifs || []).filter((n) => n.statut !== "refuse").map((n) => n.livreur_id);
  } catch (err) {
    console.error("[DispatchNotif] Erreur getLivreursNotifies:", err.message);
    return [];
  }
}
async function getLivreursRefuses(base44, courseId) {
  try {
    const notifs = await base44.asServiceRole.entities.DispatchNotification.filter(
      { course_id: courseId, statut: "refuse" },
      "-date_notification",
      500
    );
    return (notifs || []).map((n) => n.livreur_id);
  } catch (err) {
    console.error("[DispatchNotif] Erreur getLivreursRefuses:", err.message);
    return [];
  }
}
async function getLivreursEnAttente(base44, courseId) {
  try {
    const notifs = await base44.asServiceRole.entities.DispatchNotification.filter(
      { course_id: courseId, statut: "notifie" },
      "-date_notification",
      500
    );
    return (notifs || []).map((n) => n.livreur_id);
  } catch (err) {
    console.error("[DispatchNotif] Erreur getLivreursEnAttente:", err.message);
    return [];
  }
}
async function livreurATokenFCM(base44, livreurId) {
  if (!livreurId) return false;
  try {
    const tokens = await base44.asServiceRole.entities.NotificationToken.filter(
      { livreur_id: livreurId, actif: true },
      void 0,
      10
    );
    return (tokens || []).some((t) => t.token && !String(t.token).startsWith("web_"));
  } catch {
    return false;
  }
}
async function mettreAJourStatutPush(base44, courseId, livreurId, nouveauStatut) {
  try {
    await base44.asServiceRole.entities.DispatchNotification.updateMany(
      { course_id: courseId, livreur_id: livreurId, statut: { $in: ["notifie", "push_tente", "sans_token"] } },
      { $set: { statut: nouveauStatut } }
    );
  } catch (err) {
    console.error("[DispatchNotif] Erreur mettreAJourStatutPush:", err.message);
  }
}
async function enregistrerNotification(base44, courseId, livreur, vague, options = {}) {
  try {
    const existing = await base44.asServiceRole.entities.DispatchNotification.filter(
      { course_id: courseId, livreur_id: livreur.id },
      "-date_notification",
      1
    );
    if (existing && existing.length > 0) {
      return existing[0];
    }
    const hasToken = await livreurATokenFCM(base44, livreur.id);
    const statut = hasToken ? "notifie" : "sans_token";
    return await base44.asServiceRole.entities.DispatchNotification.create({
      course_id: courseId,
      livreur_id: livreur.id,
      livreur_user_email: livreur.user_email || null,
      country_code: livreur.country_code || options.country_code || "",
      vague: vague || 1,
      statut,
      distance_km: livreur.distance != null ? Number(livreur.distance.toFixed(2)) : null,
      gps_age_min: livreur.gpsAgeMin != null ? Number(livreur.gpsAgeMin.toFixed(1)) : null,
      priorite_dispatch: livreur.priorite_dispatch || 0,
      date_notification: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    console.error("[DispatchNotif] Erreur enregistrerNotification:", err.message);
    return null;
  }
}
async function marquerRefuse(base44, courseId, livreurId, raison = "") {
  try {
    await base44.asServiceRole.entities.DispatchNotification.updateMany(
      { course_id: courseId, livreur_id: livreurId, statut: { $in: ["notifie", "push_tente", "push_succes", "push_echec", "sans_token"] } },
      { $set: { statut: "refuse", date_reponse: (/* @__PURE__ */ new Date()).toISOString(), raison_refus: raison } }
    );
  } catch (err) {
    console.error("[DispatchNotif] Erreur marquerRefuse:", err.message);
  }
}
async function marquerAccepte(base44, courseId, livreurId, tempsReponseSec = null) {
  try {
    const updateData = {
      $set: {
        statut: "accepte",
        date_reponse: (/* @__PURE__ */ new Date()).toISOString()
      }
    };
    if (tempsReponseSec != null) {
      updateData.$set.temps_reponse_sec = tempsReponseSec;
    }
    await base44.asServiceRole.entities.DispatchNotification.updateMany(
      { course_id: courseId, livreur_id: livreurId, statut: { $in: ["notifie", "push_tente", "push_succes", "push_echec", "sans_token"] } },
      updateData
    );
  } catch (err) {
    console.error("[DispatchNotif] Erreur marquerAccepte:", err.message);
  }
}
async function marquerExpirees(base44, courseId) {
  try {
    await base44.asServiceRole.entities.DispatchNotification.updateMany(
      { course_id: courseId, statut: { $in: ["notifie", "push_tente", "push_succes", "push_echec", "sans_token"] } },
      { $set: { statut: "expire", date_reponse: (/* @__PURE__ */ new Date()).toISOString() } }
    );
  } catch (err) {
    console.error("[DispatchNotif] Erreur marquerExpirees:", err.message);
  }
}
async function resetNotifications(base44, courseId) {
  try {
    await base44.asServiceRole.entities.DispatchNotification.deleteMany(
      { course_id: courseId, statut: { $in: ["notifie", "expire", "accepte"] } }
    );
  } catch (err) {
    console.error("[DispatchNotif] Erreur resetNotifications:", err.message);
  }
}
async function compterNotifications(base44, courseId) {
  try {
    const notifs = await base44.asServiceRole.entities.DispatchNotification.filter(
      { course_id: courseId },
      "-date_notification",
      500
    );
    const stats = { total: notifs.length, notifie: 0, refuse: 0, expire: 0, accepte: 0 };
    for (const n of notifs || []) {
      if (stats[n.statut] != null) stats[n.statut]++;
    }
    return stats;
  } catch (err) {
    console.error("[DispatchNotif] Erreur compterNotifications:", err.message);
    return { total: 0, notifie: 0, refuse: 0, expire: 0, accepte: 0 };
  }
}
async function enregistrerNotificationsBulk(base44, courseId, candidats, vague = 0, options = {}) {
  if (!candidats || candidats.length === 0) return { created: 0, notifs: [] };
  try {
    const livreurIds = candidats.map((l) => l.id);
    const existing = await base44.asServiceRole.entities.DispatchNotification.filter(
      { course_id: courseId },
      "-date_notification",
      500
    );
    const existingIds = new Set((existing || []).map((n) => n.livreur_id));
    const tokens = await base44.asServiceRole.entities.NotificationToken.filter(
      { livreur_id: { $in: livreurIds }, actif: true },
      void 0,
      livreurIds.length * 3
    ).catch(() => []);
    const livreursWithToken = /* @__PURE__ */ new Set();
    for (const t of tokens || []) {
      if (t.token && !String(t.token).startsWith("web_")) {
        livreursWithToken.add(t.livreur_id);
      }
    }
    const toCreate = [];
    for (const livreur of candidats) {
      if (existingIds.has(livreur.id)) continue;
      const hasToken = livreursWithToken.has(livreur.id);
      if (!hasToken) continue;
      toCreate.push({
        course_id: courseId,
        livreur_id: livreur.id,
        livreur_user_email: livreur.user_email || null,
        country_code: livreur.country_code || options.country_code || "",
        vague: vague || 1,
        statut: "notifie",
        distance_km: livreur.distance != null ? Number(livreur.distance.toFixed(2)) : null,
        gps_age_min: livreur.gpsAgeMin != null ? Number(livreur.gpsAgeMin.toFixed(1)) : null,
        priorite_dispatch: livreur.priorite_dispatch || 0,
        date_notification: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    let created = [];
    if (toCreate.length > 0) {
      created = await base44.asServiceRole.entities.DispatchNotification.bulkCreate(toCreate);
    }
    return { created: Array.isArray(created) ? created.length : 0, notifs: created || [] };
  } catch (err) {
    console.error("[DispatchNotif] Erreur enregistrerNotificationsBulk:", err.message);
    return { created: 0, notifs: [] };
  }
}
async function enregistrerInboxNotificationsBulk(base44, course, candidats) {
  if (!candidats || candidats.length === 0) return { created: 0 };
  try {
    const dedupKeys = candidats.map((l) => `COURSE_DISPATCH_${course.id}_${l.id}`);
    const existing = await base44.asServiceRole.entities.Notification.filter(
      { deduplication_key: { $in: dedupKeys } },
      void 0,
      dedupKeys.length
    ).catch(() => []);
    const existingKeys = new Set((existing || []).map((n) => n.deduplication_key));
    const toCreate = [];
    for (const livreur of candidats) {
      if (!livreur.user_email) continue;
      const dedupKey = `COURSE_DISPATCH_${course.id}_${livreur.id}`;
      if (existingKeys.has(dedupKey)) continue;
      toCreate.push({
        titre: "Nouvelle course SILGAPP",
        message: `${course.quartier_depart || course.adresse_depart || "D\xE9part"} \u2192 ${course.quartier_arrivee || course.adresse_arrivee || "destination"}`,
        type: "nouvelle_course",
        course_id: course.id,
        destinataire_email: livreur.user_email,
        deduplication_key: dedupKey,
        lue: false
      });
    }
    if (toCreate.length > 0) {
      await base44.asServiceRole.entities.Notification.bulkCreate(toCreate);
    }
    return { created: toCreate.length };
  } catch (err) {
    console.error("[DispatchNotif] Erreur enregistrerInboxNotificationsBulk:", err.message);
    return { created: 0 };
  }
}
async function mettreAJourStatutPushBulk(base44, courseId, updates) {
  if (!updates || updates.length === 0) return;
  try {
    const byStatut = {};
    for (const u of updates) {
      if (!byStatut[u.statut]) byStatut[u.statut] = [];
      byStatut[u.statut].push(u.livreur_id);
    }
    const promises = [];
    for (const [statut, livreurIds] of Object.entries(byStatut)) {
      promises.push(
        base44.asServiceRole.entities.DispatchNotification.updateMany(
          { course_id: courseId, livreur_id: { $in: livreurIds }, statut: { $in: ["notifie", "push_tente", "sans_token"] } },
          { $set: { statut } }
        ).catch(() => null)
      );
    }
    await Promise.allSettled(promises);
  } catch (err) {
    console.error("[DispatchNotif] Erreur mettreAJourStatutPushBulk:", err.message);
  }
}

// frozen:base44/shared/courseAcceptanceLock.ts
async function claimCourseForLivreur(base44, courseId, livreurId, allowedDispatchStatuses, updateData) {
  const statuses = Array.from(new Set(allowedDispatchStatuses.filter(Boolean)));
  if (!courseId || !livreurId || statuses.length === 0) {
    return { claimed: false, reason: "invalid_claim_input", course: null };
  }
  await base44.asServiceRole.entities.CourseExterne.updateMany(
    {
      id: courseId,
      dispatch_status: { $in: statuses }
    },
    { $set: updateData }
  );
  const fresh = await base44.asServiceRole.entities.CourseExterne.get(courseId);
  const claimed = String(fresh?.livreur_id || "") === String(livreurId) || String(fresh?.accepted_by_livreur_id || "") === String(livreurId);
  return {
    claimed,
    reason: claimed ? "claimed" : "race_condition_lost",
    course: fresh
  };
}

// frozen:base44/shared/ecoOptimizationEngine.ts
init_enterpriseFinance();
var ACTIVE_STATUSES2 = [
  "livreur_en_route",
  "client_contacte",
  "en_route_expediteur",
  "arrive_prise_en_charge",
  "colis_recupere",
  "passager_embarque",
  "pris_en_charge",
  "en_livraison",
  "arrivee"
];
var TERMINAL_STATUSES2 = ["livree", "annulee", "completed", "delivered", "canceled"];
var DEFAULT_CONVERT_DELAY_MIN = 45;
var DEFAULT_MAX_COURSES = 2;
var DEFAULT_PROPOSAL_EXPIRATION_SEC = 300;
var DEFAULT_MAX_DETOUR_KM = 6;
var DEFAULT_MIN_GAIN = 0;
var DEFAULT_ON_ROUTE_PRIORITY_SEC = 15;
var ECO_PREFIX = "ECO";
var DEFAULT_CHAIN_MAX_PICKUP_KM = 8;
var DEFAULT_CHAIN_MAX_DROP_KM = 2.5;
var DEFAULT_CHAIN_MIN_GAIN_FCFA = 1e3;
var DEFAULT_CHAIN_COST_PER_KM = 75;
var DEFAULT_CHAIN_MAX_TIME_DIFF_HOURS = 2;
function key(countryCode, name) {
  return `${ECO_PREFIX}:${String(countryCode || "").toUpperCase()}:${name}`;
}
function parseBool(value, fallback = false) {
  if (value === void 0 || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}
function parseNumber(value, fallback, min = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : fallback;
}
function isPublicCourse(course) {
  return normalizeEnterpriseId(course?.enterprise_id) === null;
}
function normalizeDeliveryMode(value) {
  return String(value || "").toLowerCase() === "eco" ? "eco" : "standard";
}
function prixCourse2(course) {
  return Number(course?.prix_final || course?.prix_propose_client || course?.prix_propose_admin || course?.prix_estimate || 0) || 0;
}
function calculerDistance2(lat1, lon1, lat2, lon2) {
  const aLat = Number(lat1);
  const aLon = Number(lon1);
  const bLat = Number(lat2);
  const bLon = Number(lon2);
  if (![aLat, aLon, bLat, bLon].every(Number.isFinite)) return null;
  const toRad = (value) => value * Math.PI / 180;
  const earthKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function hasUsableRoutePoints2(course) {
  return Number.isFinite(Number(course?.gps_depart_lat)) && Number.isFinite(Number(course?.gps_depart_lng)) && Number.isFinite(Number(course?.gps_arrivee_lat)) && Number.isFinite(Number(course?.gps_arrivee_lng));
}
function routeDistanceKm2(course) {
  if (!hasUsableRoutePoints2(course)) return null;
  return calculerDistance2(course.gps_depart_lat, course.gps_depart_lng, course.gps_arrivee_lat, course.gps_arrivee_lng);
}
function detourViaPickupKm2(activeCourse, candidate) {
  if (!hasUsableRoutePoints2(activeCourse) || !hasUsableRoutePoints2(candidate)) return null;
  const directKm = routeDistanceKm2(activeCourse);
  const toCandidatePickupKm = calculerDistance2(
    activeCourse.gps_depart_lat,
    activeCourse.gps_depart_lng,
    candidate.gps_depart_lat,
    candidate.gps_depart_lng
  );
  const candidatePickupToActiveDropKm = calculerDistance2(
    candidate.gps_depart_lat,
    candidate.gps_depart_lng,
    activeCourse.gps_arrivee_lat,
    activeCourse.gps_arrivee_lng
  );
  if ([directKm, toCandidatePickupKm, candidatePickupToActiveDropKm].some((v) => v == null || !Number.isFinite(Number(v)))) return null;
  return Math.max(0, Number(toCandidatePickupKm) + Number(candidatePickupToActiveDropKm) - Number(directKm));
}
function destinationChainKm2(activeCourse, candidate) {
  if (!hasUsableRoutePoints2(activeCourse) || !hasUsableRoutePoints2(candidate)) return null;
  return calculerDistance2(
    activeCourse.gps_arrivee_lat,
    activeCourse.gps_arrivee_lng,
    candidate.gps_depart_lat,
    candidate.gps_depart_lng
  );
}
function evaluateOnRouteCompatibility2(activeCourses, candidate, config) {
  if (!hasUsableRoutePoints2(candidate)) return null;
  const maxDetourKm = Number(config?.maxDetourKm) || DEFAULT_MAX_DETOUR_KM;
  let best = null;
  for (const active of activeCourses || []) {
    if (!hasUsableRoutePoints2(active)) continue;
    const onRouteDetourKm = detourViaPickupKm2(active, candidate);
    if (onRouteDetourKm != null && onRouteDetourKm <= maxDetourKm) {
      const score = Math.max(1, Math.round(100 - onRouteDetourKm / Math.max(maxDetourKm, 0.1) * 45));
      const item = {
        scenario: "on_route",
        active_course_id: active.id,
        extra_km_estimate: Number(onRouteDetourKm.toFixed(2)),
        destination_pickup_km: null,
        score
      };
      if (!best || item.score > best.score) best = item;
    }
    const chainKm = destinationChainKm2(active, candidate);
    if (chainKm != null && chainKm <= maxDetourKm) {
      const score = Math.max(1, Math.round(100 - chainKm / Math.max(maxDetourKm, 0.1) * 35));
      const item = {
        scenario: "destination_chain",
        active_course_id: active.id,
        extra_km_estimate: Number(chainKm.toFixed(2)),
        destination_pickup_km: Number(chainKm.toFixed(2)),
        score
      };
      if (!best || item.score > best.score) best = item;
    }
  }
  return best;
}
async function loadEcoConfig(base44, countryCode) {
  const code = String(countryCode || "").toUpperCase();
  const configs = await base44.asServiceRole.entities.AppConfig.filter({
    cle: { $in: [
      key(code, "ENABLED"),
      key(code, "GROUPING_ENABLED"),
      key(code, "ON_ROUTE_ENABLED"),
      key(code, "CONVERT_DELAY_MIN"),
      key(code, "MAX_COURSES_PER_MISSION"),
      key(code, "PROPOSAL_EXPIRATION_SEC"),
      key(code, "MAX_DETOUR_KM"),
      key(code, "MIN_DRIVER_GAIN"),
      key(code, "CHAIN_MAX_PICKUP_KM"),
      key(code, "CHAIN_MAX_DROP_KM"),
      key(code, "CHAIN_MIN_GAIN_FCFA"),
      key(code, "CHAIN_COST_PER_KM"),
      key(code, "CHAIN_MAX_TIME_DIFF_HOURS"),
      key(code, "EMERGENCY_STOP"),
      key(code, "ON_ROUTE_PRIORITY_ENABLED"),
      key(code, "ON_ROUTE_PRIORITY_SEC")
    ] }
  }, void 0, 25).catch(() => []);
  const map = new Map((configs || []).map((c) => [c.cle, c.valeur]));
  const emergencyStop = parseBool(map.get(key(code, "EMERGENCY_STOP")), false);
  let commissionPct = null;
  try {
    const countryConfig = await chargerConfigPays(base44, code);
    commissionPct = countryConfig?.commission_pct == null ? null : normalizeCommissionPct(countryConfig.commission_pct);
  } catch {
  }
  return {
    countryCode: code,
    enabled: !emergencyStop && parseBool(map.get(key(code, "ENABLED")), false),
    groupingEnabled: !emergencyStop && parseBool(map.get(key(code, "GROUPING_ENABLED")), false),
    onRouteEnabled: !emergencyStop && parseBool(map.get(key(code, "ON_ROUTE_ENABLED")), false),
    convertDelayMin: parseNumber(map.get(key(code, "CONVERT_DELAY_MIN")), DEFAULT_CONVERT_DELAY_MIN, 1),
    maxCoursesPerMission: Math.max(2, Math.min(4, parseNumber(map.get(key(code, "MAX_COURSES_PER_MISSION")), DEFAULT_MAX_COURSES, 2))),
    proposalExpirationSec: parseNumber(map.get(key(code, "PROPOSAL_EXPIRATION_SEC")), DEFAULT_PROPOSAL_EXPIRATION_SEC, 15),
    maxDetourKm: parseNumber(map.get(key(code, "MAX_DETOUR_KM")), DEFAULT_MAX_DETOUR_KM, 0),
    minDriverGain: parseNumber(map.get(key(code, "MIN_DRIVER_GAIN")), DEFAULT_MIN_GAIN, 0),
    // ── Seuils chaîne de destination (configurables par pays) ──
    chainMaxPickupKm: parseNumber(map.get(key(code, "CHAIN_MAX_PICKUP_KM")), DEFAULT_CHAIN_MAX_PICKUP_KM, 0),
    chainMaxDropKm: parseNumber(map.get(key(code, "CHAIN_MAX_DROP_KM")), DEFAULT_CHAIN_MAX_DROP_KM, 0),
    chainMinGainFcfa: parseNumber(map.get(key(code, "CHAIN_MIN_GAIN_FCFA")), DEFAULT_CHAIN_MIN_GAIN_FCFA, 0),
    chainCostPerKm: parseNumber(map.get(key(code, "CHAIN_COST_PER_KM")), DEFAULT_CHAIN_COST_PER_KM, 0),
    chainMaxTimeDiffHours: parseNumber(map.get(key(code, "CHAIN_MAX_TIME_DIFF_HOURS")), DEFAULT_CHAIN_MAX_TIME_DIFF_HOURS, 0),
    // ── Taux de commission du pays (pour calcul du gain NET livreur) ──
    commissionPct,
    emergencyStop,
    // ── Priorité exclusive sur trajet (Correction 20) ──
    // Pendant prioritySec secondes, la course est réservée au meilleur livreur
    // compatible. Les autres livreurs ne la voient pas dans "Disponibles".
    onRoutePriorityEnabled: !emergencyStop && parseBool(map.get(key(code, "ON_ROUTE_PRIORITY_ENABLED")), false),
    onRoutePrioritySec: parseNumber(map.get(key(code, "ON_ROUTE_PRIORITY_SEC")), DEFAULT_ON_ROUTE_PRIORITY_SEC, 5)
  };
}
async function prepareEcoCreationFields(base44, rawCourseData) {
  const countryCode = String(rawCourseData?.country_code || "").toUpperCase();
  const requestedMode = normalizeDeliveryMode(rawCourseData?.delivery_mode);
  if (requestedMode !== "eco") {
    return {
      delivery_mode: "standard",
      eco_status: "none",
      eco_mission_id: null
    };
  }
  const config = await loadEcoConfig(base44, countryCode);
  const publicOnly = normalizeEnterpriseId(rawCourseData?.enterprise_id) === null;
  const price = Number(rawCourseData?.prix_propose_client || rawCourseData?.prix_propose_admin || rawCourseData?.prix_estimate || 0) || 0;
  if (!config.enabled || !publicOnly) {
    return {
      delivery_mode: "standard",
      eco_status: config.enabled && publicOnly ? "disabled" : "none",
      eco_mission_id: null
    };
  }
  const now = /* @__PURE__ */ new Date();
  return {
    delivery_mode: "eco",
    eco_status: "isolated",
    eco_mission_id: null,
    eco_created_at: now.toISOString(),
    eco_convert_after_at: new Date(now.getTime() + config.convertDelayMin * 6e4).toISOString()
  };
}
async function shouldHoldEcoCourseOnCreate(base44, course) {
  if (normalizeDeliveryMode(course?.delivery_mode) !== "eco") return false;
  if (course?.eco_status !== "isolated") return false;
  if (!isPublicCourse(course)) return false;
  const config = await loadEcoConfig(base44, course.country_code);
  return config.enabled && config.groupingEnabled;
}
function compatibilityScore(a, b, config) {
  if (!hasUsableRoutePoints2(a) || !hasUsableRoutePoints2(b)) return null;
  const pickupKm = calculerDistance2(a.gps_depart_lat, a.gps_depart_lng, b.gps_depart_lat, b.gps_depart_lng);
  const dropKm = calculerDistance2(a.gps_arrivee_lat, a.gps_arrivee_lng, b.gps_arrivee_lat, b.gps_arrivee_lng);
  const crossKm = calculerDistance2(a.gps_depart_lat, a.gps_depart_lng, b.gps_arrivee_lat, b.gps_arrivee_lng);
  if ([pickupKm, dropKm, crossKm].some((v) => v == null || !Number.isFinite(Number(v)))) return null;
  const directionScore = Math.max(0, 100 - Number(dropKm) * 12);
  const proximityScore = Math.max(0, 100 - Number(pickupKm) * 18);
  const detourScore = Math.max(0, 100 - Number(crossKm) * 5);
  const standardScore = Math.round(proximityScore * 0.45 + directionScore * 0.35 + detourScore * 0.2);
  const chainMaxPickupKm = Number(config?.chainMaxPickupKm) || DEFAULT_CHAIN_MAX_PICKUP_KM;
  const chainMaxDropKm = Number(config?.chainMaxDropKm) || DEFAULT_CHAIN_MAX_DROP_KM;
  const chainMinGainFcfa = Number(config?.chainMinGainFcfa) || DEFAULT_CHAIN_MIN_GAIN_FCFA;
  const chainCostPerKm = Number(config?.chainCostPerKm) || DEFAULT_CHAIN_COST_PER_KM;
  const chainMaxTimeDiffHours = Number(config?.chainMaxTimeDiffHours) || DEFAULT_CHAIN_MAX_TIME_DIFF_HOURS;
  if (Number(dropKm) <= chainMaxDropKm && Number(pickupKm) > 3 && Number(pickupKm) <= chainMaxPickupKm) {
    const prixBrutA = prixCourse2(a);
    const prixBrutB = prixCourse2(b);
    const commissionPct = config?.commissionPct;
    const gainNetA = commissionPct != null ? Math.round(prixBrutA * (1 - Number(commissionPct) / 100)) : prixBrutA;
    const gainNetB = commissionPct != null ? Math.round(prixBrutB * (1 - Number(commissionPct) / 100)) : prixBrutB;
    const totalGainNet = gainNetA + gainNetB;
    const detourCost = Math.round(Number(pickupKm) * chainCostPerKm);
    if (totalGainNet < chainMinGainFcfa || totalGainNet < detourCost * 2) {
      return standardScore;
    }
    const dateA = a.date_souhaitee || a.created_date;
    const dateB = b.date_souhaitee || b.created_date;
    if (dateA && dateB) {
      const timeDiff = Math.abs(new Date(dateA).getTime() - new Date(dateB).getTime());
      const maxDiffMs = chainMaxTimeDiffHours * 60 * 60 * 1e3;
      if (timeDiff > maxDiffMs) {
        return standardScore;
      }
    }
    const chainDirectionScore = Math.max(0, 100 - Number(dropKm) * 15);
    const chainDetourScore = Math.max(0, 100 - Number(pickupKm) * 8);
    const chainProfitScore = Math.min(100, Math.round(totalGainNet / Math.max(detourCost, 1) * 20));
    const chainScore = Math.round(chainDirectionScore * 0.35 + chainDetourScore * 0.35 + chainProfitScore * 0.3);
    return Math.max(standardScore, chainScore);
  }
  return standardScore;
}
function buildRoutePlan(courses) {
  const pickups = courses.map((course, index) => ({
    type: "pickup",
    course_id: course.id,
    order: index + 1,
    status: "pending",
    lat: course.gps_depart_lat || null,
    lng: course.gps_depart_lng || null
  }));
  const deliveries = courses.map((course, index) => ({
    type: "delivery",
    course_id: course.id,
    order: courses.length + index + 1,
    status: "pending",
    lat: course.gps_arrivee_lat || null,
    lng: course.gps_arrivee_lng || null
  }));
  return [...pickups, ...deliveries];
}
function routePlanForEcoMission(courses) {
  const first = courses[0];
  const second = courses[1];
  if (!first || !second) return buildRoutePlan(courses);
  const directAllPickups = [
    { type: "pickup", course_id: first.id, order: 1, status: "pending", lat: first.gps_depart_lat || null, lng: first.gps_depart_lng || null },
    { type: "pickup", course_id: second.id, order: 2, status: "pending", lat: second.gps_depart_lat || null, lng: second.gps_depart_lng || null },
    { type: "delivery", course_id: first.id, order: 3, status: "pending", lat: first.gps_arrivee_lat || null, lng: first.gps_arrivee_lng || null },
    { type: "delivery", course_id: second.id, order: 4, status: "pending", lat: second.gps_arrivee_lat || null, lng: second.gps_arrivee_lng || null }
  ];
  const pickupFirstThenDeliverFirst = [
    { type: "pickup", course_id: first.id, order: 1, status: "pending", lat: first.gps_depart_lat || null, lng: first.gps_depart_lng || null },
    { type: "delivery", course_id: first.id, order: 2, status: "pending", lat: first.gps_arrivee_lat || null, lng: first.gps_arrivee_lng || null },
    { type: "pickup", course_id: second.id, order: 3, status: "pending", lat: second.gps_depart_lat || null, lng: second.gps_depart_lng || null },
    { type: "delivery", course_id: second.id, order: 4, status: "pending", lat: second.gps_arrivee_lat || null, lng: second.gps_arrivee_lng || null }
  ];
  const chainKm = destinationChainKm2(first, second);
  const pickupKm = calculerDistance2(first.gps_depart_lat, first.gps_depart_lng, second.gps_depart_lat, second.gps_depart_lng);
  return chainKm != null && pickupKm != null && chainKm < pickupKm ? pickupFirstThenDeliverFirst : directAllPickups;
}
async function processEcoCourseCreated(base44, courseId) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId).catch(() => null);
  if (!course || !await shouldHoldEcoCourseOnCreate(base44, course)) {
    return { success: true, handled: false, reason: "not_eco_or_disabled" };
  }
  const config = await loadEcoConfig(base44, course.country_code);
  const { buildCourseCityFilterFromCourse: buildCourseCityFilterFromCourse2 } = await Promise.resolve().then(() => (init_cityDispatchFilter(), cityDispatchFilter_exports));
  const ecoCityFilter = await buildCourseCityFilterFromCourse2(base44, course);
  const candidates = await base44.asServiceRole.entities.CourseExterne.filter({
    country_code: course.country_code,
    enterprise_id: null,
    delivery_mode: "eco",
    eco_status: "isolated",
    dispatch_status: "en_attente",
    ...ecoCityFilter
  }, "-created_date", 30).catch(() => []);
  let best = null;
  let bestScore = -1;
  for (const candidate of candidates || []) {
    if (!candidate?.id || candidate.id === course.id) continue;
    if (candidate.livreur_id || candidate.accepted_by_livreur_id || candidate.eco_mission_id) continue;
    if (TERMINAL_STATUSES2.includes(candidate.statut)) continue;
    const score = compatibilityScore(course, candidate, config);
    if (score == null || score < 55) continue;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  if (!best) {
    return { success: true, handled: true, grouped: false, reason: "no_compatible_candidate" };
  }
  const courses = [course, best].slice(0, config.maxCoursesPerMission);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const mission = await base44.asServiceRole.entities.EcoMission.create({
    country_code: course.country_code,
    enterprise_id: null,
    course_ids: courses.map((c) => c.id),
    status: "available",
    route_plan_json: JSON.stringify(routePlanForEcoMission(courses)),
    active_step_index: 0,
    total_price: courses.reduce((sum, c) => sum + prixCourse2(c), 0),
    total_driver_amount: courses.reduce((sum, c) => sum + Math.max(0, prixCourse2(c) - (Number(c.commission_silga) || 0)), 0),
    compatibility_score: bestScore,
    locked_at: now
  });
  const claim = await base44.asServiceRole.entities.CourseExterne.updateMany(
    {
      id: { $in: courses.map((c) => c.id) },
      delivery_mode: "eco",
      eco_status: "isolated",
      eco_mission_id: null,
      dispatch_status: "en_attente"
    },
    {
      $set: {
        eco_status: "grouped",
        eco_mission_id: mission.id,
        eco_candidate_score: bestScore
      }
    }
  );
  if (!claim || claim.updated !== courses.length) {
    await base44.asServiceRole.entities.EcoMission.update(mission.id, { status: "invalidated" }).catch(() => null);
    return { success: false, handled: true, grouped: false, reason: "atomic_grouping_lost" };
  }
  return { success: true, handled: true, grouped: true, mission_id: mission.id, course_ids: courses.map((c) => c.id) };
}
async function notifyConversion(base44, course) {
  const title = "Course Eco convertie en Standard";
  const message = "Aucun regroupement Eco disponible dans le delai prevu. Votre course passe en Standard, sans changement de prix.";
  if (course.client_user_email) {
    await base44.asServiceRole.entities.Notification.create({
      titre: title,
      message,
      type: "generic",
      destinataire_email: course.client_user_email,
      course_id: course.id,
      lue: false,
      deduplication_key: `ECO_CONVERT_CLIENT_${course.id}`
    }).catch(() => null);
  }
  const admins = await base44.asServiceRole.entities.User.filter({ role: "admin" }, void 0, 100).catch(() => []);
  const notifRecords = (admins || []).filter((admin) => admin.email).map((admin) => ({
    titre: title,
    message: `Course ${course.id} convertie en Standard apres attente Eco. Prix conserve: ${prixCourse2(course).toLocaleString()} ${course.devise || "FCFA"}.`,
    type: "generic",
    destinataire_email: admin.email,
    course_id: course.id,
    lue: false,
    deduplication_key: `ECO_CONVERT_ADMIN_${course.id}_${admin.email}`
  }));
  if (notifRecords.length > 0) {
    await base44.asServiceRole.entities.Notification.bulkCreate(notifRecords).catch(() => null);
  }
}
async function convertDueEcoCourses(base44, countryCode, limit = 50) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const filter = {
    delivery_mode: "eco",
    eco_status: "isolated",
    enterprise_id: null,
    eco_convert_after_at: { $lte: now },
    dispatch_status: "en_attente"
  };
  if (countryCode) filter.country_code = String(countryCode).toUpperCase();
  const courses = await base44.asServiceRole.entities.CourseExterne.filter(filter, "eco_convert_after_at", limit).catch(() => []);
  const results = [];
  for (const course of courses || []) {
    if (!course?.id || TERMINAL_STATUSES2.includes(course.statut) || course.livreur_id || course.eco_mission_id) continue;
    const claim = await base44.asServiceRole.entities.CourseExterne.updateMany(
      {
        id: course.id,
        delivery_mode: "eco",
        eco_status: "isolated",
        eco_mission_id: null,
        dispatch_status: "en_attente"
      },
      {
        $set: {
          delivery_mode: "standard",
          eco_status: "converted",
          eco_converted_at: now,
          eco_conversion_reason: "no_grouping_after_delay",
          statut: "recherche_livreur",
          dispatch_status: "disponible_push",
          heure_sollicitation: now
        }
      }
    );
    if (claim?.updated === 1) {
      const fresh = await base44.asServiceRole.entities.CourseExterne.get(course.id).catch(() => course);
      await notifyConversion(base44, fresh);
      await base44.asServiceRole.functions.invoke("dispatchExterneAuto", {
        action: "lancer_recherche_auto",
        course_id: course.id
      }).catch((error) => {
        console.error("[Eco] dispatch after conversion failed:", error?.message || String(error));
      });
      results.push({ course_id: course.id, converted: true });
    } else {
      results.push({ course_id: course.id, converted: false, reason: "atomic_conversion_lost" });
    }
  }
  return { success: true, checked: (courses || []).length, results };
}
async function invalidatePendingProposals(base44, countryCode, reason = "engine_disabled") {
  const filter = { status: "pending" };
  if (countryCode) filter.country_code = String(countryCode).toUpperCase();
  const proposals = await base44.asServiceRole.entities.EcoProposal.filter(filter, "-created_date", 200).catch(() => []);
  if (!proposals?.length) return { success: true, invalidated: 0 };
  const ids = proposals.map((p) => p.id);
  await base44.asServiceRole.entities.EcoProposal.updateMany(
    { id: { $in: ids }, status: "pending" },
    { $set: { status: "invalidated", responded_at: (/* @__PURE__ */ new Date()).toISOString(), invalidation_reason: reason } }
  );
  return { success: true, invalidated: ids.length };
}
async function expirePendingProposals(base44, countryCode, limit = 200) {
  const filter = { status: "pending", expires_at: { $lte: (/* @__PURE__ */ new Date()).toISOString() } };
  if (countryCode) filter.country_code = String(countryCode).toUpperCase();
  const proposals = await base44.asServiceRole.entities.EcoProposal.filter(filter, "expires_at", limit).catch(() => []);
  if (!proposals?.length) return { success: true, expired: 0 };
  await base44.asServiceRole.entities.EcoProposal.updateMany(
    { id: { $in: proposals.map((p) => p.id) }, status: "pending" },
    { $set: { status: "expired", responded_at: (/* @__PURE__ */ new Date()).toISOString() } }
  );
  return { success: true, expired: proposals.length };
}
async function createOnRouteProposal(base44, courseId, livreurId) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId).catch(() => null);
  const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
  if (!course || !livreur) return { success: false, reason: "missing_course_or_driver" };
  const courseEnterpriseId = normalizeEnterpriseId(course.enterprise_id);
  const livreurEnterpriseId = normalizeEnterpriseId(livreur.enterprise_id);
  if (courseEnterpriseId !== livreurEnterpriseId) return { success: false, reason: "enterprise_mismatch" };
  const config = await loadEcoConfig(base44, course.country_code);
  if (!config.enabled || !config.onRouteEnabled) return { success: false, reason: "on_route_disabled" };
  if (TERMINAL_STATUSES2.includes(course.statut) || course.livreur_id || course.accepted_by_livreur_id) {
    return { success: false, reason: "course_unavailable" };
  }
  const activeCourses = await base44.asServiceRole.entities.CourseExterne.filter({
    livreur_id: livreurId,
    country_code: course.country_code
  }, "-updated_date", 20).catch(() => []);
  const activeRunnableCourses = (activeCourses || []).filter(
    (c) => ACTIVE_STATUSES2.includes(c.statut) && normalizeEnterpriseId(c.enterprise_id) === courseEnterpriseId
  );
  if (activeRunnableCourses.length === 0) return { success: false, reason: "driver_not_on_route" };
  const gainAmount = Math.max(0, prixCourse2(course) - (Number(course.commission_silga) || 0));
  if (gainAmount < config.minDriverGain) return { success: false, reason: "gain_below_threshold" };
  const compatibility = evaluateOnRouteCompatibility2(activeRunnableCourses, course, config);
  if (!compatibility) return { success: false, reason: "no_route_or_destination_match" };
  const existing = await base44.asServiceRole.entities.EcoProposal.filter({
    course_id: courseId,
    livreur_id: livreurId,
    status: "pending"
  }, "-created_date", 1).catch(() => []);
  if (existing?.[0]) return { success: true, proposal: existing[0], idempotent: true };
  const proposal = await base44.asServiceRole.entities.EcoProposal.create({
    country_code: course.country_code,
    enterprise_id: courseEnterpriseId,
    course_id: courseId,
    livreur_id: livreurId,
    livreur_user_email: livreur.user_email || null,
    proposal_type: "on_route_offer",
    proposal_scenario: compatibility.scenario,
    status: "pending",
    expires_at: new Date(Date.now() + config.proposalExpirationSec * 1e3).toISOString(),
    gain_amount: gainAmount,
    route_delta_json: JSON.stringify({
      source: "prefilter",
      scenario: compatibility.scenario,
      active_course_id: compatibility.active_course_id,
      extra_km_estimate: compatibility.extra_km_estimate,
      destination_pickup_km: compatibility.destination_pickup_km,
      score: compatibility.score,
      max_detour_km: config.maxDetourKm,
      note: "ORS reserved for top candidates only"
    })
  });
  if (livreur.user_email) {
    const notifTitle = "SILGAPP \u2014 Livraison sur votre trajet !";
    const notifMessage = "Une nouvelle livraison compatible avec votre trajet est disponible. Ouvrez SILGAPP pour consulter votre gain suppl\xE9mentaire.";
    try {
      await base44.asServiceRole.entities.Notification.create({
        titre: notifTitle,
        message: notifMessage,
        type: "on_route_proposal",
        destinataire_email: livreur.user_email,
        course_id: courseId,
        lue: false,
        deduplication_key: `ON_ROUTE_PROPOSAL_${proposal.id}`
      });
    } catch (notifError) {
      console.error("[createOnRouteProposal] Notification record failed:", notifError?.message || String(notifError));
    }
    try {
      await base44.asServiceRole.functions.invoke("envoiNotificationPush", {
        titre: notifTitle,
        message: notifMessage,
        type: "on_route_proposal",
        destinataire_email: livreur.user_email,
        livreur_id: livreurId,
        course_id: courseId,
        category: "on_route_proposal",
        alert_duration_seconds: config.proposalExpirationSec
      });
    } catch (pushError) {
      console.error("[createOnRouteProposal] FCM push failed:", pushError?.message || String(pushError));
    }
  }
  return { success: true, proposal };
}
async function respondToOnRouteProposal(base44, proposalId, livreurId, response) {
  const proposal = await base44.asServiceRole.entities.EcoProposal.get(proposalId).catch(() => null);
  if (!proposal || proposal.status !== "pending") return { success: false, reason: "proposal_unavailable" };
  if (String(proposal.livreur_id) !== String(livreurId)) return { success: false, reason: "proposal_owner_mismatch" };
  if (response === "accept") {
    const { verifyLivreurIdentity: verifyLivreurIdentity2 } = await Promise.resolve().then(() => (init_livreurIdentityGuard(), livreurIdentityGuard_exports));
    const identityCheck = await verifyLivreurIdentity2(base44, livreurId);
    if (!identityCheck.verified) {
      return { success: false, reason: "identity_mismatch", error: identityCheck.error || "V\xE9rification d'identit\xE9 \xE9chou\xE9e" };
    }
    const proposalCourse = await base44.asServiceRole.entities.CourseExterne.get(proposal.course_id).catch(() => null);
    if (proposalCourse) {
      const { verifyCityCompatibility: verifyCityCompatibility2 } = await Promise.resolve().then(() => (init_cityDispatchFilter(), cityDispatchFilter_exports));
      const cityCheck = await verifyCityCompatibility2(base44, proposalCourse, identityCheck.livreur);
      if (!cityCheck.compatible) {
        return { success: false, reason: "city_mismatch", courseCity: cityCheck.courseCity, livreurCity: cityCheck.livreurCity };
      }
    }
  }
  if (proposal.expires_at && new Date(proposal.expires_at) < /* @__PURE__ */ new Date()) {
    await base44.asServiceRole.entities.EcoProposal.update(proposal.id, { status: "expired", responded_at: (/* @__PURE__ */ new Date()).toISOString() }).catch(() => null);
    return { success: false, reason: "proposal_expired" };
  }
  if (response === "refuse") {
    await base44.asServiceRole.entities.EcoProposal.update(proposal.id, { status: "refused", responded_at: (/* @__PURE__ */ new Date()).toISOString() });
    if (proposal.is_exclusive) {
      try {
        const { releaseReservationAfterRefusal: releaseReservationAfterRefusal2 } = await Promise.resolve().then(() => (init_onRoutePriorityReservation(), onRoutePriorityReservation_exports));
        await releaseReservationAfterRefusal2(base44, proposal.course_id);
      } catch (e) {
        console.error("[respondToOnRouteProposal] release after refusal failed:", e?.message || String(e));
      }
    }
    return { success: true, accepted: false };
  }
  const course = await base44.asServiceRole.entities.CourseExterne.get(proposal.course_id).catch(() => null);
  const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
  if (!course || !livreur) return { success: false, reason: "missing_course_or_driver" };
  if (TERMINAL_STATUSES2.includes(course.statut) || course.livreur_id || course.accepted_by_livreur_id) {
    await base44.asServiceRole.entities.EcoProposal.update(proposal.id, { status: "invalidated", responded_at: (/* @__PURE__ */ new Date()).toISOString() }).catch(() => null);
    return { success: false, reason: "course_unavailable" };
  }
  if (normalizeEnterpriseId(course.enterprise_id) !== normalizeEnterpriseId(livreur.enterprise_id)) {
    return { success: false, reason: "enterprise_mismatch" };
  }
  if (livreur.validation !== "valide" || livreur.actif !== true || livreur.manual_hors_ligne === true || livreur.admin_hors_ligne === true || livreur.bloque_encours === true) {
    return { success: false, reason: "livreur_indisponible" };
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const updateData = {
    dispatch_status: "accepte",
    statut: "livreur_en_route",
    heure_acceptation: now,
    livreur_id: livreurId,
    livreur_nom: `${livreur.prenom || ""} ${livreur.nom || ""}`.trim(),
    livreur_photo_url: livreur.photo_url || "",
    livreur_telephone: livreur.telephone,
    livreur_vehicule: livreur.vehicule || livreur.type_vehicule || "moto",
    livreur_note_moyenne: livreur.note_moyenne || 0,
    livreur_nombre_avis: livreur.nombre_avis || 0,
    livreur_user_email: livreur.user_email || null,
    accepted_by_livreur_id: livreurId,
    accepted_at: now
  };
  let avantageAcceptation = null;
  if (normalizeEnterpriseId(course.enterprise_id) === null) {
    try {
      avantageAcceptation = await evaluerAvantageCommission(base44, livreurId, course.country_code, new Date(now));
      Object.assign(updateData, champsLockCommission(avantageAcceptation, now));
    } catch (error) {
      return { success: false, reason: "commission_lookup_error", retryable: true, error: error?.message || "PASS_LOOKUP_ERROR" };
    }
  }
  const claimProposal = await base44.asServiceRole.entities.EcoProposal.updateMany(
    { id: proposal.id, status: "pending" },
    { $set: { status: "accepted", responded_at: now } }
  );
  if (!claimProposal || claimProposal.updated !== 1) {
    return { success: false, reason: "proposal_race_lost" };
  }
  const claimCourse = await claimCourseForLivreur(
    base44,
    course.id,
    livreurId,
    ["en_attente", "disponible_push", "propose"],
    updateData
  );
  const fresh = claimCourse.course;
  if (!claimCourse.claimed) {
    await base44.asServiceRole.entities.EcoProposal.update(proposal.id, { status: "invalidated", responded_at: now }).catch(() => null);
    return { success: false, reason: "course_race_lost" };
  }
  if (avantageAcceptation) verifierCoherenceLock(fresh, avantageAcceptation);
  if (normalizeEnterpriseId(fresh.enterprise_id)) {
    await figerCommissionAcceptation(base44, course.id, livreurId, fresh.country_code, now).catch(() => null);
  }
  await marquerAccepte(base44, course.id, livreurId).catch(() => null);
  let missionIdForOptimization = null;
  let routePlanForOptimization = null;
  let coursesForOptimization = [];
  try {
    const activeCoursesForMission = await base44.asServiceRole.entities.CourseExterne.filter({
      livreur_id: livreurId,
      country_code: fresh.country_code,
      statut: { $in: ACTIVE_STATUSES2 }
    }, "-updated_date", 10).catch(() => []);
    const otherActiveCourses = (activeCoursesForMission || []).filter(
      (c) => c.id !== fresh.id && !TERMINAL_STATUSES2.includes(c.statut)
    );
    if (otherActiveCourses.length > 0) {
      const config = await loadEcoConfig(base44, fresh.country_code);
      const courseWithMission = otherActiveCourses.find((c) => c.eco_mission_id);
      if (courseWithMission?.eco_mission_id) {
        const existingMission = await base44.asServiceRole.entities.EcoMission.get(courseWithMission.eco_mission_id).catch(() => null);
        if (existingMission && !["completed", "cancelled", "invalidated"].includes(existingMission.status)) {
          const currentCourseIds = Array.isArray(existingMission.course_ids) ? existingMission.course_ids : [];
          if (currentCourseIds.length < config.maxCoursesPerMission) {
            const updatedCourseIds = [.../* @__PURE__ */ new Set([...currentCourseIds, fresh.id])];
            const allCoursesForMission = [...otherActiveCourses, fresh].filter((c) => updatedCourseIds.includes(c.id));
            const newRoutePlan = JSON.stringify(routePlanForEcoMission(allCoursesForMission));
            await base44.asServiceRole.entities.EcoMission.update(existingMission.id, {
              course_ids: updatedCourseIds,
              route_plan_json: newRoutePlan,
              total_price: allCoursesForMission.reduce((sum, c) => sum + prixCourse2(c), 0),
              total_driver_amount: allCoursesForMission.reduce((sum, c) => sum + Math.max(0, prixCourse2(c) - (Number(c.commission_silga) || 0)), 0)
            }).catch(() => null);
            await base44.asServiceRole.entities.CourseExterne.update(fresh.id, {
              eco_mission_id: existingMission.id
            }).catch(() => null);
            missionIdForOptimization = existingMission.id;
            routePlanForOptimization = newRoutePlan;
            coursesForOptimization = allCoursesForMission;
          }
        }
      } else {
        const allCoursesForMission = [...otherActiveCourses.slice(0, config.maxCoursesPerMission - 1), fresh];
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const newRoutePlan = JSON.stringify(routePlanForEcoMission(allCoursesForMission));
        const newMission = await base44.asServiceRole.entities.EcoMission.create({
          country_code: fresh.country_code,
          enterprise_id: null,
          course_ids: allCoursesForMission.map((c) => c.id),
          status: "accepted",
          livreur_id: livreurId,
          livreur_user_email: livreur.user_email || null,
          route_plan_json: newRoutePlan,
          active_step_index: 0,
          total_price: allCoursesForMission.reduce((sum, c) => sum + prixCourse2(c), 0),
          total_driver_amount: allCoursesForMission.reduce((sum, c) => sum + Math.max(0, prixCourse2(c) - (Number(c.commission_silga) || 0)), 0),
          accepted_at: nowIso
        }).catch(() => null);
        if (newMission) {
          await base44.asServiceRole.entities.CourseExterne.updateMany(
            { id: { $in: allCoursesForMission.map((c) => c.id) } },
            { $set: { eco_mission_id: newMission.id } }
          ).catch(() => null);
          missionIdForOptimization = newMission.id;
          routePlanForOptimization = newRoutePlan;
          coursesForOptimization = allCoursesForMission;
        }
      }
    }
  } catch (missionError) {
    console.error("[respondToOnRouteProposal] Mission creation failed:", missionError?.message || String(missionError));
  }
  let routeOptimization = { optimized: false, reason: "not_attempted" };
  if (missionIdForOptimization && coursesForOptimization.length >= 2) {
    try {
      const { optimizeEcoRoutePreservingCompleted: optimizeEcoRoutePreservingCompleted2 } = await Promise.resolve().then(() => (init_ecoRouteOptimizer(), ecoRouteOptimizer_exports));
      routeOptimization = await optimizeEcoRoutePreservingCompleted2(
        base44,
        coursesForOptimization,
        livreur,
        routePlanForOptimization
      );
      if (routeOptimization.optimized) {
        await base44.asServiceRole.entities.EcoMission.update(missionIdForOptimization, {
          route_plan_json: routeOptimization.routePlanJSON
        }).catch(() => null);
      }
    } catch (e) {
      console.error("[respondToOnRouteProposal] Route optimization failed:", e?.message || String(e));
      routeOptimization = { optimized: false, reason: "optimization_error" };
    }
  }
  return { success: true, accepted: true, course_id: course.id, proposal_id: proposal.id, route_optimization: routeOptimization };
}
async function completeEcoMissionIfNeeded(base44, courseId) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId).catch(() => null);
  if (!course?.eco_mission_id) return { completed: false, reason: "no_mission" };
  const mission = await base44.asServiceRole.entities.EcoMission.get(course.eco_mission_id).catch(() => null);
  if (!mission || ["completed", "cancelled", "invalidated"].includes(mission.status)) {
    return { completed: false, reason: "mission_terminal" };
  }
  const courseIds = Array.isArray(mission.course_ids) ? mission.course_ids : [];
  if (courseIds.length === 0) return { completed: false, reason: "no_courses" };
  const courses = await Promise.all(
    courseIds.map((id2) => base44.asServiceRole.entities.CourseExterne.get(id2).catch(() => null))
  );
  const allTerminal = courses.every((c) => c && (c.statut === "livree" || c.statut === "annulee"));
  if (!allTerminal) return { completed: false, reason: "courses_pending" };
  const allDelivered = courses.every((c) => c && c.statut === "livree");
  if (allDelivered) {
    await base44.asServiceRole.entities.EcoMission.update(mission.id, {
      status: "completed"
    }).catch(() => null);
    return { completed: true, mission_id: mission.id, final_status: "completed" };
  }
  const allCancelled = courses.every((c) => c && c.statut === "annulee");
  if (allCancelled) {
    await base44.asServiceRole.entities.EcoMission.update(mission.id, {
      status: "cancelled"
    }).catch(() => null);
    return { completed: true, mission_id: mission.id, final_status: "cancelled" };
  }
  await base44.asServiceRole.entities.EcoMission.update(mission.id, {
    status: "cancelled"
  }).catch(() => null);
  return { completed: true, mission_id: mission.id, final_status: "cancelled" };
}
async function updateEcoMissionRouteProgress(base44, courseId) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId).catch(() => null);
  if (!course?.eco_mission_id) return { updated: false, reason: "no_mission" };
  const mission = await base44.asServiceRole.entities.EcoMission.get(course.eco_mission_id).catch(() => null);
  if (!mission || ["completed", "cancelled", "invalidated"].includes(mission.status)) {
    return { updated: false, reason: "mission_terminal" };
  }
  const courseIds = Array.isArray(mission.course_ids) ? mission.course_ids : [];
  if (courseIds.length === 0) return { updated: false, reason: "no_courses" };
  const courses = await Promise.all(
    courseIds.map((id2) => base44.asServiceRole.entities.CourseExterne.get(id2).catch(() => null))
  );
  const courseStatusMap = /* @__PURE__ */ new Map();
  for (const c of courses) {
    if (c) courseStatusMap.set(c.id, c.statut);
  }
  let routePlan = [];
  try {
    routePlan = mission.route_plan_json ? JSON.parse(mission.route_plan_json) : [];
  } catch {
    routePlan = [];
  }
  let updated = false;
  let maxCompletedOrder = 0;
  for (const step of routePlan) {
    if (!step?.course_id) continue;
    const statut = courseStatusMap.get(step.course_id);
    if (!statut) continue;
    const isTerminal = statut === "livree" || statut === "annulee";
    if (isTerminal && step.status !== "completed") {
      step.status = "completed";
      updated = true;
    }
    if (isTerminal && step.order > maxCompletedOrder) {
      maxCompletedOrder = step.order;
    }
  }
  const firstPendingStep = routePlan.find((s) => s?.status !== "completed");
  const newActiveStepIndex = firstPendingStep ? Math.max(0, (Number(firstPendingStep.order) || 1) - 1) : routePlan.length;
  if (updated || mission.active_step_index !== newActiveStepIndex) {
    await base44.asServiceRole.entities.EcoMission.update(mission.id, {
      route_plan_json: JSON.stringify(routePlan),
      active_step_index: newActiveStepIndex
    }).catch(() => null);
    return { updated: true, mission_id: mission.id, active_step_index: newActiveStepIndex };
  }
  return { updated: false, reason: "no_changes" };
}
async function recalculateEcoMissionAfterCancellation(base44, courseId) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId).catch(() => null);
  if (!course?.eco_mission_id) return { recalculated: false, reason: "no_mission" };
  const mission = await base44.asServiceRole.entities.EcoMission.get(course.eco_mission_id).catch(() => null);
  if (!mission || ["completed", "cancelled", "invalidated"].includes(mission.status)) {
    return { recalculated: false, reason: "mission_terminal" };
  }
  const courseIds = Array.isArray(mission.course_ids) ? mission.course_ids : [];
  if (courseIds.length === 0) return { recalculated: false, reason: "no_courses" };
  const courses = await Promise.all(
    courseIds.map((id2) => base44.asServiceRole.entities.CourseExterne.get(id2).catch(() => null))
  );
  const cancelledCourse = courses.find((c) => c && c.id === courseId);
  const wasPickedUp = !!cancelledCourse?.heure_recuperation;
  const activeCourses = courses.filter(
    (c) => c && c.statut !== "annulee" && c.statut !== "livree" && c.statut !== "en_attente" && !c.client_decision_attendue
  );
  let routePlan = [];
  try {
    routePlan = mission.route_plan_json ? JSON.parse(mission.route_plan_json) : [];
  } catch {
    routePlan = [];
  }
  let routeUpdated = false;
  for (const step of routePlan) {
    if (!step?.course_id) continue;
    const c = courses.find((co) => co && co.id === step.course_id);
    if (!c) continue;
    const isTerminal = c.statut === "livree" || c.statut === "annulee";
    const isSuspended = c.statut === "en_attente" || c.client_decision_attendue === true;
    if (isTerminal && step.status !== "completed") {
      step.status = "completed";
      routeUpdated = true;
    }
    if (isSuspended && step.status !== "cancelled") {
      step.status = "cancelled";
      routeUpdated = true;
    }
  }
  let updatedCourseIds = courseIds;
  let courseRemoved = false;
  if (!wasPickedUp && cancelledCourse) {
    updatedCourseIds = courseIds.filter((id2) => id2 !== courseId);
    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      eco_mission_id: null
    }).catch(() => null);
    const beforeLen = routePlan.length;
    routePlan = routePlan.filter((step) => step?.course_id !== courseId);
    if (routePlan.length !== beforeLen) routeUpdated = true;
    courseRemoved = true;
  }
  const firstPendingStep = routePlan.find(
    (s) => s && s.status !== "completed" && s.status !== "cancelled"
  );
  const newActiveStepIndex = firstPendingStep ? Math.max(0, (Number(firstPendingStep.order) || 1) - 1) : routePlan.length;
  let newStatus = mission.status;
  let livreurLibere = false;
  if (activeCourses.length === 0) {
    const allTerminal = courses.every((c) => c && (c.statut === "livree" || c.statut === "annulee"));
    if (allTerminal) {
      const allDelivered = courses.every((c) => c && c.statut === "livree");
      newStatus = allDelivered ? "completed" : "cancelled";
    } else {
      newStatus = "cancelled";
    }
    livreurLibere = true;
  } else if (activeCourses.length === 1) {
    newStatus = "invalidated";
  }
  const updateData = {};
  if (routeUpdated) updateData.route_plan_json = JSON.stringify(routePlan);
  if (mission.active_step_index !== newActiveStepIndex) updateData.active_step_index = newActiveStepIndex;
  if (updatedCourseIds.length !== courseIds.length) updateData.course_ids = updatedCourseIds;
  if (newStatus !== mission.status) updateData.status = newStatus;
  if (Object.keys(updateData).length > 0) {
    await base44.asServiceRole.entities.EcoMission.update(mission.id, updateData).catch(() => null);
  }
  if (livreurLibere && mission.livreur_id) {
    const STATUTS_ACTIFS = [
      "livreur_en_route",
      "client_contacte",
      "en_route_expediteur",
      "arrive_prise_en_charge",
      "colis_recupere",
      "passager_embarque",
      "pris_en_charge",
      "en_livraison",
      "arrivee"
    ];
    const autresCourses = await base44.asServiceRole.entities.CourseExterne.filter(
      { livreur_id: mission.livreur_id },
      "-created_date",
      10
    ).catch(() => []);
    const aAutreCourseActive = (autresCourses || []).some(
      (c) => c.id !== courseId && STATUTS_ACTIFS.includes(c.statut)
    );
    if (!aAutreCourseActive) {
      const livreur = await base44.asServiceRole.entities.Livreur.get(mission.livreur_id).catch(() => null);
      if (livreur && livreur.statut === "en_course") {
        await base44.asServiceRole.entities.Livreur.update(mission.livreur_id, {
          statut: livreur.manual_hors_ligne === true ? "hors_ligne" : "disponible"
        }).catch(() => null);
      }
    }
  }
  return {
    recalculated: true,
    mission_id: mission.id,
    active_courses: activeCourses.length,
    new_status: newStatus,
    route_updated: routeUpdated,
    course_removed: courseRemoved ? courseId : null,
    livreur_libere: livreurLibere
  };
}
async function cleanupStuckEcoMissions(base44, countryCode, limit = 50) {
  const filter = { status: { $in: ["accepted", "available", "accepting"] } };
  if (countryCode) filter.country_code = String(countryCode).toUpperCase();
  const missions = await base44.asServiceRole.entities.EcoMission.filter(filter, "-created_date", limit).catch(() => []);
  const results = [];
  for (const mission of missions || []) {
    const courseIds = Array.isArray(mission.course_ids) ? mission.course_ids : [];
    if (courseIds.length === 0) continue;
    const courses = await Promise.all(
      courseIds.map((id2) => base44.asServiceRole.entities.CourseExterne.get(id2).catch(() => null))
    );
    const allTerminal = courses.every((c) => c && (c.statut === "livree" || c.statut === "annulee"));
    if (!allTerminal) {
      results.push({ mission_id: mission.id, status: mission.status, action: "skipped", reason: "courses_pending" });
      continue;
    }
    const allDelivered = courses.every((c) => c && c.statut === "livree");
    const allCancelled = courses.every((c) => c && c.statut === "annulee");
    const finalStatus = allDelivered ? "completed" : "cancelled";
    await base44.asServiceRole.entities.EcoMission.update(mission.id, { status: finalStatus }).catch(() => null);
    if (mission.livreur_id && mission.status === "accepted") {
      const livreur = await base44.asServiceRole.entities.Livreur.get(mission.livreur_id).catch(() => null);
      if (livreur && livreur.statut === "en_course") {
        const STATUTS_ACTIFS = ["livreur_en_route", "client_contacte", "en_route_expediteur", "arrive_prise_en_charge", "colis_recupere", "passager_embarque", "pris_en_charge", "en_livraison", "arrivee"];
        const autresCourses = await base44.asServiceRole.entities.CourseExterne.filter(
          { livreur_id: mission.livreur_id },
          "-created_date",
          10
        ).catch(() => []);
        const aAutreCourseActive = (autresCourses || []).some(
          (c) => c.id !== courseIds[0] && STATUTS_ACTIFS.includes(c.statut)
        );
        await base44.asServiceRole.entities.Livreur.update(mission.livreur_id, {
          statut: aAutreCourseActive ? "en_course" : livreur.manual_hors_ligne === true ? "hors_ligne" : "disponible"
        }).catch(() => null);
      }
    }
    results.push({ mission_id: mission.id, status: mission.status, action: "fixed", final_status: finalStatus });
  }
  return { success: true, checked: (missions || []).length, results };
}
async function triggerOnRouteProposalsForNewCourse(base44, courseId) {
  const course = await base44.asServiceRole.entities.CourseExterne.get(courseId).catch(() => null);
  if (!course) return { success: false, reason: "course_not_found" };
  if (TERMINAL_STATUSES2.includes(course.statut) || course.livreur_id || course.accepted_by_livreur_id) {
    return { success: true, proposals_created: 0, reason: "course_unavailable" };
  }
  if (course.eco_status === "grouped" && course.eco_mission_id) {
    return { success: true, proposals_created: 0, reason: "course_grouped" };
  }
  if (!hasUsableRoutePoints2(course)) {
    return { success: true, proposals_created: 0, reason: "no_gps_points" };
  }
  const config = await loadEcoConfig(base44, course.country_code);
  if (!config.enabled || !config.onRouteEnabled) {
    return { success: true, proposals_created: 0, reason: "on_route_disabled" };
  }
  try {
    const { releaseExpiredReservationsLazy: releaseExpiredReservationsLazy2 } = await Promise.resolve().then(() => (init_onRoutePriorityReservation(), onRoutePriorityReservation_exports));
    await releaseExpiredReservationsLazy2(base44, course.country_code, 10);
  } catch (e) {
    console.error("[triggerOnRouteProposals] lazy cleanup failed:", e?.message || String(e));
  }
  if (config.onRoutePriorityEnabled) {
    const { createExclusiveReservation: createExclusiveReservation2 } = await Promise.resolve().then(() => (init_onRoutePriorityReservation(), onRoutePriorityReservation_exports));
    const reservation = await createExclusiveReservation2(base44, course, config);
    if (reservation.created) {
      return {
        success: true,
        proposals_created: 1,
        exclusive_reservation_created: true,
        livreur_id: reservation.livreurId,
        proposal_id: reservation.proposalId,
        reason: "exclusive_priority_reservation"
      };
    }
  }
  const courseEnterpriseId = normalizeEnterpriseId(course.enterprise_id);
  const { buildCourseCityFilterFromCourse: buildCourseCityFilterFromCourse2 } = await Promise.resolve().then(() => (init_cityDispatchFilter(), cityDispatchFilter_exports));
  const onRouteCityFilter = await buildCourseCityFilterFromCourse2(base44, course);
  const activeCourses = await base44.asServiceRole.entities.CourseExterne.filter({
    country_code: course.country_code,
    statut: { $in: ACTIVE_STATUSES2 },
    livreur_id: { $exists: true },
    ...onRouteCityFilter
  }, "-updated_date", 50).catch(() => []);
  const driverIds = /* @__PURE__ */ new Set();
  for (const ac of activeCourses || []) {
    if (!ac?.livreur_id) continue;
    if (normalizeEnterpriseId(ac.enterprise_id) !== courseEnterpriseId) continue;
    driverIds.add(ac.livreur_id);
  }
  if (driverIds.size === 0) {
    return { success: true, proposals_created: 0, reason: "no_active_drivers" };
  }
  let proposalsCreated = 0;
  const errors = [];
  for (const livreurId of driverIds) {
    try {
      const result2 = await createOnRouteProposal(base44, courseId, livreurId);
      if (result2?.success && !result2?.idempotent) {
        proposalsCreated++;
      }
    } catch (e) {
      errors.push({ livreur_id: livreurId, error: e?.message || String(e) });
    }
  }
  return {
    success: true,
    proposals_created: proposalsCreated,
    drivers_checked: driverIds.size,
    errors: errors.length > 0 ? errors : void 0
  };
}
async function acceptEcoMission(base44, missionId, livreurId) {
  const mission = await base44.asServiceRole.entities.EcoMission.get(missionId).catch(() => null);
  if (!mission || mission.status !== "available") return { success: false, reason: "mission_unavailable" };
  const { verifyLivreurIdentity: verifyLivreurIdentity2 } = await Promise.resolve().then(() => (init_livreurIdentityGuard(), livreurIdentityGuard_exports));
  const identityCheck = await verifyLivreurIdentity2(base44, livreurId);
  if (!identityCheck.verified) {
    return { success: false, reason: "identity_mismatch", error: identityCheck.error || "V\xE9rification d'identit\xE9 \xE9chou\xE9e" };
  }
  const livreur = identityCheck.livreur;
  if (normalizeEnterpriseId(mission.enterprise_id) !== normalizeEnterpriseId(livreur.enterprise_id)) {
    return { success: false, reason: "enterprise_mismatch" };
  }
  if (livreur.type_livreur !== "externe" || livreur.validation !== "valide" || livreur.actif !== true || livreur.statut !== "disponible" || livreur.manual_hors_ligne === true || livreur.admin_hors_ligne === true || livreur.bloque_encours === true) {
    return { success: false, reason: "livreur_indisponible" };
  }
  const { verifyCityCompatibility: verifyCityCompatibility2 } = await Promise.resolve().then(() => (init_cityDispatchFilter(), cityDispatchFilter_exports));
  const firstCourse = await base44.asServiceRole.entities.CourseExterne.get(
    (Array.isArray(mission.course_ids) ? mission.course_ids : [])[0]
  ).catch(() => null);
  if (firstCourse) {
    const cityCheck = await verifyCityCompatibility2(base44, firstCourse, livreur);
    if (!cityCheck.compatible) {
      return { success: false, reason: "city_mismatch", courseCity: cityCheck.courseCity, livreurCity: cityCheck.livreurCity };
    }
  }
  const courseIds = Array.isArray(mission.course_ids) ? mission.course_ids : [];
  if (courseIds.length < 2) return { success: false, reason: "mission_incomplete" };
  const courses = [];
  for (const id2 of courseIds) {
    const course = await base44.asServiceRole.entities.CourseExterne.get(id2).catch(() => null);
    if (!course) return { success: false, reason: "missing_course", course_id: id2 };
    if (normalizeEnterpriseId(course.enterprise_id) !== normalizeEnterpriseId(mission.enterprise_id)) {
      return { success: false, reason: "enterprise_mismatch", course_id: id2 };
    }
    if (course.country_code !== mission.country_code || course.eco_mission_id !== mission.id || course.eco_status !== "grouped" || course.dispatch_status !== "en_attente" || TERMINAL_STATUSES2.includes(course.statut) || course.livreur_id || course.accepted_by_livreur_id) {
      return { success: false, reason: "course_not_claimable", course_id: id2 };
    }
    courses.push(course);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const claimMission = await base44.asServiceRole.entities.EcoMission.updateMany(
    { id: mission.id, status: "available" },
    { $set: { status: "accepting", livreur_id: livreurId, livreur_user_email: livreur.user_email || null, accepted_at: now } }
  );
  if (!claimMission || claimMission.updated !== 1) {
    return { success: false, reason: "mission_race_lost" };
  }
  const updateData = {
    dispatch_status: "accepte",
    statut: "livreur_en_route",
    heure_acceptation: now,
    livreur_id: livreurId,
    livreur_nom: `${livreur.prenom || ""} ${livreur.nom || ""}`.trim(),
    livreur_photo_url: livreur.photo_url || "",
    livreur_telephone: livreur.telephone,
    livreur_vehicule: livreur.vehicule || livreur.type_vehicule || "moto",
    livreur_note_moyenne: livreur.note_moyenne || 0,
    livreur_nombre_avis: livreur.nombre_avis || 0,
    livreur_user_email: livreur.user_email || null,
    accepted_by_livreur_id: livreurId,
    accepted_at: now
  };
  const claimCourses = await base44.asServiceRole.entities.CourseExterne.updateMany(
    {
      id: { $in: courseIds },
      dispatch_status: "en_attente",
      eco_status: "grouped",
      eco_mission_id: mission.id
    },
    { $set: updateData }
  );
  if (!claimCourses || claimCourses.updated !== courseIds.length) {
    await base44.asServiceRole.entities.EcoMission.update(mission.id, { status: "invalidated" }).catch(() => null);
    return { success: false, reason: "course_race_lost" };
  }
  await base44.asServiceRole.entities.EcoMission.update(mission.id, { status: "accepted" }).catch(() => null);
  await base44.asServiceRole.entities.Livreur.update(livreurId, { statut: "en_course" }).catch(() => null);
  await Promise.all(courseIds.map((id2) => marquerAccepte(base44, id2, livreurId).catch(() => null)));
  let routeOptimization = { optimized: false, reason: "not_attempted" };
  try {
    const { optimizeEcoRouteWithDriverGPS: optimizeEcoRouteWithDriverGPS2 } = await Promise.resolve().then(() => (init_ecoRouteOptimizer(), ecoRouteOptimizer_exports));
    routeOptimization = await optimizeEcoRouteWithDriverGPS2(
      base44,
      courses,
      livreur,
      mission.route_plan_json
    );
    if (routeOptimization.optimized) {
      await base44.asServiceRole.entities.EcoMission.update(mission.id, {
        route_plan_json: routeOptimization.routePlanJSON
      }).catch(() => null);
    }
  } catch (e) {
    console.error("[acceptEcoMission] Route optimization failed:", e?.message || String(e));
    routeOptimization = { optimized: false, reason: "optimization_error" };
  }
  return {
    success: true,
    accepted: true,
    mission_id: mission.id,
    course_ids: courseIds,
    livreur_id: livreurId,
    route_optimization: routeOptimization
  };
}

// frozen:base44/shared/adminClientLinkConfig.js
var ADMIN_CLIENT_LINK_CONFIG = Object.freeze({ previewEnabled: false, creationEnabled: false, creationContractReady: false, protocol: "admin-client-link-v1" });

// frozen:base44/shared/adminCourseCreationIntegrity.js
var CourseCreationError = class extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
};
var fail3 = (code, message, status = 400) => {
  throw new CourseCreationError(code, message, status);
};
var record = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
var own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
var ADMIN_COURSE_ACTIONS = Object.freeze(["creerCourseAdmin", "creerCourseEnterprise"]);
function resolveCourseCreationGrant(user, action, raw, now = Date.now()) {
  if (!user?.id) fail3("UNAUTHENTICATED", "Non autoris\xE9.", 401);
  if (!ADMIN_COURSE_ACTIONS.includes(action)) fail3("FORBIDDEN_NO_ADMIN_COURSE_PERMISSION", "Action non autoris\xE9e.", 403);
  let config;
  try {
    config = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
  }
  if (!record(config) || config.version !== 1 || !Array.isArray(config.grants)) fail3("ADMIN_COURSE_GRANTS_UNAVAILABLE", "Autorisations indisponibles. Contactez SILGAPP.", 503);
  const matches = config.grants.filter((g2) => record(g2) && g2.user_id === user.id && g2.action === action);
  if (matches.length !== 1) fail3("FORBIDDEN_NO_ADMIN_COURSE_PERMISSION", "Administrateur ou agent non autoris\xE9.", 403);
  const g = matches[0];
  const validKind = g.kind === "admin" ? user.role === "admin" : g.kind === "agent" && ["admin", "user"].includes(user.role);
  const countries = g.country_codes;
  const expiry = typeof g.expires_at === "string" ? Date.parse(g.expires_at) : NaN;
  const validExpiry = g.until_revoked === true ? g.expires_at == null : Number.isFinite(expiry) && expiry > now;
  if (!validKind || !validExpiry || !Array.isArray(countries) || !countries.length || countries.some((c) => typeof c !== "string" || !/^[A-Z]{2}$/.test(c)) || new Set(countries).size !== countries.length) fail3("FORBIDDEN_NO_ADMIN_COURSE_PERMISSION", "Autorisation invalide ou expir\xE9e.", 403);
  if (!(g.enterprise_id === null || typeof g.enterprise_id === "string" && g.enterprise_id.trim() === g.enterprise_id && g.enterprise_id.length > 0)) fail3("FORBIDDEN_NO_ADMIN_COURSE_PERMISSION", "P\xE9rim\xE8tre entreprise invalide.", 403);
  if (action === "creerCourseEnterprise" && !g.enterprise_id) fail3("FORBIDDEN_NO_ADMIN_COURSE_PERMISSION", "P\xE9rim\xE8tre entreprise requis.", 403);
  return Object.freeze({ user_id: user.id, action, country_codes: Object.freeze([...countries]), enterprise_id: g.enterprise_id });
}
var STRINGS = Object.freeze({
  client_nom: 300,
  client_telephone: 80,
  contact_createur_course: 80,
  expediteur_nom: 300,
  expediteur_telephone: 80,
  destinataire_nom: 300,
  destinataire_telephone: 80,
  client_phone_normalized: 80,
  expediteur_phone_normalized: 80,
  destinataire_phone_normalized: 80,
  adresse_depart: 2e3,
  adresse_arrivee: 2e3,
  quartier_depart: 300,
  quartier_arrivee: 300,
  ville_depart: 300,
  ville_arrivee: 300,
  notes: 1e4,
  passager_nom: 300,
  passager_telephone: 80,
  tracking_token: 500,
  tracking_link: 2e3,
  devise: 20,
  request_id: 200
});
var NUMBERS = Object.freeze({ prix_estimate: [0, 1e12], prix_propose_admin: [0, 1e12], distance_tarifaire_km: [0, 1e5], gps_depart_lat: [-90, 90], gps_arrivee_lat: [-90, 90], gps_depart_lng: [-180, 180], gps_arrivee_lng: [-180, 180], nb_passagers: [1, 1e3] });
var ENUMS = Object.freeze({ type_course: ["expedier", "recevoir", "deplacement"], type_colis: ["petit_colis", "moyen_colis", "gros_colis", "document", "nourriture", "autre"], gps_depart_source: ["exact", "quartier", "geocodage"], gps_arrivee_source: ["exact", "quartier", "geocodage"], distance_tarifaire_source: ["ors", "haversine_fallback"], delivery_mode: ["standard", "eco"], pricing_mode: ["automatic", "manual", "admin_manuel"] });
function sanitizeAdminCourse(body, grant) {
  if (!record(body)) fail3("INVALID_BODY", "Donn\xE9es de course invalides.");
  if (own(body, "statut") && body.statut != null && !["nouvelle", "en_attente", "programmee", "recherche_livreur"].includes(body.statut)) fail3("INVALID_INITIAL_STATE", "Une nouvelle course ne peut pas \xEAtre d\xE9j\xE0 prise en charge ou termin\xE9e.");
  if (own(body, "dispatch_status") && body.dispatch_status != null && body.dispatch_status !== "en_attente") fail3("INVALID_INITIAL_STATE", "\xC9tat de dispatch initial invalide.");
  const country = typeof body.country_code === "string" ? body.country_code.trim().toUpperCase() : grant.country_codes.length === 1 && body.country_code == null ? grant.country_codes[0] : "";
  if (!grant.country_codes.includes(country)) fail3("COUNTRY_FORBIDDEN", "Pays non autoris\xE9.", 403);
  const data = {};
  for (const [key2, max] of Object.entries(STRINGS)) {
    if (!own(body, key2)) continue;
    const value = body[key2];
    if (value === null) {
      data[key2] = null;
      continue;
    }
    if (typeof value !== "string" || value.length > max) fail3("INVALID_FIELD", "Champ invalide : " + key2);
    data[key2] = value.trim();
  }
  for (const [key2, bounds] of Object.entries(NUMBERS)) {
    if (!own(body, key2)) continue;
    const value = body[key2];
    if (value === null) {
      data[key2] = null;
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < bounds[0] || value > bounds[1] || key2 === "nb_passagers" && !Number.isInteger(value)) fail3("INVALID_FIELD", "Champ num\xE9rique invalide : " + key2);
    data[key2] = value;
  }
  for (const [key2, values] of Object.entries(ENUMS)) {
    if (!own(body, key2) || body[key2] == null) continue;
    if (!values.includes(body[key2])) fail3("INVALID_FIELD", "Choix invalide : " + key2);
    data[key2] = body[key2];
  }
  if (own(body, "date_souhaitee") && body.date_souhaitee != null && body.date_souhaitee !== "") {
    if (typeof body.date_souhaitee !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(body.date_souhaitee) || !Number.isFinite(Date.parse(body.date_souhaitee))) fail3("INVALID_FIELD", "Date invalide.");
    data.date_souhaitee = body.date_souhaitee;
  }
  if (!data.client_telephone) fail3("CLIENT_PHONE_REQUIRED", "Le num\xE9ro du client est obligatoire pour cr\xE9er une course administrative.");
  if (!data.type_course || !data.adresse_depart) fail3("REQUIRED_FIELD", "Type de course et adresse de d\xE9part obligatoires.");
  if (body.statut === "programmee" && !data.date_souhaitee) fail3("INVALID_INITIAL_STATE", "Date obligatoire pour une course programm\xE9e.");
  if (body.dispatch_status === "en_attente") data.dispatch_status = "en_attente";
  return { ...data, source: "admin", country_code: country, enterprise_id: grant.enterprise_id, statut: body.statut || "nouvelle", pricing_mode: data.pricing_mode || "automatic" };
}
async function requireActiveCourseEnterprise(api, grant, countryCode) {
  if (!grant.enterprise_id) return null;
  let rows;
  try {
    rows = await api.asServiceRole.entities.Enterprise.filter({ enterprise_financier_id: grant.enterprise_id });
  } catch {
    fail3("ENTERPRISE_VERIFICATION_UNAVAILABLE", "V\xE9rification entreprise indisponible.", 503);
  }
  if (!Array.isArray(rows) || rows.length !== 1) fail3("ENTERPRISE_NOT_FOUND", "Entreprise non v\xE9rifi\xE9e.", 403);
  const ent = rows[0];
  if (ent.enterprise_financier_id !== grant.enterprise_id || ent.country_code !== countryCode || ent.actif !== true || ent.statut !== "actif") fail3("ENTERPRISE_SUSPENDED_OR_SCOPE", "Entreprise inactive ou pays non autoris\xE9.", 403);
  return ent;
}
async function resolveNativeAdminCourseGrant(api, user, body) {
  if (!user?.id) fail3("UNAUTHENTICATED", "Non autoris\xE9.", 401);
  if (user.role !== "admin") fail3("FORBIDDEN_NO_ADMIN_COURSE_PERMISSION", "Administrateur non autoris\xE9.", 403);
  if (!record(body)) fail3("INVALID_BODY", "Donn\xE9es de course invalides.");
  const country = typeof body.country_code === "string" ? body.country_code.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(country)) fail3("COUNTRY_REQUIRED", "S\xE9lectionnez le pays de la course.");
  let rows;
  try {
    rows = await api.asServiceRole.entities.Country.filter({ code: country }, "created_date", 2);
  } catch {
    fail3("COUNTRY_VERIFICATION_UNAVAILABLE", "V\xE9rification du pays indisponible.", 503);
  }
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.code !== country || rows[0]?.actif !== true) fail3("COUNTRY_FORBIDDEN", "Pays inactif ou non v\xE9rifi\xE9.", 403);
  return Object.freeze({ user_id: user.id, action: "creerCourseAdmin", country_codes: Object.freeze([country]), enterprise_id: null });
}
async function createGuardedAdminCourse(api, user, body, rawGrants, prepareEco, captureOrigin = async (_decision, create) => create()) {
  const grant = user?.role === "admin" ? await resolveNativeAdminCourseGrant(api, user, body) : resolveCourseCreationGrant(user, "creerCourseAdmin", rawGrants);
  const data = sanitizeAdminCourse(body, grant);
  await requireActiveCourseEnterprise(api, grant, data.country_code);
  if (body.client_account_link?.mode === "confirmed" && ADMIN_CLIENT_LINK_CONFIG.creationEnabled !== true) throw new ClientLinkReviewError();
  const decision = await confirmAdminClientAccount(api, user, grant, data, body.client_account_link);
  const accountFields = adminAccountCourseFields(decision, user.id, data.type_course);
  const requested = data.delivery_mode;
  delete data.delivery_mode;
  const eco = await prepareEco(api, { ...data, delivery_mode: requested });
  const course = await captureOrigin(decision, () => api.asServiceRole.entities.CourseExterne.create({ ...data, ...eco, ...accountFields }));
  const linkedDecision = decision ? readPinnedAdminDecision(decision, user.id) : null;
  const client_account_link_result = linkedDecision?.mode === "linked" ? { mode: "linked", candidate: linkedDecision.candidate } : { mode: "unlinked" };
  return { success: true, course, client_account_link_result };
}
function courseCreationErrorResponse(error) {
  if (error instanceof ClientLinkReviewError) return Response.json({ error: error.message, code: error.code }, { status: 409 });
  if (error instanceof CourseCreationError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof SyntaxError) return Response.json({ error: "Corps JSON invalide.", code: "INVALID_BODY" }, { status: 400 });
  return Response.json({ error: "Cr\xE9ation non confirm\xE9e. V\xE9rifiez les courses avant de r\xE9essayer.", code: "CREATION_UNCERTAIN" }, { status: 500 });
}

// frozen:base44/functions/creerCourseAdmin/entry.ts
import { createClientFromRequest as createClientFromRequest2 } from "npm:@base44/sdk@0.8.40";
async function entry_default(req) {
  try {
    const base44 = createClientFromRequest2(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Non autoris\xE9", code: "UNAUTHENTICATED" }, { status: 401 });
    const result2 = await createGuardedAdminCourse(base44, user, await req.json(), Deno.env.get("ADMIN_COURSE_GRANTS_JSON"), prepareEcoCreationFields, (decision, create) => captureAdminCourseOrigin(req, decision, create));
    return Response.json(result2);
  } catch (error) {
    console.error("[creerCourseAdmin] Creation non confirmee");
    return courseCreationErrorResponse(error);
  }
}
export {
  entry_default as default
};
