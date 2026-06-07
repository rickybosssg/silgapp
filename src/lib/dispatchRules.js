// ─── Constantes de seuils ────────────────────────────────────────────────────

export const GPS_SEUIL_MIN = 5;           // GPS valide si < 5 min (affichage badge)
export const GPS_DISPATCH_SEUIL_MIN = 10; // GPS éligible dispatch si < 10 min (= moteur dispatch)
export const HEARTBEAT_SEUIL_MIN = 5;    // App active si heartbeat < 5 min
export const HEARTBEAT_ON_SEUIL_MIN = 10; // ON si heartbeat < 10 min
export const GPS_CLIENT_SEUIL_MIN = 30;  // Client GPS valide si < 30 min

// ─── Helpers (règles unifiées) ───────────────────────────────────────────────

/** GPS récent = dernière position < GPS_SEUIL_MIN minutes */
export function isGPSRecent(entity) {
  const dt = entity.derniere_position_date || entity.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < GPS_SEUIL_MIN * 60 * 1000;
}

/** GPS valide = coordonnées non nulles ET récentes */
export function hasValidGPS(entity) {
  return !!(entity.latitude && entity.longitude && isGPSRecent(entity));
}

/** App active = heartbeat < HEARTBEAT_SEUIL_MIN minutes (5 min) */
export function isAppActive(entity) {
  const dt = entity.last_seen_at;
  if (!dt) return false;
  const heartbeatAge = Date.now() - new Date(dt).getTime();
  // Heartbeat récent < 5 min = app active
  return heartbeatAge < HEARTBEAT_SEUIL_MIN * 60 * 1000;
}

/** ON = statut actif ET heartbeat < HEARTBEAT_ON_SEUIL_MIN */
export function isON(livreur) {
  const actifEnDB = livreur.statut === "disponible" || livreur.statut === "en_course";
  const dt = livreur.last_seen_at || livreur.derniere_position_date;
  if (!dt) return false;
  return actifEnDB && (Date.now() - new Date(dt).getTime()) < HEARTBEAT_ON_SEUIL_MIN * 60 * 1000;
}

/**
 * Libre = disponible + GPS récent < 10 min (même règle que le moteur dispatch externe)
 * ⚠️ app_active n'est PAS un critère de disponibilité :
 *   - App ouverte → notification SILGAPP
 *   - App fermée  → notification WhatsApp automatique
 * Un livreur reste dispatchable même si son app est fermée.
 * GPS > 10 min → non dispatchable → non compté comme libre.
 */
export function isLibre(livreur) {
  if (livreur.statut !== "disponible") return false;
  if (livreur.actif === false) return false;
  if (livreur.validation !== "valide") return false;
  if (!livreur.latitude || !livreur.longitude) return false;
  // GPS doit être < GPS_DISPATCH_SEUIL_MIN (10 min) — même règle que le moteur dispatch
  const dt = livreur.derniere_position_date || livreur.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < GPS_DISPATCH_SEUIL_MIN * 60 * 1000;
}

/** En course = statut en_course + ON */
export function isEnCourse(livreur) {
  return livreur.statut === "en_course" && isON(livreur);
}

/**
 * Éligible carte = visible sur la carte dispatch
 * Conditions : GPS renseigné (lat/lng) + statut actif
 * app_active n'est PAS un critère — afficher tous les livreurs ON
 */
export function isEligibleCarte(livreur) {
  return isON(livreur) && !!(livreur.latitude && livreur.longitude);
}

/**
 * Client éligible carte = actif + a des coordonnées GPS
 * Affiche tous les clients avec GPS, même si ancien (en gris si inactif)
 */
export function isClientEligibleCarte(client) {
  if (client.actif === false) return false;
  if (!client.latitude || !client.longitude) return false;
  // Tous les clients avec GPS sont affichés
  return true;
}

/** Client avec GPS (quel que soit l'âge) */
export function hasGPS(client) {
  return !!(client.latitude && client.longitude);
}

/** Client GPS récent = position < 30 min */
export function isClientGPSRecent(client) {
  const dt = client.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < GPS_CLIENT_SEUIL_MIN * 60 * 1000;
}

/**
 * Client noir = GPS absent ou expiré > 30 min
 */
export function isClientNoir(client) {
  if (!client.latitude || !client.longitude) return true;
  return !isClientGPSRecent(client);
}