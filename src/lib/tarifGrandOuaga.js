// ═══════════════════════════════════════════════════════════════════════════
// TARIFICATION GRAND OUAGA — Burkina Faso uniquement
// ────────────────────────────────────────────────────────────────────────────
// Règles validées :
//   ≤ 15 km  → 1 250 F CFA
//   > 15 km et ≤ 25 km → 1 750 F CFA
//   > 25 km → pas de tarif automatique (intervention Admin)
//
// Distance tarifaire = distance routière ORS (calculée une seule fois à la
// création, via getRouteORS). Fallback Haversine si ORS indisponible.
//
// Tolérance GPS : si au moins une extrémité est "quartier" ou "geocodage"
// et que la distance est comprise entre 14 et 16 km → 1 250 F par tolérance.
// Si les deux sources sont "exact" → seuil strict : 15,0 km = 1 250 F ;
// 15,1 km = 1 750 F.
//
// ⚠️ Dispatch V2 n'est PAS touché par cette logique.
// ═══════════════════════════════════════════════════════════════════════════

import { base44 } from "@/api/base44Client";
import { haversineKm } from "./priceEstimate";

// ── Tranches tarifaires Grand Ouaga (BF uniquement) ────────────────────────
const TARIF_BF_LE_15 = 1250;
const TARIF_BF_15_25 = 1750;
const DEVISE_BF = "FCFA";

// ── Zone de tolérance autour du seuil 15 km ────────────────────────────────
const TOLERANCE_MIN_KM = 14;
const TOLERANCE_MAX_KM = 16;

// ── Seuil strict pour GPS exact ────────────────────────────────────────────
const SEUIL_STRICT_KM = 15;

// ── Seuil > 25 km (pas de tarif automatique) ───────────────────────────────
const SEUIL_MAX_KM = 25;

/**
 * Vérifie si un pays est éligible à la tarification Grand Ouaga.
 * Actuellement : Burkina Faso uniquement.
 */
export function isPaysTarificationGrandOuaga(countryCode) {
  return String(countryCode || "").toUpperCase() === "BF";
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
 * sources GPS.
 *
 * @param {number} distanceKm - distance tarifaire (ORS ou fallback Haversine)
 * @param {string|null} sourceDepart - "exact" | "quartier" | "geocodage" | null
 * @param {string|null} sourceArrivee - "exact" | "quartier" | "geocodage" | null
 * @returns {{prix: number, tranche: string, source: string, devise: string}|null}
 *   null = distance > 25 km (pas de tarif automatique, intervention Admin requise)
 */
export function calculerTarifGrandOuaga(distanceKm, sourceDepart, sourceArrivee) {
  if (distanceKm === null || distanceKm === undefined || isNaN(Number(distanceKm))) {
    return null;
  }

  const dist = Number(distanceKm);
  const approx = isGpsApproximatif(sourceDepart, sourceArrivee);

  // > 25 km → pas de tarif automatique
  if (dist > SEUIL_MAX_KM) {
    return null;
  }

  // Tolérance GPS : entre 14 et 16 km avec GPS approximatif → 1 250 F
  if (approx && dist >= TOLERANCE_MIN_KM && dist <= TOLERANCE_MAX_KM) {
    return {
      prix: TARIF_BF_LE_15,
      tranche: "≤ 15 km (tolérance GPS approximatif)",
      source: "tolerance_gps",
      devise: DEVISE_BF,
    };
  }

  // Seuil strict (GPS exact) ou tolérance hors zone
  if (dist <= SEUIL_STRICT_KM) {
    return {
      prix: TARIF_BF_LE_15,
      tranche: "≤ 15 km",
      source: "tarif_grand_ouaga",
      devise: DEVISE_BF,
    };
  }

  // > 15 km et ≤ 25 km → 1 750 F
  return {
    prix: TARIF_BF_15_25,
    tranche: "15–25 km",
    source: "tarif_grand_ouaga",
    devise: DEVISE_BF,
  };
}

/**
 * Récupère la distance routière ORS depuis le backend getRouteORS.
 * Utilise le cache et le circuit breaker existants.
 * Fallback Haversine si ORS échoue.
 *
 * @returns {Promise<{distanceKm: number, source: "ors"|"haversine_fallback", error?: string}>}
 */
export async function fetchDistanceTarifaireORS(
  fromLat, fromLng, toLat, toLng,
  countryCode, courseId = null
) {
  // Tentative ORS
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

    // Le backend a retourné un fallback — on l'utilise aussi
    if (dist > 0) {
      return { distanceKm: dist, source: "haversine_fallback", error: data?.error };
    }
  } catch (err) {
    // Erreur réseau — fallback Haversine local
  }

  // Fallback Haversine local
  const havDist = haversineKm(fromLat, fromLng, toLat, toLng);
  return {
    distanceKm: havDist || 0,
    source: "haversine_fallback",
    error: "ORS indisponible — fallback Haversine",
  };
}

/**
 * Fonction principale : calcule le tarif Grand Ouaga en appelant ORS.
 * À utiliser dans les formulaires (Client, Admin) au moment de la création.
 *
 * @returns {Promise<{prix: number, distanceKm: number, tranche: string,
 *   source: string, devise: string, distanceSource: string}|null>}
 *   null = distance > 25 km (pas de tarif automatique)
 */
export async function calculerTarifGrandOuagaAsync(
  fromLat, fromLng, toLat, toLng,
  countryCode, sourceDepart, sourceArrivee, courseId = null
) {
  if (!isPaysTarificationGrandOuaga(countryCode)) return null;
  if (!fromLat || !fromLng || !toLat || !toLng) return null;

  const { distanceKm, source: distanceSource, error } = await fetchDistanceTarifaireORS(
    fromLat, fromLng, toLat, toLng, countryCode, courseId
  );

  const tarif = calculerTarifGrandOuaga(distanceKm, sourceDepart, sourceArrivee);
  if (!tarif) {
    // > 25 km → pas de tarif automatique
    return {
      prix: null,
      distanceKm: Math.round(distanceKm * 10) / 10,
      tranche: "> 25 km — tarif personnalisé requis",
      source: "hors_tarif",
      devise: DEVISE_BF,
      distanceSource,
      error: error || "Distance supérieure à 25 km",
    };
  }

  return {
    ...tarif,
    distanceKm: Math.round(distanceKm * 10) / 10,
    distanceSource,
  };
}