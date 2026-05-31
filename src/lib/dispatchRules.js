// ─── Constantes de seuils ────────────────────────────────────────────────────

export const GPS_SEUIL_MIN = 5;          // GPS valide si < 5 min
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

/** Libre = disponible + ON + app active + GPS récent → peut recevoir une course */
export function isLibre(livreur) {
  return livreur.statut === "disponible" && isON(livreur) && isAppActive(livreur) && hasValidGPS(livreur);
}

/** En course = statut en_course + ON */
export function isEnCourse(livreur) {
  return livreur.statut === "en_course" && isON(livreur);
}

/**
 * Éligible carte = visible sur la carte dispatch
 * Conditions : ON + GPS récent < 5 min + app active
 * Inclut libre ET en_course (couleurs différentes)
 */
export function isEligibleCarte(livreur) {
  return isON(livreur) && hasValidGPS(livreur) && isAppActive(livreur);
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