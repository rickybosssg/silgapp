import { useState, useEffect, useRef, useCallback } from "react";
import { haversineKm } from "@/lib/priceEstimate";

// Distance haversine en mètres entre deux coordonnées
const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const km = haversineKm(lat1, lon1, lat2, lon2);
  return km != null ? km * 1000 : null;
};

/**
 * Hook GPS natif Android via Capacitor Geolocation
 * Fallback sur navigator.geolocation pour le web
 *
 * Retourne :
 * - position: { latitude, longitude, accuracy, timestamp }
 * - gpsActif: boolean
 * - permissionStatut: 'granted' | 'denied' | 'prompt' | 'checking'
 * - ageMinutes: âge en minutes de la dernière position
 * - indicateur: 'recent' (<5min) | 'ancien' (5-20min) | 'perdu' (>20min) | null
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
    : ageMinutes < 5 ? "recent"
    : ageMinutes < 20 ? "ancien"
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

  // Seuil de précision GPS — assoupli à 200m pour zones à couverture faible (Ouaga)
  const ACCURACY_THRESHOLD = 200;
  // Distance minimale (mètres) pour mettre à jour — évite le bruit GPS
  const MIN_DISTANCE_M = 10;
  // Délai maximum (ms) sans position avant d'accepter n'importe quelle précision
  const FALLBACK_DELAY_MS = 60000;
  const lastPosRef = useRef(null);
  const lastValidPosTimeRef = useRef(null);

  // Mise à jour de la position interne (avec filtrage précision + distance + fallback)
  const applyPosition = useCallback((coords) => {
    const accuracy = coords.accuracy || null;
    const now = Date.now();
    const timeSinceLastPos = lastValidPosTimeRef.current ? now - lastValidPosTimeRef.current : Infinity;

    // Mode fallback : après 60s sans position valide, accepter n'importe quelle précision
    const inFallbackMode = timeSinceLastPos > FALLBACK_DELAY_MS;

    // Rejeter les positions trop imprécises (sauf en mode fallback)
    if (!inFallbackMode && accuracy && accuracy > ACCURACY_THRESHOLD) {
      return null;
    }

    const pos = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: accuracy,
      timestamp: Date.now(),
    };

    // Filtrer les déplacements négligeables (< 10m) si on a déjà une position
    if (lastPosRef.current) {
      const dist = haversineMeters(
        lastPosRef.current.latitude,
        lastPosRef.current.longitude,
        pos.latitude,
        pos.longitude
      );
      if (dist < MIN_DISTANCE_M) {
        // Garder le timestamp à jour mais ne pas propager la position
        lastPositionTimeRef.current = Date.now();
        setAgeMinutes(0);
        return lastPosRef.current;
      }
    }

    lastPosRef.current = pos;
    lastValidPosTimeRef.current = now;
    setPosition(pos);
    setGpsActif(true);
    lastPositionTimeRef.current = now;
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

  // Obtenir la position une fois — avec retry automatique (haute précision → précision réduite)
  const actualiserPosition = useCallback(async () => {
    const Geo = await getGeoPlugin();
    if (Geo) {
      try {
        const result = await Geo.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
        applyPosition(result.coords);
        return result.coords;
      } catch (err) {
        // 2e tentative : précision réduite (réseau/wifi)
        try {
          const result = await Geo.getCurrentPosition({
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 30000,
          });
          applyPosition(result.coords);
          return result.coords;
        } catch (err2) {
          console.warn("[GPS Natif] Erreur Capacitor:", err2.message);
          setGpsActif(false);
          return null;
        }
      }
    }
    // Fallback web — avec retry
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(applyPosition(pos.coords)),
        () => {
          // 2e tentative web : précision réduite
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(applyPosition(pos.coords)),
            () => { setGpsActif(false); resolve(null); },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
          );
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
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