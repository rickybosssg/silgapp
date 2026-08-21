// ── Chargeurs de configuration du dispatch (avec cache TTL) ─────────────────
import { STATUTS_ACTIFS_COURSE } from './dispatchConstants.ts';
import { dispatchLog } from './dispatchUtils.ts';

// ── Valeurs par défaut sûres (utilisées si la BDD est indisponible) ──
export const DEFAULT_CYCLE_EPUISE_TIMEOUT_MS = 5 * 60 * 1000;   // 5 minutes
export const DEFAULT_MANUAL_PRICE_TIMEOUT_SEC = 300;             // 5 minutes
export const DEFAULT_WATCHDOG_GRACE_MIN = 2;                     // 2 minutes
export const DEFAULT_PROPOSE_TIMEOUT_GRACE_MIN = 5;              // 5 minutes
export const DEFAULT_ALERT_DEDUP_MIN = 30;                       // 30 minutes
export const DEFAULT_DISPONIBLE_PUSH_TIMEOUT_MIN = 30;           // 30 minutes
export const DEFAULT_MAX_CYCLES = 3;                             // 3 cycles
export const DEFAULT_SECOURS_V2_NB_LIVREURS = 10;               // 10 livreurs
export const DEFAULT_SECOURS_V2_DELAY_MIN = 5;                   // 5 minutes

// Rétrocompatibilité : CYCLE_EPUISE_TIMEOUT_MS reste exporté mais n'est plus la
// source de vérité. La valeur réelle est chargée dynamiquement depuis AppConfig.
export const CYCLE_EPUISE_TIMEOUT_MS = DEFAULT_CYCLE_EPUISE_TIMEOUT_MS;

const CONFIG_CACHE: { dispatch: any; gps: any; expires: number } = { dispatch: null, gps: null, expires: 0 };
const CONFIG_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ⚠️ PAS DE CACHE — la liste des livreurs en course doit toujours être fraiche.
// Un cache de 30s pouvait permettre à un livreur d'être proposé sur une deuxième
// course dans les 30 secondes suivant l'acceptation de la première.


export async function chargerConfigDispatch(base44) {
  if (CONFIG_CACHE.dispatch && Date.now() < CONFIG_CACHE.expires) return CONFIG_CACHE.dispatch;
  try {
    const configs = await base44.asServiceRole.entities.AppConfig.filter({});
    const get = (cle) => configs.find((c: any) => c.cle === cle);
    const getInt = (config, def) => config ? (parseInt(config.valeur, 10) || def) : def;

    const nbConfig = get('DISPATCH_NB_LIVREURS');
    const timeoutConfig = get('DISPATCH_TIMEOUT_SEC');
    const cycleEpuiseConfig = get('DISPATCH_CYCLE_EPUISE_TIMEOUT_MS');
    const manualPriceTimeoutConfig = get('DISPATCH_MANUAL_PRICE_TIMEOUT_SEC');
    const watchdogGraceConfig = get('DISPATCH_WATCHDOG_GRACE_MIN');
    const proposeTimeoutGraceConfig = get('DISPATCH_PROPOSE_TIMEOUT_GRACE_MIN');
    const alertDedupConfig = get('DISPATCH_ALERT_DEDUP_MIN');
    const disponiblePushTimeoutConfig = get('DISPATCH_DISPONIBLE_PUSH_TIMEOUT_MIN');
    const maxCyclesConfig = get('DISPATCH_MAX_CYCLES');
    const secoursV2NbConfig = get('DISPATCH_SECOURS_V2_NB_LIVREURS');
    const secoursV2DelayConfig = get('DISPATCH_SECOURS_V2_DELAY_MIN');

    const nb = nbConfig ? (nbConfig.valeur === 'tous' ? 999 : getInt(nbConfig, 3)) : 3;
    const timeout = getInt(timeoutConfig, 300);
    const cycleEpuiseTimeoutMs = getInt(cycleEpuiseConfig, DEFAULT_CYCLE_EPUISE_TIMEOUT_MS);
    const manualPriceTimeoutSec = getInt(manualPriceTimeoutConfig, DEFAULT_MANUAL_PRICE_TIMEOUT_SEC);
    const watchdogGraceMin = getInt(watchdogGraceConfig, DEFAULT_WATCHDOG_GRACE_MIN);
    const proposeTimeoutGraceMin = getInt(proposeTimeoutGraceConfig, DEFAULT_PROPOSE_TIMEOUT_GRACE_MIN);
    const alertDedupMin = getInt(alertDedupConfig, DEFAULT_ALERT_DEDUP_MIN);
    const disponiblePushTimeoutMin = getInt(disponiblePushTimeoutConfig, DEFAULT_DISPONIBLE_PUSH_TIMEOUT_MIN);
    const maxCycles = getInt(maxCyclesConfig, DEFAULT_MAX_CYCLES);
    const secoursV2NbLivreurs = getInt(secoursV2NbConfig, DEFAULT_SECOURS_V2_NB_LIVREURS);
    const secoursV2DelayMin = getInt(secoursV2DelayConfig, DEFAULT_SECOURS_V2_DELAY_MIN);

    const result = {
      nb, timeout,
      cycleEpuiseTimeoutMs,
      manualPriceTimeoutSec,
      watchdogGraceMin,
      proposeTimeoutGraceMin,
      alertDedupMin,
      disponiblePushTimeoutMin,
      maxCycles,
      secoursV2NbLivreurs,
      secoursV2DelayMin,
    };
    CONFIG_CACHE.dispatch = result;
    CONFIG_CACHE.expires = Date.now() + CONFIG_TTL_MS;
    return result;
  } catch (err) {
    console.warn('[DISPATCH] ⚠️ Impossible de charger config dispatch, valeurs par défaut utilisées:', err.message);
    return {
      nb: 3, timeout: 120,
      cycleEpuiseTimeoutMs: DEFAULT_CYCLE_EPUISE_TIMEOUT_MS,
      manualPriceTimeoutSec: DEFAULT_MANUAL_PRICE_TIMEOUT_SEC,
      watchdogGraceMin: DEFAULT_WATCHDOG_GRACE_MIN,
      proposeTimeoutGraceMin: DEFAULT_PROPOSE_TIMEOUT_GRACE_MIN,
      alertDedupMin: DEFAULT_ALERT_DEDUP_MIN,
      disponiblePushTimeoutMin: DEFAULT_DISPONIBLE_PUSH_TIMEOUT_MIN,
      maxCycles: DEFAULT_MAX_CYCLES,
      secoursV2NbLivreurs: DEFAULT_SECOURS_V2_NB_LIVREURS,
      secoursV2DelayMin: DEFAULT_SECOURS_V2_DELAY_MIN,
    };
  }
}

export async function chargerLivreursEnCourse(base44, countryCode) {
  if (!countryCode) return new Set();
  try {
    const courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: countryCode },
      '-created_date', 200
    );
    const ids = new Set(
      (courses || [])
        .filter((c: any) => STATUTS_ACTIFS_COURSE.includes(c.statut) && c.livreur_id)
        .map((c: any) => c.livreur_id)
    );
    dispatchLog(`[DISPATCH] 🛡️ ${ids.size} livreur(s) en course détecté(s) pour ${countryCode} (fresh)`);
    return ids;
  } catch (err) {
    console.warn(`[DISPATCH] ⚠️ Impossible de charger les livreurs en course pour ${countryCode}:`, err.message);
    return new Set();
  }
}

export async function chargerConfigVaguesGPS(base44) {
  if (CONFIG_CACHE.gps && Date.now() < CONFIG_CACHE.expires) return CONFIG_CACHE.gps;
  try {
    const configs = await base44.asServiceRole.entities.DispatchWaveConfig.filter({});
    const cfg = configs[0];
    if (!cfg) {
      return {
        gps_waves_enabled: true,
        waves: [
          { size: 3, timeout_sec: 300 },
          { size: 5, timeout_sec: 300 },
          { size: 999, timeout_sec: 300 },
        ],
      };
    }
    const waves = JSON.parse(cfg.waves_json || '[]');
    const result = {
      gps_waves_enabled: cfg.gps_waves_enabled !== false,
      waves: waves.length > 0 ? waves : [
        { size: 3, timeout_sec: 300 },
        { size: 5, timeout_sec: 300 },
        { size: 999, timeout_sec: 300 },
      ],
    };
    CONFIG_CACHE.gps = result;
    CONFIG_CACHE.expires = Date.now() + CONFIG_TTL_MS;
    return result;
  } catch (err) {
    console.warn('[DISPATCH] ⚠️ Impossible de charger config vagues GPS, défaut utilisé:', err.message);
    return {
      gps_waves_enabled: true,
      waves: [
        { size: 3, timeout_sec: 300 },
        { size: 5, timeout_sec: 300 },
        { size: 999, timeout_sec: 300 },
      ],
    };
  }
}