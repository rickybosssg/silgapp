// Inert service contract: no endpoint, schema, provider, credentials or Base44
// adapter is installed here. `enabled` defaults to false. Capability assertions
// below are prerequisites for a separately reviewed adapter, NOT platform proof.
//
// Store contract (all operations are private to the server):
// - insertUnique enforces unique (app_id, transaction) across all instances.
// - readUnique is a bounded read; it is NEVER a replacement for CAS.
// - compareAndSet tests every `where` equality and expires_at > not_expired_at,
//   atomically with the update. Issued bindings/ciphertext are immutable.
// Receipts require outcome:'confirmed', success:true, has_more:false and exactly
// inserted/updated:1. An ambiguous call returns no session and is never retried
// internally; the native coordinator cancels its pending attempt on this error.
// A lost winning reply is fenced only if the adapter committed consumed. If an
// uncertain operation was NOT applied, this module cannot claim a distributed
// terminal tombstone: a separately submitted valid proof may still claim once.
// No get-then-ordinary-update/delete fallback exists.
//
// Browser adapter must verify auth.me in the expected app AND prior transaction
// binding + CSRF/session continuity. It must not trust body identity/provider or
// assume native/WebView cookies are shared. Vault must use authenticated sealing
// bound to the supplied context, with key rotation/purge reviewed separately.

const OPAQUE = /^[A-Za-z0-9_-]{43}$/;
const opaque = value => typeof value === 'string' && OPAQUE.test(value);
const APP_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_TTL_MS = 300000;
const RECORD_KEYS = new Set(['app_id', 'transaction', 'provider', 'state_hash',
  'challenge', 'challenge_method', 'return_url', 'created_at', 'expires_at',
  'status', 'revision', 'user_id', 'browser_binding_hash', 'code_hash',
  'sealed_session', 'issued_at', 'consumed_at', 'claim_id']);

function rejected(code = 'NATIVE_OAUTH_REJECTED') {
  const error = new Error(code);
  error.code = code;
  return error;
}

function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (![null, Object.prototype].includes(Object.getPrototypeOf(value))) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every(key => typeof key === 'string' &&
    Object.hasOwn(descriptors[key], 'value') && descriptors[key].enumerable === true);
}

function exactInput(value, required) {
  if (!plain(value) || Reflect.ownKeys(value).length !== required.length ||
      !required.every(key => Object.hasOwn(value, key))) throw rejected();
  return Object.freeze({ ...value });
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    !/[\s\x00-\x1f\x7f]/.test(value);
}

function session(value, appId) {
  if (!plain(value) || value.app_id !== appId || !identifier(value.user_id) ||
      typeof value.access_token !== 'string' || value.access_token.length < 10 ||
      value.access_token.length > 8192 || /[\s\x00-\x1f\x7f]/.test(value.access_token)) throw rejected();
  return { access_token: value.access_token, user_id: value.user_id, app_id: appId };
}

function confirmed(receipt, count) {
  if (!plain(receipt) || receipt.success !== true || receipt.outcome !== 'confirmed' ||
      receipt.has_more !== false || receipt.uncertain === true || receipt.error != null ||
      receipt[count] !== 1) throw rejected();
}

export function createNativeOAuthHandoffService(options = {}) {
  if (!plain(options)) throw rejected('NATIVE_OAUTH_UNAVAILABLE');
  const { enabled = false, appId, browserOrigin, browserPath, returnUrl,
    ttlMs = 60000, store, browser, vault, now = () => Date.now(), crypto = globalThis.crypto } = options;
  let origin;
  try { origin = new URL(browserOrigin); } catch { throw rejected('NATIVE_OAUTH_UNAVAILABLE'); }
  if (enabled !== true || typeof appId !== 'string' || !APP_ID.test(appId) ||
      origin.protocol !== 'https:' || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash ||
      typeof browserPath !== 'string' || !/^\/(?:[A-Za-z0-9_-]+\/?)+$/.test(browserPath) ||
      returnUrl !== 'silgapp://auth-callback' || !Number.isSafeInteger(ttlMs) ||
      ttlMs <= 0 || ttlMs > MAX_TTL_MS || typeof now !== 'function' ||
      typeof crypto?.getRandomValues !== 'function' || typeof crypto?.subtle?.digest !== 'function' ||
      !['insertUnique', 'readUnique', 'compareAndSet'].every(key => typeof store?.[key] === 'function') ||
      !['uniqueAppTransaction', 'atomicCompareAndSet', 'immutableIssuedBindings', 'serverOnly']
        .every(key => store.capabilities?.[key] === true) ||
      typeof browser?.verifyCompletion !== 'function' ||
      !['authenticatedAppIdentity', 'transactionBinding', 'csrfContinuity']
        .every(key => browser.capabilities?.[key] === true) ||
      typeof vault?.seal !== 'function' || typeof vault?.open !== 'function' ||
      !['authenticatedSealing', 'contextBinding'].every(key => vault.capabilities?.[key] === true)) {
    throw rejected('NATIVE_OAUTH_UNAVAILABLE');
  }

  let lastTime = -1;
  function time() {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0 || value < lastTime) throw rejected();
    lastTime = value;
    return value;
  }
  const digest = async value => base64url(new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(value))));
  const nonce = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
  const safe = operation => async (...args) => {
    try { return await operation(...args); } catch { throw rejected(); }
  };

  function common(input) {
    if (input.app_id !== appId || !opaque(input.transaction || '') ||
        !opaque(input.state || '') || input.return_url !== returnUrl) throw rejected();
  }

  function validateRecord(record, input, stateHash) {
    const current = time();
    if (!plain(record) || Object.keys(record).some(key => !RECORD_KEYS.has(key)) ||
        record.app_id !== appId || record.transaction !== input.transaction ||
        record.state_hash !== stateHash || record.return_url !== returnUrl ||
        !['google', 'apple'].includes(record.provider) || record.challenge_method !== 'S256' ||
        Object.hasOwn(record, 'consumed_at') || Object.hasOwn(record, 'claim_id') ||
        !opaque(record.challenge || '') || !Number.isSafeInteger(record.created_at) ||
        !Number.isSafeInteger(record.expires_at) || record.created_at > current ||
        record.expires_at <= current || record.expires_at - record.created_at !== ttlMs ||
        !['pending', 'issued'].includes(record.status) ||
        record.revision !== (record.status === 'pending' ? 0 : 1)) throw rejected();
    if (record.status === 'pending') {
      if (['code_hash', 'sealed_session', 'user_id', 'browser_binding_hash', 'issued_at']
        .some(key => Object.hasOwn(record, key))) throw rejected();
    } else if (!opaque(record.code_hash || '') || !opaque(record.browser_binding_hash || '') ||
        !identifier(record.user_id) || typeof record.sealed_session !== 'string' ||
        !record.sealed_session || record.sealed_session.length > 65536 ||
        !Number.isSafeInteger(record.issued_at) || record.issued_at < record.created_at ||
        record.issued_at > current || record.issued_at >= record.expires_at) throw rejected();
    return { ...record };
  }

  async function load(input) {
    const stateHash = await digest(input.state);
    const result = await store.readUnique({ app_id: appId, transaction: input.transaction });
    if (!plain(result) || result.success !== true || result.outcome !== 'confirmed' ||
        result.has_more !== false || result.uncertain === true || result.error != null ||
        !Array.isArray(result.rows) || result.rows.length !== 1) throw rejected();
    return validateRecord(result.rows[0], input, stateHash);
  }

  function predicate(record) {
    const current = time();
    if (current >= record.expires_at) throw rejected();
    return { app_id: appId, transaction: record.transaction, provider: record.provider,
      state_hash: record.state_hash, challenge: record.challenge, challenge_method: 'S256',
      return_url: returnUrl, created_at: record.created_at, expires_at: record.expires_at,
      status: record.status, revision: record.revision, not_expired_at: current,
      ...(record.status === 'issued' ? { code_hash: record.code_hash, user_id: record.user_id,
        browser_binding_hash: record.browser_binding_hash, issued_at: record.issued_at,
        sealed_session: record.sealed_session } : {}) };
  }

  function vaultContext(record) {
    return Object.freeze({ app_id: appId, transaction: record.transaction, provider: record.provider,
      user_id: record.user_id, state_hash: record.state_hash, challenge: record.challenge,
      return_url: returnUrl, code_hash: record.code_hash, browser_binding_hash: record.browser_binding_hash,
      created_at: record.created_at, issued_at: record.issued_at, expires_at: record.expires_at });
  }

  const begin = safe(async input => {
    input = exactInput(input, ['app_id', 'provider', 'transaction', 'state', 'challenge', 'challenge_method', 'return_url']);
    common(input);
    if (!['google', 'apple'].includes(input.provider) || input.challenge_method !== 'S256' ||
        !opaque(input.challenge || '')) throw rejected();
    const created = time();
    if (!Number.isSafeInteger(created + ttlMs)) throw rejected();
    const record = { app_id: appId, transaction: input.transaction, provider: input.provider,
      state_hash: await digest(input.state), challenge: input.challenge, challenge_method: 'S256',
      return_url: returnUrl, created_at: created, expires_at: created + ttlMs, status: 'pending', revision: 0 };
    confirmed(await store.insertUnique({ app_id: appId, transaction: input.transaction, record }), 'inserted');
    if (time() >= record.expires_at) throw rejected();
    const url = new URL(browserPath, origin);
    url.searchParams.set('transaction', input.transaction);
    url.searchParams.set('state', input.state);
    return { transaction: input.transaction, browser_url: url.toString(), expires_at: record.expires_at };
  });

  // Not a public HTTP entry. The wrapper must supply the trusted browser context
  // to the independently verified browser adapter; a JSON body cannot assert it.
  const completeBrowser = safe(async (input, browserContext) => {
    input = exactInput(input, ['app_id', 'transaction', 'state', 'return_url']);
    common(input);
    const record = await load(input);
    if (record.status !== 'pending') throw rejected();
    const proof = await browser.verifyCompletion({ context: browserContext, transaction: Object.freeze({
      app_id: appId, transaction: record.transaction, state: input.state, provider: record.provider,
      challenge: record.challenge, challenge_method: 'S256', return_url: returnUrl,
      created_at: record.created_at, expires_at: record.expires_at }) });
    if (!plain(proof) || proof.authenticated !== true || proof.csrf_verified !== true ||
        proof.transaction_bound !== true || proof.disabled === true || proof.provider !== record.provider ||
        proof.transaction !== record.transaction || proof.state_hash !== record.state_hash ||
        proof.challenge !== record.challenge || proof.return_url !== returnUrl ||
        proof.expires_at !== record.expires_at ||
        !opaque(proof.browser_binding || '')) throw rejected();
    const identity = session(proof, appId);
    const code = nonce();
    if (!opaque(code)) throw rejected();
    const issued = { ...record, status: 'issued', revision: 1, user_id: identity.user_id,
      browser_binding_hash: await digest(proof.browser_binding), code_hash: await digest(code), issued_at: time() };
    if (issued.issued_at >= record.expires_at) throw rejected();
    const context = vaultContext(issued);
    const sealed = await vault.seal({ payload: identity, context });
    if (typeof sealed !== 'string' || !sealed || sealed.length > 65536 || sealed.includes(identity.access_token)) throw rejected();
    // Round-trip checks catch an incomplete/misbound adapter; they do NOT certify
    // encryption strength, key custody or production backup/logging protections.
    const opened = session(await vault.open({ sealed, context }), appId);
    if (opened.user_id !== identity.user_id || opened.access_token !== identity.access_token) throw rejected();
    confirmed(await store.compareAndSet({ where: predicate(record), set: { status: 'issued', revision: 1,
      user_id: issued.user_id, browser_binding_hash: issued.browser_binding_hash,
      code_hash: issued.code_hash, issued_at: issued.issued_at, sealed_session: sealed } }), 'updated');
    if (time() >= record.expires_at) throw rejected();
    const url = new URL(returnUrl);
    url.searchParams.set('code', code);
    url.searchParams.set('state', input.state);
    url.searchParams.set('transaction', input.transaction);
    return { return_url: url.toString() };
  });

  async function claim(input, resumed) {
    input = exactInput(input, ['app_id', 'transaction', 'state', 'verifier', 'return_url', ...(resumed ? [] : ['code'])]);
    common(input);
    if (!opaque(input.verifier || '') || (!resumed && !opaque(input.code || ''))) throw rejected();
    const record = await load(input);
    if (await digest(input.verifier) !== record.challenge) throw rejected();
    if (record.status === 'pending') {
      if (resumed) return { pending: true };
      throw rejected();
    }
    if (!resumed && await digest(input.code) !== record.code_hash) throw rejected();
    const where = predicate(record), consumed = time(), claimId = nonce();
    if (!opaque(claimId)) throw rejected();
    confirmed(await store.compareAndSet({ where, set: { status: 'consumed', revision: 2,
      consumed_at: consumed, claim_id: claimId, sealed_session: null } }), 'updated');
    if (time() >= record.expires_at) throw rejected();
    const candidate = session(await vault.open({ sealed: record.sealed_session, context: vaultContext(record) }), appId);
    if (candidate.user_id !== record.user_id || time() >= record.expires_at) throw rejected();
    return candidate;
  }

  return Object.freeze({ begin, completeBrowser,
    redeem: safe(input => claim(input, false)), resume: safe(input => claim(input, true)) });
}
