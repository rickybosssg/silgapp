import { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
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

  const syncHeartbeat = async (pos, force = false) => {
    if (!enabled) return;

    const now = Date.now();
    if (!force && lastSyncRef.current && now - lastSyncRef.current < 5000) {
      return;
    }
    lastSyncRef.current = now;

    try {
      const isNative = isNativeMobile();
      const payload = {
        user_type,
        latitude: pos?.latitude || position?.latitude || 0,
        longitude: pos?.longitude || position?.longitude || 0,
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
        console.info(
          `[${debugLabel}] heartbeatAuto OK lat=${Number(payload.latitude).toFixed(6)} lng=${Number(payload.longitude).toFixed(6)} active=${payload.app_active} background=${payload.background_active}`
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
    }, 30000);

    let cancelled = false;
    let nativeBgHeartbeatStop = null;

    if (isNativeMobile()) {
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
        console.warn("[useHeartbeat] GPS natif indisponible - heartbeat web actif en secours:", error?.message);
      });

      if (isNativeAndroid()) {
        startNativeBackgroundHeartbeat({
          userType: user_type,
          intervalMs: 15000,
          distanceFilter: 0,
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
