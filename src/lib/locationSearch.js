import { base44 } from "@/api/base44Client";
import {
  filterAndRankLocations,
  mergeLocationResults,
  normalizeLocationText,
} from "./locationSearchCore";

export { normalizeLocationText } from "./locationSearchCore";

const INDEX_CACHE_PREFIX = "silgapp_location_index_v1";
const QUERY_CACHE_PREFIX = "silgapp_location_query_v1";
const INDEX_TTL_MS = 6 * 60 * 60 * 1000;
const QUERY_TTL_MS = 24 * 60 * 60 * 1000;
const memoryIndexes = new Map();

function safeStorageRead(key, allowExpired = false) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    if (!parsed?.data || !parsed?.savedAt) return null;
    if (!allowExpired && Date.now() - parsed.savedAt > parsed.ttl) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function safeStorageWrite(key, data, ttl) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ttl, savedAt: Date.now() }));
  } catch {
    // A full or unavailable cache must never block address entry.
  }
}

function mapQuartier(quartier, countryCode) {
  return {
    id: quartier.id,
    type: "quartier",
    label: quartier.nom,
    address: [quartier.nom, quartier.ville].filter(Boolean).join(", "),
    quartier: quartier.nom,
    ville: quartier.ville || "",
    countryCode,
    latitude: quartier.latitude ?? null,
    longitude: quartier.longitude ?? null,
    searchText: `${quartier.nom || ""} ${quartier.ville || ""} ${quartier.variantes || ""}`,
    source: "silgapp",
  };
}

function mapStructure(entity, type, countryCode) {
  return {
    id: entity.id,
    type,
    label: entity.nom,
    address: entity.adresse || [entity.quartier, entity.ville].filter(Boolean).join(", "),
    quartier: entity.quartier || "",
    ville: entity.ville || "",
    countryCode,
    latitude: entity.latitude ?? null,
    longitude: entity.longitude ?? null,
    searchText: `${entity.nom || ""} ${entity.adresse || ""} ${entity.quartier || ""} ${entity.ville || ""}`,
    source: "silgapp",
  };
}

function indexCacheKey(countryCode) {
  return `${INDEX_CACHE_PREFIX}:${String(countryCode || "").toUpperCase()}`;
}

function queryCacheKey(countryCode, query) {
  return `${QUERY_CACHE_PREFIX}:${String(countryCode || "").toUpperCase()}:${normalizeLocationText(query)}`;
}

export function getCachedLocationSuggestions(countryCode, query) {
  const code = String(countryCode || "").toUpperCase();
  const memory = memoryIndexes.get(code);
  const cached = memory?.items || safeStorageRead(indexCacheKey(code), true) || [];
  const remote = safeStorageRead(queryCacheKey(code, query), true) || [];
  return mergeLocationResults(filterAndRankLocations(cached, query), remote);
}

export async function refreshCountryLocationIndex(countryCode, force = false) {
  const code = String(countryCode || "").toUpperCase();
  if (!code) return [];

  const memory = memoryIndexes.get(code);
  if (!force && memory && Date.now() - memory.savedAt < INDEX_TTL_MS) return memory.items;

  const cached = safeStorageRead(indexCacheKey(code));
  if (!force && cached) {
    memoryIndexes.set(code, { items: cached, savedAt: Date.now() });
    return cached;
  }

  const [quartiers, boutiques, restaurants, pharmacies] = await Promise.all([
    base44.entities.Quartier.filter({ country_code: code, actif: true }, "nom", 500).catch(() => []),
    base44.entities.Boutique.filter({ pays_code: code, actif: true }, "nom", 300).catch(() => []),
    base44.entities.Restaurant.filter({ pays_code: code, actif: true }, "nom", 300).catch(() => []),
    base44.entities.Pharmacie.filter({ pays_code: code, actif: true }, "nom", 300).catch(() => []),
  ]);

  const items = [
    ...quartiers.map((item) => mapQuartier(item, code)),
    ...boutiques.map((item) => mapStructure(item, "boutique", code)),
    ...restaurants.map((item) => mapStructure(item, "restaurant", code)),
    ...pharmacies.map((item) => mapStructure(item, "pharmacie", code)),
  ];

  memoryIndexes.set(code, { items, savedAt: Date.now() });
  safeStorageWrite(indexCacheKey(code), items, INDEX_TTL_MS);
  return items;
}

function mapNominatimResult(result, countryCode) {
  const address = result.address || {};
  const quartier =
    address.neighbourhood ||
    address.suburb ||
    address.quarter ||
    address.city_district ||
    address.village ||
    "";
  const ville = address.city || address.town || address.municipality || address.village || "";

  return {
    id: `osm:${result.place_id}`,
    type: "adresse",
    label: result.name || quartier || result.display_name?.split(",")[0] || "Adresse",
    address: result.display_name || "",
    quartier,
    ville,
    countryCode,
    latitude: Number(result.lat),
    longitude: Number(result.lon),
    searchText: result.display_name || "",
    source: "openstreetmap",
  };
}

export async function searchRemoteLocations(countryCode, query, signal) {
  const code = String(countryCode || "").toUpperCase();
  const normalizedQuery = normalizeLocationText(query);
  if (!code || normalizedQuery.length < 3 || typeof navigator !== "undefined" && !navigator.onLine) {
    return [];
  }

  const cacheKey = queryCacheKey(code, normalizedQuery);
  const cached = safeStorageRead(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    limit: "8",
    countrycodes: code.toLowerCase(),
    q: query.trim(),
    "accept-language": "fr,en",
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);

  const results = (await response.json()).map((item) => mapNominatimResult(item, code));
  safeStorageWrite(cacheKey, results, QUERY_TTL_MS);
  return results;
}

export async function searchLocationSuggestions(countryCode, query, signal) {
  const cached = getCachedLocationSuggestions(countryCode, query);
  const [index, remote] = await Promise.all([
    refreshCountryLocationIndex(countryCode).catch(() => []),
    searchRemoteLocations(countryCode, query, signal).catch((error) => {
      if (error?.name === "AbortError") throw error;
      return [];
    }),
  ]);
  return mergeLocationResults(filterAndRankLocations(index, query), cached, remote);
}
