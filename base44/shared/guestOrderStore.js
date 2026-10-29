import { GUEST_CONTROL_KEY, failGuest, parseGuestLedger } from './guestOrderPolicy.js';

// Bounded pilot registry. No auto-provisioning, eviction, lease stealing or entity-wide access.
export function createGuestStore(api) {
  const entity = api.asServiceRole.entities.GuestOrderRegistry;
  const policyEntity = api.asServiceRole.entities.GuestOrderControl;
  async function read() {
    const rows = await entity.filter({ cle: GUEST_CONTROL_KEY }, 'created_date', 2);
    if (rows.length !== 1 || !Number.isSafeInteger(rows[0].revision)) failGuest('CONFIG_UNAVAILABLE', 'Commandes sans compte indisponibles.', 503);
    parseGuestLedger(rows[0]);
    return rows[0];
  }
  async function mutate(transform) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await read();
      const result = transform(current, parseGuestLedger(current));
      if (!result.patch) return result.value;
      const updated = await entity.updateMany({ id: current.id, revision: current.revision }, {
        $set: { ...result.patch, revision: current.revision + 1 },
      });
      if (Number(updated?.updated) === 1) return result.value;
    }
    return failGuest('CONCURRENT_UPDATE', 'Une opération est en cours. Réessayez sans changer votre commande.', 409);
  }
  async function policy() {
    const rows = await policyEntity.filter({ cle: GUEST_CONTROL_KEY }, 'created_date', 2);
    if (rows.length !== 1 || !Number.isSafeInteger(rows[0].revision)) failGuest('CONFIG_UNAVAILABLE', 'Réglage invité indisponible.', 503);
    return rows[0];
  }
  async function mutatePolicy(transform) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await policy();
      const result = transform(current);
      if (!result.patch) return result.value;
      const updated = await policyEntity.updateMany({ id: current.id, revision: current.revision }, { $set: { ...result.patch, revision: current.revision + 1 } });
      if (Number(updated?.updated) === 1) return result.value;
    }
    return failGuest('CONCURRENT_UPDATE', 'Réglage modifié simultanément. Réessayez.', 409);
  }
  return { read, mutate, policy, mutatePolicy };
}
