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
  ].map(normalizeCityName).filter(Boolean))];
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
  const zone = resolveOperationalName(course.ville_depart, cities, quartiers);
  if (!zone) return false;
  return !cities.some(c => c.actif === true && normalizeCityName(c.nom) === zone) ||
    zone === resolveOperationalName(driverCity, cities, quartiers);
}

