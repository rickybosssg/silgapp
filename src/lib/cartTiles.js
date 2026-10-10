/**
 * Configuration CARTO basemaps — source unique pour tous les composants carte.
 *
 * ⚠️ Les secrets Base44 ne sont PAS injectés dans import.meta.env côté navigateur.
 * La clé CARTO est récupérée via la fonction backend getCartoConfig au démarrage.
 *
 * Flow :
 *   1. main.jsx appelle initCartoTiles() avant ReactDOM.render()
 *   2. initCartoTiles() invoque getCartoConfig (backend) qui lit le secret
 *   3. Les variables let CARTO_TILE_URL / CARTO_TILE_LIGHT_URL sont mises à jour
 *   4. Les composants carte lisent les URLs à l'instanciation du TileLayer
 *
 * La clé CARTO basemaps est publique par design (utilisée côté navigateur).
 */
import { base44 } from "@/api/base44Client";

let CARTO_API_KEY = "";
let _initialized = false;
let _initPromise = null;

/** URL Voyager (couleur) — sans clé par défaut, mise à jour après initCartoTiles() */
export let CARTO_TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

/** URL Light All (gris clair) — sans clé par défaut, mise à jour après initCartoTiles() */
export let CARTO_TILE_LIGHT_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

export const CARTO_TILE_CONFIG = {
  maxZoom: 19,
  subdomains: "abcd",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
};

/**
 * Initialise les URLs CARTO avec la clé API depuis le backend.
 * À appeler UNE FOIS au démarrage de l'app (main.jsx) avant ReactDOM.render().
 * Idempotent — plusieurs appels ne déclenchent qu'une seule requête.
 */
export async function initCartoTiles() {
  if (_initialized) return _initPromise;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      const res = await base44.functions.invoke("getCartoConfig", {});
      const data = res?.data;
      if (data?.has_key) {
        CARTO_API_KEY = data.voyager_url.split("?key=")[1] || "";
        CARTO_TILE_URL = data.voyager_url;
        CARTO_TILE_LIGHT_URL = data.light_url;
        _initialized = true;
      }
    } catch (e) {
      // Silencieux — fallback sans clé (watermark visible mais carte fonctionnelle)
      console.warn("[cartTiles] initCartoTiles échec:", e?.message);
    }
  })();

  return _initPromise;
}