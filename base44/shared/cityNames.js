import { haversineKm } from './geoUtils.ts';

// Pure canonical names shared by query filters and the available-feed UI.
export function normalizeCityName(name) {
  if (typeof name !== 'string') return null;
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ') || null;
}

export function cityNamePattern(name) {
  const city = normalizeCityName(name);
  if (!city) return '^$';
  const accents = { a: '[aàáâãäå]', c: '[cç]', e: '[eèéêë]', i: '[iìíîï]', n: '[nñ]', o: '[oòóôõö]', u: '[uùúûü]', y: '[yýÿ]' };
  return '^\\s*' + Array.from(city, c => accents[c] || (c === ' ' ? '\\s+' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('') + '\\s*$';
}

export function cityNamesPattern(names) {
  return '(?:' + [...new Set(names.map(cityNamePattern))].join('|') + ')';
}

export function operationalCityAliases(city, quartiers = []) {
  const canonical = normalizeCityName(city?.nom);
  if (!canonical) return [];
  const communes = Array.isArray(city.communes_rattachees) ? city.communes_rattachees : JSON.parse(city.communes_rattachees || '[]');
  if (!Array.isArray(communes)) throw new Error('invalid_zone_aliases');
  return [...new Set([canonical, city.nom_affichage, ...communes,
    ...quartiers.filter(q => normalizeCityName(q.ville_operationnelle || q.ville) === canonical).map(q => q.ville)
  ].map(normalizeCityName).filter(value => typeof value === 'string'))];
}

export function resolveOperationalName(name, cities = [], quartiers = []) {
  const value = normalizeCityName(name);
  if (!value) return null;
  const matches = new Set(cities.filter(c => operationalCityAliases(c, quartiers).includes(value)).map(c => normalizeCityName(c.nom)));
  for (const q of quartiers) {
    if (normalizeCityName(q.ville) === value && q.ville_operationnelle) matches.add(normalizeCityName(q.ville_operationnelle));
  }
  if (matches.size > 1) throw new Error('ambiguous_operational_zone');
  return [...matches][0] || value;
}

export function canSeeOperationalCourse(course, driverCity, cities, quartiers) {
  if (!cities.some(c => c.actif === true)) return true;
  // Match backend getCourseDepartureCity: stored name first, then departure GPS.
  // A genuinely unresolved origin remains hidden whenever any zone is active.
  const zone = resolveOperationalName(course.ville_depart, cities, quartiers) ||
    resolveGpsOperationalCity(course.gps_depart_lat, course.gps_depart_lng, course.country_code, cities, quartiers);
  if (!zone) return false;
  return !cities.some(c => c.actif === true && normalizeCityName(c.nom) === zone) ||
    zone === resolveOperationalName(driverCity, cities, quartiers);
}


export function resolveGpsOperationalCity(lat, lng, countryCode, cities, quartiers, maxDistanceKm = 30) {
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

