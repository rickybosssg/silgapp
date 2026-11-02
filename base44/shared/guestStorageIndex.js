// Immutable compressed radix index. The caller commits the resulting head by CAS.
// No entity lists, deletion, leases or automatic retry of an ambiguous commit.
const SIZE = value => new TextEncoder().encode(JSON.stringify(value)).length;
const HASH = /^[a-f0-9]{64}$/;
const fail = () => { throw new Error('GUEST_INDEX_INVALID'); };
export function createGuestStorageIndex({ pages, scope, maxBytes = 4096 }) {
  if (!pages || !scope || !Number.isSafeInteger(maxBytes) || maxBytes < 1024) fail();
  const cache = new Map();
  async function digest(key) {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function read(id) {
    if (cache.has(id)) return cache.get(id);
    const row = await pages.get(id);
    if (!row || row.scope !== scope || typeof row.payload !== 'string' || new TextEncoder().encode(row.payload).length > maxBytes) fail();
    const node = JSON.parse(row.payload);
    if (node.kind === 'leaf') {
      if (typeof node.key !== 'string' || !HASH.test(node.hash) || await digest(node.key) !== node.hash || !Object.hasOwn(node, 'value')) fail();
    } else if (node.kind === 'branch') {
      if (typeof node.prefix !== 'string' || !/^[a-f0-9]{0,63}$/.test(node.prefix) || !node.children || Array.isArray(node.children)) fail();
      const pairs = Object.entries(node.children);
      if (pairs.length < 2 || pairs.length > 16 || pairs.some(([k, v]) => !/^[a-f0-9]$/.test(k) || typeof v !== 'string' || !v)) fail();
    } else fail();
    cache.set(id, node); return node;
  }
  async function save(node) {
    if (SIZE(node) > maxBytes) throw new Error('GUEST_INDEX_ITEM_TOO_LARGE');
    const row = await pages.create({ scope, payload: JSON.stringify(node) });
    if (typeof row?.id !== 'string' || !row.id) fail();
    cache.set(row.id, node); return row.id;
  }
  async function get(head, key) {
    const hash = await digest(key); let id = head, minimum = -1;
    while (id) {
      const node = await read(id);
      if (node.kind === 'leaf') return node.hash === hash && node.key === key ? structuredClone(node.value) : null;
      if (node.prefix.length <= minimum) fail();
      minimum = node.prefix.length;
      if (!hash.startsWith(node.prefix)) return null;
      id = node.children[hash[node.prefix.length]];
    }
    return null;
  }
  async function set(head, key, value) {
    const hash = await digest(key);
    const leaf = { kind: 'leaf', key, hash, value: structuredClone(value) };
    if (SIZE(leaf) > maxBytes) throw new Error('GUEST_INDEX_ITEM_TOO_LARGE');
    async function put(id, minimum = -1) {
      if (!id) return save(leaf);
      const node = await read(id);
      if (node.kind === 'leaf' && node.hash === hash) {
        if (node.key !== key) fail();
        return JSON.stringify(node.value) === JSON.stringify(value) ? id : save(leaf);
      }
      const path = node.kind === 'leaf' ? node.hash : node.prefix;
      if (node.kind === 'branch' && path.length <= minimum) fail();
      let common = 0;
      while (common < path.length && path[common] === hash[common]) common++;
      if (common < path.length) {
        const next = await save(leaf);
        return save({ kind: 'branch', prefix: hash.slice(0, common), children: { [path[common]]: id, [hash[common]]: next } });
      }
      if (node.kind !== 'branch') fail();
      const digit = hash[path.length];
      const child = await put(node.children[digit], path.length);
      if (child === node.children[digit]) return id;
      return save({ ...node, children: { ...node.children, [digit]: child } });
    }
    return put(head);
  }
  async function entries(head) {
    const result = [], visited = new Set();
    async function walk(id, minimum = -1) {
      if (!id) return;
      if (visited.has(id)) fail();
      visited.add(id);
      const node = await read(id);
      if (node.kind === 'leaf') { result.push([node.key, structuredClone(node.value)]); return; }
      if (node.prefix.length <= minimum) fail();
      for (const child of Object.values(node.children)) await walk(child, node.prefix.length);
    }
    await walk(head); return result;
  }
  return { get, set, entries };
}

export function createGuestIndexTransactions({ roots, pages, scope, maxBytes }) {
  return {
    async read(key) {
      const root = await roots.read();
      return createGuestStorageIndex({ pages, scope, maxBytes }).get(root.head, key);
    },
    async mutate(transform) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const root = await roots.read();
        if (!Number.isSafeInteger(root.revision)) fail();
        const index = createGuestStorageIndex({ pages, scope, maxBytes });
        const result = await transform({ get: key => index.get(root.head, key), root: structuredClone(root) });
        if (!result.writes?.length) return result.value;
        let head = root.head;
        for (const [key, value] of result.writes) head = await index.set(head, key, value);
        const receipt = await roots.compareAndSwap(root.revision, { head, revision: root.revision + 1 });
        if (receipt?.updated === 1) return result.value;
        if (receipt?.updated !== 0) throw new Error('GUEST_INDEX_COMMIT_UNCERTAIN');
      }
      throw new Error('GUEST_INDEX_CONCURRENT_UPDATE');
    },
  };
}
