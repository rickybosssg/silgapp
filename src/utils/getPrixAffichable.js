/**
 * ─────────────────────────────────────────────────────────────────────────
 * getPrixAffichable — SOURCE DE VÉRITÉ UNIQUE pour l'affichage du prix
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Règle (figée) :
 *   1. manual_price      si pricing_mode === "manual" ET manual_price_status === "accepted"
 *   2. prix_final         si statut === "livree" ET prix_final > 0
 *   3. prix_propose_admin si > 0
 *   4. prix_estimate      si > 0
 *   5. null               (à afficher comme "—")
 *
 * ⚠️  Cette fonction ne fait que LIRE — elle ne modifie aucun champ en base,
 *     ne recalcule aucune commission, et ne touche pas au Dispatch V2.
 *
 * @param {object} course - L'objet CourseExterne
 * @returns {number|null} Le prix à afficher, ou null si indisponible.
 */
export function getPrixAffichable(course) {
  if (!course) return null;

  // 1. Prix manuel accepté = source de vérité absolue
  if (
    course.pricing_mode === "manual" &&
    course.manual_price_status === "accepted" &&
    Number(course.manual_price) > 0
  ) {
    return Number(course.manual_price);
  }

  // 2. Prix final si la course est livrée
  if (course.statut === "livree" && Number(course.prix_final) > 0) {
    return Number(course.prix_final);
  }

  // 3. Prix proposé par l'admin
  if (Number(course.prix_propose_admin) > 0) {
    return Number(course.prix_propose_admin);
  }

  // 4. Prix estimé
  if (Number(course.prix_estimate) > 0) {
    return Number(course.prix_estimate);
  }

  // 5. Aucun prix disponible
  return null;
}