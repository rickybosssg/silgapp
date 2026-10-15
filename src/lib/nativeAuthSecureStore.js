import { Capacitor, registerPlugin } from '@capacitor/core';

// Deliberately unused by the default runtime until native/server/device review.
// This bridge has no web or Preferences fallback and never stores session tokens.
const PLUGIN = 'SilgappAuthSecureStore';
const OPAQUE = /^[A-Za-z0-9_-]{43}$/;
const APP_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_BYTES = 2048;
const MAX_AGE_MS = 300000;
const FIELDS = ['appId', 'returnUrl', 'provider', 'id', 'state', 'verifier', 'expiresAt'];

function failure(code = 'NATIVE_AUTH_STORE_UNAVAILABLE') {
  return Object.assign(new Error('Stockage securise de connexion indisponible.'), { code });
}

function validRecord(value, appId) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== FIELDS.length || !keys.every(key => FIELDS.includes(key)) ||
      !FIELDS.every(key => Object.getOwnPropertyDescriptor(value, key)?.value !== undefined)) return false;
  return value.appId === appId && value.returnUrl === 'silgapp://auth-callback' &&
    ['google', 'apple'].includes(value.provider) &&
    ['id', 'state', 'verifier'].every(key => typeof value[key] === 'string' && OPAQUE.test(value[key])) &&
    Number.isSafeInteger(value.expiresAt);
}

export function createNativeAuthSecureStore({ appId, capacitor = Capacitor,
  plugin, now = () => Date.now(), register = registerPlugin } = {}) {
  if (typeof appId !== 'string' || !APP_ID.test(appId) || typeof now !== 'function' ||
      !capacitor?.isNativePlatform?.() || !['ios', 'android'].includes(capacitor.getPlatform?.()) ||
      capacitor.isLoggingEnabled) throw failure();
  if (!plugin) {
    if (!capacitor.isPluginAvailable?.(PLUGIN)) throw failure();
    plugin = register(PLUGIN);
  }
  if (!['setPending', 'getPending', 'removePending', 'clearPending']
    .every(name => typeof plugin?.[name] === 'function')) throw failure();

  let queue = Promise.resolve();
  const serialized = operation => {
    const next = queue.then(operation);
    queue = next.catch(() => {});
    return next;
  };
  const invoke = async (method, parameters = {}) => {
    // Capacitor 5 logs full bridge payloads when this flag is enabled.
    if (capacitor.isLoggingEnabled) throw failure();
    try { return await plugin[method]({ appId, ...parameters }); }
    catch { throw failure(); }
  };
  const usable = value => value.expiresAt > now() && value.expiresAt <= now() + MAX_AGE_MS;

  return Object.freeze({
    set(value) {
      // Snapshot before waiting so later caller mutation cannot cross the bridge.
      if (!validRecord(value, appId) || !usable(value)) return Promise.reject(failure('NATIVE_AUTH_STORE_INVALID'));
      const record = Object.fromEntries(FIELDS.map(key => [key, value[key]]));
      const serializedRecord = JSON.stringify(record);
      if (new TextEncoder().encode(serializedRecord).byteLength > MAX_BYTES) return Promise.reject(failure('NATIVE_AUTH_STORE_INVALID'));
      return serialized(async () => {
        if (!usable(record)) throw failure('NATIVE_AUTH_STORE_INVALID');
        await invoke('setPending', { value: serializedRecord });
      });
    },
    get() {
      return serialized(async () => {
        const reply = await invoke('getPending');
        if (reply?.value === null) return null;
        if (typeof reply?.value !== 'string' || new TextEncoder().encode(reply.value).byteLength > MAX_BYTES)
          throw failure('NATIVE_AUTH_STORE_INVALID');
        let record;
        try { record = JSON.parse(reply.value); } catch { throw failure('NATIVE_AUTH_STORE_INVALID'); }
        if (!validRecord(record, appId)) throw failure('NATIVE_AUTH_STORE_INVALID');
        if (record.expiresAt <= now()) {
          // Conditional deletion cannot erase a newer transaction from another caller.
          await invoke('removePending', { id: record.id });
          return null;
        }
        if (!usable(record)) throw failure('NATIVE_AUTH_STORE_INVALID');
        return record;
      });
    },
    remove(id) {
      if (typeof id !== 'string' || !OPAQUE.test(id)) return Promise.reject(failure('NATIVE_AUTH_STORE_INVALID'));
      return serialized(async () => { await invoke('removePending', { id }); });
    },
    clear() { return serialized(async () => { await invoke('clearPending'); }); },
  });
}
