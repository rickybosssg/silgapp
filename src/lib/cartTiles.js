/**
 * Configuration CARTO basemaps — source unique pour les 3 composants carte.
 *
 * CARTO désormais exige une API key pour les basemaps Voyager.
 * La clé est exposée côté frontend (VITE_) car les tuiles se chargent dans le navigateur.
 * → Restreindre la clé au domaine/app SILGAPP dans le dashboard CARTO si possible.
 *
 * Si la clé est absente (ex: build local sans .env), on retombe sur l'URL sans clé
 * — le watermark "API KEY REQUIRED" réapparaîtra, mais la carte reste fonctionnelle.
 */
const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY || "";

export const CARTO_TILE_URL = CARTO_API_KEY
  ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?api_key=${CARTO_API_KEY}`
  : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

export const CARTO_TILE_CONFIG = {
  maxZoom: 19,
  subdomains: "abcd",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
};