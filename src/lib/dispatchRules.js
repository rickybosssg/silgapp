// ─── Règles de dispatch — configuration dynamique ──────────────────────────
//
// ⚠️ Aucune valeur métier codée en dur. Toutes les constantes sont lues depuis
//    dispatchConfigStore (source unique). Les defaults sont alignés sur les
//    seeds backend (Country + AppConfig).
//
// Unification : les anciennes constantes DISPATCH_NIVEAU_* sont maintenant
//    des alias vers les constantes unifiées (heartbeat/gps). Une même règle
//    métier = un seul paramètre.
//
// Le backend reste l'autorité finale pour l'éligibilité réelle au dispatch.

import { getConfig } from './dispatchConfigStore';

// ── Accès aux paramètres dynamiques (résolution: backend → cache → defaults) ──
export function getGpsSeuilMin() { return getConfig().gps_seuil_min; }
export function getGpsDispatchSeuilMin() { return getConfig().gps_dispatch_seuil_min; }
export function getGpsExpireSeuilMin() { return getConfig().gps_expire_seuil_min; }
export function getGpsClientSeuilMin() { return getConfig().gps_client_seuil_min; }
export function getHeartbeatSeuilMin() { return getConfig().heartbeat_seuil_min; }
export function getHeartbeatOnSeuilMin() { return getConfig().heartbeat_on_seuil_min; }

// ── Alias unifiés (anciennes constantes DISPATCH_NIVEAU_*) ──
// Une même règle métier = un seul paramètre.
export const DISPATCH_NIVEAU_1_HEARTBEAT_MIN = null; // = getHeartbeatSeuilMin() — alias
export const DISPATCH_NIVEAU_2_HEARTBEAT_MIN = null; // = getHeartbeatOnSeuilMin() — alias
export const DISPATCH_NIVEAU_3_HEARTBEAT_MIN = null; // = getGpsExpireSeuilMin() — alias

// ── Helpers (règles unifiées) ──────────────────────────────────────────────

/** GPS récent = dernière position < gps_seuil_min minutes */
export function isGPSRecent(entity) {
  const dt = entity.derniere_position_date || entity.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < getGpsSeuilMin() * 60 * 1000;
}

/** GPS valide = coordonnées non nulles ET récentes */
export function hasValidGPS(entity) {
  return !!(entity.latitude && entity.longitude && isGPSRecent(entity));
}

/** App active = heartbeat < heartbeat_seuil_min minutes */
export function isAppActive(entity) {
  const dt = entity.last_seen_at;
  if (!dt) return false;
  const heartbeatAge = Date.now() - new Date(dt).getTime();
  return heartbeatAge < getHeartbeatSeuilMin() * 60 * 1000;
}

/** ON = statut actif ET heartbeat < heartbeat_on_seuil_min */
export function isON(livreur) {
  const actifEnDB = livreur.statut === "disponible" || livreur.statut === "en_course";
  const dt = livreur.last_seen_at || livreur.derniere_position_date;
  if (!dt) return false;
  return actifEnDB && (Date.now() - new Date(dt).getTime()) < getHeartbeatOnSeuilMin() * 60 * 1000;
}

/**
 * Libre = disponibilité métier + GPS ≤ gps_expire_seuil_min (dispatchable)
 * Critères :
 * - statut = "disponible"
 * - actif = true
 * - validation = "valide"
 * - a des coordonnées GPS (lat/lng)
 *
 * IMPORTANT : Le GPS et heartbeat ne sont PAS des critères d'exclusion
 * Ils servent uniquement à :
 * - prioriser les propositions (niveau 1 → 4)
 * - choisir le canal de notification (SILGAPP vs WhatsApp)
 *
 * Un livreur avec GPS ancien ou heartbeat ancien reste "Libre" et dispatchable.
 */
export function isLibre(livreur) {
  if (livreur.statut !== "disponible") return false;
  if (livreur.actif === false) return false;
  if (livreur.validation !== "valide") return false;
  if (!livreur.latitude || !livreur.longitude) return false;
  const dt = livreur.derniere_position_date || livreur.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < getGpsExpireSeuilMin() * 60 * 1000;
}

/** GPS récent pour dispatch prioritaire (≤ gps_dispatch_seuil_min min) */
export function isGPSRecentDispatch(livreur) {
  if (!livreur.latitude || !livreur.longitude) return false;
  const dt = livreur.derniere_position_date || livreur.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < getGpsDispatchSeuilMin() * 60 * 1000;
}

/**
 * Catégorie d'un livreur pour l'affichage et les compteurs
 * Retourne une des 4 catégories mutuellement exclusives :
 *   - "libre"      : disponible + validé + actif + GPS ≤ gps_expire_seuil_min
 *   - "gps_expire" : disponible + validé + actif + GPS > gps_expire_seuil_min ou absent
 *   - "en_course"  : a une course active en cours
 *   - "hors_ligne" : hors_ligne, bloqué, non validé ou autre statut
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
  if (ageMin <= getGpsExpireSeuilMin()) return "libre";
  return "gps_expire";
}

/** GPS expiré = disponible + validé + actif + GPS > gps_expire_seuil_min */
export function isGPSExpire(livreur) {
  if (livreur.statut !== "disponible") return false;
  if (livreur.actif === false) return false;
  if (livreur.validation !== "valide") return false;
  if (!livreur.latitude || !livreur.longitude) return false;
  const dt = livreur.derniere_position_date || livreur.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) > getGpsExpireSeuilMin() * 60 * 1000;
}

/** GPS ancien dispatchable = disponible + validé + actif + GPS entre dispatch_seuil et expire_seuil */
export function isLibreSansGPSValide(livreur) {
  if (livreur.statut !== "disponible") return false;
  if (livreur.actif === false) return false;
  if (livreur.validation !== "valide") return false;
  if (!livreur.latitude || !livreur.longitude) return false;
  const dt = livreur.derniere_position_date || livreur.last_seen_at;
  if (!dt) return false;
  const ageMin = (Date.now() - new Date(dt).getTime()) / 60000;
  return ageMin >= getGpsDispatchSeuilMin() && ageMin <= getGpsExpireSeuilMin();
}

/** Qualité GPS — retourne l'âge du GPS en minutes */
export function getGPSAgeMin(livreur) {
  const dt = livreur.derniere_position_date;
  if (!dt) return null;
  return (Date.now() - new Date(dt).getTime()) / 60000;
}

/** Qualité Heartbeat — retourne l'âge du heartbeat en minutes */
export function getHeartbeatAgeMin(livreur) {
  const dt = livreur.last_seen_at;
  if (!dt) return null;
  return (Date.now() - new Date(dt).getTime()) / 60000;
}

/**
 * Canal de notification recommandé
 * Retourne "silgapp" si heartbeat récent (< heartbeat_seuil_min), sinon "whatsapp"
 */
export function getNotificationChannel(livreur) {
  const heartbeatAge = getHeartbeatAgeMin(livreur);
  if (heartbeatAge === null) return "whatsapp";
  return heartbeatAge < getHeartbeatSeuilMin() ? "silgapp" : "whatsapp";
}

// ── Statuts de course signifiant qu'un livreur est OCCUPÉ (en mission) ──
// SOURCE UNIQUE : tous les écrans (Dashboard, Carte Dispatch, Carte interactive)
// doivent utiliser cette liste pour déterminer si un livreur est "en mission".
// Inclut les étapes intermédiaires du workflow administratif (client_contacto,
// en_route_expediteur, arrive_prise_en_charge, pris_en_charge) car le livreur
// est déjà engagé et ne peut pas accepter une autre course.
export const STATUTS_LIVREUR_OCCUPE = [
  "livreur_en_route",
  "client_contacto",
  "en_route_expediteur",
  "arrive_prise_en_charge",
  "colis_recupere",
  "pris_en_charge",
  "en_livraison",
];

/** En course = statut en_course + ON (legacy — utiliser livreurIdsEnCourseReelle pour le croisement réel) */
export function isEnCourse(livreur) {
  return livreur.statut === "en_course" && isON(livreur);
}

/** Éligible carte = visible sur la carte dispatch */
export function isEligibleCarte(livreur) {
  return isON(livreur) && !!(livreur.latitude && livreur.longitude);
}

/** Client éligible carte = app active au premier plan + GPS récent */
export function isClientEligibleCarte(client) {
  if (client.actif === false) return false;
  if (client.app_active !== true) return false;
  if (!client.latitude || !client.longitude) return false;
  return true;
}

/** Client avec GPS (quel que soit l'âge) */
export function hasGPS(client) {
  return !!(client.latitude && client.longitude);
}

/** Client GPS récent = position < gps_client_seuil_min min */
export function isClientGPSRecent(client) {
  const dt = client.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < getGpsClientSeuilMin() * 60 * 1000;
}

/** Client noir = GPS absent ou expiré > gps_client_seuil_min */
export function isClientNoir(client) {
  if (!client.latitude || !client.longitude) return true;
  return !isClientGPSRecent(client);
}

// ── Exports rétrocompatibles (anciennes constantes) ───────────────────────
// Résolus une fois au chargement du module (depuis le cache ou les defaults).
// Pour des valeurs toujours à jour, utiliser les fonctions get*().
export const GPS_SEUIL_MIN = getGpsSeuilMin();
export const GPS_DISPATCH_SEUIL_MIN = getGpsDispatchSeuilMin();
export const GPS_EXPIRE_SEUIL_MIN = getGpsExpireSeuilMin();
export const GPS_CLIENT_SEUIL_MIN = getGpsClientSeuilMin();
export const GPS_MAX_STALE_MIN = getConfig().gps_max_stale_min;
export const HEARTBEAT_SEUIL_MIN = getHeartbeatSeuilMin();
export const HEARTBEAT_ON_SEUIL_MIN = getHeartbeatOnSeuilMin();