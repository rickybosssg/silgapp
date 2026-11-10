export const GUEST_ACCESS_UNAVAILABLE = "L'accès à votre ancienne demande est refusé. Son suivi reste conservé sur cet appareil. Vous pouvez préparer une nouvelle commande ; le serveur vérifiera les tentatives incertaines et les doublons.";

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
  const archive = [...previous, { ...last, ...(latest.course ? { last_course: latest.course } : {}), ...(latest.course?.reference ? { reference: latest.course.reference } : {}) }];
  // Keep the device capability and every independent per-course access.
  // Server reservation still rejects uncertain or duplicate active requests.
  return { ...makeAccess(saved.device_token), draft: { ...emptyDraft, confirmed: false }, draft_rejected: true, previous: archive };
}
