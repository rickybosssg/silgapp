export const GUEST_ACCESS_UNAVAILABLE = "L'accès à votre ancienne demande est refusé. Son suivi reste conservé sur cet appareil. Vous pouvez préparer une nouvelle commande ; le serveur vérifiera qu'aucune commande précédente n'est encore en cours.";

export async function readGuestStart(call, saved) {
  try {
    return await call('track', { request_id: saved.request_id, read_token: saved.read_token });
  } catch (error) {
    // A denial is not proof of expiry or cancellation. Never retry creation here.
    if (error?.code !== 'ACCESS_DENIED') throw error;
    return { accessUnavailable: true };
  }
}

export function nextGuestDraft(saved, latest, makeAccess, emptyDraft) {
  const { previous = [], ...last } = saved;
  if (previous.length >= 200) throw Error('La mémoire de suivi est pleine. Contactez le support sans effacer les données.');
  const archive = [...previous, { ...last, ...(latest.course?.reference ? { reference: latest.course.reference } : {}) }];
  // Keep the same device capability: the server's atomic active-attempt guard
  // must still prevent duplicates when the inaccessible request is active.
  return { ...makeAccess(saved.device_token), draft: { ...emptyDraft, confirmed: false }, draft_rejected: true, previous: archive };
}
