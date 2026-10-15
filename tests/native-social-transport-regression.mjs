import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNativeSocialAuthTransport as create } from '../src/lib/nativeSocialAuthTransport.js';
const nonce = c => c.repeat(43);
const appId = 'fixture-app', endpoint = 'https://oauth.invalid/api/apps/fixture-app/functions/fixtureHandoff';
const config = { appId, origin: 'https://oauth.invalid', endpoint, verified: true };
const begin = { app_id: appId, provider: 'google', transaction: nonce('a'), state: nonce('b'), challenge: nonce('c'), challenge_method: 'S256', return_url: 'silgapp://auth-callback' };
const resume = { app_id: appId, transaction: nonce('a'), state: nonce('b'), verifier: nonce('d'), return_url: 'silgapp://auth-callback' };
const redeem = { ...resume, code: nonce('e') };
const session = { app_id: appId, user_id: 'fixture-user', access_token: 'FAKE_BASE44_SESSION_FOR_LOCAL_TESTS_ONLY' };
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
test('closed without explicit verified endpoint; malformed or foreign targets are refused before fetch', () => {
  for (const override of [{ verified: false }, { endpoint: 'http://oauth.invalid/api/apps/fixture-app/functions/x' },
    { endpoint: endpoint + '?access_token=fixture' }, { endpoint: endpoint + '#fragment' },
    { endpoint: endpoint.replace('oauth.invalid', 'foreign.invalid') }, { endpoint: endpoint.replace('fixture-app', 'other-app') },
    { endpoint: 'https://user:pass@oauth.invalid/api/apps/fixture-app/functions/x' }, { endpoint: endpoint + '/other' }]) {
    assert.throws(() => create({ ...config, ...override }, { fetcher: () => assert.fail('no network') }), { code: 'NATIVE_AUTH_UNAVAILABLE' });
  }
  assert.throws(() => create(), { code: 'NATIVE_AUTH_UNAVAILABLE' });
});
test('all native operations POST strict JSON to the configured app without cookies or URL tokens', async () => {
  const requests = [];
  const transport = create(config, { fetcher: async (url, options) => {
    requests.push({ url, options }); const { action } = JSON.parse(options.body);
    return json(action === 'begin' ? { transaction: nonce('a'), browser_url: 'https://oauth.invalid/native-auth?transaction=' + nonce('a') + '&state=' + nonce('b'), expires_at: 1234 } : session);
  } });
  await transport.begin(begin); await transport.redeem(redeem); await transport.resume(resume);
  assert.equal(requests.length, 3);
  for (const { url, options } of requests) {
    assert.equal(url, endpoint); assert.equal(options.method, 'POST'); assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error'); assert.equal(options.referrerPolicy, 'no-referrer'); assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Authorization, undefined); assert.ok(options.signal instanceof AbortSignal);
    assert.equal(JSON.parse(options.body).app_id, appId); assert.ok(!url.includes('verifier'));
  }
});
test('wrong app, callback, provider, challenge and extra credentials never reach the network', async () => {
  const transport = create(config, { fetcher: () => assert.fail('no network') });
  for (const value of [{ ...begin, app_id: 'foreign' }, { ...begin, provider: 'password' },
    { ...begin, challenge_method: 'plain' }, { ...begin, state: 'short' }, { ...begin, challenge: '' },
    { ...begin, return_url: 'silgapp://auth-callback?token=fixture' }, { ...begin, access_token: 'fixture' }]) {
    await assert.rejects(transport.begin(value), { code: 'NATIVE_AUTH_TRANSPORT_REJECTED' });
  }
  let invoked = false;
  const input = { ...redeem }; Object.defineProperty(input, 'verifier', { enumerable: true, get() { invoked = true; return nonce('d'); } });
  await assert.rejects(transport.redeem(input)); assert.equal(invoked, false);
  const objectNonce = { toString() { invoked = true; return nonce('a'); } };
  await assert.rejects(transport.redeem({ ...redeem, transaction: objectNonce })); assert.equal(invoked, false);
  await assert.rejects(transport.redeem(new Proxy(redeem, { ownKeys() { throw Error('PRIVATE_FIXTURE_DETAIL'); } })),
    error => error.code === 'NATIVE_AUTH_TRANSPORT_REJECTED' && !error.message.includes('PRIVATE_FIXTURE_DETAIL'));
});
test('pending resume is preserved; foreign users/apps and malformed session replies are refused', async () => {
  assert.deepEqual(await create(config, { fetcher: async () => json({ pending: true }) }).resume(resume), { pending: true });
  for (const result of [{ ...session, app_id: 'foreign' }, { ...session, access_token: 'short' },
    { ...session, access_token: 'contains whitespace' }, { ...session, user_id: null },
    { ...session, extra: true }, { pending: true }, null, []]) {
    await assert.rejects(create(config, { fetcher: async () => json(result) }).redeem(redeem));
  }
});
test('HTTP errors, redirects, HTML, invalid JSON and oversized responses return generic errors', async () => {
  for (const response of [new Response('private server diagnostic FAKE_ONLY', { status: 500 }),
    new Response('<html>sign in</html>', { headers: { 'content-type': 'text/html' } }),
    new Response('{bad JSON', { headers: { 'content-type': 'application/json' } }),
    json({ ...session, access_token: 'x'.repeat(20000) })]) {
    await assert.rejects(create(config, { fetcher: async () => response }).redeem(redeem), error => {
      assert.equal(error.code, 'NATIVE_AUTH_TRANSPORT_REJECTED'); assert.ok(!error.message.includes('FAKE_ONLY')); return true;
    });
  }
  await assert.rejects(create(config, { fetcher: async () => ({ ok: true, redirected: true }) }).redeem(redeem));
});
test('timeout aborts the request and never returns a late response', async () => {
  let aborted = false;
  const transport = create(config, { timeoutMs: 5, fetcher: (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('FAKE timeout detail')); }, { once: true });
  }) });
  await assert.rejects(transport.redeem(redeem), { code: 'NATIVE_AUTH_TIMEOUT' }); assert.equal(aborted, true);
});
test('runtime still has no configured endpoint and all real readiness gates stay OFF', () => {
  const read = path => readFileSync(new URL('../src/lib/' + path, import.meta.url), 'utf8');
  assert.match(read('nativeSocialAuthRuntime.js'), /const NATIVE_SOCIAL_CONFIGURATION = null;/);
  assert.ok(!read('nativeSocialAuthRuntime.js').includes('createNativeSocialAuthTransport'));
  for (const key of ['serverHandoffVerified', 'singleUseStoreVerified', 'browserBindingVerified', 'protectedPendingStoreVerified', 'resumeClaimVerified']) {
    assert.ok(read('nativeSocialAuth.js').includes(key + ': false'));
  }
});
