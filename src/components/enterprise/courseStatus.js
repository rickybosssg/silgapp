// ═══════════════════════════════════════════════════════════════════════════
// courseStatus.js — Helpers d'affichage pour les statuts CourseExterne
//
// IMPORTANT: Ne renomme aucun statut en base. Ce sont des libellés FRONTEND uniquement.
// Utilise UNIQUEMENT les statuts officiels du schéma CourseExterne.
// ═══════════════════════════════════════════════════════════════════════════

// 12 statuts actifs = "En traitement" (exclut livree, annulee, programmee)
export const EN_TRAITEMENT_STATUSES = [
  "nouvelle",
  "en_attente",
  "recherche_livreur",
  "livreur_en_route",
  "client_contacte",
  "en_route_expediteur",
  "arrive_prise_en_charge",
  "colis_recupere",
  "passager_embarque",
  "pris_en_charge",
  "en_livraison",
  "arrivee",
];

export const PROGRAMMEE_STATUSES = ["programmee"];

// Libellés d'affichage par statut (frontend uniquement)
export const STATUS_LABELS = {
  nouvelle: "Nouvelle",
  en_attente: "En attente",
  programmee: "Programmée",
  recherche_livreur: "Recherche livreur",
  livreur_en_route: "Livreur en route",
  client_contacte: "Client contacté",
  en_route_expediteur: "En route expéditeur",
  arrive_prise_en_charge: "Arrivé récupération",
  colis_recupere: "Colis récupéré",
  passager_embarque: "Passager embarqué",
  pris_en_charge: "Pris en charge",
  en_livraison: "En livraison",
  arrivee: "Arrivé destination",
  livree: "Livrée",
  annulee: "Annulée",
};

// Familles visuelles pour les badges (plusieurs statuts partagent la même famille)
export const STATUS_BADGE = {
  nouvelle: { label: "Nouvelle", cls: "bg-blue-100 text-blue-700" },
  en_attente: { label: "En attente", cls: "bg-amber-100 text-amber-700" },
  programmee: { label: "Programmée", cls: "bg-indigo-100 text-indigo-700" },
  recherche_livreur: { label: "Recherche livreur", cls: "bg-orange-100 text-orange-700" },
  livreur_en_route: { label: "Livreur en route", cls: "bg-cyan-100 text-cyan-700" },
  client_contacte: { label: "Client contacté", cls: "bg-cyan-100 text-cyan-700" },
  en_route_expediteur: { label: "En route expéditeur", cls: "bg-cyan-100 text-cyan-700" },
  arrive_prise_en_charge: { label: "Arrivé récup.", cls: "bg-teal-100 text-teal-700" },
  colis_recupere: { label: "Récupéré", cls: "bg-teal-100 text-teal-700" },
  passager_embarque: { label: "Embarqué", cls: "bg-teal-100 text-teal-700" },
  pris_en_charge: { label: "Pris en charge", cls: "bg-teal-100 text-teal-700" },
  en_livraison: { label: "En livraison", cls: "bg-purple-100 text-purple-700" },
  arrivee: { label: "Arrivé destination", cls: "bg-violet-100 text-violet-700" },
  livree: { label: "Livrée", cls: "bg-emerald-100 text-emerald-700" },
  annulee: { label: "Annulée", cls: "bg-red-100 text-red-700" },
};

// Progression de la course (calculée depuis le statut réel — ne crée ni ne modifie aucune donnée)
export const PROGRESSION_STEPS = [
  { key: "created", label: "Créée" },
  { key: "search", label: "Recherche livreur" },
  { key: "assigned", label: "Livreur assigné" },
  { key: "pickup", label: "Récupération" },
  { key: "delivery", label: "Livraison" },
  { key: "done", label: "Terminée" },
];

// Retourne l'index (0-5) de l'étape de progression actuelle
export function getProgressionStep(course) {
  if (!course) return 0;
  const s = course.statut;
  if (s === "livree") return 5;
  if (["en_livraison", "arrivee"].includes(s)) return 4;
  if (["arrive_prise_en_charge", "colis_recupere", "passager_embarque", "pris_en_charge"].includes(s)) return 3;
  if (["livreur_en_route", "client_contacte", "en_route_expediteur"].includes(s)) return 2;
  if (["nouvelle", "en_attente", "recherche_livreur"].includes(s)) return 1;
  return 0; // created (default)
}