// ─── Règles unifiées pour les compteurs livreurs ─────────────────────────────
// Fichier centralisé pour garantir l'uniformité des calculs dans toute l'application
// Importer ce fichier dans DashboardExterne, CarteLivreursExterne, et tous les composants

import { isGPSRecent, hasValidGPS, isAppActive, isON, isLibre, isEnCourse, isClientGPSRecent, isClientNoir } from "./dispatchRules";

/**
 * Livreur noir = non dispatchable
 * SOURCE UNIQUE : même règle que DispatchMap et CarteLivreursExterne
 *
 * NOUVELLE RÈGLE : Disponibilité métier uniquement
 * Noir = hors_ligne OU inactif OU non validé OU pas de GPS
 *
 * heartbeat et GPS ancien NE sont PLUS des critères d'exclusion
 * Un livreur peut être :
 * - Libre (disponible + ON + validé + GPS)
 * - GPS ancien (20+ min)
 * - Heartbeat ancien (app fermée)
 * - → Reste dispatchable (recevra WhatsApp)
 */
export function isLivreurNoir(livreur, livreurIdsEnCourseReelle) {
  if (!livreur.latitude || !livreur.longitude) return true;
  if (livreur.statut === "hors_ligne") return true;
  if (livreur.actif === false) return true;
  if (livreur.validation !== "valide") return true;
  // CORRECTION : En course = avec course ACTIVE (peu importe le statut DB)
  if (livreurIdsEnCourseReelle?.has(livreur.id)) return false;
  // Disponible avec GPS = vert (même si GPS/heartbeat ancien)
  if (livreur.statut === "disponible") return false;
  return true;
}

/**
 * Calcule TOUS les compteurs livreurs avec une source unique de vérité
 * @param {Array} livreurs - Liste des livreurs (déjà filtrés: validation === "valide" && actif !== false)
 * @returns {Object} - Compteurs détaillés
 */
export function calculateLivreurCounters(livreurs) {
  const libres = livreurs.filter(l => isLibre(l));
  const enCourse = livreurs.filter(l => isEnCourse(l));

  // Diagnostic pour débogage
  console.log(" calculateLivreurCounters:", {
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
    verts: libres.length, // alias pour libres
    oranges: enCourse.length, // alias pour enCourse
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