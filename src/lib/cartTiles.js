/**
 * Configuration CARTO basemaps — source unique pour tous les composants carte.
 *
 * CARTO désormais exige une API key pour les basemaps.
 * La clé est exposée côté frontend (VITE_) car les tuiles se chargent dans le navigateur.
 * → Restreindre la clé au domaine/app SILGAPP dans le dashboard CARTO si possible.
 *
 * Si la clé est absente (ex: build local sans .env), on retombe sur l'URL sans clé
 * — le watermark "API KEY REQUIRED" réapparaîtra, mais la carte reste fonctionnelle.
 *
 * Format officiel CARTO : ?key=YOUR_KEY (NON pas ?api_key=)
 * Source : https://docs.carto.com/faqs/carto-basemaps
 */
const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY || "";
const KEY_PARAM = CARTO_API_KEY ? `?key=${CARTO_API_KEY}` : "";

/** Style Voyager (couleur) — DispatchMap, ModernMap, CarteLivreurClient */
export const CARTO_TILE_URL = `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${KEY_PARAM}`;

/** Style Light All (gris clair) — CarteLivreurs (réseau interne) */
export const CARTO_TILE_LIGHT_URL = `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png${KEY_PARAM}`;

export const CARTO_TILE_CONFIG = {
  maxZoom: 19,
  subdomains: "abcd",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
};