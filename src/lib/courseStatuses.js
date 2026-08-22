// ═══════════════════════════════════════════════════════════════════════════
// COURSE STATUSES — Source unique des statuts de course (frontend)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️  Ces statuts sont un miroir du schéma CourseExterne (backend).
//     Le backend (courseStateMachine.ts) reste l'autorité absolue pour
//     les transitions de statut. Le frontend ne fait que les afficher.
//
// Ce module centralise :
//   - L'énumération des statuts (statut)
//   - Les statuts actifs (livreur engagé)
//   - Les statuts terminaux (course finie)
//   - Les libellés d'affichage
//   - Les couleurs associées
// ═══════════════════════════════════════════════════════════════════════════

// ── Énumération des statuts ──────────────────────────────────────────────────
export const COURSE_STATUSES = {
  NOUVELLE: "nouvelle",
  EN_ATTENTE: "en_attente",
  PROGRAMMEE: "programmee",
  RECHERCHE_LIVREUR: "recherche_livreur",
  LIVREUR_EN_ROUTE: "livreur_en_route",
  CLIENT_CONTACTE: "client_contacte",
  EN_ROUTE_EXPEDITEUR: "en_route_expediteur",
  ARRIVE_PRISE_EN_CHARGE: "arrive_prise_en_charge",
  COLIS_RECUPERE: "colis_recupere",
  PASSAGER_EMBARQUE: "passager_embarque",
  PRIS_EN_CHARGE: "pris_en_charge",
  EN_LIVRAISON: "en_livraison",
  ARRIVEE: "arrivee",
  LIVREE: "livree",
  ANNULEE: "annulee",
};

// ── Statuts actifs (livreur engagé dans la livraison) ─────────────────────────
// Un livreur avec une course dans un de ces statuts ne doit JAMAIS recevoir
// de nouvelle proposition de dispatch.
export const STATUTS_ACTIFS_COURSE = [
  COURSE_STATUSES.LIVREUR_EN_ROUTE,
  COURSE_STATUSES.CLIENT_CONTACTE,
  COURSE_STATUSES.EN_ROUTE_EXPEDITEUR,
  COURSE_STATUSES.ARRIVE_PRISE_EN_CHARGE,
  COURSE_STATUSES.COLIS_RECUPERE,
  COURSE_STATUSES.PASSAGER_EMBARQUE,
  COURSE_STATUSES.PRIS_EN_CHARGE,
  COURSE_STATUSES.EN_LIVRAISON,
  COURSE_STATUSES.ARRIVEE,
];

// ── Statuts terminaux (course finie) ───────────────────────────────────────────
export const STATUTS_TERMINAUX_COURSE = [
  COURSE_STATUSES.LIVREE,
  COURSE_STATUSES.ANNULEE,
];

// ── Libellés d'affichage ─────────────────────────────────────────────────────
export const COURSE_STATUS_LABELS = {
  [COURSE_STATUSES.NOUVELLE]: "Nouvelle",
  [COURSE_STATUSES.EN_ATTENTE]: "En attente",
  [COURSE_STATUSES.PROGRAMMEE]: "Programmée",
  [COURSE_STATUSES.RECHERCHE_LIVREUR]: "Recherche livreur",
  [COURSE_STATUSES.LIVREUR_EN_ROUTE]: "Livreur en route",
  [COURSE_STATUSES.CLIENT_CONTACTE]: "Client contacté",
  [COURSE_STATUSES.EN_ROUTE_EXPEDITEUR]: "En route vers l'expéditeur",
  [COURSE_STATUSES.ARRIVE_PRISE_EN_CHARGE]: "Arrivé (prise en charge)",
  [COURSE_STATUSES.COLIS_RECUPERE]: "Colis récupéré",
  [COURSE_STATUSES.PASSAGER_EMBARQUE]: "Passager embarqué",
  [COURSE_STATUSES.PRIS_EN_CHARGE]: "Pris en charge",
  [COURSE_STATUSES.EN_LIVRAISON]: "En livraison",
  [COURSE_STATUSES.ARRIVEE]: "Arrivé",
  [COURSE_STATUSES.LIVREE]: "Livrée",
  [COURSE_STATUSES.ANNULEE]: "Annulée",
};

// ── Couleurs Tailwind par statut ──────────────────────────────────────────────
export const COURSE_STATUS_COLORS = {
  [COURSE_STATUSES.NOUVELLE]: "bg-blue-100 text-blue-700",
  [COURSE_STATUSES.EN_ATTENTE]: "bg-amber-100 text-amber-700",
  [COURSE_STATUSES.PROGRAMMEE]: "bg-purple-100 text-purple-700",
  [COURSE_STATUSES.RECHERCHE_LIVREUR]: "bg-orange-100 text-orange-700",
  [COURSE_STATUSES.LIVREUR_EN_ROUTE]: "bg-indigo-100 text-indigo-700",
  [COURSE_STATUSES.CLIENT_CONTACTE]: "bg-cyan-100 text-cyan-700",
  [COURSE_STATUSES.EN_ROUTE_EXPEDITEUR]: "bg-cyan-100 text-cyan-700",
  [COURSE_STATUSES.ARRIVE_PRISE_EN_CHARGE]: "bg-teal-100 text-teal-700",
  [COURSE_STATUSES.COLIS_RECUPERE]: "bg-teal-100 text-teal-700",
  [COURSE_STATUSES.PASSAGER_EMBARQUE]: "bg-teal-100 text-teal-700",
  [COURSE_STATUSES.PRIS_EN_CHARGE]: "bg-teal-100 text-teal-700",
  [COURSE_STATUSES.EN_LIVRAISON]: "bg-green-100 text-green-700",
  [COURSE_STATUSES.ARRIVEE]: "bg-green-100 text-green-700",
  [COURSE_STATUSES.LIVREE]: "bg-green-600 text-white",
  [COURSE_STATUSES.ANNULEE]: "bg-red-100 text-red-700",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
export function isActiveStatus(statut) {
  return STATUTS_ACTIFS_COURSE.includes(statut);
}

export function isTerminalStatus(statut) {
  return STATUTS_TERMINAUX_COURSE.includes(statut);
}

export function getCourseStatusLabel(statut) {
  return COURSE_STATUS_LABELS[statut] || statut || "—";
}

export function getCourseStatusColor(statut) {
  return COURSE_STATUS_COLORS[statut] || "bg-gray-100 text-gray-700";
}