// Only an explicit capability from a successful server config permits another active order.
export const GUEST_SINGLE_ORDER_NOTICE = 'Une course est encore active ou son état reste à vérifier. Ouvrez son suivi avant de recommander.';
export function canStartGuestOrder(config, entries = []) {
  return config?.enabled === true && (config.multi_orders_supported === true || entries.every(entry => ['annulee', 'livree', 'terminee'].includes(entry.last_course?.statut)));
}
export function assertGuestOrderCapability(config, entries) {
  if (!canStartGuestOrder(config, entries)) throw Object.assign(new Error(config?.enabled === true ? GUEST_SINGLE_ORDER_NOTICE : 'Les nouvelles commandes sans compte sont indisponibles. Les suivis existants restent accessibles.'), { code: 'GUEST_CAPABILITY_UNAVAILABLE', draftRejected: true });
}
