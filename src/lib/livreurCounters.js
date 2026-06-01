// ─── Règles unifiées pour les compteurs livreurs ─────────────────────────────
// Fichier centralisé pour garantir l'uniformité des calculs dans toute l'application
// Importer ce fichier dans DashboardExterne, CarteLivreursExterne, et tous les composants

import { GPS_SEUIL_MIN, HEARTBEAT_SEUIL_MIN, HEARTBEAT_ON_SEUIL_MIN, isGPSRecent, hasValidGPS, isAppActive, isON, isLibre, isEnCourse } from "./dispatchRules";

const GPS_EXPIRE_MIN = 10;        // GPS expiré si > 10 min → noir (livreurs)
const GPS_CLIENT_SEUIL_MIN = 30;  // Client GPS valide si < 30 min

/**
 * Livreur noir = hors ligne ou GPS expiré > 10 min
 */
export function isLivreurNoir(livreur) {
  const dt = livreur.last_seen_at || livreur.derniere_position_date;
  if (!dt) return true; // jamais vu
  const min = (Date.now() - new Date(dt).getTime()) / 60000;
  return min > GPS_EXPIRE_MIN || livreur.statut === "hors_ligne";
}

/**
 * Client noir = GPS absent ou expiré > 30 min
 */
export function isClientNoir(client) {
  if (!client.latitude || !client.longitude) return true;
  const dt = client.last_seen_at;
  if (!dt) return true;
  return (Date.now() - new Date(dt).getTime()) > GPS_CLIENT_SEUIL_MIN * 60000;
}

/**
 * Client GPS récent = position < 30 min
 */
export function isClientGPSRecent(client) {
  const dt = client.last_seen_at;
  if (!dt) return false;
  return (Date.now() - new Date(dt).getTime()) < GPS_CLIENT_SEUIL_MIN * 60000;
}

/**
 * Calcule TOUS les compteurs livreurs avec une source unique de vérité
 * @param {Array} livreurs - Liste des livreurs (déjà filtrés: validation === "valide" && actif !== false)
 * @returns {Object} - Compteurs détaillés
 */
export function calculateLivreurCounters(livreurs) {
  const libres = livreurs.filter(l => isLibre(l));
  const enCourse = livreurs.filter(l => isEnCourse(l));
  
  // 🔍 Diagnostic pour débogage
  console.log("🎯 calculateLivreurCounters:", {
    total: livreurs.length,
    libres_count: libres.length,
    libres_ids: libres.map(l => l.id.slice(-8)),
    enCourse_count: enCourse.length,
    details: libres.map(l => ({
      id: l.id.slice(-8),
      nom: `${l.prenom} ${l.nom}`,
      statut: l.statut,
      isON: isON(l),
      isAppActive: isAppActive(l),
      hasValidGPS: hasValidGPS(l),
    })),
  });
  
  return {
    total: livreurs.length,
    on: livreurs.filter(l => isON(l)).length,
    off: livreurs.filter(l => !isON(l)).length,
    libres: libres.length,
    enCourse: enCourse.length,
    appActive: livreurs.filter(l => isAppActive(l)).length,
    noirs: livreurs.filter(l => isLivreurNoir(l)).length,
    verts: libres.length,      // alias pour libres
    oranges: enCourse.length,  // alias pour enCourse
    surCarte: livreurs.length, // TOUS les livreurs enregistrés
  };
}

/**
 * Calcule TOUS les compteurs clients avec une source unique de vérité
 * @param {Array} clients - Liste des clients
 * @returns {Object} - Compteurs détaillés
 */
export function calculateClientCounters(clients) {
  return {
    total: clients.length,
    avecGPS: clients.filter(c => c.latitude && c.longitude).length,
    gpsRecent: clients.filter(c => isClientGPSRecent(c)).length,
    surCarte: clients.length, // TOUS les clients enregistrés
    noirs: clients.filter(c => isClientNoir(c)).length,
    bleus: clients.filter(c => !isClientNoir(c)).length, // alias pour GPS récent
  };
}

/**
 * Debug: Identifie les livreurs comptés comme "libres" et pourquoi
 * @param {Array} livreurs - Liste des livreurs
 * @returns {Array} - Détails par livreur
 */
export function debugLibreCounters(livreurs) {
  return livreurs.map(l => ({
    id: l.id,
    nom: `${l.prenom} ${l.nom}`,
    statut: l.statut,
    isON: isON(l),
    isAppActive: isAppActive(l),
    hasValidGPS: hasValidGPS(l),
    isLibre: isLibre(l),
    raisonNonLibre: !isLibre(l) ? {
      statutNonDisponible: l.statut !== "disponible",
      isOFF: !isON(l),
      appFermee: !isAppActive(l),
      gpsInvalide: !hasValidGPS(l),
    } : null,
  }));
}