import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { base44 } from '@/api/base44Client';
import { APP_PUBLIC_URL, BASE44_APP_ID } from '@/lib/app-params';
import { persistToken } from '@/lib/authPersistence';
import { availableNativeSocialProviders, createNativeSocialAuthController } from './nativeSocialAuth';

// No endpoint or protected-store implementation is assumed or deployed.
// Fill this only after the server contract and real device flow are verified.
const NATIVE_SOCIAL_CONFIGURATION = null;
let defaultBridge = null;

export async function verifyNativeBase44Session(token, fetcher = globalThis.fetch, { signal, timeoutMs = 15000 } = {}) {
  const rejected = () => new Error('Session non validée.');
  if (typeof token !== 'string' || token.length < 10 || token.length > 8192 || /[\s\x00-\x1f\x7f]/.test(token) ||
      !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30000) throw rejected();
  const controller = new AbortController();
  let reader, timer, abortListener;
  const interrupted = new Promise((_, reject) => {
    abortListener = () => { controller.abort(); reject(rejected()); };
    if (signal?.aborted) abortListener();
    else signal?.addEventListener('abort', abortListener, { once: true });
    timer = setTimeout(abortListener, timeoutMs);
  });
  const target = `${APP_PUBLIC_URL}/api/apps/${BASE44_APP_ID}/entities/User/me`;
  const verify = async () => {
    if (controller.signal.aborted) throw rejected();
    const response = await fetcher(target, {
      method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { Authorization: `Bearer ${token}`, 'X-App-Id': BASE44_APP_ID, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (controller.signal.aborted || !response.ok || response.redirected || (response.url && response.url !== target) ||
        !/^application\/json(?:\s*;|$)/i.test(response.headers?.get('content-type') || '') || !response.body?.getReader) throw rejected();
    reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (controller.signal.aborted) throw rejected();
      if (done) break;
      length += value.byteLength;
      if (length > 65536) throw rejected();
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const user = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!user || typeof user !== 'object' || Array.isArray(user)) throw rejected();
    return user;
  };
  try { return await Promise.race([interrupted, verify()]); }
  catch { controller.abort(); throw rejected(); }
  finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortListener);
    if (reader) {
      // Never await an uncooperative stream while finishing cancellation.
      reader.cancel().catch(() => {});
      try { reader.releaseLock(); } catch { /* An outstanding read may still settle. */ }
    }
  }
}

export function createCapacitorNativeSocialAuth(configuration, dependencies = {}) {
  const platform = dependencies.platform || (Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web');
  if (!configuration || !availableNativeSocialProviders(platform, configuration.readiness).length) return null;
  const app = dependencies.app || App, browser = dependencies.browser || Browser;
  const observers = new Set(), handles = [];
  let disposed = false, preparing = null, verification = null;
  const abortVerification = () => { verification?.abort(); verification = null; };
  const notify = (type, value) => { if (!disposed) for (const observer of observers) observer[type]?.(value); };
  const safeError = error => Object.assign(new Error(error?.code === 'NATIVE_AUTH_CANCELLED'
    ? 'Connexion annulée.' : 'La connexion sécurisée n’a pas pu être validée.'), { code: error?.code });
  const controller = createNativeSocialAuthController({ ...configuration,
    platform, appId: BASE44_APP_ID, returnUrl: 'silgapp://auth-callback', browserOrigin: APP_PUBLIC_URL,
    verifySession: async token => {
      abortVerification();
      const request = new AbortController();
      verification = request;
      try { return await (dependencies.verifySession || verifyNativeBase44Session)(token, undefined, { signal: request.signal }); }
      finally { if (verification === request) verification = null; }
    },
    commitSession: dependencies.commitSession || (token => {
      base44.auth.setToken(token);
      persistToken(token);
      return true;
    }),
  });
  const finish = async operation => {
    try {
      const user = await operation();
      if (user && !disposed) {
        await browser.close().catch(() => {});
        notify('authenticated', user);
      }
    } catch (error) { notify('error', safeError(error)); }
  };
  const add = async (plugin, name, callback) => {
    const handle = await plugin.addListener(name, callback);
    if (disposed) await handle.remove(); else handles.push(handle);
  };
  const prepare = () => {
    if (disposed) return Promise.reject(safeError({ code: 'NATIVE_AUTH_CANCELLED' }));
    if (!preparing) preparing = (async () => {
      await add(app, 'appUrlOpen', event => finish(() => controller.receive(event?.url)));
      await add(app, 'appStateChange', state => { if (state?.isActive) return finish(() => controller.resume()); });
      await add(browser, 'browserFinished', () => {
        if (controller.pending && !controller.redeeming) {
          abortVerification();
          controller.cancel();
          notify('error', safeError({ code: 'NATIVE_AUTH_CANCELLED' }));
        }
      });
    })();
    return preparing;
  };
  return {
    availableProviders: [...controller.providers],
    get disposed() { return disposed; },
    subscribe(observer) { observers.add(observer); return () => observers.delete(observer); },
    async login(provider) {
      try {
        await prepare();
        const url = await controller.start(provider);
        if (disposed) throw safeError({ code: 'NATIVE_AUTH_CANCELLED' });
        await browser.open({ url });
      } catch (error) { controller.cancel(); throw safeError(error); }
    },
    async restore() {
      await prepare();
      if (!(await controller.restore())) return;
      const launch = await app.getLaunchUrl();
      return finish(async () => (launch?.url && await controller.receive(launch.url)) || await controller.resume());
    },
    cancel() {
      abortVerification();
      controller.cancel();
      browser.close().catch(() => {});
      notify('error', safeError({ code: 'NATIVE_AUTH_CANCELLED' }));
    },
    async dispose() {
      disposed = true;
      abortVerification();
      observers.clear();
      await controller.dispose();
      await Promise.all(handles.splice(0).map(handle => handle.remove()));
    },
  };
}

export function getNativeSocialLoginBridge() {
  if (!NATIVE_SOCIAL_CONFIGURATION) return null;
  if (!defaultBridge || defaultBridge.disposed) defaultBridge = createCapacitorNativeSocialAuth(NATIVE_SOCIAL_CONFIGURATION);
  return defaultBridge;
}
