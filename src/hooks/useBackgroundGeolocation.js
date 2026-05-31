import { useEffect, useRef } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { App } from "@capacitor/app";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * Hook de géolocalisation background pour livreurs
 * Utilise watchPosition Capacitor + foreground service
 * Même écran verrouillé ou app en arrière-plan
 */
export function useBackgroundGeolocation({ enabled = false, livreurId, user_email }) {
  const trackingRef = useRef(false);
  const lastSyncRef = useRef(null);
  const watchIdRef = useRef(null);

  // Initialiser le tracking GPS continu
  useEffect(() => {
    if (!enabled || !livreurId) return;

    const startBackgroundTracking = async () => {
      try {
        console.log("[BackgroundGeo] Initialisation...");

        // Demander permission "Toujours autoriser"
        const permissionStatus = await Geolocation.requestPermissions();
        console.log("[BackgroundGeo] Permission:", permissionStatus);

        if (permissionStatus.location !== "granted") {
          toast.error("GPS requis - Veuillez autoriser la localisation");
          return;
        }

        // Démarrer watchPosition (continue en background sur Android natif)
        watchIdRef.current = await Geolocation.watchPosition(
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
            distanceFilter: 5, // 5 mètres minimum
          },
          async (position) => {
            if (!position || !position.coords) return;
            
            const { latitude, longitude } = position.coords;
            if (!latitude || !longitude) return;

            // Éviter sync trop fréquent (max 1x/10s)
            const now = Date.now();
            if (lastSyncRef.current && (now - lastSyncRef.current) < 9000) {
              return;
            }
            lastSyncRef.current = now;

            try {
              // Sync vers BDD
              await base44.entities.Livreur.update(livreurId, {
                latitude,
                longitude,
                derniere_position_date: new Date().toISOString(),
                last_seen_at: new Date().toISOString(),
                app_active: true,
              });

              console.log("[BackgroundGeo] 📍 Position sync:", {
                lat: latitude.toFixed(6),
                lng: longitude.toFixed(6),
              });

            } catch (error) {
              console.error("[BackgroundGeo] ❌ Erreur sync BDD:", error);
            }
          }
        );

        trackingRef.current = true;
        console.log("[BackgroundGeo] 🟢 Tracking démarré (watchPosition)");
        toast.success("GPS activé - Suivi permanent");

      } catch (error) {
        console.error("[BackgroundGeo] ❌ Erreur init:", error);
        toast.error("Erreur GPS: " + error.message);
      }
    };

    startBackgroundTracking();

    // Cleanup au démontage
    return () => {
      if (watchIdRef.current !== null) {
        Geolocation.clearWatch({ id: watchIdRef.current });
        console.log("[BackgroundGeo] 🔴 Tracking arrêté");
        trackingRef.current = false;
      }
    };
  }, [enabled, livreurId]);

  // Gérer les transitions background/foreground
  useEffect(() => {
    if (!enabled) return;

    const handleAppStateChange = ({ isActive }) => {
      console.log("[BackgroundGeo] App state:", isActive ? "Foreground" : "Background");
      if (isActive && trackingRef.current) {
        // Reprendre tracking si nécessaire
        console.log("[BackgroundGeo] App au premier plan");
      }
    };

    App.addListener("appStateChange", handleAppStateChange);

    return () => {
      App.removeAllListeners();
    };
  }, [enabled]);

  return {
    tracking: trackingRef.current,
  };
}