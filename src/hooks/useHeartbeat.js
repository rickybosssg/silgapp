import { useEffect, useRef, useSyncExternalStore } from "react";
import { base44 } from "@/api/base44Client";
import { getConfig, subscribeToConfigChanges, getConfigVersion } from "@/lib/dispatchConfigStore";
import {
  isNativeMobile,
  isNativeAndroid,
  startNativeLocationSync,
  startNativeBackgroundHeartbeat,
} from "@/lib/nativeAndroid";

export function useHeartbeat({ user_type, position, enabled = true, debugLabel = "", session_id, onSessionExpired }) {
  const intervalRef = useRef(null);
  const nativeStopRef = useRef(null);
  const lastSyncRef = useRef(null);

  // ── Réactivité à la config dynamique ──
  // Quand AppConfig change (via useDispatchConfig), setConfig() incrémente
  // configVersionCounter et notifie les subscribers. useSyncExternalStore
  // déclenche un re-render, ce qui fait re-runner le useEffect ci-dessous
  // avec le nouvel intervalle. L'ancien timer et l'ancien service Android
  // sont proprement nettoyés avant que les nouveaux ne soient créés.
  const configVersion = useSyncExternalStore(subscribeToConfigChanges, getConfigVersion);

  const syncHeartbeat = async (pos, force = false) => {
    if (!enabled) return;

    // ── Throttle dynamique : empêche startNativeLocationSync (5s) de déclencher
    //    heartbeatAuto plus souvent que heartbeat_web_interval_ms (30s par défaut).
    //    Le GPS local continue d'être acquis toutes les 5s, mais l'envoi serveur
    //    est limité à 1 appel toutes les 30s. La dernière position GPS acquise
    //    entre deux heartbeats est envoyée lors du heartbeat suivant.
    const now = Date.now();
    const throttleMs = getConfig().heartbeat_web_interval_ms;
    if (!force && lastSyncRef.current && now - lastSyncRef.current < throttleMs) {
      return;
    }
    lastSyncRef.current = now;

    try {
      const isNative = isNativeMobile();
      // ✅ Ne plus envoyer 0 quand aucune position — envoyer null / omettre
      const lat = pos?.latitude ?? position?.latitude ?? null;
      const lng = pos?.longitude ?? position?.longitude ?? null;
      const acc = pos?.accuracy ?? position?.accuracy ?? null;
      const hasValidGps = lat !== null && lng !== null &&
        Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&
        Number(lat) >= -90 && Number(lat) <= 90 &&
        Number(lng) >= -180 && Number(lng) <= 180;
      const payload = {
        user_type,
        ...(hasValidGps
          ? { latitude: Number(lat), longitude: Number(lng), accuracy: acc != null ? Number(acc) : undefined }
          : {}),
        app_active: document.visibilityState === "visible",
        background_active: isNative,
        device_id: navigator.userAgent.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50),
        session_id: session_id || undefined,
      };

      const res = await base44.functions.invoke("heartbeatAuto", payload);
      if (res?.data?.error === "session_expired" && onSessionExpired) {
        onSessionExpired();
        return;
      }

      if (debugLabel) {
        const latStr = hasValidGps ? Number(lat).toFixed(6) : "null";
        const lngStr = hasValidGps ? Number(lng).toFixed(6) : "null";
        const accStr = acc != null ? Number(acc).toFixed(1) + "m" : "n/a";
        console.info(
          `[${debugLabel}] heartbeatAuto OK lat=${latStr} lng=${lngStr} acc=${accStr} active=${payload.app_active} background=${payload.background_active}`
        );
      }
    } catch (err) {
      console.error("[useHeartbeat] Erreur sync:", err);
    }
  };

  useEffect(() => {
    if (!enabled) return;
    syncHeartbeat(position, true);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    intervalRef.current = setInterval(() => {
      syncHeartbeat(position);
    }, getConfig().heartbeat_web_interval_ms);

    let cancelled = false;
    let nativeBgHeartbeatStop = null;

    if (isNativeMobile()) {
      const nativeConfig = getConfig();
      startNativeLocationSync({
        enabled,
        intervalMs: nativeConfig.gps_native_interval_ms,
        distanceFilter: nativeConfig.gps_distance_filter_m,
        backgroundTitle: "SILGAPP GPS actif",
        backgroundMessage: "Synchronisation precise de votre position",
        onPosition: (pos) => syncHeartbeat(pos, false),
      }).then((stop) => {
        if (cancelled) stop?.();
        else nativeStopRef.current = stop;
      }).catch((error) => {
        console.warn("[useHeartbeat] GPS natif indisponible - heartbeat web actif en secours:", error?.message);
      });

      if (isNativeAndroid()) {
        startNativeBackgroundHeartbeat({
          userType: user_type,
          sessionId: session_id || "",
          intervalMs: getConfig().heartbeat_bg_interval_ms,
          distanceFilter: getConfig().gps_distance_filter_m,
        }).then((stop) => {
          if (cancelled) stop?.();
          else nativeBgHeartbeatStop = stop;
        }).catch((error) => {
          console.warn("[useHeartbeat] Background heartbeat natif indisponible:", error?.message);
        });
      }
    }

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      nativeStopRef.current?.();
      nativeStopRef.current = null;
      nativeBgHeartbeatStop?.();
    };
  }, [enabled, user_type, session_id, configVersion]);

  useEffect(() => {
    if (!enabled) return;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        syncHeartbeat(position, true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [enabled, user_type, position?.latitude, position?.longitude]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      nativeStopRef.current?.();
    };
  }, []);

  return { syncHeartbeat };
}
