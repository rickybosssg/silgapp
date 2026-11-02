import { GUEST_CONTROL_KEY, sha256 } from './guestOrderPolicy.js';
import { prepareGuestIndexMigration } from './guestIndexedRegistry.js';
import { createGuestStorageIndex } from './guestStorageIndex.js';
const FROZEN = 'guest-storage-frozen-v2';
const scope = 'guest-registry-v2';
const bytes = text => new TextEncoder().encode(text).length;
const invariant = (ok, code) => { if (!ok) throw new Error(code); };

export function guestStorageMigration(entities) {
  const pages = entities.GuestOrderStoragePage;
  async function root(name) {
    const rows = await entities[name].filter({ cle: GUEST_CONTROL_KEY }, 'created_date', 2);
    invariant(rows.length === 1 && Number.isSafeInteger(rows[0].revision), 'MIGRATION_ROOT_INVALID');
    return rows[0];
  }
  async function bulk(rows) {
    const saved = [];
    for (let i = 0; i < rows.length; i += 20) {
      const batch = rows.slice(i, i + 20);
      invariant(batch.every(r => bytes(r.payload) <= 4096), 'MIGRATION_PAGE_TOO_LARGE');
      const response = await pages.bulkCreate(batch);
      invariant(Array.isArray(response) && response.length === batch.length, 'MIGRATION_BULK_UNCERTAIN');
      const remaining = [...response];
      for (const expected of batch) {
        const position = remaining.findIndex(r => r.scope === expected.scope && r.payload === expected.payload && r.id);
        invariant(position >= 0, 'MIGRATION_BULK_CONTENT');
        saved.push(remaining.splice(position, 1)[0]);
      }
    }
    return saved;
  }
  async function fetchIds(ids) {
    const rows = new Map();
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const found = await pages.filter({ id: { $in: batch } }, 'created_date', 51);
      invariant(found.length === batch.length, 'MIGRATION_PAGES_MISSING');
      for (const row of found) { invariant(batch.includes(row.id), 'MIGRATION_PAGE_UNEXPECTED'); rows.set(row.id, row); }
    }
    return rows;
  }
  async function archive(value, kind) {
    const text = JSON.stringify(value), rows = [];
    for (let i = 0; i < text.length; i += 500) rows.push({ scope: `guest-backup-${kind}-v2`, payload: JSON.stringify({ text: text.slice(i, i + 500) }) });
    let ids = (await bulk(rows)).map(r => r.id);
    while (ids.length > 1) {
      const parents = [];
      for (let i = 0; i < ids.length; i += 64) parents.push({ scope: `guest-backup-${kind}-v2`, payload: JSON.stringify({ parts: ids.slice(i, i + 64) }) });
      ids = (await bulk(parents)).map(r => r.id);
    }
    const marker = { format: FROZEN, backup: ids[0], hash: await sha256(text), kind };
    invariant(JSON.stringify(await restore(marker)) === text, 'MIGRATION_BACKUP_VERIFY');
    return marker;
  }
  async function restore(marker) {
    invariant(marker?.format === FROZEN && marker.backup && marker.hash, 'MIGRATION_BACKUP_INVALID');
    let ids = [marker.backup]; const visited = new Set();
    for (let depth = 0; depth < 8; depth++) {
      invariant(ids.every(id => !visited.has(id)), 'MIGRATION_BACKUP_CYCLE'); ids.forEach(id => visited.add(id));
      const rows = await fetchIds(ids);
      const nodes = ids.map(id => {
        const row = rows.get(id); invariant(row.scope === `guest-backup-${marker.kind}-v2`, 'MIGRATION_BACKUP_SCOPE'); return JSON.parse(row.payload);
      });
      if (nodes.every(n => typeof n.text === 'string')) {
        const text = nodes.map(n => n.text).join('');
        invariant(await sha256(text) === marker.hash, 'MIGRATION_BACKUP_HASH');
        return JSON.parse(text);
      }
      invariant(nodes.every(n => Array.isArray(n.parts)), 'MIGRATION_BACKUP_TREE'); ids = nodes.flatMap(n => n.parts);
    }
    throw Error('MIGRATION_BACKUP_DEPTH');
  }
  async function freezeOne(name, field) {
    const current = await root(name), value = JSON.parse(current[field]);
    if (value?.format === FROZEN) { await restore(value); return value; }
    invariant(Array.isArray(value), 'MIGRATION_ALREADY_ACTIVE_OR_UNKNOWN');
    const marker = await archive(current, name);
    const result = await entities[name].updateMany({ id: current.id, revision: current.revision }, { $set: { [field]: JSON.stringify(marker), revision: current.revision + 1 } });
    invariant(result?.updated === 1, 'MIGRATION_FREEZE_CONFLICT');
    return marker;
  }
  async function inspect() {
    const registry = await root('GuestOrderRegistry'), control = await root('GuestOrderControl');
    const ledger = JSON.parse(registry.ledger), grants = JSON.parse(control.grants);
    return { registry: Array.isArray(ledger) ? 'legacy' : ledger.format, control: Array.isArray(grants) ? 'legacy' : grants.format,
      entries: Array.isArray(ledger) ? ledger.length : null, grants: Array.isArray(grants) ? grants.length : null,
      ledger_bytes: bytes(registry.ledger), grants_bytes: bytes(control.grants), enabled: control.enabled, countries: JSON.parse(control.countries) };
  }
  async function freeze() {
    // Fencing by non-array marker prevents legacy workers from acquiring new claims.
    // A claim won before this CAS is copied intact, so recovery never creates again.
    await freezeOne('GuestOrderRegistry', 'ledger');
    await freezeOne('GuestOrderControl', 'grants');
    return inspect();
  }
  async function migrate() {
    const registry = await root('GuestOrderRegistry'), control = await root('GuestOrderControl');
    const registryMarker = JSON.parse(registry.ledger), controlMarker = JSON.parse(control.grants);
    invariant(registryMarker.format === FROZEN && controlMarker.format === FROZEN, 'MIGRATION_NOT_FROZEN');
    const previousRegistry = await restore(registryMarker), previousControl = await restore(controlMarker);
    const entries = JSON.parse(previousRegistry.ledger), grants = JSON.parse(previousControl.grants);
    const memory = new Map(); let serial = 0;
    const inMemory = { create: async row => { const r = { ...row, id: `temporary-${++serial}` }; memory.set(r.id, r); return r; }, get: async id => memory.get(id) };
    const prepared = await prepareGuestIndexMigration({ entries, grants, pages: inMemory, now: Date.now() });
    const levels = new Map();
    function visit(id) {
      const row = memory.get(id), node = JSON.parse(row.payload);
      const depth = node.kind === 'leaf' ? 0 : 1 + Math.max(...Object.values(node.children).map(visit));
      if (!levels.has(depth)) levels.set(depth, new Map()); levels.get(depth).set(id, row);
      return depth;
    }
    if (prepared.head) visit(prepared.head);
    const idMap = new Map();
    for (const depth of [...levels.keys()].sort((a, b) => a - b)) {
      const group = [...levels.get(depth).entries()];
      const saved = await bulk(group.map(([, row]) => {
        const node = JSON.parse(row.payload);
        if (node.kind === 'branch') node.children = Object.fromEntries(Object.entries(node.children).map(([k, id]) => [k, idMap.get(id)]));
        return { scope, payload: JSON.stringify(node) };
      }));
      saved.forEach((row, i) => idMap.set(group[i][0], row.id));
    }
    const head = prepared.head ? idMap.get(prepared.head) : '';
    const reread = await fetchIds([...idMap.values()]);
    const expected = await createGuestStorageIndex({ pages: inMemory, scope }).entries(prepared.head);
    const actual = await createGuestStorageIndex({ pages: { get: async id => reread.get(id) }, scope }).entries(head);
    invariant(JSON.stringify(actual) === JSON.stringify(expected), 'MIGRATION_INDEX_VERIFY');
    const marker = { format: 'guest-index-v2', head, registry_backup: registryMarker, control_backup: controlMarker, migrated_at: new Date().toISOString() };
    const result = await entities.GuestOrderControl.updateMany({ id: control.id, revision: control.revision, grants: control.grants }, { $set: { grants: JSON.stringify(marker), revision: control.revision + 1 } });
    invariant(result?.updated === 1, 'MIGRATION_ACTIVATION_CONFLICT');
    const live = await root('GuestOrderControl');
    invariant(JSON.parse(live.grants).head === head, 'MIGRATION_ACTIVATION_UNCERTAIN');
    return { active: true, entries: entries.length, grants: grants.length, verified_keys: actual.length, pages: idMap.size, enabled: live.enabled, countries: JSON.parse(live.countries), courseWrites: 0 };
  }
  async function rollbackFrozen() {
    for (const [name, field] of [['GuestOrderControl', 'grants'], ['GuestOrderRegistry', 'ledger']]) {
      const current = await root(name), marker = JSON.parse(current[field]);
      if (Array.isArray(marker)) continue;
      invariant(marker.format === FROZEN, 'MIGRATION_ACTIVE_ROLLBACK_REFUSED');
      const previous = await restore(marker);
      const result = await entities[name].updateMany({ id: current.id, revision: current.revision }, { $set: { [field]: previous[field], revision: current.revision + 1 } });
      invariant(result?.updated === 1, 'MIGRATION_ROLLBACK_CONFLICT');
    }
    return inspect();
  }
  return { inspect, freeze, migrate, rollbackFrozen };
}
