// ── Grille tarifaire SILGAPP — dynamique (fetch depuis Country) ──
// Plus aucun pays codé en dur. Fallback minimal uniquement si la BDD
// est indisponible au premier chargement.

import { base44 } from "@/api/base44Client";

// Cache en mémoire des configs pays (évite les requêtes répétées)
const countryConfigCache = new Map();
let cacheInitialized = false;

const FALLBACK_CONFIG = {
  prix_par_km: 100,
  prix_minimum: 500,
  devise: "FCFA",
};

/**
 * Charge toutes les configs Country actives en cache.
 * Idempotent — ne recharge que si le cache est vide.
 */
export async function ensureCountryConfigCache() {
  if (cacheInitialized && countryConfigCache.size > 0) return;
  try {
    const countries = await base44.entities.Country.filter({ actif: true });
    for (const c of countries || []) {
      if (c.code) {
        countryConfigCache.set(c.code, {
          prix_par_km: c.prix_par_km ?? FALLBACK_CONFIG.prix_par_km,
          prix_minimum: c.prix_minimum ?? FALLBACK_CONFIG.prix_minimum,
          devise: c.devise || FALLBACK_CONFIG.devise,
          indicatif: c.indicatif,
          commission_pct: c.commission_pct,
          rayon_km: c.rayon_km,
        });
      }
    }
    cacheInitialized = true;
  } catch (e) {
    console.warn("[priceEstimate] Failed to load country configs, using fallback:", e?.message);
  }
}

/**
 * Récupère la config tarifaire d'un pays depuis le cache.
 * Fallback minimal si le pays n'est pas en base.
 */
export function getCountryTarifConfig(countryCode) {
  const code = String(countryCode || "").toUpperCase();
  return countryConfigCache.get(code) || { ...FALLBACK_CONFIG };
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  if (Number.isNaN(Number(lat1)) || Number.isNaN(Number(lng1)) ||
      Number.isNaN(Number(lat2)) || Number.isNaN(Number(lng2))) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calcule le prix approximatif d'une course à partir des coordonnées GPS.
 * Utilise la config du pays depuis la BDD (Country).
 *
 * @returns {prix, distance, devise} ou null si GPS manquant
 */
export function calculerPrixApproximatif(lat1, lng1, lat2, lng2, countryCode) {
  const tarif = getCountryTarifConfig(countryCode);
  const distance = haversineKm(lat1, lng1, lat2, lng2);
  if (distance === null) return null;

  const PRIX_MINIMUM_GLOBAL = tarif.devise === "FCFA" ? 1000 : tarif.prix_minimum;
  const prixBrut = distance * tarif.prix_par_km;
  const prixFinal = Math.max(Math.round(prixBrut), tarif.prix_minimum, PRIX_MINIMUM_GLOBAL);

  return {
    prix: prixFinal,
    distance: Math.round(distance * 10) / 10,
    devise: tarif.devise,
  };
}

/**
 * Version async — garantit que le cache est chargé avant le calcul.
 * À utiliser dans les composants qui peuvent attendre (useEffect, onClick).
 */
export async function calculerPrixApproximatifAsync(lat1, lng1, lat2, lng2, countryCode) {
  await ensureCountryConfigCache();
  return calculerPrixApproximatif(lat1, lng1, lat2, lng2, countryCode);
}