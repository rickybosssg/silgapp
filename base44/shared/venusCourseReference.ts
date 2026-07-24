/**
 * Génère une référence unique et cohérente pour une course SILGAPP.
 *
 * Format : SG-YYYYMMDD-XXXXXX
 * - YYYYMMDD : date de création de la course (pas la date du jour)
 * - XXXXXX   : dérivé des 6 derniers caractères hex de l'ID MongoDB (mod 1000000)
 *
 * DÉTERMINISTE : la même course produit toujours la même référence,
 * quel que soit le moment où la fonction est appelée (création, annulation,
 * suivi, affichage dashboard).
 *
 * Utilisée par :
 * - venusReasoningEngine (création de course via WhatsApp)
 * - webhookWhatsAppVenus (création + annulation via WhatsApp)
 * - envoyerSuiviWhatsApp (notifications de suivi)
 * - CourseDetailDialog (affichage dashboard)
 */
export function genererReferenceCourse(course: { id?: string; created_date?: string }): string {
  if (!course?.id) return 'SG-00000000-000000';

  const hexSuffix = course.id.replace(/-/g, '').slice(-6) || '000000';
  const numSuffix = String(parseInt(hexSuffix, 16) % 1000000).padStart(6, '0');

  const date = course.created_date ? new Date(course.created_date) : new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  return `SG-${yyyy}${mm}${dd}-${numSuffix}`;
}