// ═══════════════════════════════════════════════════════════════════════════
// DISPATCH CONFIG STORE — Source unique frontend pour les paramètres dynamiques
// ═══════════════════════════════════════════════════════════════════════════
// Ordre de résolution :
//   1. Configuration backend active (chargée par useDispatchConfig)
//   2. Dernière configuration valide conservée en cache local (localStorage)
//   3. Valeurs par défaut alignées EXACTEMENT sur les valeurs backend seedées
//
// ⚠️ Aucune valeur métier frontend indépendante. Les defaults ci-dessous sont
//    des MIRRORS des valeurs seedées en base (Country defaults + AppConfig).
//    Si le backend change les seeds, ces defaults doivent être mis à jour.
//
// Le backend reste l'autorité finale pour :
//   - l'éligibilité réelle au dispatch
//   - la sélection des livreurs
//   - l'expiration GPS
//   - le watchdog
//   - les règles critiques de notification
//
// Un APK ancien ou une config frontend stale ne peut JAMAIS contourner
// une règle backend. Le frontend utilise ces valeurs uniquement pour :
//   - badges (GPS récent, app active)
//   - affichage (catégorisation, compteurs)
//   - priorisation visuelle
//   - intervals de heartbeat natif (Android)
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_KEY = 'silgapp_dispatch_config';

// ── Valeurs par défaut alignées sur les seeds backend ──────────────────────
//    Ces valeurs sont des MIRRORS des defaults définis dans :
//      - base44/entities/Country.jsonc (champs gps_*, heartbeat_*)
//      - Seeds AppConfig (clés LIVREUR_ALERT_*, HEARTBEAT_*, GPS_*)
export const ALIGNED_DEFAULTS = {
  // GPS thresholds (Country defaults)
  gps_seuil_min: 5,
  gps_dispatch_seuil_min: 10,
  gps_expire_seuil_min: 30,    // FIX: was 60 in frontend, now aligned with backend (30)
  gps_client_seuil_min: 30,
  gps_max_stale_min: 120,
  // Heartbeat thresholds (Country defaults)
  heartbeat_seuil_min: 2,
  heartbeat_on_seuil_min: 10,
  // Alert (AppConfig seeds)
  livreur_alert_duration_sec: 120,
  livreur_alert_interval_sec: 5,
  // Heartbeat intervals (AppConfig seeds)
  heartbeat_web_interval_ms: 30000,
  gps_native_interval_ms: 5000,
  heartbeat_bg_interval_ms: 15000,
  gps_distance_filter_m: 3,
  // Dispatch V2 (AppConfig seeds — déjà en backend)
  dispatch_secours_v2_nb_livreurs: 10,
  dispatch_secours_v2_delay_min: 5,
};

// ── Bornes de sécurité pour les paramètres sensibles ──────────────────────
//    Une mauvaise configuration Admin ne doit pas pouvoir :
//      - vider rapidement la batterie (min trop bas)
//      - saturer le backend de requêtes (min trop bas)
//      - rendre le GPS inutilisable (max trop haut)
//      - désactiver pratiquement le heartbeat (max trop haut)
//
//    Documenté pour audit : ces bornes sont aussi validées côté backend
//    dans chargerConfigDispatch (base44/shared/dispatchConfig.ts).
export const BOUNDS = {
  heartbeat_web_interval_ms: { min: 5000, max: 120000 },    // 5s — 2min
  gps_native_interval_ms: { min: 1000, max: 60000 },         // 1s — 60s
  heartbeat_bg_interval_ms: { min: 5000, max: 120000 },       // 5s — 2min
  gps_distance_filter_m: { min: 1, max: 100 },                // 1m — 100m
  livreur_alert_duration_sec: { min: 5, max: 180 },           // 5s — 3min
  livreur_alert_interval_sec: { min: 3, max: 30 },            // 3s — 30s
};

function clampValue(key, value) {
  const bounds = BOUNDS[key];
  if (!bounds) return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return ALIGNED_DEFAULTS[key];
  return Math.min(bounds.max, Math.max(bounds.min, n));
}

export function clampConfig(config) {
  const clamped = { ...config };
  for (const key of Object.keys(BOUNDS)) {
    if (clamped[key] !== undefined) {
      clamped[key] = clampValue(key, clamped[key]);
    }
  }
  return clamped;
}

// ── Store en mémoire (module-level singleton) ─────────────────────────────
let currentConfig = null;

/**
 * Récupère la configuration courante.
 * Ordre de résolution :
 *   1. Store en mémoire (si déjà chargé par useDispatchConfig)
 *   2. Cache local (dernière config valide reçue du backend)
 *   3. ALIGNED_DEFAULTS (mirrors des seeds backend)
 */
export function getConfig() {
  if (currentConfig) return currentConfig;

  // 2. Cache local (dernière config valide)
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.config) {
        currentConfig = { ...ALIGNED_DEFAULTS, ...parsed.config };
        return currentConfig;
      }
    }
  } catch (_) {}

  // 3. Defaults alignés (mirrors des seeds backend)
  return ALIGNED_DEFAULTS;
}

/**
 * Met à jour la configuration (appelé par useDispatchConfig après fetch backend).
 * Clampe les valeurs sensibles contre les bornes de sécurité.
 */
export function setConfig(config) {
  const clamped = clampConfig(config);
  currentConfig = { ...ALIGNED_DEFAULTS, ...clamped };
  const cacheEntry = {
    config: currentConfig,
    config_version: currentConfig.config_version || Date.now(),
    updated_at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
  } catch (_) {}
  return currentConfig;
}

/**
 * Diagnostique : quelle configuration un téléphone utilise.
 * Retourne la version de config, la date de mise à jour et la source.
 */
export function getConfigVersion() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        config_version: parsed.config_version || 'unknown',
        updated_at: parsed.updated_at || 'unknown',
        source: currentConfig ? 'memory' : 'cache',
      };
    }
  } catch (_) {}
  return { config_version: 'defaults', updated_at: null, source: 'defaults' };
}