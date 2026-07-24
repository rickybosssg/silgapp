import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { haversineKm, computeFallbackEta, isValidCoord } from "../../shared/geoUtils.ts";

// ── Constantes ──────────────────────────────────────────────────────────────
const ORS_BASE_URL = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
const ORS_TIMEOUT_MS = 8000;
const MAX_ROUTE_RATIO = 3;
const MIN_COORDS_POINTS = 2;

// ── Defaults (surchargeables via SystemConfig) ──────────────────────────────
const DEFAULT_CACHE_TTL_SEC = 300;       // 5 minutes
const DEFAULT_RECALC_DISTANCE_M = 500;   // 500 mètres
const DEFAULT_MIN_INTERVAL_SEC = 30;     // 30 secondes
const DEFAULT_CB_THRESHOLD = 3;          // 3 échecs consécutifs → ouverture
const DEFAULT_CB_DURATION_SEC = 60;      // 60s avant retry (half-open)
const CACHE_MAX_SIZE = 500;

// ── Cache server-side (persiste dans l'isolate Deno) ────────────────────────
interface CacheEntry {
  coordinates: number[][];
  distanceKm: number;
  durationSec: number;
  etaMinutes: number;
  originLat: number;
  originLng: number;
  timestamp: number;
}

const routeCache = new Map<string, CacheEntry>();

// ── Circuit Breaker (état global isolate) ───────────────────────────────────
interface CircuitBreakerState {
  failureCount: number;
  isOpen: boolean;
  openedAt: number;
}

const circuitBreaker: CircuitBreakerState = {
  failureCount: 0,
  isOpen: false,
  openedAt: 0,
};

// ── Déduplication des requêtes ORS en vol ───────────────────────────────────
const inflightRequests = new Map<string, Promise<any>>();

// ── Helpers ─────────────────────────────────────────────────────────────────
function roundCoord(v: number): number {
  return Math.round(v * 1000) / 1000; // ~10m de précision
}

function getCacheKey(courseId: string | undefined, phase: string, toLat: number, toLng: number): string {
  return `${courseId || "nocourse"}_${phase}_${roundCoord(toLat)}_${roundCoord(toLng)}`;
}

// ── Lecture centralisée de la config SystemConfig ───────────────────────────
async function getRoutingConfig(base44: any) {
  const config = {
    enabled: true,
    cacheTtlSec: DEFAULT_CACHE_TTL_SEC,
    recalcDistanceM: DEFAULT_RECALC_DISTANCE_M,
    minIntervalSec: DEFAULT_MIN_INTERVAL_SEC,
    cbThreshold: DEFAULT_CB_THRESHOLD,
    cbDurationSec: DEFAULT_CB_DURATION_SEC,
  };

  try {
    const [enabledRes, ttlRes, recalcRes, intervalRes, cbThresholdRes, cbDurationRes] = await Promise.all([
      base44.asServiceRole.entities.SystemConfig.filter({ cle: "routing_enabled" }).catch(() => []),
      base44.asServiceRole.entities.SystemConfig.filter({ cle: "routing_cache_ttl_seconds" }).catch(() => []),
      base44.asServiceRole.entities.SystemConfig.filter({ cle: "routing_recalculation_distance_meters" }).catch(() => []),
      base44.asServiceRole.entities.SystemConfig.filter({ cle: "routing_minimum_interval_seconds" }).catch(() => []),
      base44.asServiceRole.entities.SystemConfig.filter({ cle: "routing_circuit_breaker_threshold" }).catch(() => []),
      base44.asServiceRole.entities.SystemConfig.filter({ cle: "routing_circuit_breaker_duration_seconds" }).catch(() => []),
    ]);

    if (enabledRes?.length > 0) config.enabled = enabledRes[0].valeur !== "false";
    if (ttlRes?.length > 0) {
      const v = parseInt(ttlRes[0].valeur);
      if (!isNaN(v) && v > 0) config.cacheTtlSec = v;
    }
    if (recalcRes?.length > 0) {
      const v = parseInt(recalcRes[0].valeur);
      if (!isNaN(v) && v > 0) config.recalcDistanceM = v;
    }
    if (intervalRes?.length > 0) {
      const v = parseInt(intervalRes[0].valeur);
      if (!isNaN(v) && v >= 0) config.minIntervalSec = v;
    }
    if (cbThresholdRes?.length > 0) {
      const v = parseInt(cbThresholdRes[0].valeur);
      if (!isNaN(v) && v > 0) config.cbThreshold = v;
    }
    if (cbDurationRes?.length > 0) {
      const v = parseInt(cbDurationRes[0].valeur);
      if (!isNaN(v) && v > 0) config.cbDurationSec = v;
    }
  } catch (_) {}

  return config;
}

// ── Nettoyage du cache si trop volumineux ───────────────────────────────────
function cleanCache(ttlMs: number) {
  if (routeCache.size <= CACHE_MAX_SIZE) return;
  const now = Date.now();
  for (const [key, entry] of routeCache) {
    if (now - entry.timestamp > ttlMs * 2) {
      routeCache.delete(key);
    }
  }
}

// ── Circuit Breaker ─────────────────────────────────────────────────────────
function isCircuitOpen(cbDurationSec: number): boolean {
  if (!circuitBreaker.isOpen) return false;
  const elapsedSec = (Date.now() - circuitBreaker.openedAt) / 1000;
  if (elapsedSec >= cbDurationSec) {
    // Half-open: allow one attempt
    circuitBreaker.isOpen = false;
    return false;
  }
  return true;
}

function recordORSSuccess() {
  circuitBreaker.failureCount = 0;
  circuitBreaker.isOpen = false;
}

function recordORSFailure(cbThreshold: number) {
  circuitBreaker.failureCount++;
  if (circuitBreaker.failureCount >= cbThreshold) {
    circuitBreaker.isOpen = true;
    circuitBreaker.openedAt = Date.now();
  }
}

// ── Déduplication: requêtes ORS identiques simultanées ──────────────────────
async function fetchORSWithDedup(cacheKey: string, fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const existing = inflightRequests.get(cacheKey);
  if (existing) return existing;

  const promise = fetchORS(fromLat, fromLng, toLat, toLng);
  inflightRequests.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inflightRequests.delete(cacheKey);
  }
}

// ── Fetch ORS avec timeout ──────────────────────────────────────────────────
async function fetchORS(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ORS_TIMEOUT_MS);

  try {
    const body = {
      coordinates: [
        [fromLng, fromLat],
        [toLng, toLat],
      ],
      instructions: false,
    };

    const response = await fetch(ORS_BASE_URL, {
      method: "POST",
      headers: {
        "Authorization": Deno.env.get("ORS_API_KEY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMsg = `ORS HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        if (errBody?.error?.message) errorMsg = errBody.error.message;
      } catch (_) {}
      return { ok: false, httpStatus: response.status, error: errorMsg };
    }

    const data = await response.json();

    if (!data?.features || !Array.isArray(data.features) || data.features.length === 0) {
      return { ok: false, error: "Aucune route retournée par ORS (GeoJSON)" };
    }

    const feature = data.features[0];
    if (!feature?.geometry?.coordinates || !Array.isArray(feature.geometry.coordinates)) {
      return { ok: false, error: "Géométrie manquante dans la réponse ORS" };
    }

    const coords = feature.geometry.coordinates;
    if (coords.length < MIN_COORDS_POINTS) {
      return { ok: false, error: `Géométrie insuffisante (${coords.length} points)` };
    }

    const summary = feature.properties?.summary;
    if (!summary) {
      return { ok: false, error: "Résumé manquant dans la réponse ORS" };
    }

    const distanceKm = summary.distance ? summary.distance / 1000 : 0;
    const durationSec = summary.duration || 0;

    if (distanceKm <= 0) return { ok: false, error: "Distance nulle retournée par ORS" };
    if (durationSec <= 0 || durationSec > 7200) return { ok: false, error: `Durée incohérente: ${durationSec}s` };

    // Validation anti-route aberrante
    const haversineDist = haversineKm(fromLat, fromLng, toLat, toLng);
    if (haversineDist && haversineDist > 0 && distanceKm > haversineDist * MAX_ROUTE_RATIO) {
      return { ok: false, error: `Route aberrante: ${distanceKm.toFixed(2)}km vs ${haversineDist.toFixed(2)}km Haversine` };
    }

    // Convertir [lng, lat] → [lat, lng] pour Leaflet
    const leafletCoords = coords.map((c: number[]) => [c[1], c[0]]);

    return {
      ok: true,
      coordinates: leafletCoords,
      distanceKm,
      durationSec,
      etaMinutes: Math.round(durationSec / 60),
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") return { ok: false, error: "Timeout ORS (8s)" };
    return { ok: false, error: err.message || "Erreur réseau ORS" };
  }
}

// ── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Authentification
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Non authentifié" }, { status: 401 });
    }

    // 2. Parse du payload
    const payload = await req.json();
    const { from_lat, from_lng, to_lat, to_lng, course_id, phase, livreur_id, country_code } = payload;

    // 3. Validation des coordonnées
    if (!isValidCoord(from_lat, from_lng) || !isValidCoord(to_lat, to_lng)) {
      return Response.json({
        source: "fallback", status: "error",
        coordinates: null, distanceKm: 0, durationSec: 0, etaMinutes: 0,
        error: "Coordonnées GPS invalides",
      }, { status: 200 });
    }

    // 4. Lire la config SystemConfig (batch parallèle)
    const config = await getRoutingConfig(base44);

    // 5. Routing désactivé → fallback Haversine
    if (!config.enabled) {
      const dist = haversineKm(from_lat, from_lng, to_lat, to_lng) || 0;
      const eta = computeFallbackEta(dist);
      return Response.json({
        source: "fallback", status: "fallback",
        coordinates: [[from_lat, from_lng], [to_lat, to_lng]],
        distanceKm: dist, durationSec: eta * 60, etaMinutes: eta,
        error: "Routing désactivé (routing_enabled=false)",
      });
    }

    // 6. Vérifier le cache server-side
    const cacheKey = getCacheKey(course_id, phase, to_lat, to_lng);
    const now = Date.now();
    const cached = routeCache.get(cacheKey);

    if (cached) {
      const ageSec = (now - cached.timestamp) / 1000;

      // Cache valide (dans le TTL)
      if (ageSec < config.cacheTtlSec) {
        // L'origine a-t-elle bougé significativement ?
        const originMovedM = (haversineKm(cached.originLat, cached.originLng, from_lat, from_lng) || 0) * 1000;

        if (originMovedM < config.recalcDistanceM) {
          // Origine pas assez bougée → retourner le cache
          return Response.json({
            source: "cache", status: "cache",
            coordinates: cached.coordinates,
            distanceKm: cached.distanceKm,
            durationSec: cached.durationSec,
            etaMinutes: cached.etaMinutes,
            responseTimeMs: 0,
          });
        }

        // Origine bougée mais trop tôt pour refetch (minimum interval)
        if (ageSec < config.minIntervalSec) {
          return Response.json({
            source: "cache", status: "cache",
            coordinates: cached.coordinates,
            distanceKm: cached.distanceKm,
            durationSec: cached.durationSec,
            etaMinutes: cached.etaMinutes,
            responseTimeMs: 0,
          });
        }
      }
    }

    // 7. Nettoyer le cache si trop volumineux
    cleanCache(config.cacheTtlSec * 1000);

    // 8. Circuit breaker — si ouvert, fallback immédiat sans appeler ORS
    if (isCircuitOpen(config.cbDurationSec)) {
      const cbFallbackDist = haversineKm(from_lat, from_lng, to_lat, to_lng) || 0;
      const cbFallbackEta = computeFallbackEta(cbFallbackDist);

      try {
        await base44.asServiceRole.entities.RoutingLog.create({
          course_id: course_id || "unknown",
          livreur_id: livreur_id || null,
          phase: phase || "recuperation",
          source: "fallback",
          status: "fallback",
          distance_km: cbFallbackDist,
          duration_sec: cbFallbackEta * 60,
          eta_minutes: cbFallbackEta,
          response_time_ms: 0,
          error_code: "circuit_breaker_open",
          error_message: `Circuit breaker ouvert (${circuitBreaker.failureCount} échecs consécutifs)`,
          country_code: country_code || null,
        });
      } catch (_) {}

      return Response.json({
        source: "fallback", status: "fallback",
        coordinates: [[from_lat, from_lng], [to_lat, to_lng]],
        distanceKm: cbFallbackDist,
        durationSec: cbFallbackEta * 60,
        etaMinutes: cbFallbackEta,
        responseTimeMs: 0,
        error: "Circuit breaker ouvert — ORS temporairement indisponible",
      });
    }

    // 9. Appel ORS avec déduplication des requêtes simultanées
    const startTime = Date.now();
    const orsResult = await fetchORSWithDedup(cacheKey, from_lat, from_lng, to_lat, to_lng);
    const responseTimeMs = Date.now() - startTime;

    // Mettre à jour le circuit breaker
    if (orsResult.ok) {
      recordORSSuccess();
    } else {
      recordORSFailure(config.cbThreshold);
    }

    // 10. Journaliser (uniquement les vrais appels ORS / fallbacks, pas le cache)
    const logEntry = {
      course_id: course_id || "unknown",
      livreur_id: livreur_id || null,
      phase: phase || "recuperation",
      source: orsResult.ok ? "ors" : "fallback",
      status: orsResult.ok ? "success" : "fallback",
      distance_km: orsResult.ok ? orsResult.distanceKm : (haversineKm(from_lat, from_lng, to_lat, to_lng) || 0),
      duration_sec: orsResult.ok ? orsResult.durationSec : 0,
      eta_minutes: orsResult.ok ? orsResult.etaMinutes : computeFallbackEta(haversineKm(from_lat, from_lng, to_lat, to_lng) || 0),
      response_time_ms: responseTimeMs,
      error_code: orsResult.ok ? null : (orsResult.httpStatus ? String(orsResult.httpStatus) : null),
      error_message: orsResult.ok ? null : orsResult.error,
      country_code: country_code || null,
    };

    try {
      await base44.asServiceRole.entities.RoutingLog.create(logEntry);
    } catch (logErr) {
      console.error("[getRouteORS] Erreur journalisation:", logErr.message);
    }

    // 11. Succès ORS → stocker en cache et retourner
    if (orsResult.ok) {
      routeCache.set(cacheKey, {
        coordinates: orsResult.coordinates,
        distanceKm: orsResult.distanceKm,
        durationSec: orsResult.durationSec,
        etaMinutes: orsResult.etaMinutes,
        originLat: from_lat,
        originLng: from_lng,
        timestamp: now,
      });

      return Response.json({
        source: "ors", status: "success",
        coordinates: orsResult.coordinates,
        distanceKm: orsResult.distanceKm,
        durationSec: orsResult.durationSec,
        etaMinutes: orsResult.etaMinutes,
        responseTimeMs,
      });
    }

    // 12. ORS échoué → fallback Haversine
    const fallbackDist = haversineKm(from_lat, from_lng, to_lat, to_lng) || 0;
    const fallbackEta = computeFallbackEta(fallbackDist);
    return Response.json({
      source: "fallback", status: "fallback",
      coordinates: [[from_lat, from_lng], [to_lat, to_lng]],
      distanceKm: fallbackDist,
      durationSec: fallbackEta * 60,
      etaMinutes: fallbackEta,
      responseTimeMs,
      error: orsResult.error,
    });

  } catch (error) {
    return Response.json({
      source: "fallback", status: "error",
      coordinates: null, distanceKm: 0, durationSec: 0, etaMinutes: 0,
      error: error.message,
    }, { status: 500 });
  }
});