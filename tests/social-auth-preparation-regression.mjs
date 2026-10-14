import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { availableSocialProviders, beginSocialLogin, SOCIAL_AUTH_READINESS } from '../src/lib/socialAuth.js';

const ready = { google: { providerEnabled: true, webSessionVerified: true }, apple: { providerEnabled: true, webSessionVerified: true } };
test('observed default Google ON and Apple ON stay hidden until session readiness is verified', () => {
  assert.deepEqual(availableSocialProviders('web'), []);
  assert.deepEqual(availableSocialProviders('web', { google: { providerEnabled: true } }), []);
  assert.deepEqual(availableSocialProviders('web', ready, false), []);
  assert.equal(SOCIAL_AUTH_READINESS.apple.providerEnabled, true);
  assert.equal(SOCIAL_AUTH_READINESS.google.providerEnabled, true);
  assert.equal(SOCIAL_AUTH_READINESS.google.oauthMode, 'default');
  assert.equal(SOCIAL_AUTH_READINESS.google.webSessionVerified, false);
});

function sourceFunction(path, name) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
  const fn = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(fn, `actual function ${name}`);
  return fn.getText(tree).replace(/^export\s+/, '');
}

function actualSdkAuth() {
  const redirects = [];
  const storage = new Map();
  const location = { origin: 'https://silga-dispatch-go.base44.app', set href(value) { redirects.push(value); } };
  const windowFixture = { location, localStorage: { setItem: (key, value) => storage.set(key, value) } };
  const create = new Function('window', 'resetAnalyticsSessionContext', 'isInsideIframe', 'loginViaPopup',
    `return (${sourceFunction('../node_modules/@base44/sdk/dist/modules/auth.js', 'createAuthModule')});`)(
    windowFixture, () => {}, () => false, () => { throw Error('No popup or network in this adapter'); });
  const requests = [];
  const api = { defaults: { headers: { common: {} } }, get: async path => {
    requests.push({ path, authorization: api.defaults.headers.common.Authorization });
    return { id: 'fixture-user', email: 'fixture@example.test', is_verified: true, silgapp_role: 'client', country_code: 'BF', enterprise_id: null };
  } };
  const functions = { defaults: { headers: { common: {} } } };
  return { auth: create(api, functions, 'fixture-app', { appBaseUrl: location.origin }), api, functions, redirects, requests, storage };
}

test('actual installed SDK constructs its documented Google and Apple browser routes', () => {
  const sdk = actualSdkAuth();
  for (const provider of ['google', 'apple']) {
    beginSocialLogin({ provider, platform: 'web', readiness: ready, auth: sdk.auth,
      location: { origin: 'https://silga-dispatch-go.base44.app', pathname: '/livreur' } });
    const url = new URL(sdk.redirects.at(-1));
    assert.equal(url.origin, 'https://silga-dispatch-go.base44.app');
    assert.equal(url.pathname, provider === 'google' ? '/api/apps/auth/login' : '/api/apps/auth/apple/login');
    assert.equal(url.searchParams.get('app_id'), 'fixture-app');
    assert.equal(url.searchParams.get('from_url'), 'https://silga-dispatch-go.base44.app/livreur');
    assert.deepEqual([...url.searchParams.keys()].sort(), ['app_id', 'from_url']);
  }
  assert.equal(sdk.requests.length, 0, 'URL construction is not an OAuth login or consent');
  assert.equal(sdk.auth.hasToken(), false, 'starting OAuth does not create a Base44 session');
});

function actualEmailLogin(sdk, fetchResponse) {
  const source = readFileSync(new URL('../src/components/auth/AuthGate.jsx', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('AuthGate.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const variables = tree.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]);
  const save = variables.find(node => node.name.getText(tree) === 'saveAuthToken');
  const keys = variables.find(node => node.name.getText(tree) === 'AUTH_TOKEN_KEYS');
  const persisted = [], posts = [];
  const storage = { setItem: (key, value) => sdk.storage.set(key, value) };
  const saveToken = new Function('AUTH_TOKEN_KEYS', 'localStorage', 'base44', 'persistToken', `return (${save.initializer.getText(tree)});`)(
    JSON.parse(keys.initializer.getText(tree)), storage, { setToken: value => sdk.auth.setToken(value) }, value => persisted.push(value));
  const login = new Function('getBase44AppId', 'fetch', 'APP_PUBLIC_URL', 'saveAuthToken',
    `return (${sourceFunction('../src/components/auth/AuthGate.jsx', 'loginWithEmailPassword')});`)(
    () => 'fixture-app', async (url, options) => { posts.push({ url, options }); return { ok: fetchResponse.ok, json: async () => fetchResponse.payload }; },
    'https://silga-dispatch-go.base44.app', saveToken);
  return { login, persisted, posts };
}

test('actual existing email login installs only its Base44 response session and SDK me uses it', async () => {
  const sdk = actualSdkAuth();
  const token = 'isolated-base44-session-fixture';
  const adapter = actualEmailLogin(sdk, { ok: true, payload: { access_token: token } });
  await adapter.login('fixture@example.test', 'isolated-test-password');
  assert.equal(adapter.posts[0].url, 'https://silga-dispatch-go.base44.app/api/apps/fixture-app/auth/login');
  assert.equal(adapter.posts[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(adapter.posts[0].options.body), { email: 'fixture@example.test', password: 'isolated-test-password' });
  assert.deepEqual(adapter.persisted, [token]);
  assert.equal(sdk.functions.defaults.headers.common.Authorization, `Bearer ${token}`);
  const user = await sdk.auth.me();
  assert.equal(user.id, 'fixture-user');
  assert.deepEqual(sdk.requests, [{ path: '/apps/fixture-app/entities/User/me', authorization: `Bearer ${token}` }]);
  assert.equal(sdk.redirects.length, 0, 'email login has no external-browser return to solve');
});

test('existing email login refuses failed or provider-token-only responses without persisting a session', async () => {
  for (const response of [{ ok: false, payload: { message: 'isolated refusal' } },
    { ok: true, payload: { identityToken: 'isolated-provider-identity-fixture' } }, { ok: true, payload: {} }]) {
    const sdk = actualSdkAuth(); const adapter = actualEmailLogin(sdk, response);
    await assert.rejects(adapter.login('fixture@example.test', 'isolated-test-password'));
    assert.deepEqual(adapter.persisted, []);
    assert.equal(sdk.storage.size, 0);
    assert.equal(sdk.auth.hasToken(), false);
  }
});
test('native iOS/Android never navigate their embedded WebView to OAuth', () => {
  for (const platform of ['ios', 'android']) {
    let navigations = 0;
    assert.deepEqual(availableSocialProviders(platform, ready), []);
    for (const provider of ['google', 'apple']) assert.throws(() => beginSocialLogin({ provider, platform,
      auth: { loginWithProvider: () => { navigations++; } }, location: { origin: 'capacitor://localhost' }, readiness: ready }));
    assert.equal(navigations, 0);
  }
});
test('verified browser flow delegates identity/session to Base44 without passing query secrets', () => {
  for (const provider of ['google', 'apple']) {
    const calls = [];
    beginSocialLogin({ provider, platform: 'web', readiness: ready,
      auth: { loginWithProvider: (...args) => calls.push(args) },
      location: { origin: 'https://silga-dispatch-go.base44.app', pathname: '/livreur', search: '?access_token=fixture', hash: '#fixture' } });
    assert.deepEqual(calls, [[provider, 'https://silga-dispatch-go.base44.app/livreur']]);
  }
});
test('unknown provider, unverified platform and hostile callback cannot start a flow', () => {
  const calls = [];
  const input = { platform: 'web', readiness: ready, auth: { loginWithProvider: (...args) => calls.push(args) }, location: { origin: 'javascript:fixture', pathname: '/' } };
  assert.throws(() => beginSocialLogin({ ...input, provider: 'google' }));
  assert.throws(() => beginSocialLogin({ ...input, provider: 'other' }));
  assert.deepEqual(calls, []);
  beginSocialLogin({ ...input, provider: 'google', location: { origin: 'https://silga-dispatch-go.base44.app', pathname: '//other.invalid' } });
  assert.deepEqual(calls[0], ['google', 'https://silga-dispatch-go.base44.app/']);
});
