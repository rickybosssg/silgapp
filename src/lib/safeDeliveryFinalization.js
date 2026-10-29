import { normalizeCourseFunctionResult } from './courseFunctionResult.js';
import { withRequestDeadline } from './guestTrackingState.js';

const states = new WeakMap();
const statusOf = error => Number(error?.response?.status || error?.status);
const uncertainError = () => Object.assign(new Error('Résultat de livraison incertain. Actualisez avant de réessayer.'), { status: 408, code: 'DELIVERY_UNCERTAIN' });

function storedReceipt(row, id) {
  if (row?.id !== id || row.statut !== 'livree' || row.annulation_user_id ||
      !(row.heure_livraison || row.colis_livre_at) ||
      !['prix_final', 'commission_silga', 'montant_livreur'].every(key =>
        row[key] != null && row[key] !== '' && Number.isFinite(Number(row[key])) && Number(row[key]) >= 0)) return null;
  return { success: true, course: row, reconciled: true };
}

async function explainUnauthorized(api, original) {
  let message = 'Autorisation de livraison refusée. Votre session est conservée ; actualisez ou contactez le support.';
  let code = 'DELIVERY_UNAUTHORIZED';
  try {
    const user = await withRequestDeadline(api.auth.me(), 10000, 'Vérification de session indisponible.');
    if (!user?.id) message = 'Session non vérifiée. Aucune livraison confirmée ; réessayez la connexion manuellement.';
  } catch (error) {
    if (statusOf(error) === 401) {
      message = 'Votre session est refusée par le serveur. Reconnectez-vous avant de poursuivre.';
      code = 'REAUTH_REQUIRED';
    } else message = 'Vérification de session indisponible. Votre session est conservée ; aucune livraison confirmée.';
  }
  // A function 401 is never success and never a reason to erase credentials.
  return Object.assign(new Error(message), { status: 401, code, cause: original });
}

export function finaliserLivraisonSafe(api, payload) {
  if (!payload?.course_id) return Promise.reject(new Error('Course manquante.'));
  let courses = states.get(api);
  if (!courses) { courses = new Map(); states.set(api, courses); }
  let state = courses.get(payload.course_id);
  if (state?.pending) return state.pending;
  if (!state) { state = { pending: null, uncertain: false, settled: true }; courses.set(payload.course_id, state); }
  const read = () => withRequestDeadline(api.entities.CourseExterne.get(payload.course_id), 10000, 'Lecture de la livraison indisponible.');
  const operation = (async () => {
    if (state.uncertain) {
      const row = await read();
      const receipt = storedReceipt(row, payload.course_id);
      if (receipt) { state.uncertain = false; return receipt; }
      if (!state.settled || row?.id !== payload.course_id || ['annulee', 'livree', 'terminee'].includes(row.statut)) throw uncertainError();
    }
    state.settled = false;
    try {
      let request;
      try { request = Promise.resolve(api.functions.invoke('finaliserLivraisonLivreur', payload)); }
      catch (error) { state.settled = true; throw error; }
      request.then(() => { state.settled = true; }, () => { state.settled = true; });
      const raw = await withRequestDeadline(request, 30000, 'Résultat de livraison incertain. Actualisez avant de réessayer.');
      if (Number(raw?.status) >= 400) throw Object.assign(new Error('Requête de livraison refusée.'), { status: Number(raw.status) });
      const result = normalizeCourseFunctionResult(raw);
      if ((!result.success && !result.skipped) || (result.course_id && result.course_id !== payload.course_id) ||
          (result.course && (result.course.id !== payload.course_id || result.course.statut !== 'livree'))) {
        const body = raw?.data ?? raw;
        const refused = body && typeof body === 'object' && (body.success === false || typeof body.error === 'string');
        throw Object.assign(new Error(result.error || 'Livraison non confirmée.'), { code: refused ? 'DELIVERY_REFUSED' : 'DELIVERY_UNCERTAIN' });
      }
      state.uncertain = false;
      return raw;
    } catch (error) {
      const status = statusOf(error);
      if (status === 401) throw await explainUnauthorized(api, error);
      if (error.code === 'DELIVERY_REFUSED' || (status && status !== 408 && status < 500)) throw error;
      state.uncertain = true;
      try {
        const receipt = storedReceipt(await read(), payload.course_id);
        if (receipt) { state.uncertain = false; return receipt; }
      } catch { /* Retain uncertainty; do not repeat the write. */ }
      throw uncertainError();
    }
  })();
  state.pending = operation;
  operation.then(() => { state.pending = null; if (!state.uncertain) courses.delete(payload.course_id); }, () => { state.pending = null; });
  return operation;
}
