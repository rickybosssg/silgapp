// Client coordinator only. No production handoff transport or protected store is
// configured. A local adapter test is not proof that these server guarantees exist.
export const NATIVE_SOCIAL_READINESS = Object.freeze({
  serverHandoffVerified: false,
  singleUseStoreVerified: false,
  browserBindingVerified: false,
  protectedPendingStoreVerified: false,
  resumeClaimVerified: false,
  devices: Object.freeze({ ios: false, android: false }),
  providers: Object.freeze({ google: false, apple: false }),
});

const OPAQUE = /^[A-Za-z0-9_-]{43}$/;
const MAX_ATTEMPT_MS = 300000;
let authEpoch = 0;
let activeCancellation = null;

export function cancelPendingNativeSocialAuth() {
  authEpoch++;
  const cancel = activeCancellation;
  activeCancellation = null;
  cancel?.();
}

export function availableNativeSocialProviders(platform, readiness = NATIVE_SOCIAL_READINESS) {
  if (!['ios', 'android'].includes(platform) || readiness.devices?.[platform] !== true ||
      !['serverHandoffVerified', 'singleUseStoreVerified', 'browserBindingVerified',
        'protectedPendingStoreVerified', 'resumeClaimVerified'].every(key => readiness[key] === true)) return [];
  return ['google', 'apple'].filter(provider => readiness.providers?.[provider] === true);
}

function failure(code = 'NATIVE_AUTH_REJECTED') {
  const error = new Error(code === 'NATIVE_AUTH_CANCELLED'
    ? 'Connexion annulée.' : 'La connexion sécurisée n’a pas pu être validée. Réessayez.');
  error.code = code;
  return error;
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createNativeSocialAuthController({ platform, appId, returnUrl,
  browserOrigin, browserPath, transport, pendingStore, verifySession, commitSession,
  readiness = NATIVE_SOCIAL_READINESS, now = () => Date.now(), crypto = globalThis.crypto }) {
  const providers = availableNativeSocialProviders(platform, readiness);
  const origin = new URL(browserOrigin);
  const callback = new URL(returnUrl);
  if (!providers.length || origin.protocol !== 'https:' || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash ||
      returnUrl !== 'silgapp://auth-callback' || callback.search || callback.hash ||
      !browserPath?.startsWith('/') || browserPath.startsWith('//') || /[?#]/.test(browserPath) ||
      !appId || !transport?.begin || !transport?.redeem || !transport?.resume ||
      !pendingStore?.get || !pendingStore?.set || !pendingStore?.remove ||
      typeof verifySession !== 'function' || typeof commitSession !== 'function' ||
      !crypto?.getRandomValues || !crypto?.subtle?.digest) throw failure('NATIVE_AUTH_UNAVAILABLE');

  let attempt = null;
  let generation = 0;
  let storageQueue = Promise.resolve();
  const store = operation => {
    const result = storageQueue.then(operation, operation);
    storageQueue = result.catch(() => {});
    return result;
  };
  const nonce = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
  const current = value => attempt === value && value.generation === generation && value.epoch === authEpoch;
  const validRecord = value => value && value.appId === appId && value.returnUrl === returnUrl &&
    providers.includes(value.provider) && OPAQUE.test(value.id || '') && OPAQUE.test(value.state || '') &&
    OPAQUE.test(value.verifier || '') && Number.isFinite(value.expiresAt) &&
    value.expiresAt > now() && value.expiresAt <= now() + MAX_ATTEMPT_MS;

  function cancel() {
    const previous = attempt;
    generation++;
    attempt = null;
    if (activeCancellation === cancel) activeCancellation = null;
    if (previous?.id) store(() => pendingStore.remove(previous.id)).catch(() => {});
  }

  async function accept(value, reply) {
    if (!current(value)) throw failure('NATIVE_AUTH_CANCELLED');
    if (!reply || typeof reply.access_token !== 'string' || reply.access_token.length < 10 ||
        reply.access_token.length > 8192 || /\s/.test(reply.access_token) ||
        reply.app_id !== appId || typeof reply.user_id !== 'string' || !reply.user_id) throw failure();
    // verifySession uses a separate HTTPS request/client. Never install a candidate
    // token in the shared SDK or persistent stores before this identity is checked.
    const user = await verifySession(reply.access_token);
    if (!current(value)) throw failure('NATIVE_AUTH_CANCELLED');
    if (!validRecord(value) || !user?.id || user.id !== reply.user_id ||
        user.app_id !== appId || user.disabled === true) throw failure();
    // The existing session persistence is synchronous at this boundary. Do not
    // await a callback which could install an old session after an email login.
    if (commitSession(reply.access_token, user) !== true) throw failure();
    attempt = null;
    generation++;
    if (activeCancellation === cancel) activeCancellation = null;
    // A cleanup failure must not turn an already verified/installed session into
    // an apparent failed login. The consumed server code still cannot be reused.
    await store(() => pendingStore.remove(value.id)).catch(() => {});
    return user;
  }

  async function redeem(value, input, resumed = false) {
    if (!current(value) || !validRecord(value)) { cancel(); throw failure(); }
    if (value.redeeming) return false;
    value.redeeming = true;
    try {
      const request = { app_id: appId, transaction: value.id, state: value.state,
        verifier: value.verifier, return_url: returnUrl, ...input };
      const reply = await transport[resumed ? 'resume' : 'redeem'](request);
      if (!current(value)) throw failure('NATIVE_AUTH_CANCELLED');
      if (resumed && reply?.pending === true) return false;
      return await accept(value, reply);
    } catch (error) {
      if (current(value)) cancel();
      throw failure(error?.code === 'NATIVE_AUTH_CANCELLED' ? error.code : undefined);
    } finally { value.redeeming = false; }
  }

  return {
    providers: [...providers],
    get pending() { return !!attempt; },
    get redeeming() { return !!attempt?.redeeming; },
    async start(provider) {
      if (!providers.includes(provider)) throw failure('NATIVE_AUTH_UNAVAILABLE');
      cancelPendingNativeSocialAuth();
      const value = { appId, returnUrl, provider, id: nonce(), state: nonce(), verifier: nonce(),
        expiresAt: now() + MAX_ATTEMPT_MS, generation: ++generation, epoch: authEpoch };
      attempt = value;
      activeCancellation = cancel;
      try {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.verifier));
        if (!current(value)) throw failure('NATIVE_AUTH_CANCELLED');
        const reply = await transport.begin({ app_id: appId, provider, transaction: value.id,
          state: value.state, challenge: base64url(new Uint8Array(digest)),
          challenge_method: 'S256', return_url: returnUrl });
        if (!current(value)) throw failure('NATIVE_AUTH_CANCELLED');
        const url = new URL(reply?.browser_url);
        const keys = [...url.searchParams.keys()];
        if (reply?.transaction !== value.id || !Number.isFinite(reply.expires_at) ||
            reply.expires_at <= now() || reply.expires_at > value.expiresAt ||
            url.origin !== origin.origin || url.pathname !== browserPath ||
            url.username || url.password || url.hash || keys.length !== 2 ||
            new Set(keys).size !== 2 || !keys.every(key => ['transaction', 'state'].includes(key)) ||
            url.searchParams.get('transaction') !== value.id || url.searchParams.get('state') !== value.state) throw failure();
        value.expiresAt = reply.expires_at;
        await store(() => pendingStore.set({ appId, returnUrl, provider, id: value.id,
          state: value.state, verifier: value.verifier, expiresAt: value.expiresAt }));
        if (!current(value)) throw failure('NATIVE_AUTH_CANCELLED');
        return url.toString();
      } catch (error) {
        if (current(value)) cancel();
        throw failure(error?.code === 'NATIVE_AUTH_CANCELLED' ? error.code : undefined);
      }
    },
    async restore() {
      if (attempt) return true;
      if (activeCancellation && activeCancellation !== cancel) return false;
      const expectedGeneration = generation, expectedEpoch = authEpoch;
      const saved = await store(() => pendingStore.get());
      if (expectedGeneration !== generation || expectedEpoch !== authEpoch || !saved) return false;
      if (!validRecord(saved)) { if (saved.id) await store(() => pendingStore.remove(saved.id)); return false; }
      attempt = { ...saved, generation, epoch: authEpoch };
      activeCancellation = cancel;
      return true;
    },
    async receive(urlString) {
      if (!attempt) return false;
      let url;
      try { url = new URL(urlString); } catch { throw failure(); }
      // Ignore unrelated app links. A matching auth callback is strictly parsed.
      if (`${url.protocol}//${url.host}${url.pathname}` !== returnUrl) return false;
      const value = attempt, keys = [...url.searchParams.keys()];
      if (url.username || url.password || url.hash || keys.length !== 3 ||
          new Set(keys).size !== 3 || !keys.every(key => ['transaction', 'state', 'code'].includes(key)) ||
          url.searchParams.get('transaction') !== value.id || url.searchParams.get('state') !== value.state ||
          !OPAQUE.test(url.searchParams.get('code') || '')) throw failure();
      return redeem(value, { code: url.searchParams.get('code') });
    },
    async resume() { return attempt ? redeem(attempt, {}, true) : false; },
    cancel,
    async dispose() { cancel(); await storageQueue; },
  };
}
