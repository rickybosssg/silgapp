export const ACTIVE_LIVREUR_COURSE_STATUSES = new Set([
  "livreur_en_route",
  "client_contacte",
  "en_route_expediteur",
  "arrive_prise_en_charge",
  "colis_recupere",
  "passager_embarque",
  "pris_en_charge",
  "en_livraison",
  "arrivee",
  "acceptee",
]);

export function sameLivreurId(value, livreurId) {
  return value != null && livreurId != null && String(value) === String(livreurId);
}

export function listIncludesLivreur(value, livreurId) {
  if (!value || !livreurId) return false;
  if (Array.isArray(value)) return value.some((id) => sameLivreurId(id, livreurId));
  if (typeof value !== "string") return false;

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.some((id) => sameLivreurId(id, livreurId));
  } catch (_) {}

  return value.split(/[,\s]+/).some((id) => sameLivreurId(id, livreurId));
}

export function isCourseAssignedToLivreur(course, livreurId) {
  if (!course || !livreurId) return false;
  return (
    sameLivreurId(course.livreur_id, livreurId) ||
    sameLivreurId(course.accepted_by_livreur_id, livreurId) ||
    sameLivreurId(course.proposed_by_livreur_id, livreurId) ||
    sameLivreurId(course.proposed_livreur_id, livreurId)
  );
}

export function isCourseAcceptedByLivreur(course, livreurId) {
  if (!course || !livreurId) return false;
  return (
    sameLivreurId(course.livreur_id, livreurId) ||
    sameLivreurId(course.accepted_by_livreur_id, livreurId)
  );
}

// ── Statuts terminaux : la course n'est plus active opérationnellement ──
// Pour ces statuts, livreur_financier_id est accepté comme fallback d'ownership
// afin de récupérer les courses livrées dont livreur_id a été vidé par le passé
// (bug nettoyageMatinal, désormais corrigé côté source).
// Pour les courses ACTIVES (non terminales), livreur_financier_id n'est JAMAIS
// utilisé comme critère d'ownership — cela protégerait le redispatch.
const TERMINAL_COURSE_STATUSES = new Set(["livree", "annulee", "completed", "delivered", "canceled"]);

export function isCourseHistoricallyOwnedByLivreur(course, livreurId) {
  if (!course || !livreurId) return false;
  // Pour les courses terminales uniquement : accepter livreur_financier_id comme fallback
  if (!TERMINAL_COURSE_STATUSES.has(course.statut)) return false;
  return sameLivreurId(course.livreur_financier_id, livreurId);
}

export function normalizeFourDigitPin(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\D/g, "")
    .slice(0, 4);
}