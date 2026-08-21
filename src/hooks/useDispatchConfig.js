import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { setConfig, getConfig, ALIGNED_DEFAULTS, getConfigVersion } from '@/lib/dispatchConfigStore';

// ── Clés AppConfig à charger depuis le backend ────────────────────────────
const APP_CONFIG_KEYS = [
  'LIVREUR_ALERT_DURATION_SEC',
  'LIVREUR_ALERT_INTERVAL_SEC',
  'HEARTBEAT_WEB_INTERVAL_MS',
  'GPS_NATIVE_INTERVAL_MS',
  'HEARTBEAT_BG_INTERVAL_MS',
  'GPS_DISTANCE_FILTER_M',
  'DISPATCH_SECOURS_V2_NB_LIVREURS',
  'DISPATCH_SECOURS_V2_DELAY_MIN',
];

/**
 * Hook centralisé — source unique frontend pour les paramètres dynamiques.
 *
 * Charge la configuration depuis le backend (Country + AppConfig), la met en cache
 * local (localStorage) pour fonctionner hors-ligne, et alimente le store
 * module-level (dispatchConfigStore) utilisé par dispatchRules.js, etc.
 *
 * Ordre de résolution :
 *   1. Configuration backend active
 *   2. Dernière configuration valide conservée en cache local
 *   3. Valeurs par défaut alignées sur les seeds backend
 *
 * @param {string} countryCode - Code pays ISO 2 lettres (ex: BF, CI)
 * @returns {{ config, isLoading, error, configVersion }}
 */
export function useDispatchConfig(countryCode) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dispatch-config', countryCode],
    queryFn: async () => {
      const [countries, appConfigs] = await Promise.all([
        countryCode
          ? base44.entities.Country.filter({ code: countryCode, actif: true })
          : Promise.resolve([]),
        base44.entities.AppConfig.filter({ cle: { $in: APP_CONFIG_KEYS } }),
      ]);

      const country = countries?.[0] || null;
      const appConfigMap = {};
      for (const c of appConfigs || []) {
        appConfigMap[c.cle] = c.valeur;
      }

      const config = {
        // From Country (per-country)
        gps_seuil_min: country?.gps_seuil_min ?? ALIGNED_DEFAULTS.gps_seuil_min,
        gps_dispatch_seuil_min: country?.gps_dispatch_seuil_min ?? ALIGNED_DEFAULTS.gps_dispatch_seuil_min,
        gps_expire_seuil_min: country?.gps_expire_seuil_min ?? ALIGNED_DEFAULTS.gps_expire_seuil_min,
        gps_client_seuil_min: country?.gps_client_seuil_min ?? ALIGNED_DEFAULTS.gps_client_seuil_min,
        gps_max_stale_min: country?.gps_max_stale_min ?? ALIGNED_DEFAULTS.gps_max_stale_min,
        heartbeat_seuil_min: country?.heartbeat_seuil_min ?? ALIGNED_DEFAULTS.heartbeat_seuil_min,
        heartbeat_on_seuil_min: country?.heartbeat_on_seuil_min ?? ALIGNED_DEFAULTS.heartbeat_on_seuil_min,
        // From AppConfig (global)
        livreur_alert_duration_sec: Number(appConfigMap.LIVREUR_ALERT_DURATION_SEC) || ALIGNED_DEFAULTS.livreur_alert_duration_sec,
        livreur_alert_interval_sec: Number(appConfigMap.LIVREUR_ALERT_INTERVAL_SEC) || ALIGNED_DEFAULTS.livreur_alert_interval_sec,
        heartbeat_web_interval_ms: Number(appConfigMap.HEARTBEAT_WEB_INTERVAL_MS) || ALIGNED_DEFAULTS.heartbeat_web_interval_ms,
        gps_native_interval_ms: Number(appConfigMap.GPS_NATIVE_INTERVAL_MS) || ALIGNED_DEFAULTS.gps_native_interval_ms,
        heartbeat_bg_interval_ms: Number(appConfigMap.HEARTBEAT_BG_INTERVAL_MS) || ALIGNED_DEFAULTS.heartbeat_bg_interval_ms,
        gps_distance_filter_m: Number(appConfigMap.GPS_DISTANCE_FILTER_M) || ALIGNED_DEFAULTS.gps_distance_filter_m,
        dispatch_secours_v2_nb_livreurs: Number(appConfigMap.DISPATCH_SECOURS_V2_NB_LIVREURS) || ALIGNED_DEFAULTS.dispatch_secours_v2_nb_livreurs,
        dispatch_secours_v2_delay_min: Number(appConfigMap.DISPATCH_SECOURS_V2_DELAY_MIN) || ALIGNED_DEFAULTS.dispatch_secours_v2_delay_min,
        // Version pour diagnostic
        config_version: Date.now(),
      };

      setConfig(config);
      return config;
    },
    enabled: !!countryCode,
    staleTime: 5 * 60 * 1000, // 5 min
    refetchOnWindowFocus: false,
  });

  // Toujours s'assurer que le store est peuplé depuis le cache au montage
  useEffect(() => {
    getConfig();
  }, []);

  return {
    config: data || getConfig(),
    isLoading,
    error,
    configVersion: getConfigVersion(),
  };
}