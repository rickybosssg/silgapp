import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/authPersistence.js', import.meta.url), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
function fixture(overrides = {}, timers = { setTimeout, clearTimeout }) {
  const storage = new Map(), operations = [], sdk = [], logouts = [];
  let native = null;
  const Preferences = {
    async get() { operations.push('get'); return { value: native }; },
    async set({ value }) { operations.push('set'); native = value; },
    async remove() { operations.push('remove'); native = null; }, ...overrides,
  };
  const module = { exports: {} }, document = { cookie: '' };
  const require = name => ({ '@capacitor/preferences': { Preferences },
    '@/api/base44Client': { base44: { setToken: value => sdk.push(value), auth: { logout: url => logouts.push(url) } } },
    '@/lib/nativeSocialAuth': { cancelPendingNativeSocialAuth() {} },
    '@/lib/notifications': { resetNotificationSession() { operations.push('clear-push-session'); } } })[name];
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports, require, document,
    localStorage: { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key), removeItem: key => storage.delete(key) },
    console: { log() {} }, ...timers });
  return { api: module.exports, Preferences, storage, operations, sdk, logouts, document, get native() { return native; } };
}

function controlledTimers() {
  let callback, duration, cleared = 0;
  const handle = {};
  return { setTimeout(fn, ms) { callback = fn; duration = ms; return handle; },
    clearTimeout(value) { assert.equal(value, handle); cleared++; },
    fire() { assert.equal(duration, 15000); callback(); }, get cleared() { return cleared; } };
}

test('logout waits for an already-started native write and removes its result before SDK navigation', async () => {
  const write = deferred(), calls = [];
  const f = fixture({ async set() { calls.push('set-start'); await write.promise; calls.push('set-end'); },
    async remove() { calls.push('remove'); } });
  f.api.persistToken('SYNTHETIC_OLD_SESSION'); await flush();
  const logout = f.api.logoutPersistent('/after'); await flush();
  assert.deepEqual(calls, ['set-start']); assert.equal(f.logouts.length, 0); assert.equal(f.storage.size, 0);
  write.resolve(); await logout;
  assert.deepEqual(calls, ['set-start', 'set-end', 'remove']); assert.deepEqual(f.logouts, ['/after']);
});

test('a queued obsolete write is skipped and a newer account persists after logout removal', async () => {
  const read = deferred(), writes = [], f = fixture({ get: () => read.promise,
    async set({ value }) { writes.push(value); } });
  const restore = f.api.syncTokenFromPreferences(); await flush();
  f.api.persistToken('SYNTHETIC_OLD_SESSION'); const clear = f.api.clearPersistedToken();
  f.api.persistToken('SYNTHETIC_NEW_SESSION'); read.resolve({ value: 'SYNTHETIC_RESTORED_SESSION' });
  assert.equal(await restore, null); await clear; await flush();
  assert.deepEqual(writes, ['SYNTHETIC_NEW_SESSION']); assert.equal(f.storage.get('base44_access_token'), 'SYNTHETIC_NEW_SESSION');
});

test('a read delayed across logout cannot resurrect a cookie or native session', async () => {
  const read = deferred(), f = fixture({ get: () => read.promise });
  const restore = f.api.syncTokenFromPreferences(); await flush();
  const removal = f.api.clearPersistedToken(); f.document.cookie = 'silgapp_auth_token=SYNTHETIC_OLD_SESSION';
  assert.equal(f.api.restoreTokenFromCookie(), null);
  read.resolve({ value: 'SYNTHETIC_OLD_SESSION' }); assert.equal(await restore, null); await removal;
  assert.equal(f.storage.size, 0); assert.equal(f.sdk.length, 0);
});

test('a read delayed across account replacement cannot overwrite the newer session', async () => {
  const read = deferred(), f = fixture({ get: () => read.promise });
  const restore = f.api.syncTokenFromPreferences(); await flush();
  const before = f.api.getAuthSessionGeneration(); f.api.persistToken('SYNTHETIC_NEW_SESSION');
  assert.notEqual(f.api.getAuthSessionGeneration(), before);
  read.resolve({ value: 'SYNTHETIC_OLD_SESSION' }); assert.equal(await restore, null); await flush();
  assert.deepEqual(f.sdk, ['SYNTHETIC_NEW_SESSION']); assert.equal(f.native, 'SYNTHETIC_NEW_SESSION');
});

test('failed durable removal refuses SDK logout navigation and does not poison later operations', async () => {
  let failed = true;
  const timers = controlledTimers(), f = fixture({ async remove() { if (failed) throw Error('SYNTHETIC_STORAGE_FAILURE'); } }, timers);
  await assert.rejects(f.api.logoutPersistent(), error => error.code === 'AUTH_LOGOUT_UNCONFIRMED' &&
    !error.message.includes('SYNTHETIC_STORAGE_FAILURE'));
  assert.equal(f.logouts.length, 0); assert.equal(timers.cleared, 1);
  failed = false; await f.api.logoutPersistent('/retry'); assert.deepEqual(f.logouts, ['/retry']);
  assert.equal(timers.cleared, 2);
  f.api.persistToken('SYNTHETIC_NEW_SESSION'); await flush(); assert.equal(f.native, 'SYNTHETIC_NEW_SESSION');
});

test('a hung removal times out without navigation and remains ahead of a newer session until its true completion', async () => {
  const timers = controlledTimers(), late = deferred(), f = fixture({}, timers);
  f.api.persistToken('SYNTHETIC_OLD_SESSION'); await flush();
  const remove = f.Preferences.remove;
  f.Preferences.remove = async () => { await late.promise; await remove(); };
  const logout = f.api.logoutPersistent('/old');
  const rejected = assert.rejects(logout, error => error.code === 'AUTH_LOGOUT_UNCONFIRMED');
  await flush(); timers.fire(); await rejected;
  assert.equal(timers.cleared, 1); assert.equal(f.logouts.length, 0);
  f.api.persistToken('SYNTHETIC_NEW_SESSION'); await flush();
  // The newer session is visible in memory but its native write must remain
  // queued: otherwise the old delayed remove would erase it on completion.
  assert.equal(f.storage.get('base44_access_token'), 'SYNTHETIC_NEW_SESSION');
  assert.equal(f.native, 'SYNTHETIC_OLD_SESSION');
  assert.deepEqual(f.operations, ['set', 'clear-push-session']);
  late.resolve(); await flush();
  assert.deepEqual(f.operations, ['set', 'clear-push-session', 'remove', 'set']);
  assert.equal(f.native, 'SYNTHETIC_NEW_SESSION'); assert.equal(f.logouts.length, 0);
});

test('normal startup still restores a native session into all historical SDK keys', async () => {
  const f = fixture({ get: async () => ({ value: 'SYNTHETIC_COLD_SESSION' }) });
  assert.equal(await f.api.syncTokenFromPreferences(), 'SYNTHETIC_COLD_SESSION');
  assert.equal(f.storage.size, 4); assert.deepEqual(f.sdk, ['SYNTHETIC_COLD_SESSION']);
});

test('a newer login during durable removal prevents the older logout from navigating', async () => {
  const removal = deferred(), f = fixture({ remove: () => removal.promise });
  const logout = f.api.logoutPersistent('/old'); await flush();
  f.api.persistToken('SYNTHETIC_NEW_SESSION'); removal.resolve(); await logout; await flush();
  assert.equal(f.logouts.length, 0); assert.equal(f.native, 'SYNTHETIC_NEW_SESSION');
});

test('application logout entry points use the durable helper without bypassing it before navigation', () => {
  const files = ['src/components/auth/AuthGate.jsx', 'src/components/auth/BlockedLivreurScreen.jsx',
    'src/components/client/ProfilModal.jsx', 'src/components/livreur/LivreurMesInfosModal.jsx',
    'src/components/layout/Sidebar.jsx', 'src/components/layout/MobileNav.jsx',
    'src/pages/LivreurApp.jsx', 'src/pages/PartenaireDashboard.jsx',
    'src/pages/ClientExterneApp.jsx', 'src/pages/LivreurExterneApp.jsx',
    'src/pages/EntrepriseApp.jsx', 'src/components/enterprise/EnterpriseLayout.jsx'];
  for (const file of files) {
    const text = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.equal(/\bbase44\.auth\.logout\s*\(|\bclearPersistedToken\s*\(/.test(text), false, file + ': direct logout bypass');
    const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let count = 0;
    const visit = node => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'logoutPersistent') {
        count++;
        if (!ts.isAwaitExpression(node.parent)) {
          // A concise async-safe handler may return helper.catch(...); it has no
          // subsequent reload or navigation that can race durable removal.
          const access = node.parent, caught = access.parent, handler = caught.parent;
          assert.ok(ts.isPropertyAccessExpression(access) && access.name.text === 'catch' &&
            ts.isCallExpression(caught) && ts.isArrowFunction(handler) && handler.body === caught,
          file + ': logout completion must be awaited or returned with error handling');
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree); assert.ok(count > 0, file + ': durable logout missing');
  }
});
