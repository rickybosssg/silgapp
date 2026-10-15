// Local compatibility only: real coordinator + HTTP transport + server service +
// JS secure-store adapter. CAS, vault, browser context and native bridge are MOCKS.
// The fetcher returns Response.json in-process; no fetch/network/provider/device.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { createNativeOAuthHandoffService } from '../base44/shared/nativeOAuthHandoff.js';
import { createNativeSocialAuthTransport } from '../src/lib/nativeSocialAuthTransport.js';
import { NATIVE_SOCIAL_READINESS, availableNativeSocialProviders } from '../src/lib/nativeSocialAuth.js';

const APP = 'fixture-app', RETURN = 'silgapp://auth-callback';
const ORIGIN = 'https://fixture.invalid', PATH = '/native/start';
const ENDPOINT = ORIGIN + '/api/apps/' + APP + '/functions/fixtureHandoff';
const TOKEN = 'FAKE_INTEGRATED_BASE44_SESSION_ONLY';
const USER = Object.freeze({ id: 'fixture-user', app_id: APP, disabled: false });
const READY = Object.freeze({ serverHandoffVerified: true, singleUseStoreVerified: true,
  browserBindingVerified: true, protectedPendingStoreVerified: true, resumeClaimVerified: true,
  devices: { ios: true, android: true }, providers: { google: true, apple: true } });
const hash = value => createHash('sha256').update(value).digest('base64url');
const clone = value => structuredClone(value);
const receipt = (field, count) => ({ success: true, outcome: 'confirmed', has_more: false, [field]: count });
const active = [];
let importCounter = 0;
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
async function freshCore() { return import('../src/lib/nativeSocialAuth.js?handoff-integration-' + (++importCounter)); }
async function flush() { for (let index = 0; index < 60; index++) await Promise.resolve(); }
afterEach(async () => {
  for (const f of active.splice(0)) {
    for (const core of f.cores) core.cancelPendingNativeSocialAuth();
    for (const controller of f.controllers) await controller.dispose();
  }
});

function actualSecureStoreFactory() {
  const module = { exports: {} };
  const compiled = ts.transpileModule(read('src/lib/nativeAuthSecureStore.js'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports,
    require: name => {
      assert.equal(name, '@capacitor/core');
      return { Capacitor: {}, registerPlugin: () => assert.fail('No real native bridge registration') };
    }, Object, Reflect, Array, Number, String, Set, Promise, TextEncoder, Date, JSON, Error });
  return module.exports.createNativeAuthSecureStore;
}

async function fixture(platform = 'ios') {
  let clientTime = 1000000, serverTime = 1000000, entropy = 0, pending = null;
  const rows = new Map(), envelopes = new Map(), wire = [], bridgeCalls = [], commits = [], order = [], control = {};
  const counts = { claim: 0, issue: 0, verify: 0, open: 0 };
  const bindingContext = Object.freeze({ syntheticBrowserBindingOnly: true });
  const core = await freshCore(), cores = [core], controllers = [];
  const fakeCrypto = { getRandomValues(bytes) { bytes.fill(++entropy); return bytes; }, subtle: webcrypto.subtle };
  const store = {
    capabilities: { uniqueAppTransaction: true, atomicCompareAndSet: true, immutableIssuedBindings: true, serverOnly: true },
    async insertUnique({ app_id, transaction, record }) {
      const key = app_id + ':' + transaction;
      if (rows.has(key)) return receipt('inserted', 0);
      rows.set(key, clone(record)); return receipt('inserted', 1);
    },
    async readUnique({ app_id, transaction }) {
      const row = rows.get(app_id + ':' + transaction);
      return { success: true, outcome: 'confirmed', has_more: false, rows: row ? [clone(row)] : [] };
    },
    async compareAndSet({ where, set }) {
      counts[set.status === 'issued' ? 'issue' : 'claim']++;
      const row = rows.get(where.app_id + ':' + where.transaction);
      const { not_expired_at, ...equalities } = where;
      if (!row || row.expires_at <= not_expired_at || row.expires_at <= serverTime ||
          !Object.entries(equalities).every(([field, value]) => row[field] === value)) return receipt('updated', 0);
      // Mock-process atomic section only. No platform distributed claim asserted.
      Object.assign(row, clone(set)); return receipt('updated', 1);
    },
  };
  const service = createNativeOAuthHandoffService({ enabled: true, appId: APP, browserOrigin: ORIGIN,
    browserPath: PATH, returnUrl: RETURN, now: () => serverTime, crypto: fakeCrypto, store,
    browser: { capabilities: { authenticatedAppIdentity: true, transactionBinding: true, csrfContinuity: true },
      async verifyCompletion({ context, transaction }) {
        assert.equal(context, bindingContext, 'synthetic binding adapter must approve context');
        return { authenticated: true, csrf_verified: true, transaction_bound: true,
          app_id: APP, user_id: USER.id, access_token: TOKEN, provider: transaction.provider,
          transaction: transaction.transaction, state_hash: hash(transaction.state), challenge: transaction.challenge,
          return_url: transaction.return_url, expires_at: transaction.expires_at, browser_binding: 'b'.repeat(43) };
      } },
    vault: { capabilities: { authenticatedSealing: true, contextBinding: true },
      async seal({ payload, context }) {
        const sealed = 'MOCK_INTEGRATION_ENVELOPE_' + envelopes.size;
        envelopes.set(sealed, { payload: clone(payload), context: JSON.stringify(context) }); return sealed;
      },
      async open({ sealed, context }) {
        counts.open++;
        const envelope = envelopes.get(sealed);
        assert.equal(envelope.context, JSON.stringify(context), 'mock authenticated context');
        return clone(envelope.payload);
      } },
  });
  const plugin = {
    async setPending(input) { bridgeCalls.push(['setPending', input.appId]); pending = input.value; },
    async getPending(input) { bridgeCalls.push(['getPending', input.appId]); return { value: pending }; },
    async removePending(input) {
      bridgeCalls.push(['removePending', input.appId]);
      if (pending && JSON.parse(pending).id === input.id) pending = null;
    },
    async clearPending(input) { bridgeCalls.push(['clearPending', input.appId]); pending = null; },
  };
  const pendingStore = actualSecureStoreFactory()({ appId: APP,
    capacitor: { isNativePlatform: () => true, getPlatform: () => platform, isPluginAvailable: () => true },
    plugin, now: () => clientTime });
  const fetcher = async (url, options) => {
    assert.equal(url, ENDPOINT); assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store'); assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.headers['X-App-Id'], APP);
    assert.equal(Object.hasOwn(options.headers, 'Authorization'), false);
    const { action, ...body } = JSON.parse(options.body);
    wire.push({ action, body: clone(body) });
    if (control.httpStatus) return Response.json({ error: 'fixture HTTP failure' }, { status: control.httpStatus });
    let value;
    try { value = await service[action](body); }
    catch { return Response.json({ error: 'fixture rejected' }, { status: 400 }); }
    if (control.reply && action !== 'begin') value = { ...value, ...control.reply };
    if (control.pauseReply && action !== 'begin') await control.pauseReply(action);
    return Response.json(value);
  };
  const transport = createNativeSocialAuthTransport({ appId: APP, origin: ORIGIN, endpoint: ENDPOINT,
    verified: true }, { fetcher });
  const options = { platform, appId: APP, returnUrl: RETURN, browserOrigin: ORIGIN, browserPath: PATH,
    transport, pendingStore, readiness: clone(READY), now: () => clientTime, crypto: fakeCrypto,
    verifySession: async token => {
      counts.verify++; order.push('verify'); assert.equal(token, TOKEN);
      if (control.pauseVerify) await control.pauseVerify();
      return control.verifyUser === undefined ? { ...USER } : control.verifyUser;
    },
    commitSession: (token, user) => { order.push('commit'); commits.push({ token, user: clone(user) }); return true; },
  };
  function newController(usingCore = core) {
    if (!cores.includes(usingCore)) cores.push(usingCore);
    const controller = usingCore.createNativeSocialAuthController(options);
    controllers.push(controller); return controller;
  }
  const f = { core, cores, controllers, service, transport, pendingStore, newController, wire, rows, counts,
    bridgeCalls, commits, order, control, options,
    get record() { return pending && JSON.parse(pending); },
    get rawPending() { return pending; },
    advance(ms, side = 'both') { if (side !== 'server') clientTime += ms; if (side !== 'client') serverTime += ms; },
    async complete(begin = wire.findLast(value => value.action === 'begin').body) {
      return service.completeBrowser({ app_id: APP, transaction: begin.transaction, state: begin.state,
        return_url: RETURN }, bindingContext);
    },
  };
  f.controller = newController(); active.push(f); return f;
}

for (const platform of ['ios', 'android']) for (const provider of ['google', 'apple']) {
  test(platform + '/' + provider + ': real modules complete warm flow once with strict native callback', async () => {
    const f = await fixture(platform), browserUrl = await f.controller.start(provider), record = f.record;
    const begin = f.wire[0].body;
    assert.equal(begin.provider, provider);
    assert.equal(begin.challenge, hash(record.verifier));
    assert.equal(Object.hasOwn(begin, 'verifier'), false);
    assert.deepEqual([...new URL(browserUrl).searchParams.keys()].sort(), ['state', 'transaction']);
    assert.equal(browserUrl.includes(record.verifier), false);
    assert.equal(f.rawPending.includes(TOKEN), false);
    assert.deepEqual(Object.keys(record).sort(), ['appId', 'expiresAt', 'id', 'provider', 'returnUrl', 'state', 'verifier']);
    const { return_url } = await f.complete(), url = new URL(return_url);
    assert.deepEqual([...url.searchParams.keys()].sort(), ['code', 'state', 'transaction']);
    assert.equal(return_url.includes(TOKEN), false); assert.equal(return_url.includes(record.verifier), false);
    assert.equal((await f.controller.receive(return_url)).id, USER.id);
    assert.equal(f.commits.length, 1); assert.deepEqual(f.order, ['verify', 'commit']);
    assert.equal(f.record, null); assert.equal(f.counts.claim, 1);
    assert.deepEqual(f.wire.map(item => item.action), ['begin', 'redeem']);
    assert.equal(f.bridgeCalls.every(([, appId]) => appId === APP), true);
    assert.equal(await f.controller.receive(return_url), false);
  });
}

test('cold restore and resume preserve pending without issue, then consume the completed service once', async () => {
  const f = await fixture(); await f.controller.start('apple');
  const savedId = f.record.id, fresh = await freshCore(), cold = f.newController(fresh);
  assert.equal(await cold.restore(), true);
  assert.equal(await cold.resume(), false);
  assert.equal(f.record.id, savedId); assert.equal(f.counts.issue, 0);
  assert.equal(f.counts.claim, 0); assert.equal(f.commits.length, 0);
  await f.complete(); // Deep link deliberately not delivered: no cookie sharing assumed.
  assert.equal((await cold.resume()).id, USER.id);
  assert.equal(f.counts.issue, 1); assert.equal(f.counts.claim, 1); assert.equal(f.commits.length, 1);
  assert.equal(f.record, null); assert.equal(await cold.resume(), false);
  assert.deepEqual(f.wire.map(item => item.action), ['begin', 'resume', 'resume']);
});

test('cold callback restores actual JS-store state and rejects replay across a fresh controller', async () => {
  const f = await fixture(); await f.controller.start('google'); const saved = await f.pendingStore.get();
  const link = (await f.complete()).return_url, cold = f.newController(await freshCore());
  assert.equal(await cold.restore(), true); assert.equal((await cold.receive(link)).id, USER.id);
  // Model a stale protected backup after successful consumption, not real storage.
  await f.pendingStore.set(saved);
  const replay = f.newController(await freshCore()); assert.equal(await replay.restore(), true);
  await assert.rejects(replay.receive(link));
  assert.equal(f.commits.length, 1); assert.equal(f.counts.claim, 1); assert.equal(f.record, null);
});

test('client expiration removes pending before transport; server expiration refuses still-valid native attempt', async () => {
  const f = await fixture(); await f.controller.start('google'); const link = (await f.complete()).return_url;
  f.advance(60000, 'client'); await assert.rejects(f.controller.receive(link)); await flush();
  assert.equal(f.commits.length, 0); assert.equal(f.counts.claim, 0); assert.equal(f.record, null);
  const g = await fixture(); await g.controller.start('apple'); const otherLink = (await g.complete()).return_url;
  g.advance(60000, 'server'); await assert.rejects(g.controller.receive(otherLink)); await flush();
  assert.equal(g.commits.length, 0); assert.equal(g.counts.claim, 0);
  assert.deepEqual(g.wire.map(item => item.action), ['begin', 'redeem']);
});

test('foreign/disabled auth.me identity cannot be committed despite a valid consumed service response', async () => {
  for (const user of [{ ...USER, id: 'foreign-user' }, { ...USER, app_id: 'foreign-app' },
    { ...USER, disabled: true }, null]) {
    const f = await fixture(); await f.controller.start('google'); const link = (await f.complete()).return_url;
    f.control.verifyUser = user; await assert.rejects(f.controller.receive(link));
    assert.equal(f.commits.length, 0); assert.equal(f.counts.claim, 1);
    assert.equal(f.counts.verify, 1); assert.equal(f.record, null);
  }
});

test('HTTP errors and foreign application response never install a session', async () => {
  const f = await fixture(); f.control.httpStatus = 503;
  await assert.rejects(f.controller.start('google')); assert.equal(f.record, null); assert.equal(f.commits.length, 0);
  const g = await fixture(); await g.controller.start('apple'); const link = (await g.complete()).return_url;
  g.control.reply = { app_id: 'foreign-app' };
  await assert.rejects(g.controller.receive(link));
  assert.equal(g.counts.claim, 1); assert.equal(g.counts.verify, 0); assert.equal(g.commits.length, 0);
});

test('cancel before callback clears the real JS-store request and ignores late result', async () => {
  const f = await fixture(); await f.controller.start('google'); const link = (await f.complete()).return_url;
  f.controller.cancel(); await flush();
  assert.equal(f.record, null); assert.equal(await f.controller.receive(link), false);
  assert.equal(f.counts.claim, 0); assert.equal(f.commits.length, 0);
});

test('account epoch cancellation during identity verification blocks the delayed old session', async () => {
  const f = await fixture(); await f.controller.start('apple'); const link = (await f.complete()).return_url;
  let release, entered;
  const reached = new Promise(resolve => { entered = resolve; });
  f.control.pauseVerify = () => { entered(); return new Promise(resolve => { release = resolve; }); };
  const receive = f.controller.receive(link); await reached;
  f.core.cancelPendingNativeSocialAuth(); release();
  await assert.rejects(receive); await flush();
  assert.equal(f.counts.claim, 1); assert.equal(f.counts.verify, 1); assert.equal(f.commits.length, 0);
  assert.equal(f.record, null);
});

test('a newer account attempt survives conditional cleanup from delayed old HTTP response', async () => {
  const f = await fixture(); await f.controller.start('google'); const oldId = f.record.id;
  const link = (await f.complete()).return_url;
  let release, entered;
  const reached = new Promise(resolve => { entered = resolve; });
  f.control.pauseReply = () => { entered(); return new Promise(resolve => { release = resolve; }); };
  const receive = f.controller.receive(link); await reached;
  const newer = f.newController(); await newer.start('apple');
  const newId = f.record.id; assert.notEqual(newId, oldId);
  delete f.control.pauseReply; release();
  await assert.rejects(receive); await flush();
  assert.equal(f.record.id, newId); assert.equal(f.record.provider, 'apple');
  assert.equal(f.commits.length, 0); assert.equal(f.counts.verify, 0);
});

test('production readiness/configuration stay off; integration has no active endpoint or native registration', () => {
  for (const platform of ['ios', 'android']) assert.deepEqual(availableNativeSocialProviders(platform), []);
  assert.equal(Object.values(NATIVE_SOCIAL_READINESS.providers).some(Boolean), false);
  assert.match(read('src/lib/nativeSocialAuthRuntime.js'), /NATIVE_SOCIAL_CONFIGURATION\s*=\s*null/);
  assert.throws(() => createNativeSocialAuthTransport());
  assert.throws(() => createNativeOAuthHandoffService());
});