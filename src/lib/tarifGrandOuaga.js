// ═══════════════════════════════════════════════════════════════════════════
// TARIFICATION GRAND OUAGA — Configurable depuis le backend
// ────────────────────────────────────────────────────────────────────────────
// Les valeurs (1250, 1750, 15km, 25km) ne sont PLUS codées en dur.
// Elles sont récupérées depuis l'entité TarifZone via getTarifZones.
//
// Cache local :
//   - Cache en mémoire (TTL 5 min) pour éviter les requêtes répétées
//   - Cache persistant (localStorage, TTL 24h) pour fonctionner hors-ligne
//   - Fallback hardcoded UNIQUEMENT si aucune config n'a jamais été reçue
//
// Le backend reste la source de vérité du prix : calculPrixCourseExterne
// recalcule/valide le tarif avec la configuration active à la création.
// ═══════════════════════════════════════════════════════════════════════════

import { base44 } from "@/api/base44Client";
import { haversineKm } from "./priceEstimate";

// ── Fallback générique (uniquement si aucune config backend jamais reçue) ──
// Aucun pays codé en dur — valeurs neutres utilisées uniquement avant la
// première synchronisation avec le backend.
const FALLBACK_CONFIG = {
  palier_1_km_max: 15,
  palier_1_prix: 0,
  palier_2_km_max: 25,
  palier_2_prix: 0,
  tolerance_min_km: 14,
  tolerance_max_km: 16,
  seuil_strict_km: 15,
  devise: "FCFA",
};

const CACHE_KEY = "silgapp_tarif_grand_ouaga";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min en mémoire
// Pas de TTL sur le cache localStorage : la dernière config connue reste
// valide indéfiniment. Un téléphone jamais synchronisé utilisera la dernière
// config reçue plutôt qu'un tarif figé dans l'APK. Le fallback hardcodé
// n'est utilisé QUE si aucune config n'a JAMAIS été reçue.

let memoryCache = {};
let memoryCacheExpires = 0;

/**
 * Charge la config tarifaire Grand Ouaga depuis le backend.
 * Cache en mémoire (5 min) + localStorage (24h) pour le hors-ligne.
 */
async function loadTarifConfig(countryCode = null) {
  // 1. Cache en mémoire (clé par pays)
  const cacheKey = countryCode || "default";
  if (memoryCache?.[cacheKey] && Date.now() < memoryCacheExpires) {
    return memoryCache[cacheKey];
  }

  // 2. Tentative backend (country_code dynamique — aucun pays codé en dur)
  if (countryCode) {
    try {
      const res = await base44.functions.invoke("getTarifZones", { country_code: countryCode });
      const data = res?.data || res;
      const zones = data?.zones || [];
      // Sélectionner la zone applicable (ville ou pays)
      const zone = zones[0];
      if (zone) {
        if (!memoryCache) memoryCache = {};
        memoryCache[cacheKey] = zone;
        memoryCacheExpires = Date.now() + CACHE_TTL_MS;
        try {
          localStorage.setItem(
            CACHE_KEY + "_" + cacheKey,
            JSON.stringify({ config: zone, saved_at: Date.now() })
          );
        } catch (_) {}
        return zone;
      }
    } catch (err) {
      // Backend indisponible — essayer le cache persistant
    }
  }

  // 3. Cache persistant (localStorage) — hors-ligne, sans expiration
  try {
    const raw = localStorage.getItem(CACHE_KEY + "_" + (countryCode || "default"));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.config) {
        if (!memoryCache) memoryCache = {};
        memoryCache[cacheKey] = parsed.config;
        memoryCacheExpires = Date.now() + CACHE_TTL_MS;
        return parsed.config;
      }
    }
  } catch (_) {}

  // 4. Fallback générique (dernier recours — aucun pays codé en dur)
  return FALLBACK_CONFIG;
}

/**
 * Vérifie si un pays est éligible à une tarification par paliers.
 * Dynamique : interroge le backend pour savoir si une TarifZone existe.
 * Cache le résultat en localStorage (24h) pour éviter les requêtes répétées.
 */
export async function isPaysTarificationParPaliers(countryCode) {
  if (!countryCode) return false;
  const key = "silgapp_has_tarif_zone_" + countryCode;
  try {
    const cached = localStorage.getItem(key);
    if (cached !== null) return cached === "true";
  } catch (_) {}
  try {
    const res = await base44.functions.invoke("getTarifZones", { country_code: countryCode });
    const data = res?.data || res;
    const zones = data?.zones || [];
    const has = zones.length > 0;
    try { localStorage.setItem(key, String(has)); } catch (_) {}
    return has;
  } catch (_) {
    return false;
  }
}

/**
 * @deprecated Utiliser isPaysTarificationParPaliers (async) à la place.
 * Conserver uniquement pour rétrocompatibilité — retourne true pour tout pays
 * pouvant avoir une TarifZone configurée.
 */
export function isPaysTarificationGrandOuaga(countryCode) {
  return !!countryCode;
}

/**
 * Détermine si la tolérance GPS s'applique.
 * Renvoie true si au moins une source est "quartier" ou "geocodage".
 */
export function isGpsApproximatif(sourceDepart, sourceArrivee) {
  const approx = ["quartier", "geocodage"];
  return approx.includes(sourceDepart) || approx.includes(sourceArrivee);
}

/**
 * Calcule le tarif Grand Ouaga à partir de la distance tarifaire et des
 * sources GPS, en utilisant la configuration du backend.
 *
 * @param {number} distanceKm - distance tarifaire (ORS ou fallback Haversine)
 * @param {string|null} sourceDepart - "exact" | "quartier" | "geocodage" | null
 * @param {string|null} sourceArrivee - "exact" | "quartier" | "geocodage" | null
 * @returns {Promise<{prix: number, tranche: string, source: string, devise: string}|null>}
 *   null = distance > palier_2_km_max (pas de tarif automatique, intervention Admin requise)
 */
export async function calculerTarifGrandOuaga(distanceKm, sourceDepart, sourceArrivee, countryCode = null) {
  if (distanceKm === null || distanceKm === undefined || isNaN(Number(distanceKm))) {
    return null;
  }

  const dist = Number(distanceKm);
  const approx = isGpsApproximatif(sourceDepart, sourceArrivee);
  const config = await loadTarifConfig(countryCode);

  const palier1KmMax = config.palier_1_km_max ?? FALLBACK_CONFIG.palier_1_km_max;
  const palier1Prix = config.palier_1_prix ?? FALLBACK_CONFIG.palier_1_prix;
  const palier2KmMax = config.palier_2_km_max ?? FALLBACK_CONFIG.palier_2_km_max;
  const palier2Prix = config.palier_2_prix ?? FALLBACK_CONFIG.palier_2_prix;
  const tolMin = config.tolerance_min_km ?? FALLBACK_CONFIG.tolerance_min_km;
  const tolMax = config.tolerance_max_km ?? FALLBACK_CONFIG.tolerance_max_km;
  const seuilStrict = config.seuil_strict_km ?? FALLBACK_CONFIG.seuil_strict_km;
  const devise = config.devise || FALLBACK_CONFIG.devise;

  // > palier_2_km_max → pas de tarif automatique
  if (dist > palier2KmMax) {
    return null;
  }

  // Tolérance GPS : entre tolMin et tolMax avec GPS approximatif → palier 1
  if (approx && dist >= tolMin && dist <= tolMax) {
    return {
      prix: palier1Prix,
      tranche: `≤ ${palier1KmMax} km (tolérance GPS approximatif)`,
      source: "tolerance_gps",
      devise,
    };
  }

  // Seuil strict (GPS exact) ou tolérance hors zone
  if (dist <= seuilStrict) {
    return {
      prix: palier1Prix,
      tranche: `≤ ${palier1KmMax} km`,
      source: "tarif_grand_ouaga",
      devise,
    };
  }

  // > seuilStrict et ≤ palier2KmMax → palier 2
  return {
    prix: palier2Prix,
    tranche: `${palier1KmMax}–${palier2KmMax} km`,
    source: "tarif_grand_ouaga",
    devise,
  };
}

/**
 * Récupère la distance routière ORS depuis le backend getRouteORS.
 * Utilise le cache et le circuit breaker existants.
 * Fallback Haversine si ORS échoue.
 */
export async function fetchDistanceTarifaireORS(
  fromLat, fromLng, toLat, toLng,
  countryCode, courseId = null
) {
  try {
    const res = await base44.functions.invoke("getRouteORS", {
      course_id: courseId,
      phase: "tarification",
      from_lat: fromLat,
      from_lng: fromLng,
      to_lat: toLat,
      to_lng: toLng,
      country_code: countryCode,
    });

    const data = res?.data || res;
    const dist = Number(data?.distanceKm);

    if (data?.source === "ors" && dist > 0) {
      return { distanceKm: dist, source: "ors" };
    }
    if (dist > 0) {
      return { distanceKm: dist, source: "haversine_fallback", error: data?.error };
    }
  } catch (err) {
    // Erreur réseau — fallback Haversine local
  }

  const havDist = haversineKm(fromLat, fromLng, toLat, toLng);
  return {
    distanceKm: havDist || 0,
    source: "haversine_fallback",
    error: "ORS indisponible — fallback Haversine",
  };
}

/**
 * Fonction principale : calcule le tarif Grand Ouaga en appelant ORS + config backend.
 * À utiliser dans les formulaires (Client, Admin) au moment de la création.
 *
 * @returns {Promise<{prix: number, distanceKm: number, tranche: string,
 *   source: string, devise: string, distanceSource: string}|null>}
 *   null = distance > palier_2_km_max (pas de tarif automatique)
 */
export async function calculerTarifGrandOuagaAsync(
  fromLat, fromLng, toLat, toLng,
  countryCode, sourceDepart, sourceArrivee, courseId = null
) {
  if (!countryCode) return null;
  if (!fromLat || !fromLng || !toLat || !toLng) return null;

  const hasTarifZone = await isPaysTarificationParPaliers(countryCode);
  if (!hasTarifZone) return null;

  const { distanceKm, source: distanceSource, error } = await fetchDistanceTarifaireORS(
    fromLat, fromLng, toLat, toLng, countryCode, courseId
  );

  const tarif = await calculerTarifGrandOuaga(distanceKm, sourceDepart, sourceArrivee, countryCode);
  if (!tarif) {
    const config = await loadTarifConfig(countryCode);
    const palier2KmMax = config.palier_2_km_max ?? FALLBACK_CONFIG.palier_2_km_max;
    return {
      prix: null,
      distanceKm: Math.round(distanceKm * 10) / 10,
      tranche: `> ${palier2KmMax} km — tarif personnalisé requis`,
      source: "hors_tarif",
      devise: config.devise || FALLBACK_CONFIG.devise,
      distanceSource,
      error: error || `Distance supérieure à ${palier2KmMax} km`,
    };
  }

  return {
    ...tarif,
    distanceKm: Math.round(distanceKm * 10) / 10,
    distanceSource,
  };
}