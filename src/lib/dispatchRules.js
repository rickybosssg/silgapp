// ─── Règles de dispatch — utilitaires partagés (réseau externe uniquement) ───
// Utilisé par : CarteLivreursExterne, DashboardExterne, DispatchMap, livreurCounters

export const GPS_DISPATCH_SEUIL_MIN = 10; // minutes — GPS older than this is considered expired
export const GPS_CLIENT_ACTIF_SEUIL_MIN = 5;
export const GPS_CLIENT_RECENT_SEUIL_MIN = 15;

// ─── Livreur ──────────────────────────────────────────────────────────

export function isON(livreur) {
  const dt = livreur.last_seen_at || livreur.derniere_position_date;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) / 60000 < GPS_DISPATCH_SEUIL_MIN;
}

export function isAppActive(livreur) {
  return livreur.app_active === true;
}

export function hasValidGPS(livreur) {
  if (!livreur.latitude || !livreur.longitude) return false;
  return true;
}

export function isGPSRecent(livreur) {
  const dt = livreur.derniere_position_date || livreur.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) / 60000 < GPS_DISPATCH_SEUIL_MIN;
}

/** Livreur libre = disponible + validé + actif + GPS récent */
export function isLibre(livreur) {
  if (livreur.statut !== "disponible") return false;
  if (livreur.validation !== "valide") return false;
  if (livreur.actif === false) return false;
  return isGPSRecent(livreur);
}

/** Livreur en course = statut "en_course" */
export function isEnCourse(livreur) {
  return livreur.statut === "en_course";
}

// ─── Client ───────────────────────────────────────────────────────────

export function isClientGPSRecent(client) {
  const dt = client.last_seen_at || client.derniere_position_date;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) / 60000 < GPS_CLIENT_RECENT_SEUIL_MIN;
}

export function isClientNoir(client) {
  if (!client.latitude || !client.longitude) return true;
  return !isClientGPSRecent(client);
}

export function isClientEligibleCarte(client) {
  if (!client.latitude || !client.longitude) return false;
  return isClientGPSRecent(client);
}