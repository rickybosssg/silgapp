import { createGuestStore } from './guestOrderStore.js';
import { createGuestIndexedRegistry, base44GuestIndexRoots } from './guestIndexedRegistry.js';
import { failGuest } from './guestOrderPolicy.js';

export async function selectGuestStorage(api) {
  const legacy = createGuestStore(api);
  const control = await legacy.policy();
  let format;
  try { format = JSON.parse(control.grants || '[]'); } catch { failGuest('CONFIG_INVALID', 'Registre invite invalide.', 503); }
  if (Array.isArray(format)) return legacy;
  if (format?.format === 'guest-storage-frozen-v2') failGuest('TEMPORARILY_UNAVAILABLE', 'Maintenance du suivi en cours. Conservez votre tentative.', 503);
  if (format?.format !== 'guest-index-v2') failGuest('CONFIG_INVALID', 'Stockage invite inconnu.', 503);
  const entities = api.asServiceRole.entities;
  return createGuestIndexedRegistry({ roots: base44GuestIndexRoots(entities), pages: entities.GuestOrderStoragePage, policyStore: legacy });
}
