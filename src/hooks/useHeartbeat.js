import { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { isNativeMobile, startNativeLocationSync } from "@/lib/nativeAndroid";

export function useHeartbeat({ user_type, position, enabled = true, debugLabel = "" }) {
  const intervalRef = useRef(null);
  const nativeStopRef = useRef(null);
  const lastSyncRef = useRef(null);

  const syncHeartbeat = async (pos, force = false) => {
    if (!enabled) return;

    const now = Date.now();
    if (!force && lastSyncRef.current && now - lastSyncRef.current < 5000) {
      return;
    }
    lastSyncRef.current = now;

    try {
      const payload = {
        user_type,
        latitude: pos?.latitude || position?.latitude || 0,
        longitude: pos?.longitude || position?.longitude || 0,
        app_active: document.visibilityState === "visible",
        device_id: navigator.userAgent.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50),
      };
      await base44.functions.invoke("heartbeatAuto", payload);
      if (debugLabel) {
        console.info(
          `[${debugLabel}] heartbeatAuto OK lat=${Number(payload.latitude).toFixed(6)} lng=${Number(payload.longitude).toFixed(6)} active=${payload.app_active}`
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

    // 🔒 SECOURS WEB : heartbeat de présence toujours actif (30s)
    // Garantit que last_seen_at est mis à jour même si le GPS natif échoue
    intervalRef.current = setInterval(() => {
      syncHeartbeat(position);
    }, 30000);

    // 🎯 GPS NATIF : précision haute fréquence (5s) si disponible
    if (isNativeMobile()) {
      let cancelled = false;
      startNativeLocationSync({
        enabled,
        intervalMs: 5000,
        distanceFilter: 3,
        backgroundTitle: "SILGAPP GPS actif",
        backgroundMessage: "Synchronisation precise de votre position",
        onPosition: (pos) => syncHeartbeat(pos, false),
      }).then((stop) => {
        if (cancelled) stop?.();
        else nativeStopRef.current = stop;
      }).catch((error) => {
        console.warn("[useHeartbeat] GPS natif indisponible — heartbeat web actif en secours:", error?.message);
      });
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      nativeStopRef.current?.();
      nativeStopRef.current = null;
    };
  }, [enabled, user_type]);

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