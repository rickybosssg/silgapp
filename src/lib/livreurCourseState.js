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

export function normalizeFourDigitPin(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\D/g, "")
    .slice(0, 4);
}
