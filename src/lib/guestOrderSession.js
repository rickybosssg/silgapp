import { reconcileGuestCourse } from './guestTrackingState.js';

let queue = Promise.resolve();
export function withGuestSessionLock(work, nativeSingleView = false) {
  // Web Locks coordinate tabs; the queue covers native single-WebView sessions.
  if (globalThis.navigator?.locks?.request) return navigator.locks.request('silgapp-guest-orders-v1', work);
  if (!nativeSingleView) return Promise.reject(Object.assign(new Error('Ce navigateur ne permet pas de protéger les commandes entre plusieurs onglets. Utilisez l’application SILGAPP ou un navigateur récent.'), { code: 'SESSION_LOCK_UNAVAILABLE' }));
  const result = queue.then(work, work);
  queue = result.catch(() => {});
  return result;
}

export const guestSessionTransaction = (storage, work) => storage.transaction ? storage.transaction(work) : work();

export function guestSavedEntries(saved) {
  if (!saved) return [];
  const { previous = [], ...current } = saved;
  return [...previous, ...(current.draft_rejected ? [] : [current])];
}

export function guestSessionReceipt(saved, requestId, result) {
  if (!saved || !result?.course) return saved;
  const update = entry => entry.request_id !== requestId ? entry : {
    ...entry, ...(Number.isFinite(Date.parse(result.expires_at)) ? { expires_at: result.expires_at } : {}),
    reference: result.course.reference || entry.reference,
    last_course: reconcileGuestCourse(entry.last_course, result.course),
  };
  return { ...update(saved), previous: (saved.previous || []).map(update) };
}

export async function rememberGuestReceipt(storage, requestId, result) {
  return guestSessionTransaction(storage, async () => {
    const saved = await storage.read();
    const next = guestSessionReceipt(saved, requestId, result);
    if (next) await storage.save(next);
    return next;
  });
}
