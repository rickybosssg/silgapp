import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

// ── Cache module-level (partagé entre tous les composants) ──────────────────
const routeCache = new Map(); // key → { data, timestamp }
const CACHE_TTL_MS = 300000; // 5 minutes
const MIN_INTERVAL_MS = 30000; // 30 secondes entre requêtes
const RECALC_DISTANCE_M = 500; // 500m minimum avant recalcul

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function roundCoord(v) {
  return Math.round(v * 1000) / 1000; // ~10m de précision
}

function getCacheKey(courseId, phase, fromLat, fromLng, toLat, toLng) {
  return `${courseId || "nocourse"}_${phase}_${roundCoord(fromLat)}_${roundCoord(fromLng)}_${roundCoord(toLat)}_${roundCoord(toLng)}`;
}

/**
 * Hook: récupère un itinéraire road-based depuis la fonction backend getRouteORS.
 *
 * - Cache les résultats (TTL 5 min) pour éviter les appels redondants
 * - Ne refetch que si l'origine a bougé de > 500m ET > 30s écoulées
 * - Fallback automatique vers ligne droite (Haversine) si ORS indisponible
 * - 100% rétrocompatible: si le hook échoue, le comportement actuel (ligne droite) est conservé
 *
 * @returns {{ route: { coordinates: number[][], distanceKm: number, etaMinutes: number, durationSec: number, source: string } | null, loading: boolean, error: string | null }}
 */
export function useRouteORS({
  courseId,
  phase,
  fromLat,
  fromLng,
  toLat,
  toLng,
  countryCode,
  livreurId,
  enabled = true,
}) {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const lastOriginRef = useRef(null); // { lat, lng } de la dernière requête
  const lastDestRef = useRef(null);
  const lastFetchTsRef = useRef(0);

  useEffect(() => {
    if (!enabled || !fromLat || !fromLng || !toLat || !toLng) return;

    const now = Date.now();

    // ── 1. Déterminer si on doit refetch ──
    const needRefetch = (() => {
      if (!route) return true;

      // Destination changée significativement (> 50m) ?
      if (lastDestRef.current) {
        const destMoved = haversineKm(lastDestRef.current.lat, lastDestRef.current.lng, toLat, toLng) * 1000;
        if (destMoved > 50) return true;
      }

      // Origine bougée de > 500m ET > 30s écoulées ?
      if (lastOriginRef.current) {
        const originMoved = haversineKm(lastOriginRef.current.lat, lastOriginRef.current.lng, fromLat, fromLng) * 1000;
        if (originMoved >= RECALC_DISTANCE_M && now - lastFetchTsRef.current >= MIN_INTERVAL_MS) {
          return true;
        }
      }

      return false;
    })();

    if (!needRefetch) return;

    // ── 2. Vérifier le cache ──
    const cacheKey = getCacheKey(courseId, phase, fromLat, fromLng, toLat, toLng);
    const cached = routeCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      setRoute(cached.data);
      setError(null);
      lastOriginRef.current = { lat: fromLat, lng: fromLng };
      lastDestRef.current = { lat: toLat, lng: toLng };
      return;
    }

    // ── 3. Appeler la fonction backend ──
    lastFetchTsRef.current = now;
    lastOriginRef.current = { lat: fromLat, lng: fromLng };
    lastDestRef.current = { lat: toLat, lng: toLng };
    setLoading(true);

    base44.functions
      .invoke("getRouteORS", {
        course_id: courseId,
        livreur_id: livreurId,
        phase,
        from_lat: fromLat,
        from_lng: fromLng,
        to_lat: toLat,
        to_lng: toLng,
        country_code: countryCode,
      })
      .then((res) => {
        const routeData = {
          coordinates: res.coordinates || [],
          distanceKm: res.distanceKm || 0,
          etaMinutes: res.etaMinutes || 0,
          durationSec: res.durationSec || 0,
          source: res.source || "fallback",
        };
        routeCache.set(cacheKey, { data: routeData, timestamp: Date.now() });
        setRoute(routeData);
        setError(null);
      })
      .catch(() => {
        // ── Fallback: ligne droite (rétrocompatible) ──
        setRoute({
          coordinates: [
            [fromLat, fromLng],
            [toLat, toLng],
          ],
          distanceKm: 0,
          etaMinutes: 0,
          durationSec: 0,
          source: "fallback",
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [courseId, phase, fromLat, fromLng, toLat, toLng, countryCode, livreurId, enabled]);

  return { route, loading, error };
}

/** Vide le cache (utile pour les tests) */
export function clearRouteCache() {
  routeCache.clear();
}