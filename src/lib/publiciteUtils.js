/**
 * Utilitaires partagés pour le module Publicités.
 * Gère le filtrage par moment d'affichage, le tracking des impressions,
 * et l'anti-répétition (une fois par course, par jour, par session).
 */

// ── Moments d'affichage supportés ──
export const MOMENTS = {
  OUVERTURE_APP: "ouverture_app",
  RECHERCHE_LIVREUR: "recherche_livreur",
  APRES_ASSIGNATION: "apres_assignation",
  APRES_LIVRAISON: "apres_livraison",
};

/**
 * Vérifie si une publicité doit s'afficher pour un moment donné.
 *
 * @param {object} pub - L'entité Publicite
 * @param {string} moment - Le moment déclencheur (ouverture_app, recherche_livreur, apres_assignation, apres_livraison)
 * @returns {boolean}
 */
export function pubMatchMoment(pub, moment) {
  const ma = pub.moment_affichage || "ouverture_app";
  if (ma === "desactivee") return false;
  if (ma === moment) return true;
  if (ma === "ouverture_et_recherche") {
    return moment === MOMENTS.OUVERTURE_APP || moment === MOMENTS.RECHERCHE_LIVREUR;
  }
  if (ma === "personnalise") {
    try {
      const arr = pub.moments_personnalises ? JSON.parse(pub.moments_personnalises) : [];
      return Array.isArray(arr) && arr.includes(moment);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Vérifie si une publicité est dans sa période de validité (dates + actif).
 */
export function pubEstValide(pub, now = new Date().toISOString()) {
  if (!pub.actif) return false;
  if (pub.date_debut && pub.date_debut > now) return false;
  if (pub.date_fin && pub.date_fin < now) return false;
  return true;
}

/**
 * Vérifie si une publicité cible l'utilisateur (type + pays).
 */
export function pubCibleUser(pub, cible, userCountry) {
  const cibles = ["tous", cible];
  if (!cibles.includes(pub.cible)) return false;
  if (pub.pays_cibles && pub.pays_cibles !== "tous") {
    try {
      const paysList = JSON.parse(pub.pays_cibles);
      if (!Array.isArray(paysList) || (userCountry && !paysList.includes(userCountry))) {
        return false;
      }
    } catch {
      // JSON invalide → on considère "tous"
    }
  }
  return true;
}

// ── Anti-répétition via localStorage ──
const STORAGE_KEY_AFFICHAGES = "silgapp_pub_affichages";

function getAffichagesLocaux() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_AFFICHAGES) || "{}"); } catch { return {}; }
}

function sauvegarderAffichages(data) {
  try { localStorage.setItem(STORAGE_KEY_AFFICHAGES, JSON.stringify(data)); } catch {}
}

/**
 * Vérifie si la pub peut être affichée selon la limite configurée.
 *
 * @param {object} pub - L'entité Publicite
 * @param {string|null} courseId - ID de la course (pour limite "une_fois_par_course")
 * @returns {boolean} true si la pub peut s'afficher
 */
export function peutAfficherPub(pub, courseId = null) {
  const limite = pub.limite_affichage || "une_fois_par_course";
  const affichages = getAffichagesLocaux();
  const key = pub.id;

  if (limite === "illimite") return true;

  if (limite === "une_fois_par_course") {
    if (!courseId) return true; // pas de course → on permet
    const courseKey = `${key}_course_${courseId}`;
    return !affichages[courseKey];
  }

  if (limite === "une_fois_par_jour") {
    const derniere = affichages[`${key}_jour`];
    if (derniere) {
      const age = (Date.now() - new Date(derniere).getTime()) / (1000 * 3600);
      if (age < 24) return false;
    }
    return true;
  }

  if (limite === "une_fois_par_session") {
    const derniere = affichages[`${key}_session`];
    if (derniere) return false;
    return true;
  }

  return true;
}

/**
 * Marque une publicité comme ayant été affichée pour la limite configurée.
 *
 * @param {object} pub - L'entité Publicite
 * @param {string|null} courseId - ID de la course
 */
export function marquerPubAffichee(pub, courseId = null) {
  const limite = pub.limite_affichage || "une_fois_par_course";
  const affichages = getAffichagesLocaux();
  const key = pub.id;
  const now = new Date().toISOString();

  if (limite === "une_fois_par_course" && courseId) {
    affichages[`${key}_course_${courseId}`] = now;
  } else if (limite === "une_fois_par_jour") {
    affichages[`${key}_jour`] = now;
  } else if (limite === "une_fois_par_session") {
    affichages[`${key}_session`] = now;
  }

  sauvegarderAffichages(affichages);
}

/**
 * Nettoie les entrées anti-répétition pour une course donnée.
 * À appeler quand une course est livrée/annulée pour libérer la mémoire.
 */
export function nettoyerAffichagesCourse(courseId) {
  if (!courseId) return;
  const affichages = getAffichagesLocaux();
  Object.keys(affichages).forEach(key => {
    if (key.includes(`_course_${courseId}`)) delete affichages[key];
  });
  sauvegarderAffichages(affichages);
}