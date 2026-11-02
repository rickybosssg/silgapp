import { createGuestIndexTransactions, createGuestStorageIndex } from './guestStorageIndex.js';
import { failGuest, sha256, guestCreationEnabled, GUEST_CONTROL_KEY } from './guestOrderPolicy.js';

const identityMatches = (a, b) => ['read_hash', 'action_hash', 'device_hash', 'fingerprint'].every(k => a[k] === b[k]);
const recent = (rows, now) => rows.filter(at => Number.isFinite(Date.parse(at)) && now - Date.parse(at) < 3600000);
const scope = 'guest-registry-v2';

// roots.read/compareAndSwap must use the SAME control revision as ON/OFF changes.
// Only attach this adapter after the frozen legacy migration has been verified.
export function createGuestIndexedRegistry({ roots, pages, now = () => Date.now(), policyStore }) {
  const tx = createGuestIndexTransactions({ roots, pages, scope });
  const findEntry = requestId => tx.read(`request:${requestId}`);
  async function deviceEntries(deviceHash) {
    const ids = await tx.read(`device:${deviceHash}`) || [];
    const entries = [];
    for (const id of ids) {
      const entry = await findEntry(id);
      if (!entry || entry.device_hash !== deviceHash) throw Error('GUEST_INDEX_DEVICE_INVALID');
      if (!entry.closed_at) entries.push(entry);
    }
    return entries;
  }
  async function changeEntry(requestId, change) {
    return tx.mutate(async ({ get }) => {
      const entry = await get(`request:${requestId}`);
      if (!entry) failGuest('NOT_FOUND', 'Commande introuvable.', 404);
      const next = structuredClone(entry);
      await change(next);
      if (next.request_id !== entry.request_id || next.device_hash !== entry.device_hash) throw Error('GUEST_INDEX_IDENTITY_CHANGED');
      const writes = [[`request:${requestId}`, next]];
      if (next.closed_at && !entry.closed_at) {
        const active = await get(`device:${entry.device_hash}`) || [];
        writes.push([`device:${entry.device_hash}`, active.filter(id => id !== requestId)]);
      }
      return { writes, value: null };
    });
  }
  async function reserve(entry, priorControl) {
    const phoneKey = `phone:${entry.country_code}:${await sha256(entry.phone)}`;
    return tx.mutate(async ({ get, root }) => {
      const previous = await get(`request:${entry.request_id}`);
      if (previous) {
        if (!identityMatches(previous, entry)) failGuest('REQUEST_CONFLICT', 'Tentative incompatible.', 409);
        return { value: false };
      }
      if (!guestCreationEnabled({ ...root, grants: '[]' }) || root.countries !== priorControl.countries) failGuest('DISABLED', 'Les nouvelles commandes sans compte ne sont plus disponibles.', 403);
      const grant = await get(`grant:${entry.request_id}`);
      if (grant && !identityMatches(grant, entry)) failGuest('REQUEST_CONFLICT', 'Tentative incompatible.', 409);
      const active = await get(`device:${entry.device_hash}`) || [];
      if (active.length) failGuest('DEVICE_LIMIT', 'Une commande est deja en cours sur cet appareil. Retrouvez son suivi.', 409);
      const instant = now();
      const phone = recent(await get(phoneKey) || [], instant);
      const countryKey = `country:${entry.country_code}`;
      const country = recent(await get(countryKey) || [], instant);
      if (phone.length >= 10 || (!grant && country.length >= 30)) failGuest('RATE_LIMIT', 'Trop de demandes. Reessayez plus tard ou contactez le support.', 429);
      const stamp = new Date(instant).toISOString();
      const writes = [[`request:${entry.request_id}`, entry], [`device:${entry.device_hash}`, [entry.request_id]], [phoneKey, [...phone, stamp]]];
      if (!grant) writes.push([`grant:${entry.request_id}`, { request_id: entry.request_id, fingerprint: entry.fingerprint, read_hash: entry.read_hash, action_hash: entry.action_hash, device_hash: entry.device_hash, country_code: entry.country_code, at: stamp }], [countryKey, [...country, stamp]]);
      return { writes, value: true };
    });
  }
  async function allEntries() {
    const root = await roots.read();
    const entries = await createGuestStorageIndex({ pages, scope }).entries(root.head);
    return entries.filter(([key]) => key.startsWith('request:')).map(([, value]) => value);
  }
  async function mutate(transform) {
    // Compatibility for server callers still using a ledger transform (chat).
    // Order creation and tracking never use this full-snapshot compatibility path.
    return tx.mutate(async ({ root }) => {
      const index = createGuestStorageIndex({ pages, scope });
      const pairs = (await index.entries(root.head)).filter(([key]) => key.startsWith('request:'));
      const ledger = pairs.map(([, value]) => structuredClone(value));
      const result = transform({ ledger: JSON.stringify(ledger) }, ledger);
      if (!result.patch) return { value: result.value };
      if (Object.keys(result.patch).some(key => key !== 'ledger')) throw Error('GUEST_INDEX_PATCH_INVALID');
      const next = JSON.parse(result.patch.ledger);
      if (next.length !== pairs.length || new Set(next.map(e => e.request_id)).size !== pairs.length) throw Error('GUEST_INDEX_PATCH_INVALID');
      const original = new Map(pairs);
      const writes = [];
      for (const entry of next) {
        const key = `request:${entry.request_id}`, old = original.get(key);
        if (!old || old.device_hash !== entry.device_hash || old.closed_at !== entry.closed_at) throw Error('GUEST_INDEX_PATCH_INVALID');
        if (JSON.stringify(old) !== JSON.stringify(entry)) writes.push([key, entry]);
      }
      return { writes, value: result.value };
    });
  }
  return { findEntry, deviceEntries, changeEntry, reserve, allEntries,
    mutate,
    policy: async () => ({ ...await roots.read(), grants: '[]' }),
    mutatePolicy: transform => policyStore.mutatePolicy(transform) };
}

export function base44GuestIndexRoots(entities) {
  async function read() {
    const rows = await entities.GuestOrderControl.filter({ cle: GUEST_CONTROL_KEY }, 'created_date', 2);
    let manifest;
    try { manifest = JSON.parse(rows[0]?.grants || 'null'); } catch { manifest = null; }
    if (rows.length !== 1 || manifest?.format !== 'guest-index-v2' || !Number.isSafeInteger(rows[0].revision) || typeof manifest.head !== 'string') {
      failGuest('CONFIG_UNAVAILABLE', 'Stockage invite non migre.', 503);
    }
    return { ...rows[0], head: manifest.head || null, manifest };
  }
  return { read, async compareAndSwap(revision, next) {
    const root = await read();
    if (root.revision !== revision) return { updated: 0 };
    return entities.GuestOrderControl.updateMany({ id: root.id, revision, grants: root.grants }, {
      $set: { grants: JSON.stringify({ ...root.manifest, head: next.head }), revision: revision + 1 },
    });
  } };
}

// Preparation only: never changes a live root, settings, courses or old records.
export async function prepareGuestIndexMigration({ entries, grants, pages, now }) {
  const index = createGuestStorageIndex({ pages, scope });
  const values = new Map(), devices = new Map(), phones = new Map(), countries = new Map();
  for (const entry of entries) {
    const key = `request:${entry.request_id}`;
    if (values.has(key)) throw Error('GUEST_MIGRATION_DUPLICATE');
    values.set(key, entry);
    if (!entry.closed_at) devices.set(entry.device_hash, [...devices.get(entry.device_hash) || [], entry.request_id]);
    if (recent([entry.created_at], now).length) {
      const phone = `${entry.country_code}:${await sha256(entry.phone)}`;
      phones.set(phone, [...phones.get(phone) || [], entry.created_at]);
    }
  }
  for (const grant of grants) {
    const key = `grant:${grant.request_id}`;
    if (values.has(key)) throw Error('GUEST_MIGRATION_DUPLICATE');
    const entry = values.get(`request:${grant.request_id}`);
    if (entry && !identityMatches(entry, grant)) throw Error('GUEST_MIGRATION_CONFLICT');
    values.set(key, grant);
    if (recent([grant.at], now).length) countries.set(grant.country_code, [...countries.get(grant.country_code) || [], grant.at]);
  }
  for (const [key, ids] of devices) values.set(`device:${key}`, ids);
  for (const [key, dates] of phones) values.set(`phone:${key}`, dates);
  for (const [key, dates] of countries) values.set(`country:${key}`, dates);
  let head = null;
  for (const [key, value] of values) head = await index.set(head, key, value);
  // Read back every migrated value; this is offline work, not a request-time scan.
  for (const [key, value] of values) {
    if (JSON.stringify(await index.get(head, key)) !== JSON.stringify(value)) throw Error('GUEST_MIGRATION_VERIFY_FAILED');
  }
  return { head, entries: entries.length, grants: grants.length, keys: values.size };
}
