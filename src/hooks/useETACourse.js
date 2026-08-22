import { useState, useEffect, useRef, useCallback } from "react";
import { haversineKm } from "@/lib/priceEstimate";

// ── Constantes ──────────────────────────────────────────────────────────
const STALE_WARN_MS = 2 * 60 * 1000;   // 2 min — ETA figé + avertissement
const STALE_CRITICAL_MS = 5 * 60 * 1000; // 5 min — ETA masqué
const ORS_RECALC_DISTANCE_M = 300;      // 300m de déplacement minimum
const ORS_RECALC_INTERVAL_MS = 5 * 60 * 1000; // 5 min minimum entre appels
const FALLBACK_SPEED_KMH = 25;          // 25 km/h — fallback Haversine

function computeFallbackEta(distKm) {
  if (!distKm || distKm <= 0) return null;
  return Math.max(1, Math.round((distKm / FALLBACK_SPEED_KMH) * 60));
}

function dureeDepuis(isoDate) {
  if (!isoDate) return null;
  const diff = Math.round((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  return `${Math.floor(diff / 3600)} h`;
}

/**
 * useETACourse — SOURCE UNIQUE d'ETA pour tous les écrans SILGAPP.
 *
 * Priorité : ORS (route réelle) > Haversine ÷ 25 km/h (fallback).
 * Recalcul ORS uniquement si le livreur s'est déplacé de ≥300m ou après 5 min.
 * Détection GPS obsolète : <2min = live, 2-5min = figé+avertissement, >5min = masqué.
 * L'ETA ne diminue JAMAIS artificiellement.
 *
 * @param {Object} params
 * @param {string} params.courseId
 * @param {string} params.phase - "recuperation" | "livraison"
 * @param {number} params.fromLat - latitude livreur
 * @param {number} params.fromLng - longitude livreur
 * @param {number} params.toLat - latitude cible
 * @param {number} params.toLng - longitude cible
 * @param {string} params.countryCode
 * @param {string} params.livreurId
 * @param {string} params.livreurLastUpdate - ISO date de derniere_position_date
 * @returns {{ etaMinutes, distanceKm, isRoadBased, isStale, staleLabel, lastUpdate, phase }}
 */
export function useETACourse({
  courseId,
  phase = "recuperation",
  fromLat,
  fromLng,
  toLat,
  toLng,
  countryCode,
  livreurId,
  livreurLastUpdate,
}) {
  const [eta, setEta] = useState(null);
  const [distanceKm, setDistanceKm] = useState(null);
  const [isRoadBased, setIsRoadBased] = useState(false);

  // Refs pour éviter les re-renders inutiles
  const lastOrsCallRef = useRef({ lat: null, lng: null, timestamp: 0, result: null });
  const frozenEtaRef = useRef(null); // ETA figé en cas de GPS stale

  // ── Détection GPS obsolète ──
  const gpsAgeMs = livreurLastUpdate ? Date.now() - new Date(livreurLastUpdate).getTime() : null;
  const isStaleWarn = gpsAgeMs !== null && gpsAgeMs >= STALE_WARN_MS && gpsAgeMs < STALE_CRITICAL_MS;
  const isStaleCritical = gpsAgeMs !== null && gpsAgeMs >= STALE_CRITICAL_MS;
  const isStale = isStaleWarn || isStaleCritical;

  let staleLabel = null;
  if (isStaleCritical) {
    staleLabel = "Position du livreur momentanément indisponible";
  } else if (isStaleWarn) {
    staleLabel = `Dernière position reçue il y a ${dureeDepuis(livreurLastUpdate)}`;
  }

  // ── Calculer l'ETA ──
  const computeETA = useCallback(async () => {
    // Pas de coords → pas d'ETA
    if (fromLat == null || fromLng == null || toLat == null || toLng == null) {
      setEta(null);
      setDistanceKm(null);
      return;
    }

    // GPS critique → masquer l'ETA (sauf si on a un ETA figé)
    if (isStaleCritical) {
      if (frozenEtaRef.current) {
        setEta(frozenEtaRef.current.etaMinutes);
        setDistanceKm(frozenEtaRef.current.distanceKm);
        setIsRoadBased(frozenEtaRef.current.isRoadBased);
      }
      return;
    }

    // Vérifier si on doit rappeler ORS
    const lastCall = lastOrsCallRef.current;
    const now = Date.now();
    const distSinceLastCall = lastCall.lat != null
      ? haversineKm(lastCall.lat, lastCall.lng, fromLat, fromLng) * 1000
      : Infinity;
    const timeSinceLastCall = now - lastCall.timestamp;

    const shouldRecalc = !lastCall.result
      || distSinceLastCall >= ORS_RECALC_DISTANCE_M
      || timeSinceLastCall >= ORS_RECALC_INTERVAL_MS;

    // ── Si cache local valide → retourner sans appel réseau ──
    if (!shouldRecalc && lastCall.result) {
      setEta(lastCall.result.etaMinutes);
      setDistanceKm(lastCall.result.distanceKm);
      setIsRoadBased(lastCall.result.isRoadBased);
      return;
    }

    // ── Appel ORS (si coords valides) ──
    if (courseId || (fromLat && toLat)) {
      try {
        const { base44 } = await import("@/api/base44Client");
        const res = await base44.functions.invoke("getRouteORS", {
          course_id: courseId,
          livreur_id: livreurId,
          phase,
          from_lat: fromLat,
          from_lng: fromLng,
          to_lat: toLat,
          to_lng: toLng,
          country_code: countryCode,
        });

        if (res && res.etaMinutes != null && res.etaMinutes > 0) {
          const result = {
            etaMinutes: res.etaMinutes,
            distanceKm: res.distanceKm || 0,
            isRoadBased: res.source === "ors",
          };
          lastOrsCallRef.current = { lat: fromLat, lng: fromLng, timestamp: now, result };
          frozenEtaRef.current = result;
          setEta(result.etaMinutes);
          setDistanceKm(result.distanceKm);
          setIsRoadBased(result.isRoadBased);
          return;
        }
      } catch (e) {
        console.warn("[useETACourse] ORS error:", e?.message);
      }
    }

    // ── Fallback Haversine ÷ 25 km/h ──
    const dist = haversineKm(fromLat, fromLng, toLat, toLng);
    const mins = computeFallbackEta(dist);
    const result = { etaMinutes: mins, distanceKm: dist, isRoadBased: false };
    lastOrsCallRef.current = { lat: fromLat, lng: fromLng, timestamp: now, result };
    if (!isStaleWarn) frozenEtaRef.current = result;
    setEta(mins);
    setDistanceKm(dist);
    setIsRoadBased(false);
  }, [courseId, phase, fromLat, fromLng, toLat, toLng, countryCode, livreurId, isStaleWarn, isStaleCritical]);

  // Recalculer quand les inputs changent
  useEffect(() => {
    computeETA();
  }, [computeETA]);

  return {
    etaMinutes: eta,
    distanceKm,
    isRoadBased,
    isStale,
    staleLabel,
    lastUpdate: livreurLastUpdate,
    phase,
  };
}
