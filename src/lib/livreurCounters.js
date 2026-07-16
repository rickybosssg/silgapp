// ─── Règles unifiées pour les compteurs livreurs ─────────────────────────────
// Fichier centralisé pour garantir l'uniformité des calculs dans toute l'application
// Importer ce fichier dans DashboardExterne, CarteLivreursExterne, et tous les composants

import { isGPSRecent, hasValidGPS, isAppActive, isON, isLibre, isEnCourse, isClientGPSRecent, isClientNoir, getLivreurCategorie, isGPSExpire, isLibreSansGPSValide } from "./dispatchRules";

/**
 * Livreur noir = non dispatchable
 * SOURCE UNIQUE : même règle que DispatchMap et CarteLivreursExterne
 * 
 * NOUVELLE RÈGLE : Disponibilité métier uniquement
 * Noir = hors_ligne OU inactif OU non validé OU pas de GPS
 * 
 * ⚠️ heartbeat et GPS ancien NE sont PLUS des critères d'exclusion
 * Un livreur peut être :
 *   - 🟢 Libre (disponible + ON + validé + GPS)
 *   - 📍 GPS ancien (20+ min)
 *   - 📡 Heartbeat ancien (app fermée)
 *   - → Reste dispatchable (recevra WhatsApp)
 */
export function isLivreurNoir(livreur, livreurIdsEnCourseReelle) {
  const cat = getLivreurCategorie(livreur, livreurIdsEnCourseReelle);
  return cat === "hors_ligne" || cat === "gps_expire";
}

/**
 * Calcule TOUS les compteurs livreurs avec une source unique de vérité
 * @param {Array} livreurs - Liste des livreurs (déjà filtrés: validation === "valide" && actif !== false)
 * @returns {Object} - Compteurs détaillés
 */
export function calculateLivreurCounters(livreurs, livreurIdsEnCourseReelle) {
  const cats = livreurs.map(l => getLivreurCategorie(l, livreurIdsEnCourseReelle));
  const libres = cats.filter(c => c === "libre_gps_valide").length;
  const sansGPS = cats.filter(c => c === "sans_gps_valide").length;
  const expires = cats.filter(c => c === "gps_expire").length;
  const enCourse = cats.filter(c => c === "en_course").length;
  const horsLigne = cats.filter(c => c === "hors_ligne").length;

  return {
    total: livreurs.length,
    libres,                     // dispatchables (GPS < 10 min)
    sans_gps_valide: sansGPS,   // disponible mais GPS invalide (10-60 min ou absent)
    gps_expire: expires,        // GPS > 60 min (app fermée)
    enCourse,
    hors_ligne: horsLigne,
    // Aliases for backward compatibility
    on: livreurs.filter(l => isON(l)).length,
    off: livreurs.filter(l => !isON(l)).length,
    appActive: livreurs.filter(l => isAppActive(l)).length,
    noirs: expires + horsLigne,
    verts: libres,
    oranges: enCourse,
    surCarte: livreurs.length,
    // Marqueurs visibles = libre_gps_valide + sans_gps_valide + en_course
    visibleCarte: libres + sansGPS + enCourse,
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