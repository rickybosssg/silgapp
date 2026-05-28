/**
 * gpsSync.js — Module centralisé de synchronisation GPS client
 * Source de vérité : base de données (ClientExterne.latitude/longitude)
 * Principe : obtenir les coords → sauvegarder en BDD → mettre à jour localStorage
 */
import { base44 } from "@/api/base44Client";

let _watchId = null;
let _lastSyncTime = 0;
let _lastLat = null;
let _lastLng = null;
const SYNC_INTERVAL_MS = 30_000; // sync au plus toutes les 30s
const MIN_DISTANCE_M = 20;       // déclencher si déplacement > 20m

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Synchronise les coordonnées GPS vers la base de données.
 * @param {string} clientId  ID du ClientExterne
 * @param {{latitude: number, longitude: number}} pos
 * @returns {Promise<boolean>} true si sync réussie
 */
export async function syncGPSVersBDD(clientId, pos) {
  if (!clientId || !pos?.latitude || !pos?.longitude) {
    console.warn("[GPS] syncGPSVersBDD : données manquantes", { clientId, pos });
    return false;
  }
  try {
    console.log("[GPS] → Synchronisation BDD", { clientId, lat: pos.latitude, lng: pos.longitude });
    await base44.entities.ClientExterne.update(clientId, {
      latitude: pos.latitude,
      longitude: pos.longitude,
    });
    _lastLat = pos.latitude;
    _lastLng = pos.longitude;
    _lastSyncTime = Date.now();
    // Mettre à jour localStorage (cache local)
    try { localStorage.setItem("client_gps_position", JSON.stringify(pos)); } catch (_) {}
    console.log("[GPS] ✅ BDD mise à jour avec succès", pos.latitude, pos.longitude);
    return true;
  } catch (err) {
    console.error("[GPS] ❌ Erreur sync BDD:", err?.message || err);
    return false;
  }
}

/**
 * Obtient la position GPS actuelle du navigateur et la synchronise en BDD.
 * @param {string} clientId
 * @param {function} onPosition  callback(pos) appelé si succès
 * @returns {Promise<{latitude, longitude}|null>}
 */
export async function getCurrentPositionAndSync(clientId, onPosition) {
  if (!navigator.geolocation) {
    console.warn("[GPS] Géolocalisation non disponible");
    return null;
  }
  return new Promise((resolve) => {
    console.log("[GPS] Demande position GPS...");
    navigator.geolocation.getCurrentPosition(
      async (geoPos) => {
        const pos = { latitude: geoPos.coords.latitude, longitude: geoPos.coords.longitude };
        console.log("[GPS] 📍 Position obtenue:", pos.latitude, pos.longitude, "± " + Math.round(geoPos.coords.accuracy) + "m");
        if (clientId) await syncGPSVersBDD(clientId, pos);
        if (onPosition) onPosition(pos);
        resolve(pos);
      },
      (err) => {
        console.error("[GPS] ❌ Erreur géolocalisation:", err.code, err.message);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  });
}

/**
 * Démarre la surveillance GPS continue (watchPosition).
 * Synchronise en BDD si déplacement significatif ou délai dépassé.
 * @param {string} clientId
 * @param {function} onPosition callback(pos) à chaque nouvelle position
 */
export function startGPSWatch(clientId, onPosition) {
  if (_watchId !== null) {
    console.log("[GPS] watchPosition déjà actif (id=" + _watchId + ")");
    return;
  }
  if (!navigator.geolocation) {
    console.warn("[GPS] watchPosition non disponible");
    return;
  }
  console.log("[GPS] 🔄 Démarrage watchPosition continu...");
  _watchId = navigator.geolocation.watchPosition(
    async (geoPos) => {
      const pos = { latitude: geoPos.coords.latitude, longitude: geoPos.coords.longitude };
      const now = Date.now();
      // Calculer si on s'est assez déplacé ou si délai dépassé
      const movedEnough = _lastLat === null || _lastLng === null ||
        haversineMeters(_lastLat, _lastLng, pos.latitude, pos.longitude) > MIN_DISTANCE_M;
      const timeoutPassed = (now - _lastSyncTime) > SYNC_INTERVAL_MS;

      if (movedEnough || timeoutPassed) {
        console.log("[GPS] 📡 Mise à jour position", pos.latitude, pos.longitude,
          movedEnough ? "(déplacement)" : "(timeout)");
        if (clientId) await syncGPSVersBDD(clientId, pos);
        if (onPosition) onPosition(pos);
      }
    },
    (err) => console.error("[GPS] ❌ watchPosition erreur:", err.code, err.message),
    { enableHighAccuracy: true, timeout: 30000, maximumAge: 15000 }
  );
  console.log("[GPS] watchPosition démarré id=" + _watchId);
}

/**
 * Arrête la surveillance GPS continue.
 */
export function stopGPSWatch() {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    console.log("[GPS] watchPosition arrêté id=" + _watchId);
    _watchId = null;
  }
}

/**
 * Vérifie si les coordonnées GPS en BDD sont récentes et valides.
 * "Récentes" = mise à jour il y a moins de X minutes.
 * @param {{latitude, longitude, updated_date}} profil
 * @param {number} maxAgeMinutes
 */
export function gpsValideEnBDD(profil, maxAgeMinutes = 60) {
  if (!profil?.latitude || !profil?.longitude) return false;
  if (!profil.updated_date) return true; // pas de date → on accepte si coords présentes
  const age = (Date.now() - new Date(profil.updated_date).getTime()) / 60000;
  return age < maxAgeMinutes;
}