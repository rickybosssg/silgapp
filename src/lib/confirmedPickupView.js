const terminal = value => ['annulee', 'livree', 'terminee'].includes(value?.statut);
const picked = value => ['colis_recupere', 'en_livraison'].includes(value?.statut)
  && Boolean(value.heure_recuperation || value.pickup_confirmed_at);

// Only persisted pickup receipts can fence a late pre-pickup read.
export function reconcilePickupView(previous, next) {
  if (!previous || !next || previous.id !== next.id) return next;
  // An observed cancellation cannot be turned into a delivery by another read.
  if (next.statut === 'annulee' || next.annulation_user_id) return next;
  if (previous.statut === 'annulee' || previous.annulation_user_id) return previous;
  if (terminal(next)) return next;
  if (terminal(previous)) return previous;
  if (!picked(previous)) return next;
  // A genuinely newer assignment starts a new custody lifecycle.
  const acceptedBefore = Date.parse(previous.heure_acceptation || previous.accepted_at || '');
  const acceptedAfter = Date.parse(next.heure_acceptation || next.accepted_at || '');
  if (Number.isFinite(acceptedAfter) && Number.isFinite(acceptedBefore) && acceptedAfter > acceptedBefore) return next;
  const priorRevision = Date.parse(previous.updated_date || '');
  const nextRevision = Date.parse(next.updated_date || '');
  if (Number.isFinite(priorRevision) && Number.isFinite(nextRevision) && nextRevision > priorRevision &&
      previous.livreur_id !== next.livreur_id) return next;
  if (!picked(next)) return previous;
  const before = Date.parse(previous.updated_date), after = Date.parse(next.updated_date);
  if (Number.isFinite(before) && Number.isFinite(after) && after < before) return previous;
  if (previous.statut === 'en_livraison' && next.statut === 'colis_recupere') return previous;
  return next;
}

export function reconcilePickupRows(previous, next) {
  if (!Array.isArray(next)) return next;
  const byId = new Map((previous || []).map(course => [course.id, course]));
  return next.map(course => reconcilePickupView(byId.get(course.id), course));
}

export function pickupDisplayStatus(course, optimistic) {
  return picked(course) || terminal(course) || course.annulation_user_id
    ? course.statut : optimistic || course.statut;
}

// Merge independent reads by server revision, not completion/source order.
export function newestCourseRows(items = []) {
  const rows = new Map();
  for (const row of items.filter(Boolean)) {
    if (!row.id) continue;
    const previous = rows.get(row.id);
    const before = Date.parse(previous?.updated_date || previous?.created_date || '');
    const after = Date.parse(row.updated_date || row.created_date || '');
    if (previous && (previous.statut === 'annulee' || previous.annulation_user_id)) continue;
    if (row.statut === 'annulee' || row.annulation_user_id) { rows.set(row.id, row); continue; }
    if (!previous || (Number.isFinite(after) && Number.isFinite(before) && after > before) ||
        (!Number.isFinite(before) && !terminal(previous) && Number.isFinite(after)) ||
        ((!Number.isFinite(before) || !Number.isFinite(after) || after === before) && terminal(row) && !terminal(previous))) rows.set(row.id, row);
  }
  return [...rows.values()];
}
