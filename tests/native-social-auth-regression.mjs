import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as core from '../src/lib/nativeSocialAuth.js';
import { availableSocialProviders } from '../src/lib/socialAuth.js';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const READY = { serverHandoffVerified: true, singleUseStoreVerified: true, browserBindingVerified: true,
  protectedPendingStoreVerified: true, resumeClaimVerified: true,
  devices: { ios: true, android: true }, providers: { google: true, apple: true } };
const TOKEN = 'FAKE_BASE44_SESSION_FIXTURE_ONLY', CODE = 'c'.repeat(43);
const USER = { id: 'fixture-user', app_id: 'fixture-app', email: 'fixture@example.test', role: 'user' };
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
afterEach(() => core.cancelPendingNativeSocialAuth());
function fixture(extra = {}, factory = core.createNativeSocialAuthController) {
  core.cancelPendingNativeSocialAuth();
  let record = null, now = 1000000, randomCount = 0;
  const commits = [], requests = [], verifications = [];
  const options = { platform: 'ios', appId: 'fixture-app', returnUrl: 'silgapp://auth-callback',
    browserOrigin: 'https://fixture.invalid', browserPath: '/native/start', readiness: structuredClone(READY), now: () => now,
    crypto: { getRandomValues: bytes => { bytes.fill(++randomCount); return bytes; }, subtle: webcrypto.subtle },
    pendingStore: { get: async () => record, set: async value => { record = structuredClone(value); },
      remove: async id => { if (record?.id === id) record = null; } },
    transport: {
      begin: async value => { requests.push(['begin', value]); return { transaction: value.transaction, expires_at: now + 60000,
        browser_url: 'https://fixture.invalid/native/start?transaction=' + value.transaction + '&state=' + value.state }; },
      redeem: async value => { requests.push(['redeem', value]); return { access_token: TOKEN, app_id: 'fixture-app', user_id: USER.id }; },
      resume: async value => { requests.push(['resume', value]); return { pending: true }; },
    },
    verifySession: async token => { verifications.push(token); return { ...USER }; },
    commitSession: (token, user) => { commits.push({ token, user }); return true; }, ...extra };
  return { options, controller: factory(options), commits, requests, verifications,
    get record() { return record; }, set record(value) { record = value; }, advance: ms => { now += ms; },
    link: () => 'silgapp://auth-callback?transaction=' + record.id + '&state=' + record.state + '&code=' + CODE };
}
test('production gates remain closed and each prerequisite is required', () => {
  for (const os of ['ios', 'android', 'web', 'other']) assert.deepEqual(core.availableNativeSocialProviders(os), []);
  for (const key of ['serverHandoffVerified', 'singleUseStoreVerified', 'browserBindingVerified', 'protectedPendingStoreVerified', 'resumeClaimVerified'])
    assert.deepEqual(core.availableNativeSocialProviders('ios', { ...READY, [key]: false }), []);
  assert.deepEqual(core.availableNativeSocialProviders('ios', READY), ['google', 'apple']);
  assert.throws(() => fixture({ readiness: core.NATIVE_SOCIAL_READINESS }));
});
for (const platform of ['ios', 'android']) for (const provider of ['google', 'apple']) {
  test(platform + '/' + provider + ': verify session before the only commit; verifier stays out of URLs', async () => {
    const f = fixture({ platform }), url = await f.controller.start(provider), begin = f.requests[0][1];
    assert.equal(begin.provider, provider); assert.equal(begin.challenge_method, 'S256');
    assert.equal(begin.challenge, createHash('sha256').update(f.record.verifier).digest('base64url'));
    assert.equal('verifier' in begin, false); assert.equal(url.includes(f.record.verifier), false); assert.equal(url.includes(TOKEN), false);
    assert.equal(f.commits.length, 0); assert.equal((await f.controller.receive(f.link())).id, USER.id);
    assert.deepEqual(f.verifications, [TOKEN]); assert.equal(f.commits.length, 1); assert.equal(f.record, null);
  });
}
test('hostile browser origin/path/credentials/fragments/token query never reach storage', async () => {
  for (const location of ['http://fixture.invalid/native/start', 'https://other.invalid/native/start',
    'https://user:pass@fixture.invalid/native/start', 'https://fixture.invalid/other',
    'https://fixture.invalid/native/start#fragment', 'https://fixture.invalid/native/start?access_token=FAKE']) {
    const f = fixture(); f.options.transport.begin = async input => ({ transaction: input.transaction, expires_at: 1060000, browser_url: location });
    await assert.rejects(f.controller.start('google')); assert.equal(f.record, null); assert.equal(f.commits.length, 0);
  }
});
test('invalid native callbacks cannot redeem or install a candidate', async () => {
  for (const mutate of [u => u.searchParams.set('state', 'x'.repeat(43)), u => u.searchParams.set('transaction', 'x'.repeat(43)),
    u => u.searchParams.append('code', CODE), u => { u.hash = 'fragment'; }, u => u.searchParams.set('access_token', TOKEN),
    u => u.searchParams.set('code', 'short'), u => { u.username = 'user'; }]) {
    const f = fixture(); await f.controller.start('google'); const url = new URL(f.link()); mutate(url);
    await assert.rejects(f.controller.receive(url.toString()));
    assert.equal(f.requests.filter(x => x[0] === 'redeem').length, 0); assert.equal(f.commits.length, 0);
  }
});
test('unrelated links and callbacks without a protected pending request are ignored', async () => {
  const f = fixture(); assert.equal(await f.controller.receive('silgapp://auth-callback?access_token=FAKE'), false);
  await f.controller.start('apple'); assert.equal(await f.controller.receive('silgapp://other'), false); assert.equal(f.commits.length, 0);
});
test('parallel and replayed callbacks produce one redemption and one session commit', async () => {
  const f = fixture(); await f.controller.start('google'); const link = f.link();
  const result = await Promise.all([f.controller.receive(link), f.controller.receive(link)]);
  assert.equal(result.filter(Boolean).length, 1); assert.equal(f.commits.length, 1);
  assert.equal(f.requests.filter(x => x[0] === 'redeem').length, 1); assert.equal(await f.controller.receive(link), false);
});
test('expired pending requests cannot redeem', async () => {
  const f = fixture(); await f.controller.start('google'); const link = f.link(); f.advance(60001);
  await assert.rejects(f.controller.receive(link)); assert.equal(f.commits.length, 0);
});
test('provider tokens and replies bound to another app/user cannot become a Base44 session', async () => {
  for (const reply of [{ identityToken: 'FAKE_PROVIDER_TOKEN' }, { access_token: TOKEN, app_id: 'other', user_id: USER.id },
    { access_token: TOKEN, app_id: 'fixture-app' }]) {
    const f = fixture(); f.options.transport.redeem = async () => reply; await f.controller.start('google');
    await assert.rejects(f.controller.receive(f.link())); assert.equal(f.commits.length, 0);
  }
});
test('me must match the expected app/user and must not be disabled', async () => {
  for (const user of [{ ...USER, id: 'other' }, { ...USER, app_id: 'other' }, { ...USER, disabled: true }, null]) {
    const f = fixture({ verifySession: async () => user }); await f.controller.start('apple');
    await assert.rejects(f.controller.receive(f.link())); assert.equal(f.commits.length, 0);
  }
});
test('logout/email epoch invalidates replies delayed during redemption or identity verification', async () => {
  for (const phase of ['redeem', 'verify']) {
    let release, started; const begun = new Promise(resolve => { started = resolve; });
    const delayed = () => { started(); return new Promise(resolve => { release = resolve; }); };
    const f = fixture(phase === 'verify' ? { verifySession: delayed } : {});
    if (phase === 'redeem') f.options.transport.redeem = delayed;
    await f.controller.start('google'); const result = f.controller.receive(f.link()); await begun;
    core.cancelPendingNativeSocialAuth(); release(phase === 'verify' ? USER : { access_token: TOKEN, app_id: 'fixture-app', user_id: USER.id });
    await assert.rejects(result); assert.equal(f.commits.length, 0);
  }
});
test('a protected fixture restores in a fresh process/module context', async () => {
  const f = fixture(); await f.controller.start('apple'); const link = f.link();
  const fresh = await import('../src/lib/nativeSocialAuth.js?cold-fixture');
  const controller = fresh.createNativeSocialAuthController(f.options);
  assert.equal(await controller.restore(), true); assert.equal((await controller.receive(link)).id, USER.id);
  assert.equal(f.commits.length, 1); fresh.cancelPendingNativeSocialAuth();
});
test('corrupt protected state does not restore', async () => {
  for (const change of [{ appId: 'other' }, { returnUrl: 'silgapp://other' }, { expiresAt: 1 }, { verifier: 'short' }]) {
    const f = fixture(); f.record = { appId: 'fixture-app', returnUrl: 'silgapp://auth-callback', provider: 'google',
      id: 'i'.repeat(43), state: 's'.repeat(43), verifier: 'v'.repeat(43), expiresAt: 1060000, ...change };
    assert.equal(await f.controller.restore(), false); assert.equal(f.commits.length, 0);
  }
});
test('resume does not poll: pending is preserved and a later reply is verified once', async () => {
  const f = fixture(); await f.controller.start('google'); assert.equal(await f.controller.resume(), false);
  f.options.transport.resume = async body => { assert.equal(body.verifier, f.record.verifier);
    return { access_token: TOKEN, app_id: 'fixture-app', user_id: USER.id }; };
  assert.equal((await f.controller.resume()).id, USER.id); assert.equal(f.commits.length, 1);
});
test('cleanup failure after a verified commit does not report failure or allow replay', async () => {
  const f = fixture(); await f.controller.start('google'); const link = f.link();
  f.options.pendingStore.remove = async () => { throw Error('fixture cleanup outage'); };
  assert.equal((await f.controller.receive(link)).id, USER.id); assert.equal(await f.controller.receive(link), false);
});
test('transport errors never expose their fake secret/body in the public error', async () => {
  const f = fixture(); f.options.transport.redeem = async () => { throw Error(TOKEN); };
  await f.controller.start('google'); await assert.rejects(f.controller.receive(f.link()), error => !error.message.includes(TOKEN));
});
function runtimeFixture() {
  const events = new Map(), opens = [], removed = [], persisted = [];
  const plugin = { addListener: async (name, callback) => { events.set(name, callback); return { remove: async () => removed.push(name) }; },
    getLaunchUrl: async () => undefined, open: async value => opens.push(value), close: async () => {} };
  const module = { exports: {} };
  const require = name => ({ '@capacitor/core': { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } },
    '@capacitor/app': { App: plugin }, '@capacitor/browser': { Browser: plugin },
    '@/api/base44Client': { base44: { auth: { setToken: token => persisted.push(token) } } },
    '@/lib/app-params': { APP_PUBLIC_URL: 'https://fixture.invalid', BASE44_APP_ID: 'fixture-app' },
    '@/lib/authPersistence': { persistToken: token => persisted.push(token) }, './nativeSocialAuth': core })[name];
  const js = ts.transpileModule(read('src/lib/nativeSocialAuthRuntime.js'),
    { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require, URL, Set, Promise, AbortController, TextDecoder, Uint8Array,
    setTimeout, clearTimeout, globalThis: { fetch: () => { throw Error('No live network'); } } });
  return { api: module.exports, events, opens, removed, persisted, plugin };
}
test('default native runtime performs no listener, browser, session or network work', () => {
  const r = runtimeFixture(); assert.equal(r.api.getNativeSocialLoginBridge(), null);
  assert.equal(r.events.size, 0); assert.equal(r.opens.length, 0); assert.equal(r.persisted.length, 0);
});
test('Capacitor adapter connects browser, URL return and only its own listener cleanup', async () => {
  const f = fixture(), r = runtimeFixture(), authenticated = [];
  const bridge = r.api.createCapacitorNativeSocialAuth(f.options, { platform: 'ios', app: r.plugin, browser: r.plugin,
    verifySession: f.options.verifySession, commitSession: f.options.commitSession });
  bridge.subscribe({ authenticated: user => authenticated.push(user) });
  await bridge.login('google'); assert.equal(r.opens.length, 1); assert.equal(r.opens[0].url.includes(TOKEN), false);
  await r.events.get('appUrlOpen')({ url: f.link() }); assert.equal(authenticated.length, 1); assert.equal(f.commits.length, 1);
  await bridge.dispose(); assert.deepEqual(r.removed.sort(), ['appStateChange', 'appUrlOpen', 'browserFinished']);
});
test('Capacitor adapter handles browser cancellation and rejects a late return', async () => {
  const f = fixture(), r = runtimeFixture(), errors = [];
  const bridge = r.api.createCapacitorNativeSocialAuth(f.options, { platform: 'android', app: r.plugin, browser: r.plugin,
    verifySession: f.options.verifySession, commitSession: f.options.commitSession });
  bridge.subscribe({ error: error => errors.push(error.code) });
  await bridge.login('apple'); const link = f.link(); r.events.get('browserFinished')();
  await r.events.get('appUrlOpen')({ url: link }); assert.deepEqual(errors, ['NATIVE_AUTH_CANCELLED']);
  assert.equal(f.commits.length, 0); await bridge.dispose();
});
test('candidate verification uses isolated same-app HTTPS headers, no cookies, no redirect and no shared SDK mutation', async () => {
  const r = runtimeFixture(), requests = [];
  await r.api.verifyNativeBase44Session(TOKEN, async (url, options) => { requests.push({ url, options }); return Response.json(USER); });
  assert.equal(requests[0].url, 'https://fixture.invalid/api/apps/fixture-app/entities/User/me');
  assert.equal(requests[0].url.includes(TOKEN), false); assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(requests[0].options.redirect, 'error'); assert.equal(requests[0].options.headers.Authorization, 'Bearer ' + TOKEN);
  assert.equal(r.persisted.length, 0);
});
test('UI gates remain closed by default, support only known native platforms and cancel old email/logout attempts', () => {
  const providers = { google: { providerEnabled: true, webSessionVerified: true }, apple: { providerEnabled: true, webSessionVerified: true } };
  assert.deepEqual(availableSocialProviders('ios', providers), []);
  assert.deepEqual(availableSocialProviders('other', providers, true, { availableProviders: ['google'] }), []);
  assert.deepEqual(availableSocialProviders('android', providers, true, { availableProviders: ['apple'] }), ['apple']);
  const buttons = read('src/components/auth/SocialLoginButtons.jsx');
  assert.match(buttons, /else await nativeBridge\.login\(provider\)/); assert.match(buttons, /nativeBridge\.restore\(\)/);
  assert.match(buttons, /unsubscribe\(\); nativeBridge\.dispose\(\)/);
  assert.match(read('src/components/auth/AuthGate.jsx'), /cancelPendingNativeSocialAuth\(\);[\s\S]*const email = loginForm\.email/);
  assert.match(read('src/lib/authPersistence.js'), /function clearPersistedToken\(\)\s*\{\s*cancelPendingNativeSocialAuth\(\)/);
});
test('iOS scheme and Capacitor forwarding are declared; existing Android receiver stays', () => {
  assert.match(read('ios/App/App/Info.plist'), /CFBundleURLTypes[\s\S]*CFBundleURLSchemes[\s\S]*<string>silgapp<\/string>/);
  assert.match(read('ios/App/App/AppDelegate.swift'), /ApplicationDelegateProxy\.shared\.application\(app, open: url/);
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /android:scheme="silgapp"\s+android:host="auth-callback"/);
});

function renderNativeButtons(bridge, readiness = { google: { providerEnabled: true }, apple: { providerEnabled: true } }, props = {}) {
  const state = [], cleanups = [], calls = [], callbacks = { authenticated: 0, errors: [] };
  let observer, restores = 0, disposed = 0, unsubscribed = 0;
  if (bridge) Object.assign(bridge, { availableProviders: ['google', 'apple'],
    subscribe: value => { observer = value; return () => { unsubscribed++; }; },
    restore: async () => { restores++; }, dispose: async () => { disposed++; },
    login: async provider => { calls.push(['native', provider]); }, cancel: () => {} });
  const react = { __esModule: true, default: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState: value => [value, next => state.push(next)], useRef: value => ({ current: value }),
    useEffect: effect => { cleanups.push(effect()); } };
  const require = name => ({ react, '@capacitor/core': { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } },
    '@/api/base44Client': { base44: { auth: { loginWithProvider: () => calls.push(['web']) } } },
    '@/lib/socialAuth': { availableSocialProviders, beginSocialLogin: () => calls.push(['web']), SOCIAL_AUTH_READINESS: readiness },
    '@/lib/nativeSocialAuthRuntime': { getNativeSocialLoginBridge: () => null } })[name];
  const module = { exports: {} };
  const js = ts.transpileModule(read('src/components/auth/SocialLoginButtons.jsx'), { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require, window: { location: {} } });
  const node = module.exports.default({ nativeBridge: bridge, readiness, ...props,
    onAuthenticated: (...args) => { assert.equal(args.length, 0); callbacks.authenticated++; },
    onError: message => callbacks.errors.push(message) });
  const all = [];
  const visit = value => { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') {
    all.push(value); visit(value.props?.children); } };
  visit(node);
  return { node, all, state, calls, callbacks, get observer() { return observer; }, get restores() { return restores; },
    get disposed() { return disposed; }, get unsubscribed() { return unsubscribed; }, cleanup: () => cleanups.forEach(fn => fn?.()) };
}
test('actual native button delegates to the verified bridge, reruns AuthGate and cleans its subscription', async () => {
  const f = renderNativeButtons({});
  const google = f.all.find(node => node.type === 'button' && node.props.children.flat().includes('Google'));
  assert.ok(google); await google.props.onClick();
  assert.deepEqual(f.calls, [['native', 'google']]); assert.equal(f.restores, 1);
  f.observer.authenticated(USER); assert.equal(f.callbacks.authenticated, 1);
  f.cleanup(); await flush(); assert.equal(f.disposed, 1); assert.equal(f.unsubscribed, 1);
});
test('actual UI with disabled providers stays invisible and does not restore a pending session', () => {
  const f = renderNativeButtons({}, { google: { providerEnabled: false }, apple: { providerEnabled: false } });
  assert.equal(f.node, null); assert.equal(f.restores, 0); assert.equal(f.observer, undefined); f.cleanup();
});

test('email submission exclusion blocks social clicks even before a render, and social double clicks start once', async () => {
  for (const props of [{ disabled: true }, { onPendingChange: () => false }]) {
    const f = renderNativeButtons({}, undefined, props);
    const button = f.all.find(node => node.type === 'button');
    await button.props.onClick(); assert.equal(f.calls.length, 0); f.cleanup();
  }
  const changes = [], f = renderNativeButtons({}, undefined, { onPendingChange: value => changes.push(value) });
  const button = f.all.find(node => node.type === 'button');
  await Promise.all([button.props.onClick(), button.props.onClick()]);
  assert.equal(f.calls.length, 1); assert.deepEqual(changes, [true]);
  f.observer.error({ code: 'NATIVE_AUTH_CANCELLED' }); assert.deepEqual(changes, [true, false]);
  await button.props.onClick(); assert.equal(f.calls.length, 2); f.cleanup();
});

test('isolated candidate verification rejects a stalled fetch or body, malformed and oversized responses', async () => {
  const { api } = runtimeFixture();
  for (const fetcher of [async () => new Promise(() => {}), async () => new Response(new ReadableStream({ start() {} }),
    { headers: { 'Content-Type': 'application/json' } })]) {
    await assert.rejects(api.verifyNativeBase44Session(TOKEN, fetcher, { timeoutMs: 10 }));
  }
  for (const response of [new Response('{}', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{broken', { headers: { 'Content-Type': 'application/json' } }),
    Response.json(['wrong-shape']), Response.json({ padding: 'x'.repeat(65536) }),
    new Response(new Uint8Array([255]), { headers: { 'Content-Type': 'application/json' } })]) {
    await assert.rejects(api.verifyNativeBase44Session(TOKEN, async () => response));
  }
});

test('candidate verification aborts promptly even if a fetch adapter ignores cancellation', async () => {
  const { api } = runtimeFixture(), cancellation = new AbortController();
  let received;
  const result = api.verifyNativeBase44Session(TOKEN, async (_, options) => {
    received = options.signal; return new Promise(() => {});
  }, { signal: cancellation.signal });
  cancellation.abort(); await assert.rejects(result); assert.equal(received.aborted, true);
});
