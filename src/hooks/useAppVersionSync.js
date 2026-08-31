import { useEffect, useRef } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { base44 } from "@/api/base44Client";

/**
 * Remonte la version APK du livreur au backend à l'ouverture de l'app.
 * Utilise @capacitor/app (déjà installé) — aucune modification native.
 * Ne touche PAS au dispatch, GPS, heartbeat, foreground service ou FCM.
 *
 * @param {string} livreurId - ID du livreur
 */
export function useAppVersionSync(livreurId) {
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!livreurId || syncedRef.current) return;
    syncedRef.current = true;

    const syncVersion = async () => {
      try {
        if (!Capacitor.isNativePlatform()) return;

        const info = await CapacitorApp.getInfo();
        const versionName = info.version || "";
        const versionCode = Number(info.build) || 0;
        if (!versionName && !versionCode) return;

        await base44.entities.Livreur.update(livreurId, {
          app_version_name: versionName,
          app_version_code: versionCode,
          last_app_version_seen_at: new Date().toISOString(),
        });
      } catch (err) {
        console.warn("[useAppVersionSync] sync échouée:", err?.message);
      }
    };

    syncVersion();
  }, [livreurId]);
}