import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { haversineKm, computeFallbackEta, isValidCoord } from "../../shared/geoUtils.ts";

// ── Constantes ──────────────────────────────────────────────────────────────
const ORS_BASE_URL = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
const ORS_TIMEOUT_MS = 8000; // 8 secondes max
const MAX_ROUTE_RATIO = 3; // Si distance ORS > 3× Haversine → aberrant
const MIN_COORDS_POINTS = 2; // Minimum de points dans la géométrie

// ── Fetch ORS avec timeout ───────────────────────────────────────────────────
async function fetchORS(fromLat, fromLng, toLat, toLng) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ORS_TIMEOUT_MS);

  try {
    const body = {
      coordinates: [
        [fromLng, fromLat], // ORS utilise [lng, lat]
        [toLng, toLat],
      ],
      instructions: false, // Pas d'instructions de virage — on ne fait que du tracking
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
      return {
        ok: false,
        httpStatus: response.status,
        error: errorMsg,
      };
    }

    const data = await response.json();

    // Format GeoJSON : data.features[0].geometry.coordinates + data.features[0].properties.summary
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

    if (distanceKm <= 0) {
      return { ok: false, error: "Distance nulle retournée par ORS" };
    }
    if (durationSec <= 0 || durationSec > 7200) {
      return { ok: false, error: `Durée incohérente: ${durationSec}s` };
    }

    // Validation anti-route aberrante
    const haversineDist = haversineKm(fromLat, fromLng, toLat, toLng);
    if (haversineDist > 0 && distanceKm > haversineDist * MAX_ROUTE_RATIO) {
      return {
        ok: false,
        error: `Route aberrante: ${distanceKm.toFixed(2)}km vs ${haversineDist.toFixed(2)}km Haversine`,
      };
    }

    // Convertir [lng, lat] → [lat, lng] pour Leaflet
    const leafletCoords = coords.map(c => [c[1], c[0]]);

    return {
      ok: true,
      coordinates: leafletCoords,
      distanceKm,
      durationSec,
      etaMinutes: Math.round(durationSec / 60),
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return { ok: false, error: "Timeout ORS (8s)" };
    }
    return { ok: false, error: err.message || "Erreur réseau ORS" };
  }
}

// ── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Authentification obligatoire
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Non authentifié" }, { status: 401 });
    }

    // 2. Parse du payload
    const payload = await req.json();
    const {
      from_lat,
      from_lng,
      to_lat,
      to_lng,
      course_id,
      phase,
      livreur_id,
      country_code,
    } = payload;

    // 3. Validation des coordonnées
    if (!isValidCoord(from_lat, from_lng) || !isValidCoord(to_lat, to_lng)) {
      return Response.json({
        source: "fallback",
        status: "error",
        coordinates: null,
        distanceKm: 0,
        durationSec: 0,
        etaMinutes: 0,
        error: "Coordonnées GPS invalides",
      }, { status: 200 });
    }

    // 4. Vérifier que le routing est activé (SystemConfig)
    let routingEnabled = true;
    try {
      const configs = await base44.asServiceRole.entities.SystemConfig.filter({
        cle: "routing_enabled",
      });
      if (configs && configs.length > 0) {
        routingEnabled = configs[0].valeur !== "false";
      }
    } catch (_) {}

    if (!routingEnabled) {
      const haversineDist = haversineKm(from_lat, from_lng, to_lat, to_lng);
      const eta = computeFallbackEta(haversineDist);
      return Response.json({
        source: "fallback",
        status: "fallback",
        coordinates: [[from_lat, from_lng], [to_lat, to_lng]],
        distanceKm: haversineDist,
        durationSec: eta * 60,
        etaMinutes: eta,
        error: "Routing désactivé (routing_enabled=false)",
      });
    }

    // 5. Appel ORS
    const startTime = Date.now();
    const orsResult = await fetchORS(from_lat, from_lng, to_lat, to_lng);
    const responseTimeMs = Date.now() - startTime;

    // 6. Journaliser dans RoutingLog (sans données sensibles)
    const logEntry = {
      course_id: course_id || "unknown",
      livreur_id: livreur_id || null,
      phase: phase || "recuperation",
      source: orsResult.ok ? "ors" : "fallback",
      status: orsResult.ok ? "success" : "fallback",
      distance_km: orsResult.ok ? orsResult.distanceKm : (haversineKm(from_lat, from_lng, to_lat, to_lng) || 0),
      duration_sec: orsResult.ok ? orsResult.durationSec : 0,
      eta_minutes: orsResult.ok ? orsResult.etaMinutes : computeFallbackEta(haversineKm(from_lat, from_lng, to_lat, to_lng)),
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

    // 7. Retourner le résultat
    if (orsResult.ok) {
      return Response.json({
        source: "ors",
        status: "success",
        coordinates: orsResult.coordinates,
        distanceKm: orsResult.distanceKm,
        durationSec: orsResult.durationSec,
        etaMinutes: orsResult.etaMinutes,
        responseTimeMs,
      });
    }

    // 8. Fallback Haversine
    const haversineDist = haversineKm(from_lat, from_lng, to_lat, to_lng);
    const fallbackEta = computeFallbackEta(haversineDist);
    return Response.json({
      source: "fallback",
      status: "fallback",
      coordinates: [[from_lat, from_lng], [to_lat, to_lng]],
      distanceKm: haversineDist,
      durationSec: fallbackEta * 60,
      etaMinutes: fallbackEta,
      responseTimeMs,
      error: orsResult.error,
    });

  } catch (error) {
    return Response.json({
      source: "fallback",
      status: "error",
      coordinates: null,
      distanceKm: 0,
      durationSec: 0,
      etaMinutes: 0,
      error: error.message,
    }, { status: 500 });
  }
});