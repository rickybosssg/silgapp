import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
import * as auth from '../src/lib/nativeSocialAuth.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('src/lib/nativeAuthSecureStore.js');
const unavailable = () => { throw new Error('No native bridge in this synthetic test'); };
const exportsModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText, { module: exportsModule, exports: exportsModule.exports,
  require: name => { assert.equal(name, '@capacitor/core'); return { Capacitor: {}, registerPlugin: unavailable }; },
  Object, Reflect, Array, Number, String, Set, Promise, TextEncoder, Date, JSON, Error });
const { createNativeAuthSecureStore } = exportsModule.exports;
const APP = '6a0ec08f3af5e1d1284254c1';
const record = (change = {}) => ({ appId: APP, returnUrl: 'silgapp://auth-callback', provider: 'google',
  id: 'i'.repeat(43), state: 's'.repeat(43), verifier: 'v'.repeat(43), expiresAt: 1060000, ...change });
function fixture(platform = 'ios') {
  let raw = null, time = 1000000;
  const calls = [];
  const plugin = {
    async setPending(input) { calls.push(['setPending', input]); raw = input.value; },
    async getPending(input) { calls.push(['getPending', input]); return { value: raw }; },
    async removePending(input) { calls.push(['removePending', input]);
      if (raw && JSON.parse(raw).id === input.id) raw = null; },
    async clearPending(input) { calls.push(['clearPending', input]); raw = null; },
  };
  const capacitor = { isNativePlatform: () => true, getPlatform: () => platform, isPluginAvailable: () => true };
  const options = { appId: APP, capacitor, plugin, now: () => time };
  return { plugin, options, calls, store: createNativeAuthSecureStore(options),
    get raw() { return raw; }, set raw(value) { raw = value; }, advance: ms => { time += ms; } };
}

for (const platform of ['ios', 'android']) test(platform + ': actual JS stores only the strict pending record and clears it', async () => {
  const f = fixture(platform), value = record();
  assert.equal(await f.store.get(), null);
  await f.store.set(value); assert.deepEqual(await f.store.get(), value);
  assert.equal(f.calls.every(([, input]) => input.appId === APP), true);
  await f.store.clear(); assert.equal(await f.store.get(), null);
});

test('web, missing or partial native bridge fail closed without storage fallback', () => {
  const f = fixture();
  for (const options of [{ ...f.options, capacitor: { isNativePlatform: () => false } },
    { ...f.options, capacitor: { isNativePlatform: () => true, getPlatform: () => 'other' } },
    { ...f.options, plugin: undefined, capacitor: { ...f.options.capacitor, isPluginAvailable: () => false } },
    { ...f.options, plugin: { getPending() {} } }]) assert.throws(() => createNativeAuthSecureStore(options),
    error => error.code === 'NATIVE_AUTH_STORE_UNAVAILABLE');
  assert.equal(f.calls.length, 0);
  assert.equal(/localStorage|sessionStorage|indexedDB|Preferences/.test(source.replace(/^\/\/.*$/gm, '')), false);
});

test('default Capacitor5 plugin registration is lazy and uses the exact native name', () => {
  const f = fixture(), names = [];
  const store = createNativeAuthSecureStore({ ...f.options, plugin: undefined, register: name => { names.push(name); return f.plugin; } });
  assert.ok(store); assert.deepEqual(names, ['SilgappAuthSecureStore']);
});

test('Capacitor bridge payload logging prevents construction and each later sensitive operation', async () => {
  const f = fixture();
  assert.throws(() => createNativeAuthSecureStore({ ...f.options,
    capacitor: { ...f.options.capacitor, isLoggingEnabled: true } }));
  f.options.capacitor.isLoggingEnabled = true;
  await assert.rejects(f.store.set(record())); await assert.rejects(f.store.get());
  await assert.rejects(f.store.remove('i'.repeat(43))); await assert.rejects(f.store.clear());
  assert.equal(f.calls.length, 0);
});

test('invalid app scope, token fields, getters, types and oversized records never cross the bridge', async () => {
  const f = fixture();
  for (const change of [{ appId: 'another-app' }, { returnUrl: 'silgapp://other' }, { provider: 'password' },
    { id: 123 }, { state: 's'.repeat(42) }, { verifier: 'v'.repeat(10000) },
    { access_token: 'SYNTHETIC_TOKEN_NOT_ALLOWED' }, { expiresAt: '1060000' }, { expiresAt: NaN },
    { expiresAt: 1060000.5 }, { expiresAt: 1300001 }, { expiresAt: 1000000 }]) {
    await assert.rejects(f.store.set(record(change)), error => error.code === 'NATIVE_AUTH_STORE_INVALID');
  }
  const withGetter = record(); Object.defineProperty(withGetter, 'state', { get() { throw Error('must not be evaluated'); } });
  await assert.rejects(f.store.set(withGetter));
  assert.equal(f.calls.length, 0);
  assert.throws(() => createNativeAuthSecureStore({ ...f.options, appId: '../../other' }));
});

test('expiration removes only the matching transaction and returns no verifier', async () => {
  const f = fixture(); await f.store.set(record()); f.advance(60000);
  assert.equal(await f.store.get(), null); assert.equal(f.raw, null);
  assert.equal(f.calls.at(-1)[0], 'removePending'); assert.equal(f.calls.at(-1)[1].id, 'i'.repeat(43));
});

test('conditional removal cannot erase a newer attempt', async () => {
  const f = fixture(); await f.store.set(record());
  await f.store.set(record({ id: 'n'.repeat(43) })); await f.store.remove('i'.repeat(43));
  assert.equal((await f.store.get()).id, 'n'.repeat(43));
  await f.store.remove('n'.repeat(43)); assert.equal(await f.store.get(), null);
});

test('corrupt, foreign, future, additional-field and oversized native replies are rejected', async () => {
  const f = fixture();
  for (const raw of [undefined, 23, {}, 'not-json', 'x'.repeat(2049), JSON.stringify(record({ appId: 'foreign' })),
    JSON.stringify(record({ access_token: 'SYNTHETIC_TOKEN' })), JSON.stringify(record({ expiresAt: 1300001 })),
    JSON.stringify(record({ verifier: false })), JSON.stringify([]), 'null']) {
    f.raw = raw;
    await assert.rejects(f.store.get(), error => error.code === 'NATIVE_AUTH_STORE_INVALID');
  }
  assert.equal(f.calls.some(([name]) => name === 'setPending'), false);
});

test('native exceptions are sanitized and a failed operation does not poison the queue', async () => {
  const f = fixture(); f.plugin.setPending = async () => { throw Error('SYNTHETIC_PRIVATE_DATA'); };
  await assert.rejects(f.store.set(record()), error => !error.message.includes('SYNTHETIC_PRIVATE_DATA') &&
    error.code === 'NATIVE_AUTH_STORE_UNAVAILABLE');
  f.plugin.getPending = async () => ({ value: null }); assert.equal(await f.store.get(), null);
  f.plugin.clearPending = async () => { throw Error('SYNTHETIC_PRIVATE_DATA'); };
  await assert.rejects(f.store.clear(), error => !error.message.includes('SYNTHETIC_PRIVATE_DATA'));
});

test('queued operations preserve call order, snapshot values and recheck expiration before writing', async () => {
  const f = fixture(); let release;
  f.plugin.getPending = async () => new Promise(resolve => { release = () => resolve({ value: null }); });
  const first = f.store.get(); await Promise.resolve();
  const input = record(), second = f.store.set(input); input.verifier = 'm'.repeat(43);
  release(); await first; await second; assert.equal(JSON.parse(f.raw).verifier, 'v'.repeat(43));
  const delayed = f.store.get(); await Promise.resolve();
  const expiring = f.store.set(record()); f.advance(60000); release(); await delayed;
  await assert.rejects(expiring, error => error.code === 'NATIVE_AUTH_STORE_INVALID');
});

test('default native social configuration and readiness remain disabled', () => {
  assert.match(read('src/lib/nativeSocialAuthRuntime.js'), /const NATIVE_SOCIAL_CONFIGURATION = null/);
  assert.match(read('src/lib/nativeSocialAuth.js'), /protectedPendingStoreVerified: false/);
});

test('actual coordinator starts and cold-restores through the real JS store with a synthetic native bridge', async () => {
  const f = fixture(), ready = { serverHandoffVerified: true, singleUseStoreVerified: true,
    browserBindingVerified: true, protectedPendingStoreVerified: true, resumeClaimVerified: true,
    devices: { ios: true }, providers: { google: true } };
  const options = { platform: 'ios', appId: APP, returnUrl: 'silgapp://auth-callback',
    browserOrigin: 'https://fixture.invalid', browserPath: '/native/start', readiness: ready,
    pendingStore: f.store, now: () => 1000000, crypto: webcrypto,
    transport: { begin: async request => ({ transaction: request.transaction, expires_at: 1060000,
      browser_url: 'https://fixture.invalid/native/start?transaction=' + request.transaction + '&state=' + request.state }),
    redeem: async () => { throw Error('No real exchange'); }, resume: async () => ({ pending: true }) },
    verifySession: async () => { throw Error('No real session'); }, commitSession: () => false };
  const controller = auth.createNativeSocialAuthController(options);
  const url = await controller.start('google');
  assert.equal(url.includes(JSON.parse(f.raw).verifier), false);
  const cold = await import('../src/lib/nativeSocialAuth.js?secure-store-cold');
  const restored = cold.createNativeSocialAuthController(options);
  assert.equal(await restored.restore(), true); assert.equal(await restored.resume(), false);
  await restored.dispose(); auth.cancelPendingNativeSocialAuth(); await controller.dispose();
  assert.equal(f.raw, null);
});

test('native source contracts: Keychain device-only, Keystore AES-GCM authenticated ciphertext and bounded app scope', () => {
  const swift = read('ios/App/App/SilgappAuthSecureStorePlugin.swift');
  const objc = read('ios/App/App/SilgappAuthSecureStorePlugin.m');
  const java = read('android/app/src/main/java/com/silgapp2/app/SilgappAuthSecureStorePlugin.java');
  assert.match(swift, /kSecAttrAccessibleWhenUnlockedThisDeviceOnly/);
  assert.match(swift, /kSecAttrSynchronizable as String: false/);
  assert.match(swift, /SecItemCopyMatching/); assert.match(swift, /SecItemUpdate/); assert.match(swift, /SecItemDelete/);
  assert.match(objc, /CAP_PLUGIN\(SilgappAuthSecureStorePlugin, "SilgappAuthSecureStore"/);
  for (const method of ['setPending', 'getPending', 'removePending', 'clearPending']) {
    assert.match(objc, new RegExp('CAP_PLUGIN_METHOD\\(' + method + ', CAPPluginReturnPromise\\)'));
    assert.match(java, new RegExp('void ' + method + '\\(PluginCall call\\)'));
    assert.match(swift, new RegExp('@objc func ' + method + '\\('));
  }
  assert.match(java, /KeyStore.getInstance\("AndroidKeyStore"\)/);
  assert.match(java, /Cipher.getInstance\("AES\/GCM\/NoPadding"\)/);
  assert.match(java, /cipher.updateAAD\(associatedData\(\)\)/);
  assert.match(java, /new GCMParameterSpec\(128,/);
  assert.match(java, /setRandomizedEncryptionRequired\(true\)/);
  assert.match(java, /getNoBackupFilesDir\(\)/); assert.match(java, /new AtomicFile/);
  assert.match(java, /if \(!create\) throw new IllegalStateException\(\)/);
  assert.match(java, /private SecretKey key\(boolean create\)/);
  assert.match(java, /cipher.init\(Cipher.DECRYPT_MODE, key\(false\)/);
  assert.match(java, /requireUnlocked\(\)/);
  for (const nativeSource of [swift, java]) {
    assert.equal(nativeSource.includes(APP), true);
    assert.equal(/UserDefaults|SharedPreferences|System\.out|NSLog|print\(|Logger\./.test(nativeSource), false);
  }
});

test('native registration, when applied, is unique, correctly ordered and includes both iOS compile sources', () => {
  const activity = read('android/app/src/main/java/com/silgapp2/app/MainActivity.java');
  const registration = 'registerPlugin(SilgappAuthSecureStorePlugin.class);';
  const registrations = activity.split(registration).length - 1;
  assert.ok(registrations <= 1);
  if (registrations) {
    const onCreate = activity.indexOf('public void onCreate(Bundle savedInstanceState)');
    assert.ok(activity.indexOf(registration) > onCreate);
    assert.ok(activity.indexOf(registration) < activity.indexOf('super.onCreate(savedInstanceState)', onCreate));
  }
  const project = read('ios/App/App.xcodeproj/project.pbxproj');
  if (!project.includes('SilgappAuthSecureStorePlugin')) return; // Separate prepared patch can be reviewed before application.
  const sourceSection = project.split('/* Begin PBXSourcesBuildPhase section */')[1].split('/* End PBXSourcesBuildPhase section */')[0];
  const appGroup = project.split('504EC3061FED79650016851F /* App */ = {')[1].split('path = App;')[0];
  for (const extension of ['swift', 'm']) {
    const file = 'SilgappAuthSecureStorePlugin.' + extension;
    const escaped = file.replaceAll('.', '\\.');
    const references = [...project.matchAll(new RegExp('([A-F0-9]{24}) /\\* ' + escaped + ' \\*/ = \\{isa = PBXFileReference;', 'g'))];
    assert.equal(references.length, 1);
    const builds = [...project.matchAll(new RegExp('([A-F0-9]{24}) /\\* ' + escaped + ' in Sources \\*/ = \\{isa = PBXBuildFile; fileRef = ' + references[0][1], 'g'))];
    assert.equal(builds.length, 1);
    assert.ok(sourceSection.includes(builds[0][1] + ' /* ' + file + ' in Sources */'));
    assert.ok(appGroup.includes(references[0][1] + ' /* ' + file + ' */'));
  }
});

test('native plugin registration has no storage reads or key generation at load', () => {
  const java = read('android/app/src/main/java/com/silgapp2/app/SilgappAuthSecureStorePlugin.java');
  const swift = read('ios/App/App/SilgappAuthSecureStorePlugin.swift');
  assert.equal(/void load\(|SilgappAuthSecureStorePlugin\s*\(/.test(java), false);
  assert.equal(/override.*func load\(|init\(/.test(swift), false);
  const keyMethod = java.slice(java.indexOf('private SecretKey key(boolean create)'), java.indexOf('private byte[] encrypt'));
  assert.equal((java.match(/generator\.generateKey\(\)/g) || []).length, 1);
  assert.ok(keyMethod.includes('generator.generateKey()'));
  assert.ok(keyMethod.indexOf('if (!create)') < keyMethod.indexOf('generator.generateKey()'));
  assert.equal((java.match(/key\(true\)/g) || []).length, 1);
  assert.ok(java.slice(java.indexOf('private byte[] encrypt'), java.indexOf('private String decrypt')).includes('key(true)'));
});

test('Android source imposes the Keystore unlocked-device policy on API28+ and has no unrestricted fallback', () => {
  const java = read('android/app/src/main/java/com/silgapp2/app/SilgappAuthSecureStorePlugin.java');
  const keyMethod = java.slice(java.indexOf('private SecretKey key(boolean create)'), java.indexOf('private byte[] encrypt'));
  const preflight = java.slice(java.indexOf('private void requireUnlocked()'), java.indexOf('private SecretKey key'));
  const versionGuard = 'if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) throw new IllegalStateException();';
  assert.ok(keyMethod.includes(versionGuard)); assert.ok(preflight.includes(versionGuard));
  assert.ok(keyMethod.indexOf(versionGuard) < keyMethod.indexOf('KeyStore.getInstance'));
  assert.match(keyMethod, /\.setUnlockedDeviceRequired\(true\)/);
  assert.match(java, /\.auth-pending\.unlocked\.v1/);
  assert.equal(/setUnlockedDeviceRequired\(false\)/.test(java), false);
  assert.equal(/isUnlockedDeviceRequired\(\)/.test(java), false);
});

test('actual coordinator cancels the previous transaction and removes the verified successful transaction once', async () => {
  const f = fixture(), commits = [], user = { id: 'fixture-user', app_id: APP };
  const ready = { serverHandoffVerified: true, singleUseStoreVerified: true,
    browserBindingVerified: true, protectedPendingStoreVerified: true, resumeClaimVerified: true,
    devices: { ios: true }, providers: { google: true } };
  const options = { platform: 'ios', appId: APP, returnUrl: 'silgapp://auth-callback',
    browserOrigin: 'https://fixture.invalid', browserPath: '/native/start', readiness: ready,
    pendingStore: f.store, now: () => 1000000, crypto: webcrypto,
    transport: { begin: async request => ({ transaction: request.transaction, expires_at: 1060000,
      browser_url: 'https://fixture.invalid/native/start?transaction=' + request.transaction + '&state=' + request.state }),
    redeem: async () => ({ access_token: 'SYNTHETIC_SESSION_FIXTURE_ONLY', app_id: APP, user_id: user.id }),
    resume: async () => ({ pending: true }) }, verifySession: async () => user,
    commitSession: (token, verifiedUser) => { commits.push([token, verifiedUser]); return true; } };
  const first = auth.createNativeSocialAuthController(options);
  await first.start('google'); const old = JSON.parse(f.raw);
  const second = auth.createNativeSocialAuthController(options);
  await second.start('google'); const current = JSON.parse(f.raw);
  assert.notEqual(old.id, current.id);
  await f.store.remove(old.id); assert.equal(JSON.parse(f.raw).id, current.id);
  const callback = value => 'silgapp://auth-callback?transaction=' + value.id + '&state=' + value.state + '&code=' + 'c'.repeat(43);
  assert.equal(await first.receive(callback(old)), false);
  assert.deepEqual(await second.receive(callback(current)), user);
  assert.equal(commits.length, 1); assert.equal(f.raw, null);
  assert.equal(await second.receive(callback(current)), false);
  await first.dispose(); await second.dispose();
});
