import { normalizePhone } from "@/lib/phoneUtils";

/**
 * Source de vérité unique pour le contact d'une course selon la phase.
 *
 * Règle métier officielle SILGAPP :
 * - Avant récupération du colis → expéditeur (celui qui donne le colis)
 * - Après récupération du colis → destinataire (celui qui reçoit)
 * - Course administrative (source=admin) → contact_createur_course prioritaire
 *   (l'admin définit explicitement le bon contact)
 * - Déplacement → passager (contact unique toute la course)
 *
 * `contact_createur_course` n'est PLUS priorité absolue pour les courses client.
 * Il sert uniquement de fallback final si les contacts spécifiques sont vides.
 */

/**
 * Retourne le numéro de téléphone du bon contact selon la phase de la course.
 * @param {object} course - L'objet CourseExterne
 * @param {"recuperation"|"livraison"} phase - Phase actuelle
 * @returns {{ telephone: string, nom: string, role: string }}
 */
export function getCourseContactForPhase(course, phase = "recuperation") {
  if (!course) return { telephone: "", nom: "", role: "" };

  const isAdminCourse = course.source === "admin" || course.pricing_mode === "admin_manuel";
  const isDeplacement = course.type_course === "deplacement";

  // ── Déplacement : passager unique ──
  if (isDeplacement) {
    const tel = course.passager_telephone || course.contact_createur_course || course.client_telephone || "";
    const nom = course.passager_nom || course.client_nom || "Passager";
    return { telephone: tel, nom, role: "Passager" };
  }

  // ── Course administrative : contact_createur_course prioritaire ──
  // L'admin définit explicitement le contact à appeler.
  if (isAdminCourse && course.contact_createur_course) {
    const tel = course.contact_createur_course;
    const nom = phase === "livraison"
      ? (course.destinataire_nom || course.client_nom || "Destinataire")
      : (course.expediteur_nom || course.client_nom || "Client");
    const role = phase === "livraison" ? "Destinataire" : "Client";
    return { telephone: tel, nom, role };
  }

  // ── Courses client : priorité au contact de phase ──
  if (phase === "livraison") {
    // Après récupération → destinataire
    const tel = course.destinataire_telephone
      || course.destinataire_phone_normalized
      || course.contact_createur_course
      || course.client_telephone
      || "";
    const nom = course.destinataire_nom || course.client_nom || "Destinataire";
    return { telephone: tel, nom, role: "Destinataire" };
  }

  // Avant récupération → expéditeur
  const tel = course.expediteur_telephone
    || course.expediteur_phone_normalized
    || course.contact_createur_course
    || course.client_telephone
    || "";
  const nom = course.expediteur_nom || course.client_nom || "Expéditeur";
  return { telephone: tel, nom, role: "Expéditeur" };
}

/**
 * Normalise un numéro de téléphone au format international (sans + ni espaces).
 * Utilise getCountryConfig de phoneUtils.js pour l'indicatif pays.
 *
 * @param {string} phone - Le numéro à normaliser
 * @param {string} countryCode - Code pays ISO 2 lettres (ex: BF, CI, BJ)
 * @returns {string} Numéro au format international (ex: 22670123456)
 */
export function normalizePhoneForWhatsapp(phone, countryCode = "") {
  if (!phone) return "";
  const num = String(phone).replace(/\D/g, "");
  if (!num) return "";
  return normalizePhone(num, countryCode) || num;
}
