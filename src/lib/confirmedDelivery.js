import { normalizeCourseFunctionResult } from './courseFunctionResult.js';

export function confirmedDeliverySnapshot(course, response) {
  const result = normalizeCourseFunctionResult(response);
  if ((!result.success && !result.skipped) ||
    (result.course_id && result.course_id !== course.id) ||
    (result.course?.id && result.course.id !== course.id) ||
    result.course?.statut === 'annulee') {
    throw new Error(result.error || 'Livraison non confirmée. Actualisez la course.');
  }
  const row = result.course?.id === course.id ? result.course : {};
  return { ...course, ...row, statut: 'livree',
    prix_final: result.prix_final ?? row.prix_final ?? course.prix_final ?? null,
    commission_silga: result.commission_silga ?? row.commission_silga ?? course.commission_silga ?? null,
    montant_livreur: result.montant_livreur ?? row.montant_livreur ?? course.montant_livreur ?? null,
    heure_livraison: result.heure_livraison ?? row.heure_livraison ?? course.heure_livraison ?? null,
  };
}
