// Prepared transport only: no endpoint is configured by the application runtime.
// Native cookies are deliberately not assumed to be shared with the browser.
const OPAQUE = /^[A-Za-z0-9_-]{43}$/;
const opaque = value => typeof value === 'string' && OPAQUE.test(value);
const RETURN_URL = 'silgapp://auth-callback';
const MAX_BYTES = 16384;
const FIELDS = Object.freeze({
  begin: ['app_id', 'provider', 'transaction', 'state', 'challenge', 'challenge_method', 'return_url'],
  redeem: ['app_id', 'transaction', 'state', 'verifier', 'return_url', 'code'],
  resume: ['app_id', 'transaction', 'state', 'verifier', 'return_url'],
});

function failure(code = 'NATIVE_AUTH_TRANSPORT_REJECTED') {
  return Object.assign(new Error('La connexion sécurisée ne peut pas être vérifiée.'), { code });
}
function fields(value, names) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== names.length ||
        names.some(key => !descriptors[key] || !('value' in descriptors[key]))) throw failure();
    return Object.fromEntries(names.map(key => [key, descriptors[key].value]));
  } catch { throw failure(); }
}
async function readJson(response) {
  let text;
  if (response.body?.getReader) {
    const reader = response.body.getReader(), chunks = [];
    let total = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) { await reader.cancel().catch(() => {}); throw failure(); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } finally { reader.releaseLock(); }
  } else {
    text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw failure();
  }
  return JSON.parse(text);
}

export function createNativeSocialAuthTransport({ appId, origin, endpoint, verified = false } = {}, {
  fetcher = globalThis.fetch, timeoutMs = 15000,
  AbortControllerImpl = globalThis.AbortController,
} = {}) {
  let host, target;
  try { host = new URL(origin); target = new URL(endpoint); } catch { throw failure('NATIVE_AUTH_UNAVAILABLE'); }
  const prefix = `/api/apps/${appId}/functions/`;
  if (verified !== true || typeof appId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(appId) ||
      host.protocol !== 'https:' || host.username || host.password || host.pathname !== '/' || host.search || host.hash ||
      target.origin !== host.origin || target.username || target.password || target.search || target.hash ||
      !target.pathname.startsWith(prefix) || !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(target.pathname.slice(prefix.length)) ||
      typeof fetcher !== 'function' || typeof AbortControllerImpl !== 'function' ||
      !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30000) throw failure('NATIVE_AUTH_UNAVAILABLE');

  async function request(action, input) {
    const payload = fields(input, FIELDS[action]);
    if (payload.app_id !== appId || payload.return_url !== RETURN_URL ||
        !opaque(payload.transaction) || !opaque(payload.state) ||
        (action === 'begin'
          ? !['google', 'apple'].includes(payload.provider) || payload.challenge_method !== 'S256' || !opaque(payload.challenge)
          : !opaque(payload.verifier) || (action === 'redeem' && !opaque(payload.code)))) throw failure();
    const controller = new AbortControllerImpl();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetcher(target.toString(), {
        method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-App-Id': appId },
        body: JSON.stringify({ action, ...payload }), signal: controller.signal,
      });
      if (!response?.ok || response.redirected || (response.url && response.url !== target.toString()) ||
          !/^application\/json(?:\s*;|$)/i.test(response.headers?.get('content-type') || '')) throw failure();
      const result = await readJson(response);
      if (timedOut || controller.signal.aborted) throw failure();
      if (action === 'begin') return fields(result, ['transaction', 'browser_url', 'expires_at']);
      if (action === 'resume' && result?.pending === true) return fields(result, ['pending']);
      const session = fields(result, ['access_token', 'user_id', 'app_id']);
      if (session.app_id !== appId || typeof session.user_id !== 'string' || !session.user_id || session.user_id.length > 128 || /[\s\x00-\x1f\x7f]/.test(session.user_id) ||
          typeof session.access_token !== 'string' || session.access_token.length < 10 ||
          session.access_token.length > 8192 || /[\s\x00-\x1f\x7f]/.test(session.access_token)) throw failure();
      return session;
    } catch { throw failure(timedOut ? 'NATIVE_AUTH_TIMEOUT' : undefined); }
    finally { clearTimeout(timer); }
  }
  return Object.freeze(Object.fromEntries(Object.keys(FIELDS).map(action => [action, input => request(action, input)])));
}
