// ─── Constantes de seuils ────────────────────────────────────────────────────

export const GPS_SEUIL_MIN = 5;           // GPS valide si < 5 min (affichage badge)
export const GPS_DISPATCH_SEUIL_MIN = 10; // GPS éligible dispatch si < 10 min (= moteur dispatch)
export const GPS_EXPIRE_SEUIL_MIN = 60;   // GPS expiré si > 60 min (masqué de la carte, non dispatchable)
export const HEARTBEAT_SEUIL_MIN = 2;    // App active si heartbeat < 2 min (dispatch niveau 1)
export const HEARTBEAT_ON_SEUIL_MIN = 10; // ON si heartbeat < 10 min
export const GPS_CLIENT_SEUIL_MIN = 30;  // Client GPS valide si < 30 min

// ─── Nouveaux seuils de dispatch par niveaux ───────────────────────────────
export const DISPATCH_NIVEAU_1_HEARTBEAT_MIN = 2;   // Priorité absolue
export const DISPATCH_NIVEAU_2_HEARTBEAT_MIN = 10;  // Secours
export const DISPATCH_NIVEAU_3_HEARTBEAT_MIN = 30;  // Secours étendu
// Niveau 4 : tous les livreurs libres (pas de limite heartbeat)

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
 * Libre = disponibilité métier + GPS ≤ 60 min (dispatchable)
 * Critères :
 *   - statut = "disponible"
 *   - actif = true
 *   - validation = "valide"
 *   - a des coordonnées GPS (lat/lng)
 *   - GPS récent (< GPS_EXPIRE_SEUIL_MIN = 60 min)
 * 
 * Un livreur avec GPS 10-60 min reste "Libre" et dispatchable (priorité fallback).
 * Seul un GPS > 60 min rend le livreur non dispatchable.
 */
export function isLibre(livreur) {
  if (livreur.statut !== "disponible") return false;
  if (livreur.actif === false) return false;
  if (livreur.validation !== "valide") return false;
  if (!livreur.latitude || !livreur.longitude) return false;
  const dt = livreur.derniere_position_date || livreur.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < GPS_EXPIRE_SEUIL_MIN * 60 * 1000;
}

/** GPS récent pour dispatch prioritaire (≤ 10 min) */
export function isGPSRecentDispatch(livreur) {
  if (!livreur.latitude || !livreur.longitude) return false;
  const dt = livreur.derniere_position_date || livreur.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < GPS_DISPATCH_SEUIL_MIN * 60 * 1000;
}

/**
 * Catégorie d'un livreur pour l'affichage et les compteurs
 * Retourne une des 5 catégories mutuellement exclusives :
 *   - "libre_gps_recent" : disponible + validé + actif + GPS ≤ 10 min (dispatchable, priorité max)
 *   - "libre_gps_ancien" : disponible + validé + actif + GPS 10-60 min (dispatchable, fallback)
 *   - "gps_expire"       : disponible + validé + actif + GPS > 60 min ou absent (non dispatchable)
 *   - "en_course"        : a une course active en cours
 *   - "hors_ligne"       : hors_ligne, bloqué, non validé ou autre statut
 */
export function getLivreurCategorie(livreur, livreurIdsEnCourseReelle) {
  if (livreur.actif === false) return "hors_ligne";
  if (livreur.validation !== "valide") return "hors_ligne";
  if (livreur.statut === "hors_ligne") return "hors_ligne";
  if (livreurIdsEnCourseReelle?.has(livreur.id)) return "en_course";
  if (livreur.statut !== "disponible") return "hors_ligne";
  if (!livreur.latitude || !livreur.longitude) return "gps_expire";
  const dt = livreur.derniere_position_date || livreur.last_seen_at;
  if (!dt) return "gps_expire";
  const ageMin = (Date.now() - new Date(dt).getTime()) / 60000;
  if (ageMin < GPS_DISPATCH_SEUIL_MIN) return "libre_gps_recent";
  if (ageMin <= GPS_EXPIRE_SEUIL_MIN) return "libre_gps_ancien";
  return "gps_expire";
}

/** GPS expiré = disponible + validé + actif + GPS > 60 min */
export function isGPSExpire(livreur) {
  if (livreur.statut !== "disponible") return false;
  if (livreur.actif === false) return false;
  if (livreur.validation !== "valide") return false;
  if (!livreur.latitude || !livreur.longitude) return false;
  const dt = livreur.derniere_position_date || livreur.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) > GPS_EXPIRE_SEUIL_MIN * 60 * 1000;
}

/** GPS ancien dispatchable = disponible + validé + actif + GPS 10-60 min */
export function isLibreSansGPSValide(livreur) {
  if (livreur.statut !== "disponible") return false;
  if (livreur.actif === false) return false;
  if (livreur.validation !== "valide") return false;
  if (!livreur.latitude || !livreur.longitude) return false;
  const dt = livreur.derniere_position_date || livreur.last_seen_at;
  if (!dt) return false;
  const ageMin = (Date.now() - new Date(dt).getTime()) / 60000;
  return ageMin >= GPS_DISPATCH_SEUIL_MIN && ageMin <= GPS_EXPIRE_SEUIL_MIN;
}

/**
 * Qualité GPS — pour affichage et priorisation
 * Retourne l'âge du GPS en minutes
 */
export function getGPSAgeMin(livreur) {
  const dt = livreur.derniere_position_date;
  if (!dt) return null;
  return (Date.now() - new Date(dt).getTime()) / 60000;
}

/**
 * Qualité Heartbeat — pour choisir le canal de notification
 * Retourne l'âge du heartbeat en minutes
 */
export function getHeartbeatAgeMin(livreur) {
  const dt = livreur.last_seen_at;
  if (!dt) return null;
  return (Date.now() - new Date(dt).getTime()) / 60000;
}

/**
 * Canal de notification recommandé
 * Retourne "silgapp" si heartbeat récent (< 2 min), sinon "whatsapp"
 */
export function getNotificationChannel(livreur) {
  const heartbeatAge = getHeartbeatAgeMin(livreur);
  if (heartbeatAge === null) return "whatsapp";
  return heartbeatAge < DISPATCH_NIVEAU_1_HEARTBEAT_MIN ? "silgapp" : "whatsapp";
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