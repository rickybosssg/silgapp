import { normalizeCourseFunctionResult } from './courseFunctionResult.js';

export function confirmedDeliverySnapshot(course, response) {
  const result = normalizeCourseFunctionResult(response);
  if ((!result.success && !result.skipped) ||
    (result.course_id && result.course_id !== course.id) ||
    (result.course?.id && result.course.id !== course.id) ||
    (result.course?.statut && result.course.statut !== 'livree') || result.course?.annulation_user_id) {
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

// Install the acknowledged delivery before refreshes; never replay a business call.
export async function commitConfirmedDeliveryView(queryClient, course, missionId) {
  if (!course?.id || course.statut !== 'livree' || course.annulation_user_id) throw new Error('Livraison non confirmée.');
  const keys = [['mes-courses-externes'], ...(missionId ? [['eco-mission-active-courses', missionId]] : [])];
  let cancellationSeen = false;
  for (const queryKey of keys) {
    await queryClient.cancelQueries({ queryKey });
    queryClient.setQueriesData({ queryKey }, rows => Array.isArray(rows)
      ? rows.map(row => {
        if (row.id !== course.id) return row;
        if (row.statut === 'annulee' || row.annulation_user_id) { cancellationSeen = true; return row; }
        return { ...row, ...course };
      }) : rows);
  }
  if (cancellationSeen) throw new Error('Course annulée. Actualisez avant de poursuivre.');
}
