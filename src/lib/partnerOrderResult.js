import { normalizeCourseFunctionResult } from './courseFunctionResult.js';

export function readPartnerOrderResult(response, { type, etablissementId, clientId, total }) {
  const body = normalizeCourseFunctionResult(response);
  if (body.error || body.success !== true || body.skipped) throw new Error(body.error || 'Commande non confirmée. Consultez vos commandes avant de réessayer.');
  const order = body.commande;
  const field = type === 'restaurant' ? 'restaurant_id' : 'boutique_id';
  if (!order?.id || !clientId || order.client_id !== clientId || order[field] !== etablissementId || !Number.isFinite(order.total) || order.total !== total) {
    throw new Error('Confirmation incohérente. Consultez vos commandes avant de réessayer.');
  }
  return order;
}
