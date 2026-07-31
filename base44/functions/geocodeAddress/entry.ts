import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { haversineKm } from "../../shared/geoUtils.ts";

// ── Autocomplétion d'adresses via OpenRouteService Geocode ──────────────────
// Proxy sécurisé vers l'API ORS autocomplete avec cache server-side.
// Utilisé par le composant AddressAutocomplete partout dans SILGAPP.

const ORS_AUTOCOMPLETE_URL = "https://api.openrouteservice.org/geocode/autocomplete";
const ORS_TIMEOUT_MS = 6000;

// Cache server-side (persiste dans l'isolate Deno)
const geocodeCache = new Map<string, { results: any[]; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_MAX_SIZE = 500;

// ISO 3166-1 alpha-2 → alpha-3 pour l'API ORS (boundary.country)
const ALPHA3_MAP: Record<string, string> = {
  BF: 'BFA', CI: 'CIV', TG: 'TGO', BJ: 'BEN', SN: 'SEN',
  ML: 'MLI', GN: 'GIN', NE: 'NER', GH: 'GHA',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Authentification — seuls les utilisateurs connectés peuvent géocoder
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Non authentifié" }, { status: 401 });
    }

    const payload = await req.json();
    const { query, country_code, focus_lat, focus_lng } = payload;

    if (!query || query.trim().length < 2) {
      return Response.json({ results: [] });
    }

    const countryAlpha3 = ALPHA3_MAP[country_code] || (country_code ? country_code : '');

    // ── Clé de cache ──
    const cacheKey = `${query.trim().toLowerCase()}_${country_code || 'all'}_${focus_lat || '0'}_${focus_lng || '0'}`;
    const now = Date.now();

    const cached = geocodeCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      return Response.json({ results: cached.results, cached: true });
    }

    // Nettoyer le cache si trop volumineux
    if (geocodeCache.size > CACHE_MAX_SIZE) {
      for (const [key, entry] of geocodeCache) {
        if (now - entry.timestamp > CACHE_TTL_MS * 2) geocodeCache.delete(key);
      }
    }

    // ── Construire les paramètres ORS ──
    const params = new URLSearchParams({
      text: query.trim(),
      size: '8',
    });

    if (countryAlpha3) params.set('boundary.country', countryAlpha3);
    if (focus_lat && focus_lng) {
      params.set('focus.point.lat', String(focus_lat));
      params.set('focus.point.lon', String(focus_lng));
    }

    // ── Appel ORS avec timeout ──
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ORS_TIMEOUT_MS);

    const response = await fetch(`${ORS_AUTOCOMPLETE_URL}?${params}`, {
      headers: {
        "Authorization": Deno.env.get("ORS_API_KEY"),
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMsg = `ORS HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        if (errBody?.error?.message) errorMsg = errBody.error.message;
      } catch (_) {}
      return Response.json({ results: [], error: errorMsg });
    }

    const data = await response.json();

    // ── Transformer les résultats GeoJSON en format SILGAPP ──
    const results = (data.features || []).map((f: any) => {
      const props = f.properties || {};
      const coords = f.geometry?.coordinates || [];
      const lat = coords[1];
      const lng = coords[0];

      const quartier = props.neighbourhood || props.borough || props.locality || '';
      const ville = props.locality || props.county || props.region || '';

      return {
        name: props.name || props.label || '',
        label: props.label || props.name || '',
        quartier,
        ville,
        pays: props.country_a || country_code || '',
        latitude: lat,
        longitude: lng,
        distance: (focus_lat && focus_lng && lat && lng)
          ? Number(haversineKm(focus_lat, focus_lng, lat, lng).toFixed(1))
          : null,
      };
    });

    // Mettre en cache — uniquement les résultats non vides pour éviter qu'une
    // panne transitoire d'ORS n'empoisonne le cache pendant 10 minutes.
    if (results.length > 0) {
      geocodeCache.set(cacheKey, { results, timestamp: now });
    }

    return Response.json({ results });
  } catch (error) {
    if (error.name === 'AbortError') {
      return Response.json({ results: [], error: "Timeout ORS (6s)" });
    }
    return Response.json({ results: [], error: error.message }, { status: 500 });
  }
});