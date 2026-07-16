// ─── Règles unifiées pour les compteurs livreurs ─────────────────────────────
// Fichier centralisé pour garantir l'uniformité des calculs dans toute l'application
// Importer ce fichier dans DashboardExterne, CarteLivreursExterne, et tous les composants

import { isGPSRecent, hasValidGPS, isAppActive, isON, isLibre, isEnCourse, isClientGPSRecent, isClientNoir, getLivreurCategorie, isGPSExpire, isLibreSansGPSValide } from "./dispatchRules";

/**
 * Livreur noir = non dispatchable
 * SOURCE UNIQUE : même règle que DispatchMap et CarteLivreursExterne
 * 
 * Noir = hors_ligne OU gps_expire (GPS > 60 min ou absent)
 * Un livreur avec GPS 10-60 min reste dispatchable (non noir).
 */
export function isLivreurNoir(livreur, livreurIdsEnCourseReelle) {
  const cat = getLivreurCategorie(livreur, livreurIdsEnCourseReelle);
  return cat === "hors_ligne" || cat === "gps_expire";
}

/**
 * Calcule TOUS les compteurs livreurs avec une source unique de vérité
 * @param {Array} livreurs - Liste des livreurs (déjà filtrés: validation === "valide" && actif !== false)
 * @param {Set} livreurIdsEnCourseReelle - IDs des livreurs avec course active
 * @returns {Object} - Compteurs détaillés
 */
export function calculateLivreurCounters(livreurs, livreurIdsEnCourseReelle) {
  const cats = livreurs.map(l => getLivreurCategorie(l, livreurIdsEnCourseReelle));
  const libresRecent = cats.filter(c => c === "libre_gps_recent").length;
  const libresAncien = cats.filter(c => c === "libre_gps_ancien").length;
  const expires = cats.filter(c => c === "gps_expire").length;
  const enCourse = cats.filter(c => c === "en_course").length;
  const horsLigne = cats.filter(c => c === "hors_ligne").length;

  return {
    total: livreurs.length,
    libres: libresRecent + libresAncien,  // TOUS dispatchables (GPS ≤ 60 min)
    libres_recent: libresRecent,           // GPS ≤ 10 min (priorité max)
    libres_ancien: libresAncien,           // GPS 10-60 min (priorité fallback)
    sans_gps_valide: libresAncien,         // alias rétro-compatibilité
    gps_expire: expires,                   // GPS > 60 min (non dispatchable)
    enCourse,
    hors_ligne: horsLigne,
    // Aliases for backward compatibility
    on: livreurs.filter(l => isON(l)).length,
    off: livreurs.filter(l => !isON(l)).length,
    appActive: livreurs.filter(l => isAppActive(l)).length,
    noirs: expires + horsLigne,
    verts: libresRecent + libresAncien,    // tous les dispatchables
    oranges: enCourse,
    surCarte: livreurs.length,
    // Marqueurs visibles = libre_gps_recent + libre_gps_ancien + en_course
    visibleCarte: libresRecent + libresAncien + enCourse,
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
    gpsRecents: clients.filter(c => isClientGPSRecent(c)).length, // alias utilisé par NetworkHealthBanner
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