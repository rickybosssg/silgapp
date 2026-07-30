export const MAX_LOCATION_RESULTS = 10;

export function normalizeLocationText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function locationKey(item) {
  const lat = Number(item.latitude);
  const lng = Number(item.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `${lat.toFixed(5)}:${lng.toFixed(5)}`;
  }
  return `${item.type || "adresse"}:${normalizeLocationText(item.label)}`;
}

function scoreItem(item, normalizedQuery) {
  const label = normalizeLocationText(item.label);
  const variants = normalizeLocationText(item.searchText || "");
  const haystack = `${label} ${variants}`.trim();
  if (label === normalizedQuery) return 100;
  if (label.startsWith(normalizedQuery)) return 90;
  if (label.split(" ").some((token) => token.startsWith(normalizedQuery))) return 80;
  if (haystack.includes(normalizedQuery)) return 60;

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  if (queryTokens.length && queryTokens.every((token) => haystack.includes(token))) return 45;
  return 0;
}

export function filterAndRankLocations(items, query, limit = MAX_LOCATION_RESULTS) {
  const normalizedQuery = normalizeLocationText(query);
  if (normalizedQuery.length < 2) return [];

  return items
    .map((item) => ({ item, score: scoreItem(item, normalizedQuery) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label, "fr"))
    .slice(0, limit)
    .map(({ item }) => item);
}

export function mergeLocationResults(...groups) {
  const seen = new Set();
  const merged = [];
  for (const group of groups) {
    for (const item of group || []) {
      const key = locationKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= MAX_LOCATION_RESULTS) return merged;
    }
  }
  return merged;
}

