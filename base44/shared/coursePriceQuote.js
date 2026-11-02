// Matches getPrixAffichable; never estimates a missing amount.
export function courseQuotedPrice(c) {
  if (!c) return null;
  if (c.pricing_mode === 'manual' && c.manual_price_status === 'accepted' && Number(c.manual_price) > 0) return Number(c.manual_price);
  if (c.statut === 'livree' && Number(c.prix_final) > 0) return Number(c.prix_final);
  for (const key of ['prix_propose_client', 'prix_propose_admin', 'prix_estimate']) if (Number(c[key]) > 0) return Number(c[key]);
  return null;
}
export function displayedPriceQuote(c, amount = courseQuotedPrice(c)) {
  return { observed_price: amount, observed_price_revision: Number(c?.client_price_revision || 0) };
}
export function priceSnapshotFilter(c) {
  const filter = {};
  for (const key of ['prix_propose_client', 'prix_propose_admin', 'prix_estimate', 'prix_final', 'manual_price', 'manual_price_status', 'pricing_mode', 'client_price_revision']) {
    filter[key] = c[key] == null ? { $in: [null, ''] } : c[key];
  }
  return filter;
}
export function acceptancePriceGuard(c, input = {}, quotedAmount = courseQuotedPrice(c)) {
  const fail = (reason, error) => ({ ok: false, success: false, accepted: false, reason, error });
  if (!c) return fail('course_missing', 'Course indisponible.');
  if (c.client_decision_attendue || ['pending', 'publishing'].includes(c.client_relaunch_state)) return fail('client_decision_pending', 'Cette course attend une decision client. Actualisez.');
  const price = quotedAmount, revision = Number(c.client_price_revision || 0);
  const supplied = Object.hasOwn(input, 'observed_price');
  if (!supplied && revision > 0) return fail('price_confirmation_required', 'Le prix a change. Une version compatible est necessaire pour afficher puis confirmer ce prix.');
  if (supplied && (typeof input.observed_price !== 'number' || !Number.isFinite(input.observed_price) || input.observed_price !== price || Number(input.observed_price_revision) !== revision)) {
    return fail('price_changed', 'Le prix a change ou ne peut pas etre confirme. Actualisez la course puis confirmez le prix affiche.');
  }
  return { ok: true, filter: { ...priceSnapshotFilter(c), client_relaunch_state: { $nin: ['pending', 'publishing'] } },
    patch: { accepted_price: price, accepted_price_revision: revision, accepted_price_verified: supplied } };
}
