// ── Chargeurs de configuration du dispatch (avec cache TTL) ─────────────────
import { STATUTS_ACTIFS_COURSE } from './dispatchConstants.ts';
import { dispatchLog } from './dispatchUtils.ts';

export const CYCLE_EPUISE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

const CONFIG_CACHE: { dispatch: any; gps: any; expires: number } = { dispatch: null, gps: null, expires: 0 };
const CONFIG_TTL_MS = 5 * 60 * 1000; // 5 minutes

const LIVREURS_EN_COURSE_CACHE = new Map<string, { ids: Set<string>; expires: number }>();
const LIVREURS_EN_COURSE_TTL_MS = 30 * 1000; // 30 secondes

export async function chargerConfigDispatch(base44) {
  if (CONFIG_CACHE.dispatch && Date.now() < CONFIG_CACHE.expires) return CONFIG_CACHE.dispatch;
  try {
    const configs = await base44.asServiceRole.entities.AppConfig.filter({});
    const nbConfig = configs.find((c: any) => c.cle === 'DISPATCH_NB_LIVREURS');
    const timeoutConfig = configs.find((c: any) => c.cle === 'DISPATCH_TIMEOUT_SEC');
    const nb = nbConfig ? (nbConfig.valeur === 'tous' ? 999 : parseInt(nbConfig.valeur, 10) || 3) : 3;
    const timeout = timeoutConfig ? (parseInt(timeoutConfig.valeur, 10) || 60) : 60;
    const result = { nb, timeout };
    CONFIG_CACHE.dispatch = result;
    CONFIG_CACHE.expires = Date.now() + CONFIG_TTL_MS;
    return result;
  } catch (err) {
    console.warn('[DISPATCH] ⚠️ Impossible de charger config dispatch, valeurs par défaut utilisées:', err.message);
    return { nb: 3, timeout: 120 };
  }
}

export async function chargerLivreursEnCourse(base44, countryCode) {
  if (!countryCode) return new Set();
  const now = Date.now();
  const cached = LIVREURS_EN_COURSE_CACHE.get(countryCode);
  if (cached && cached.expires > now) return cached.ids;
  try {
    const courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: countryCode },
      '-created_date', 100
    );
    const ids = new Set(
      (courses || [])
        .filter((c: any) => STATUTS_ACTIFS_COURSE.includes(c.statut) && c.livreur_id)
        .map((c: any) => c.livreur_id)
    );
    LIVREURS_EN_COURSE_CACHE.set(countryCode, { ids, expires: now + LIVREURS_EN_COURSE_TTL_MS });
    dispatchLog(`[DISPATCH] 🛡️ ${ids.size} livreur(s) en course détecté(s) pour ${countryCode} (cache 30s)`);
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
          { size: 3, timeout_sec: 60 },
          { size: 5, timeout_sec: 60 },
          { size: 999, timeout_sec: 60 },
        ],
      };
    }
    const waves = JSON.parse(cfg.waves_json || '[]');
    const result = {
      gps_waves_enabled: cfg.gps_waves_enabled !== false,
      waves: waves.length > 0 ? waves : [
        { size: 3, timeout_sec: 60 },
        { size: 5, timeout_sec: 60 },
        { size: 999, timeout_sec: 60 },
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
        { size: 3, timeout_sec: 60 },
        { size: 5, timeout_sec: 60 },
        { size: 999, timeout_sec: 60 },
      ],
    };
  }
}