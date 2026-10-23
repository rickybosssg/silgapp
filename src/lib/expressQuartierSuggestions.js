import { normalizeLocationText } from './locationSearchCore.js';
import { resolveExpressQuartier } from '../../base44/shared/expressOrder.js';

const digits = ['zero', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
const nameKey = value => normalizeLocationText(value).replace(/[.,;:!?]/g, ' ').replace(/\s+/g, ' ').trim();
const spokenKey = value => nameKey(value).replace(/\b[0-9]\b/g, digit => digits[Number(digit)]);
// Ranking hints only: these spelling similarities never resolve a destination.
const soundKey = value => spokenKey(value).replace(/ph/g, 'f').replace(/qu/g, 'k').replace(/c(?=[eiy])/g, 's').replace(/ss/g, 's').replace(/[xz]$/g, 's');

function distance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    for (let column = 1; column <= right.length; column++) current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
    previous = current;
  }
  return previous[right.length];
}

function validQuartiers(quartiers, country) {
  if (!/^[A-Z]{2}$/.test(country || '')) return [];
  return (quartiers || []).filter(quartier => {
    if (!quartier?.id || quartier.country_code !== country || quartier.actif !== true) return false;
    try { resolveExpressQuartier(quartier.nom, [quartier], country); return true; } catch { return false; }
  });
}

export function scopeVoiceQuartiers(quartiers, country, city) {
  const active = validQuartiers(quartiers, country);
  const cityKey = nameKey(city);
  if (!cityKey) return [];
  const zones = new Set(active.filter(q => nameKey(q.ville) === cityKey || nameKey(q.ville_operationnelle) === cityKey).map(q => nameKey(q.ville_operationnelle || q.ville)));
  if (zones.size !== 1) return [];
  const [zone] = zones;
  return active.filter(q => nameKey(q.ville_operationnelle || q.ville) === zone);
}

function similarity(query, value) {
  const a = spokenKey(query), b = spokenKey(value);
  if (!a || !b || a.length > 120 || b.length > 120) return 0;
  if (a === b) return 100;
  if (a.length >= 3 && b.startsWith(a)) return 85;
  const editRatio = distance(a.slice(0, 120), b.slice(0, 120)) / Math.max(a.length, b.length);
  if (a.length >= 3 && editRatio <= 0.4) return 75 - editRatio * 30;
  const phoneticA = soundKey(a), phoneticB = soundKey(b);
  if (phoneticA.length >= 3 && (phoneticB.startsWith(phoneticA) || phoneticA === phoneticB)) return 60;
  return 0;
}

export function suggestVoiceQuartiers(value, quartiers, country, city) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) return [];
  const fragments = [...new Set(value.split(/[,;]+/).map(fragment => nameKey(fragment).replace(/^(?:(?:le|la|du|de|au)\s+)*(?:quartier|secteur)\s+/, '').trim()).filter(Boolean))];
  const seen = new Set();
  return scopeVoiceQuartiers(quartiers, country, city)
    .filter(q => { if (seen.has(q.id)) return false; seen.add(q.id); return true; })
    .map(quartier => ({ quartier, score: Math.max(0, ...[quartier.nom, ...(quartier.variantes || '').split(',')].flatMap(name => fragments.map(fragment => similarity(fragment, name)))) }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.quartier.nom.localeCompare(b.quartier.nom, 'fr'))
    .slice(0, 3).map(result => result.quartier);
}

export function getVoiceQuartierReview({ fields, quartiers, country, city = '' }) {
  let origin;
  try { origin = resolveExpressQuartier(fields.depart, quartiers, country); } catch { /* An uncertain departure cannot determine the city. */ }
  const scopeCity = origin?.ville_operationnelle || origin?.ville || city;
  const checks = {};
  for (const field of ['depart', 'arrivee']) {
    if (!fields[field]?.trim()) continue;
    try { resolveExpressQuartier(fields[field], quartiers, country); }
    catch {
      checks[field] = { query: fields[field], candidates: suggestVoiceQuartiers(fields[field], quartiers, country, scopeCity) };
    }
  }
  return checks;
}
