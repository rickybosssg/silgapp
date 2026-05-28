import { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * Hook universel pour heartbeat automatique
 * Utilisé par : ClientExterneApp, LivreurExterneApp
 * Sync toutes les 30s + événements lifecycle
 */
export function useHeartbeat({ user_type, position, enabled = true }) {
  const intervalRef = useRef(null);
  const visibilityRef = useRef(null);
  const lastSyncRef = useRef(null);

  // Fonction de sync
  const syncHeartbeat = async (pos, force = false) => {
    if (!enabled || !pos?.latitude || !pos?.longitude) return;
    
    // Éviter sync trop fréquentes (max toutes les 30s)
    const now = Date.now();
    if (!force && lastSyncRef.current && (now - lastSyncRef.current) < 30000) {
      return;
    }
    
    lastSyncRef.current = now;
    
    try {
      await base44.functions.invoke('heartbeatAuto', {
        user_type: user_type,
        latitude: pos.latitude,
        longitude: pos.longitude,
        app_active: document.visibilityState === "visible",
        device_id: navigator.userAgent.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50),
      });
    } catch (err) {
      console.error('[useHeartbeat] Erreur sync:', err);
    }
  };

  // Sync initiale au montage
  useEffect(() => {
    if (enabled && position) {
      syncHeartbeat(position, true); // Force sync immédiate
    }
  }, [enabled]);

  // Heartbeat continu (30s)
  useEffect(() => {
    if (!enabled || !position) return;
    
    intervalRef.current = setInterval(() => {
      syncHeartbeat(position);
    }, 30000); // 30 secondes

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, position?.latitude, position?.longitude]);

  // Sync au retour au premier plan
  useEffect(() => {
    if (!enabled || !position) return;
    
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        console.log(`[useHeartbeat ${user_type}] App au premier plan → sync GPS`);
        syncHeartbeat(position, true);
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [enabled, position?.latitude, position?.longitude]);

  // Cleanup au démontage
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (visibilityRef.current) {
        document.removeEventListener("visibilitychange", visibilityRef.current);
      }
    };
  }, []);

  return { syncHeartbeat };
}