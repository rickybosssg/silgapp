const terminal = value => ['annulee', 'livree', 'terminee'].includes(value?.statut);
const picked = value => ['colis_recupere', 'en_livraison'].includes(value?.statut)
  && Boolean(value.heure_recuperation || value.pickup_confirmed_at);

// Only persisted pickup receipts can fence a late pre-pickup read.
export function reconcilePickupView(previous, next) {
  if (!previous || !next || previous.id !== next.id) return next;
  if (terminal(next) || next.annulation_user_id) return next;
  if (terminal(previous)) return previous;
  if (!picked(previous)) return next;
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
