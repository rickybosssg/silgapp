import { pickupRecordedAt } from './deliveryRecap.js';
import { withRequestDeadline } from './guestTrackingState.js';

export const pickupRead = (api, courseId) => withRequestDeadline(api.entities.CourseExterne.get(courseId), 10000,
  'Lecture de la récupération indisponible. Actualisez avant de réessayer.');

export const pickupTransition = (api, payload) => withRequestDeadline(api.functions.invoke('transitionStatutLivreur', payload), 30000,
  'Résultat de récupération incertain. Vérifiez la course avant de réessayer.');

/** @returns {Promise<any>} */
export function optionalPickupPosition(geolocation, milliseconds = 5500) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => finish(null), milliseconds);
    try {
      if (!geolocation) return finish(null);
      geolocation.getCurrentPosition(position => finish(position.coords), () => finish(null), { enableHighAccuracy: true, timeout: 5000 });
    } catch { finish(null); }
  });
}

export async function recoverUncertainParcelPickup(api, courseId, error) {
  const status = Number(error?.response?.status || error?.status);
  // A business refusal or quota response is not permission to retry a write.
  if (status && status !== 408 && status < 500) throw error;
  try {
    const course = await pickupRead(api, courseId);
    if (!pickupRecordedAt(course)) throw error;
    return await readConfirmedParcelPickup(api, courseId, { success: true, course });
  } catch {
    throw error;
  }
}

export async function readConfirmedParcelPickup(api, courseId, result) {
  if (!result.success && !result.skipped) throw new Error(result.error || 'Récupération non confirmée. Actualisez.');
  let saved = result.course;
  if (!saved || !pickupRecordedAt(saved)) saved = await pickupRead(api, courseId);
  if (saved?.id !== courseId || !['colis_recupere', 'en_livraison'].includes(saved.statut) || saved.annulation_user_id) {
    throw new Error('La récupération ne peut pas être confirmée. Actualisez la course.');
  }
  if (!pickupRecordedAt(saved)) throw new Error('Récupération sans heure enregistrée. Actualisez ou contactez le support.');
  return saved;
}
