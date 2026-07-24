/**
 * Génère une référence unique et cohérente pour une course SILGAPP.
 *
 * Format : SG-YYYYMMDD-XXXXXX
 *
 * DOIT rester identique à base44/shared/venusCourseReference.ts
 * (duplication car le frontend ne peut pas importer les modules Deno.)
 */
export function genererReferenceCourse(course) {
  if (!course?.id) return 'SG-00000000-000000';

  const hexSuffix = course.id.replace(/-/g, '').slice(-6) || '000000';
  const numSuffix = String(parseInt(hexSuffix, 16) % 1000000).padStart(6, '0');

  const date = course.created_date ? new Date(course.created_date) : new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  return `SG-${yyyy}${mm}${dd}-${numSuffix}`;
}