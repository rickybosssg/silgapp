import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Hook GPS natif Android via Capacitor Geolocation
 * Fallback sur navigator.geolocation pour le web
 * 
 * Retourne :
 * - position: { latitude, longitude, accuracy, timestamp }
 * - gpsActif: boolean
 * - permissionStatut: 'granted' | 'denied' | 'prompt' | 'checking'
 * - ageMinutes: âge en minutes de la dernière position
 * - indicateur: 'recent' (<2min) | 'ancien' (2-10min) | 'perdu' (>10min) | null
 * - demanderPermission: () => Promise<boolean>
 * - actualiserPosition: () => Promise<void>
 */
export function useGPSNatif({ enabled = true, intervalMs = 15000, onPosition } = {}) {
  const [position, setPosition] = useState(null);
  const [gpsActif, setGpsActif] = useState(false);
  const [permissionStatut, setPermissionStatut] = useState("checking");
  const [ageMinutes, setAgeMinutes] = useState(null);

  const intervalRef = useRef(null);
  const ageTimerRef = useRef(null);
  const lastPositionTimeRef = useRef(null);

  // Calcul indicateur GPS
  const indicateur = ageMinutes === null ? null
    : ageMinutes < 2 ? "recent"
    : ageMinutes < 10 ? "ancien"
    : "perdu";

  // Mise à jour de l'âge en temps réel (toutes les 30s)
  useEffect(() => {
    ageTimerRef.current = setInterval(() => {
      if (lastPositionTimeRef.current) {
        const age = (Date.now() - lastPositionTimeRef.current) / 60000;
        setAgeMinutes(age);
      }
    }, 30000);
    return () => clearInterval(ageTimerRef.current);
  }, []);

  // Obtenir le plugin Capacitor Geolocation
  const getGeoPlugin = async () => {
    if (typeof window === "undefined" || !window.Capacitor) return null;
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      return Geolocation;
    } catch {
      return null;
    }
  };

  // Mise à jour de la position interne
  const applyPosition = useCallback((coords) => {
    const pos = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy || null,
      timestamp: Date.now(),
    };
    setPosition(pos);
    setGpsActif(true);
    lastPositionTimeRef.current = Date.now();
    setAgeMinutes(0);
    if (onPosition) onPosition(pos);
    return pos;
  }, [onPosition]);

  // Demander la permission GPS
  const demanderPermission = useCallback(async () => {
    setPermissionStatut("checking");
    const Geo = await getGeoPlugin();
    if (Geo) {
      try {
        const perm = await Geo.requestPermissions();
        const granted = perm.location === "granted" || perm.coarseLocation === "granted";
        setPermissionStatut(granted ? "granted" : "denied");
        return granted;
      } catch {
        setPermissionStatut("denied");
        return false;
      }
    }
    // Web fallback
    if (!("geolocation" in navigator)) {
      setPermissionStatut("denied");
      return false;
    }
    setPermissionStatut("granted");
    return true;
  }, []);

  // Obtenir la position une fois
  const actualiserPosition = useCallback(async () => {
    const Geo = await getGeoPlugin();
    if (Geo) {
      try {
        const result = await Geo.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
        });
        applyPosition(result.coords);
        return result.coords;
      } catch (err) {
        console.warn("[GPS Natif] Erreur Capacitor:", err.message);
        setGpsActif(false);
        return null;
      }
    }
    // Fallback web
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(applyPosition(pos.coords)),
        () => { setGpsActif(false); resolve(null); },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  }, [applyPosition]);

  // Initialisation + polling périodique
  useEffect(() => {
    if (!enabled) return;

    // Init immédiate
    (async () => {
      const granted = await demanderPermission();
      if (granted) await actualiserPosition();
    })();

    // Polling
    intervalRef.current = setInterval(actualiserPosition, intervalMs);
    return () => clearInterval(intervalRef.current);
  }, [enabled, intervalMs]);

  // Sync au retour au premier plan
  useEffect(() => {
    if (!enabled) return;
    const handler = () => {
      if (document.visibilityState === "visible") actualiserPosition();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [enabled, actualiserPosition]);

  return {
    position,
    gpsActif,
    permissionStatut,
    ageMinutes,
    indicateur,
    demanderPermission,
    actualiserPosition,
  };
}