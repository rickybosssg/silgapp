// Executes the reusable service with synthetic adapters only. No provider, network,
// persistent store, real credentials, encryption keys or platform CAS is tested.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createNativeOAuthHandoffService } from '../base44/shared/nativeOAuthHandoff.js';

const APP = 'fixture-app';
const RETURN = 'silgapp://auth-callback';
const TOKEN = 'FAKE_BASE44_SESSION_FOR_LOCAL_TESTS_ONLY';
const USER = 'fixture-user';
const hash = value => createHash('sha256').update(value).digest('base64url');
const opaque = character => character.repeat(43);
const reject = operation => assert.rejects(operation, error => {
  assert.equal(error.code, 'NATIVE_OAUTH_REJECTED');
  assert.equal(error.message.includes(TOKEN), false);
  return true;
});
const receipt = (count, amount = 1) => ({ success: true, outcome: 'confirmed', has_more: false, [count]: amount });
const clone = value => structuredClone(value);

function fixture(overrides = {}) {
  let timestamp = 1000000, sequence = 0;
  const rows = new Map(), envelopes = new Map(), control = {};
  const counts = { insert: 0, read: 0, issue: 0, claim: 0, seal: 0, open: 0, browser: 0, fallback: 0 };
  const input = { app_id: APP, provider: 'google', transaction: opaque('t'), state: opaque('s'),
    challenge: hash(opaque('v')), challenge_method: 'S256', return_url: RETURN };
  const trustedBrowser = Object.freeze({ fixtureOnly: true, browser: 'fixture-browser' });
  const key = value => JSON.stringify([value.app_id, value.transaction]);
  const fakeCrypto = {
    getRandomValues(bytes) {
      // Deliberately deterministic fixture entropy. Not a credential/key source.
      const number = ++sequence;
      for (let index = 0; index < bytes.length; index++) bytes[index] = (number + index) % 256;
      return bytes;
    },
    subtle: { async digest(algorithm, bytes) {
      assert.equal(algorithm, 'SHA-256');
      if (control.beforeDigest) await control.beforeDigest(new TextDecoder().decode(bytes));
      return Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer;
    } },
  };
  const store = {
    capabilities: { uniqueAppTransaction: true, atomicCompareAndSet: true, immutableIssuedBindings: true, serverOnly: true },
    async insertUnique(request) {
      counts.insert++;
      const id = key(request);
      if (rows.has(id)) return receipt('inserted', 0);
      rows.set(id, clone(request.record));
      if (control.insertError) throw new Error(TOKEN);
      return control.insertReceipt ?? receipt('inserted');
    },
    async readUnique(request) {
      counts.read++;
      if (control.readError) throw new Error(TOKEN);
      if (control.readReceipt) return clone(control.readReceipt);
      const row = rows.get(key(request));
      return { success: true, outcome: 'confirmed', has_more: false, rows: row ? [clone(row)] : [] };
    },
    async compareAndSet({ where, set }) {
      const stage = set.status === 'issued' ? 'issue' : 'claim';
      counts[stage]++;
      if (control.beforeCas) await control.beforeCas(stage);
      if (control.ambiguousBeforeApply === stage) return { success: false, outcome: 'uncertain', has_more: false };
      // Atomic ONLY in this mock process: comparison and mutation have no await.
      // Production distributed CAS/uniqueness still needs independent proof.
      const row = rows.get(key(where));
      const { not_expired_at, ...equalities } = where;
      const matches = row && row.expires_at > not_expired_at && row.expires_at > timestamp &&
        Object.entries(equalities).every(([field, value]) => row[field] === value);
      if (!matches) return receipt('updated', 0);
      Object.assign(row, clone(set));
      if (control[stage + 'Error']) throw new Error(TOKEN);
      return control[stage + 'Receipt'] ?? receipt('updated');
    },
    async get() { counts.fallback++; assert.fail('No ordinary get fallback'); },
    async update() { counts.fallback++; assert.fail('No ordinary update fallback'); },
    async delete() { counts.fallback++; assert.fail('No ordinary delete fallback'); },
  };
  const browser = {
    capabilities: { authenticatedAppIdentity: true, transactionBinding: true, csrfContinuity: true },
    async verifyCompletion({ context, transaction }) {
      counts.browser++;
      if (context !== trustedBrowser) throw new Error('Wrong synthetic browser/CSRF binding');
      assert.equal(transaction.app_id, input.app_id);
      assert.equal(transaction.transaction, input.transaction);
      assert.equal(transaction.state, input.state);
      assert.equal(transaction.provider, input.provider);
      return { authenticated: true, csrf_verified: true, transaction_bound: true,
        app_id: APP, user_id: USER, access_token: TOKEN, provider: input.provider,
        transaction: transaction.transaction, state_hash: hash(transaction.state), challenge: transaction.challenge,
        return_url: transaction.return_url, expires_at: transaction.expires_at, browser_binding: opaque('b'),
        ...control.browserProof };
    },
  };
  const vault = {
    capabilities: { authenticatedSealing: true, contextBinding: true },
    async seal({ payload, context }) {
      counts.seal++;
      if (control.sealError) throw new Error(TOKEN);
      if (control.plaintextSeal) return TOKEN;
      const sealed = 'MOCK_OPAQUE_ENVELOPE_' + counts.seal;
      envelopes.set(sealed, { payload: clone(payload), context: JSON.stringify(context) });
      return sealed;
    },
    async open({ sealed, context }) {
      counts.open++;
      if (control.openError) throw new Error(TOKEN);
      const entry = envelopes.get(sealed);
      if (!entry || entry.context !== JSON.stringify(context)) throw new Error('Synthetic authenticated envelope rejected');
      return { ...clone(entry.payload), ...control.openPayload };
    },
  };
  const options = { enabled: true, appId: APP, browserOrigin: 'https://fixture.invalid', browserPath: '/native-auth',
    returnUrl: RETURN, store, browser, vault, now: () => timestamp, crypto: fakeCrypto, ...overrides };
  const service = createNativeOAuthHandoffService(options);
  const common = () => ({ app_id: APP, transaction: input.transaction, state: input.state, return_url: RETURN });
  const f = { options, service, input, store, browser, vault, trustedBrowser, control, counts, rows, envelopes,
    advance(ms) { timestamp += ms; }, setTime(value) { timestamp = value; },
    row: () => rows.get(key(input)),
    begin: change => service.begin({ ...input, ...change }),
    complete: (change, context = trustedBrowser) => service.completeBrowser({ ...common(), ...change }, context),
    redeem: (code, change) => service.redeem({ ...common(), verifier: opaque('v'), code, ...change }),
    resume: change => service.resume({ ...common(), verifier: opaque('v'), ...change }),
  };
  return f;
}

async function ready(overrides = {}) {
  const f = fixture();
  Object.assign(f.input, overrides);
  await f.begin();
  f.completion = await f.complete();
  f.link = new URL(f.completion.return_url);
  f.code = f.link.searchParams.get('code');
  return f;
}

test('default is unavailable and every declared prerequisite is mandatory', () => {
  assert.throws(() => createNativeOAuthHandoffService(), error => error.code === 'NATIVE_OAUTH_UNAVAILABLE');
  const f = fixture();
  for (const options of [{ ...f.options, enabled: undefined }, { ...f.options, enabled: false },
    { ...f.options, store: {} }, { ...f.options, browser: {} }, { ...f.options, vault: {} },
    { ...f.options, store: { ...f.store, compareAndSet: undefined } },
    { ...f.options, browser: { ...f.browser, capabilities: { ...f.browser.capabilities, csrfContinuity: false } } },
    { ...f.options, vault: { ...f.vault, capabilities: { authenticatedSealing: true, contextBinding: false } } },
    { ...f.options, store: { ...f.store, capabilities: { ...f.store.capabilities, serverOnly: false } } }]) {
    assert.throws(() => createNativeOAuthHandoffService(options), error => error.code === 'NATIVE_OAUTH_UNAVAILABLE');
  }
  assert.equal(f.counts.insert, 0);
});

test('configuration rejects unsafe app, browser path/origin, return and TTL', () => {
  const f = fixture();
  for (const change of [{ appId: 7 }, { appId: 'bad/app' }, { browserOrigin: 'http://fixture.invalid' },
    { browserOrigin: 'https://user:pass@fixture.invalid' }, { browserOrigin: 'https://fixture.invalid/path' },
    { browserOrigin: 'https://fixture.invalid?x=1' }, { browserPath: '//attacker.invalid' },
    { browserPath: '/native-auth/../callback' }, { browserPath: '/native-auth?x=1' },
    { returnUrl: 'silgapp://other' }, { returnUrl: RETURN + '?x=1' }, { ttlMs: 300001 },
    { ttlMs: 0 }, { ttlMs: 1.5 }]) {
    assert.throws(() => createNativeOAuthHandoffService({ ...f.options, ...change }),
      error => error.code === 'NATIVE_OAUTH_UNAVAILABLE');
  }
});

test('begin returns exact controller contract with server TTL and state/challenge-only record', async () => {
  const f = fixture(), response = await f.begin();
  assert.deepEqual(Object.keys(response).sort(), ['browser_url', 'expires_at', 'transaction']);
  assert.equal(response.expires_at, 1060000);
  const url = new URL(response.browser_url);
  assert.equal(url.origin + url.pathname, 'https://fixture.invalid/native-auth');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['state', 'transaction']);
  assert.equal(url.searchParams.get('state'), f.input.state);
  assert.equal(f.row().state_hash, hash(f.input.state));
  assert.equal(JSON.stringify(f.row()).includes(f.input.state), false);
  assert.equal(JSON.stringify(f.row()).includes(opaque('v')), false);
});

test('begin strictly rejects unknown/missing fields, nonstrings and untrusted values before storage', async () => {
  for (const change of [{ app_id: 'other' }, { transaction: { toString: () => opaque('t') } },
    { state: opaque('s') + '=' }, { challenge: opaque('c') + '=' }, { challenge_method: 'plain' },
    { provider: 'facebook' }, { return_url: RETURN + '#token' }, { expires_at: 999999999 },
    { user_id: 'attacker' }, { access_token: TOKEN }]) {
    const f = fixture(); await reject(() => f.begin(change)); assert.equal(f.counts.insert, 0);
  }
  const f = fixture(), input = { ...f.input }; delete input.state;
  await reject(() => f.service.begin(input));
});

test('duplicate transaction insertion never overwrites original bindings', async () => {
  const f = fixture(); await f.begin(); const original = clone(f.row());
  await reject(() => f.begin({ state: opaque('z'), challenge: hash(opaque('q')) }));
  assert.deepEqual(f.row(), original);
});

test('uncertain/partial insertion receipts refuse browser URL; no overwrite retry', async () => {
  for (const response of [{}, receipt('inserted', 0), receipt('inserted', 2),
    { ...receipt('inserted'), outcome: 'uncertain' }, { ...receipt('inserted'), has_more: true }]) {
    const f = fixture(); f.control.insertReceipt = response;
    await reject(() => f.begin()); await reject(() => f.begin());
    assert.equal(f.counts.fallback, 0);
  }
});

test('completion deep link exposes only opaque code, state and transaction; bearer is sealed at rest', async () => {
  const f = await ready();
  assert.deepEqual(Object.keys(f.completion), ['return_url']);
  assert.deepEqual([...f.link.searchParams.keys()].sort(), ['code', 'state', 'transaction']);
  assert.equal(f.code.length, 43);
  assert.equal(f.link.protocol + '//' + f.link.host + f.link.pathname, RETURN);
  assert.equal(f.completion.return_url.includes(TOKEN), false);
  assert.equal(f.completion.return_url.includes(opaque('v')), false);
  assert.equal(JSON.stringify(f.row()).includes(TOKEN), false);
  assert.equal(JSON.stringify(f.row()).includes(f.code), false);
  assert.equal(f.row().code_hash, hash(f.code));
  assert.equal(f.row().sealed_session.startsWith('MOCK_OPAQUE_ENVELOPE_'), true);
  assert.equal(f.counts.seal, 1);
  assert.equal(f.counts.open, 1, 'checked round trip before issue');
});

test('authenticated browser, CSRF and prior transaction binding are all mandatory', async () => {
  for (const proof of [{ authenticated: false }, { csrf_verified: false }, { transaction_bound: false }, { disabled: true },
    { app_id: 'other' }, { user_id: '' }, { provider: 'apple' }, { browser_binding: opaque('b') + 'x' },
    { transaction: opaque('x') }, { state_hash: opaque('x') }, { challenge: opaque('x') },
    { return_url: 'silgapp://other' }, { expires_at: 1999999 }]) {
    const f = fixture(); await f.begin(); f.control.browserProof = proof;
    await reject(() => f.complete()); assert.equal(f.counts.issue, 0);
  }
  const f = fixture(); await f.begin();
  await reject(() => f.complete({}, { fixtureOnly: true, browser: 'other-browser' }));
  assert.equal(f.counts.issue, 0);
});

test('completion cannot accept session identity or timestamps from JSON body', async () => {
  const f = fixture(); await f.begin();
  for (const change of [{ user_id: USER }, { access_token: TOKEN }, { provider: 'google' }, { csrf_verified: true },
    { browser_binding: opaque('b') }, { expires_at: 1060000 }]) await reject(() => f.complete(change));
  assert.equal(f.counts.browser, 0);
});

test('wrong browser transaction/app/state/return cannot issue a code', async () => {
  const f = fixture(); await f.begin();
  for (const change of [{ transaction: opaque('x') }, { app_id: 'other' }, { state: opaque('x') },
    { return_url: 'silgapp://other' }]) await reject(() => f.complete(change));
  assert.equal(f.counts.issue, 0);
});

test('vault failure, plaintext seal, wrong round-trip app/user/token all refuse issue', async () => {
  for (const control of [{ sealError: true }, { openError: true }, { plaintextSeal: true },
    { openPayload: { app_id: 'other' } }, { openPayload: { user_id: 'other' } },
    { openPayload: { access_token: 'FAKE_DIFFERENT_TOKEN' } }]) {
    const f = fixture(); await f.begin(); Object.assign(f.control, control);
    await reject(() => f.complete()); assert.equal(f.counts.issue, 0);
  }
});

test('one transaction cannot issue a second browser code', async () => {
  const f = await ready();
  await reject(() => f.complete());
  assert.equal(f.counts.issue, 1);
});

test('ambiguous issue receipts never return the generated deep link', async () => {
  for (const response of [{}, receipt('updated', 0), receipt('updated', 2),
    { ...receipt('updated'), has_more: true }, { ...receipt('updated'), outcome: 'uncertain' }]) {
    const f = fixture(); await f.begin(); f.control.issueReceipt = response;
    await reject(() => f.complete());
    assert.equal(f.counts.fallback, 0);
  }
});

test('redeem returns exactly native response after confirmed claim and removes sealed payload', async () => {
  const f = await ready(), response = await f.redeem(f.code);
  assert.deepEqual(response, { access_token: TOKEN, user_id: USER, app_id: APP });
  assert.equal(f.row().status, 'consumed');
  assert.equal(f.row().sealed_session, null);
  assert.equal(f.counts.claim, 1);
  assert.equal(f.counts.open, 2);
});

test('wrong verifier, state, transaction, code, app or return are rejected without consuming', async () => {
  for (const change of [{ verifier: opaque('x') }, { state: opaque('x') }, { transaction: opaque('x') },
    { code: opaque('x') }, { app_id: 'other' }, { return_url: 'silgapp://other' },
    { verifier: { toString: () => opaque('v') } }, { access_token: TOKEN }, { provider: 'google' }]) {
    const f = await ready(); await reject(() => f.redeem(f.code, change));
    assert.equal(f.counts.claim, 0);
    assert.equal((await f.redeem(f.code)).user_id, USER);
  }
});

test('code replay is refused with no second vault open', async () => {
  const f = await ready(); await f.redeem(f.code);
  const opened = f.counts.open;
  await reject(() => f.redeem(f.code)); await reject(() => f.resume());
  assert.equal(f.counts.open, opened);
  assert.equal(f.counts.fallback, 0);
});

test('pending resume requires correct device verifier and reveals only pending', async () => {
  const f = fixture(); await f.begin();
  assert.deepEqual(await f.resume(), { pending: true });
  await reject(() => f.resume({ verifier: opaque('x') }));
  await reject(() => f.redeem(opaque('c')));
  assert.equal(f.counts.claim, 0);
});

test('resume without callback code uses the same single-use claim and refuses replay', async () => {
  const f = await ready();
  assert.equal((await f.resume()).access_token, TOKEN);
  await reject(() => f.resume()); await reject(() => f.redeem(f.code));
  assert.equal(f.counts.claim, 1);
});

test('20 concurrent native claims have exactly one winner in the mock CAS only', async () => {
  const f = await ready();
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => f.redeem(f.code)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 19);
  assert.equal(f.counts.claim, 20);
  assert.equal(f.counts.open, 2, 'only the claim winner can open after the issue round trip');
  assert.equal(f.counts.fallback, 0);
});

test('callback and resume cannot both win the mock claim', async () => {
  const f = await ready();
  const results = await Promise.allSettled([f.redeem(f.code), f.resume()]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(f.counts.open, 2);
});

test('0, >1, missing, nonnumeric, ambiguous and erroneous claim receipts release no session', async () => {
  for (const response of [{}, receipt('updated', 0), receipt('updated', 2), receipt('updated', '1'),
    { ...receipt('updated'), has_more: true }, { ...receipt('updated'), has_more: undefined },
    { ...receipt('updated'), success: false }, { ...receipt('updated'), outcome: undefined },
    { ...receipt('updated'), outcome: 'uncertain' }, { ...receipt('updated'), uncertain: true },
    { ...receipt('updated'), error: 'uncertain' }]) {
    const f = await ready(); f.control.claimReceipt = response;
    await reject(() => f.redeem(f.code));
    assert.equal(f.counts.open, 1, 'no opening after uncertain claim');
    delete f.control.claimReceipt;
    await reject(() => f.resume());
    assert.equal(f.counts.fallback, 0);
  }
  const f = await ready(); f.control.claimError = true;
  await reject(() => f.redeem(f.code));
  delete f.control.claimError;
  await reject(() => f.redeem(f.code));
  assert.equal(f.counts.open, 1);
});

test('expiry boundary blocks pending completion and issued native claim using server clock', async () => {
  const f = fixture(); await f.begin(); f.advance(60000);
  await reject(() => f.complete()); await reject(() => f.resume());
  assert.equal(f.counts.issue, 0);
  const g = await ready(); g.advance(60000);
  await reject(() => g.redeem(g.code)); assert.equal(g.counts.claim, 0);
});

test('expiry while awaiting CAS or vault open refuses delivery and never retries a burned claim', async () => {
  const f = await ready(); f.control.beforeCas = async () => f.advance(60000);
  await reject(() => f.redeem(f.code)); assert.equal(f.counts.open, 1);
  const g = await ready(), open = g.vault.open;
  g.vault.open = async request => { const value = await open(request); g.advance(60000); return value; };
  await reject(() => g.redeem(g.code));
  assert.equal(g.row().status, 'consumed');
  await reject(() => g.resume());
});

test('clock rollback, untrusted persisted TTL and state corruption refuse redemption', async () => {
  const f = await ready(); f.setTime(999999); await reject(() => f.redeem(f.code));
  for (const change of [{ expires_at: 999999999 }, { created_at: 1000001 }, { state_hash: opaque('x') },
    { revision: 0 }, { challenge_method: 'plain' }, { user_id: '' }, { access_token: TOKEN },
    { claim_id: opaque('x') }, { consumed_at: 1 }]) {
    const g = await ready(); Object.assign(g.row(), change);
    await reject(() => g.redeem(g.code)); assert.equal(g.counts.claim, 0);
  }
});

test('bounded unique reads reject zero/multiple rows or pagination/uncertainty', async () => {
  for (const build of [row => [], row => [row, row], row => [row]]) {
    const f = await ready();
    f.control.readReceipt = { success: true, outcome: 'confirmed', has_more: false, rows: build(clone(f.row())) };
    if (f.control.readReceipt.rows.length === 1) f.control.readReceipt.has_more = true;
    await reject(() => f.redeem(f.code)); assert.equal(f.counts.claim, 0);
  }
  const f = await ready(); f.control.readError = true;
  await reject(() => f.resume()); assert.equal(f.counts.claim, 0);
});

test('tampered ciphertext or context and post-claim identity mismatch are burned and refused', async () => {
  for (const tamper of [f => { f.row().sealed_session += '_modified'; },
    f => { f.row().user_id = 'wrong-user'; }, f => { f.row().provider = 'apple'; },
    f => { f.control.openPayload = { app_id: 'other' }; },
    f => { f.control.openPayload = { user_id: 'other' }; }]) {
    const f = await ready(); tamper(f);
    await reject(() => f.redeem(f.code));
    assert.equal(f.row().status, 'consumed');
    await reject(() => f.resume());
  }
});

test('Apple and Google share identical validated service contract', async () => {
  for (const provider of ['google', 'apple']) {
    const f = await ready({ provider });
    assert.equal(f.row().provider, provider);
    assert.equal((await f.redeem(f.code)).app_id, APP);
  }
});

test('module is inert: no function entry, provider, network, storage fallback or automatic configuration', () => {
  const source = readFileSync(new URL('../base44/shared/nativeOAuthHandoff.js', import.meta.url), 'utf8');
  assert.equal(/fetch\s*\(|Deno\.serve|createClient|localStorage|sessionStorage|DeviceSession|process\.env|Deno\.env/.test(source), false);
  assert.equal(/store\.(?:get|update|delete)\s*\(/.test(source), false);
  assert.deepEqual(Object.keys(fixture().service).sort(), ['begin', 'completeBrowser', 'redeem', 'resume']);
});

test('symbols, hidden properties and getters are rejected without invoking request getters', async () => {
  let getters = 0;
  for (const alter of [value => Object.defineProperty(value, Symbol('extra'), { value: 'ignored', enumerable: true }),
    value => Object.defineProperty(value, 'extra', { value: 'ignored', enumerable: false }),
    value => Object.defineProperty(value, 'state', { get() { getters++; return opaque('s'); }, enumerable: true })]) {
    const f = fixture(), value = { ...f.input }; alter(value);
    await reject(() => f.service.begin(value)); assert.equal(f.counts.insert, 0);
  }
  const f = await ready(), request = { app_id: APP, transaction: f.input.transaction, state: f.input.state,
    verifier: opaque('v'), code: f.code, return_url: RETURN };
  Object.defineProperty(request, 'verifier', { get() { getters++; return opaque('v'); }, enumerable: true });
  await reject(() => f.service.redeem(request));
  assert.equal(getters, 0);
});

test('unapplied ambiguous claim has no internal retry or invented terminal tombstone', async () => {
  const f = await ready(); f.control.ambiguousBeforeApply = 'claim';
  await reject(() => f.redeem(f.code));
  assert.equal(f.counts.claim, 1);
  assert.equal(f.counts.open, 1);
  assert.equal(f.row().status, 'issued', 'mock explicitly did not persist consumed');
  delete f.control.ambiguousBeforeApply;
  // A separately submitted valid proof can still win once. The native coordinator
  // cancels after the first error; distributed terminal marking is not claimed.
  assert.equal((await f.redeem(f.code)).user_id, USER);
  await reject(() => f.resume());
});

test('clock advancement during verifier hashing or sealing prevents an already-expired CAS', async () => {
  const f = await ready();
  f.control.beforeDigest = async input => { if (input === opaque('v')) f.advance(60000); };
  await reject(() => f.redeem(f.code));
  assert.equal(f.counts.claim, 0);
  const g = fixture(); await g.begin();
  const seal = g.vault.seal;
  g.vault.seal = async input => { const sealed = await seal(input); g.advance(60000); return sealed; };
  await reject(() => g.complete());
  assert.equal(g.counts.issue, 0);
});


test('validated input is snapshotted before any asynchronous adapter can change caller fields', async () => {
  const f = fixture(), request = { ...f.input };
  f.control.beforeDigest = async () => { request.transaction = opaque('x'); request.return_url = 'silgapp://other'; };
  const response = await f.service.begin(request);
  assert.equal(response.transaction, opaque('t'));
  assert.equal(f.row().return_url, RETURN);
  assert.equal(f.row().transaction, opaque('t'));
});
