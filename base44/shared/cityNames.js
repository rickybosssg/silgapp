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
