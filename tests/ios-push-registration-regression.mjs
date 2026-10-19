import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const FCM = 'FCM_FIXTURE_ONLY_' + 'x'.repeat(120);
const CLIENT = { email: 'client@example.test', user_type: 'client', client_id: 'fixture-client' };
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

function actualFunction(path, name, bindings) {
  const source = read(path), tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const fn = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(fn, `actual function ${name}`);
  return new Function(...Object.keys(bindings), `return (${fn.getText(tree).replace(/^export\s+/, '')});`)(...Object.values(bindings));
}

function fixture(os = 'ios', permission = 'granted') {
  const events = new Map(), writes = [], logs = [], intervals = new Map();
  const windowListeners = new Map();
  let timerId = 0, androidCalls = 0, registrationCalls = 0, nativeToken = FCM;
  let signedIn = CLIENT;
  const handle = { remove: async () => {} };
  const native = {
    addListener: async (name, callback) => { events.set(name, callback); return handle; },
    createChannel: async () => { if (os !== 'android') { androidCalls++; throw Error('Android-only fixture'); } },
    checkPermissions: async () => ({ receive: permission }),
    requestPermissions: async () => ({ receive: permission }),
    register: async () => { registrationCalls++; await events.get('registration')?.({ value: nativeToken }); },
  };
  const androidOnly = async () => { androidCalls++; if (os !== 'android') throw Error('Android-only fixture'); return {}; };
  const custom = {
    addListener: async (name, callback) => { await androidOnly(); events.set(name, callback); return handle; },
    getLaunchNotificationData: androidOnly, getDeviceId: androidOnly,
    consumePendingFcmToken: androidOnly, confirmPendingFcmToken: androidOnly,
    requestNotificationPermission: async () => { await androidOnly(); return { receive: permission }; },
    getToken: async () => { await androidOnly(); return { token: nativeToken, platform: 'android' }; },
  };
  const api = { auth: { me: async () => signedIn }, functions: { invoke: async (name, payload) => { writes.push({ name, payload }); return { data: { success: true } }; } },
    entities: { NotificationToken: { filter: async () => [], update: async () => {}, create: async () => {} } } };
  const storage = new Map();
  const require = name => {
    if (name === '@/api/base44Client') return { base44: api };
    if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => os !== 'web', getPlatform: () => os }, registerPlugin: () => custom };
    if (name === '@capacitor/push-notifications') return { PushNotifications: native };
    if (name === '@capacitor/local-notifications') return { LocalNotifications: native };
    if (name === '@/lib/livreurUrgentAlert') return { isLivreurNewCourseNotification: () => false, saveLivreurAlertConfig: () => ({}), startUrgentCourseAlert: () => {}, stopUrgentCourseAlert: () => {} };
    throw Error('Unexpected fixture import: ' + name);
  };
  const module = { exports: {} };
  const context = { module, exports: module.exports, require, Date, Map, Promise,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    console: Object.fromEntries(['log', 'warn', 'error'].map(name => [name, (...args) => logs.push(args)])),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    window: {
      dispatchEvent: event => { for (const callback of windowListeners.get(event.type) || []) callback(event); },
      focus: () => {},
    },
    setTimeout: () => ++timerId, clearTimeout: () => {},
    setInterval: callback => { const id = ++timerId; intervals.set(id, callback); return id; },
    clearInterval: id => intervals.delete(id),
  };
  const output = ts.transpileModule(read('src/lib/notifications.js'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(output, context, { timeout: 1000 });
  return { auth: module.exports, api, native, writes, logs, events, storage,
    onWindow: (name, callback) => { const listeners = windowListeners.get(name) || []; listeners.push(callback); windowListeners.set(name, listeners); },
    setUser: user => { signedIn = user; }, setToken: token => { nativeToken = token; },
    androidCalls: () => androidCalls, registrations: () => registrationCalls,
    async register(user = CLIENT) {
      const result = module.exports.registerPushToken(null, user);
      let settled = false, value;
      result.then(resultValue => { settled = true; value = resultValue; });
      for (let turn = 0; turn < 500 && !settled; turn++) {
        await flush();
        for (const callback of [...intervals.values()]) await callback();
      }
      assert.equal(settled, true, 'registration fixture settles without real timers or network');
      return value;
    } };
}

test('actual iOS support/permission helpers use the native plugin without Android-only APIs', async () => {
  const f = fixture();
  const support = await f.auth.checkNotificationSupport();
  assert.equal(support.supported, true);
  assert.equal(support.platform, 'ios');
  assert.equal((await f.auth.requestNotificationPermission()).granted, true);
  assert.equal(f.androidCalls(), 0);
});

test('iOS registration persists the synthetic FCM value with client identity and no Android plugin calls', async () => {
  const f = fixture();
  assert.equal(await f.register(), FCM);
  assert.ok(f.writes.length > 0);
  for (const { payload } of f.writes) {
    assert.equal(payload.platform, 'ios'); assert.equal(payload.user_type, 'client');
    assert.equal(payload.client_id, CLIENT.client_id); assert.equal(payload.user_email, CLIENT.email);
  }
  assert.equal(f.androidCalls(), 0);
  assert.equal(JSON.stringify(f.logs).includes('FCM_FIXTURE_ONLY_'), false, 'no token or prefix in diagnostics');
});

test('iOS FCM refresh uses the current signed-in identity without losing another role', async () => {
  const f = fixture(); await f.register();
  const admin = { email: 'admin@example.test', user_type: 'admin', role: 'admin' };
  f.setUser(admin);
  await f.register(admin); f.writes.length = 0;
  await f.events.get('registration')({ value: 'FCM_ROTATION_FIXTURE_ONLY_' + 'y'.repeat(120) });
  assert.ok(f.writes.length > 0);
  assert.ok(f.writes.every(({ payload }) => payload.user_email === admin.email && payload.user_type === 'admin' && payload.platform === 'ios'));
});

test('iOS denial does not register or persist a token', async () => {
  const f = fixture('ios', 'denied');
  assert.equal(await f.register(), null); assert.equal(f.registrations(), 0); assert.equal(f.writes.length, 0);
});

test('existing Android direct registration and client identity remain available', async () => {
  const f = fixture('android');
  assert.equal(await f.register(), FCM);
  assert.ok(f.androidCalls() > 0);
  assert.ok(f.writes.every(({ payload }) => payload.platform === 'android' && payload.client_id === CLIENT.client_id));
});

test('Android direct registration installs foreground and warm-tap listeners before returning', async () => {
  const f = fixture('android');
  const scheduled = [], opened = [];
  f.native.schedule = async payload => { scheduled.push(payload); };
  f.auth.subscribeToNotificationOpened(event => opened.push(event.detail), CLIENT.email);
  assert.equal(await f.register(), FCM);
  for (const name of ['pushNotificationReceived', 'pushNotificationActionPerformed', 'registration', 'registrationError',
    'nativeNotificationOpened', 'silgapp:notification-tapped', 'silgapp:fcm-token-refreshed', 'localNotificationActionPerformed']) {
    assert.equal(typeof f.events.get(name), 'function', `installed ${name}`);
  }
  const foregroundData = { notification_id: 'foreground-fixture', type: 'nouveau_message', conversation_id: 'fixture-conversation' };
  f.events.get('pushNotificationReceived')({ title: 'Fixture', body: 'Fixture', data: foregroundData });
  await flush();
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].notifications[0].data.conversation_id, 'fixture-conversation');
  const tapData = { notification_id: 'warm-tap-fixture', type: 'nouveau_message', conversation_id: 'warm-conversation' };
  f.events.get('nativeNotificationOpened')({ data: tapData });
  f.events.get('pushNotificationActionPerformed')({ notification: { data: tapData }, actionId: 'tap' });
  assert.equal(opened.length, 1, 'duplicate native/Capacitor warm tap opens once');
  assert.equal(opened[0].conversation_id, 'warm-conversation');
});

test('iOS retained cold tap waits for the matching dashboard and is consumed once', async () => {
  const f = fixture('ios');
  const originalAdd = f.native.addListener;
  f.native.addListener = async (name, callback) => {
    const handle = await originalAdd(name, callback);
    if (name === 'pushNotificationActionPerformed') {
      callback({ actionId: 'tap', notification: { data: {
        notification_id: 'cold-fixture', type: 'nouveau_message', conversation_id: 'cold-conversation',
      } } });
    }
    return handle;
  };
  await f.register();
  const wrongAccount = [];
  const stopWrong = f.auth.subscribeToNotificationOpened(event => wrongAccount.push(event.detail), 'other@example.test');
  assert.equal(wrongAccount.length, 0);
  stopWrong();
  const opened = [];
  const stop = f.auth.subscribeToNotificationOpened(event => opened.push(event.detail), CLIENT.email);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].conversation_id, 'cold-conversation');
  stop();
  f.auth.subscribeToNotificationOpened(event => opened.push(event.detail), CLIENT.email);
  assert.equal(opened.length, 1, 'remount cannot replay an acknowledged cold tap');
  assert.equal(f.storage.has('silgapp_last_opened_notification'), false, 'opening payload is not persisted');
});

test('warm taps do not replay on remount and pending taps do not cross account changes', async () => {
  const f = fixture('ios');
  await f.register();
  const opened = [];
  const stop = f.auth.subscribeToNotificationOpened(event => opened.push(event.detail), CLIENT.email);
  f.events.get('pushNotificationActionPerformed')({ notification: { data: { notification_id: 'warm-fixture', type: 'nouveau_message' } } });
  stop();
  const stopRemount = f.auth.subscribeToNotificationOpened(event => opened.push(event.detail), CLIENT.email);
  assert.equal(opened.length, 1, 'handled warm tap never becomes pending');
  stopRemount();
  f.events.get('pushNotificationActionPerformed')({ notification: { data: { notification_id: 'old-account-pending', type: 'nouveau_message' } } });
  const next = { email: 'next@example.test', user_type: 'client', client_id: 'next-client' };
  f.setUser(next);
  await f.register(next);
  f.auth.subscribeToNotificationOpened(event => opened.push(event.detail), next.email);
  f.auth.subscribeToNotificationOpened(event => opened.push(event.detail), CLIENT.email);
  assert.equal(opened.length, 1, 'neither account receives the previous pending opening');
});

test('logout fences pending taps and token persistence before another account mounts', async () => {
  const f = fixture(); await f.register();
  const opened = [];
  f.events.get('pushNotificationActionPerformed')({ notification: { data: { notification_id: 'logout-tap', type: 'nouveau_message' } } });
  f.auth.resetNotificationSession();
  f.auth.subscribeToNotificationOpened(event => opened.push(event), CLIENT.email);
  f.writes.length = 0;
  await f.events.get('registration')({ value: 'LATE_LOGOUT_TOKEN_FIXTURE_ONLY' });
  assert.equal(f.writes.length, 0); assert.equal(opened.length, 0);
  const next = { email: 'next@example.test', user_type: 'client' };
  f.setUser(next); await f.register(next);
  f.auth.subscribeToNotificationOpened(event => opened.push(event), next.email);
  assert.equal(opened.length, 0);
});

test('push receipt signals refresh once without logging private payload or SDK headers', async () => {
  const f = fixture(); await f.register();
  const received = [];
  f.onWindow('silgapp:notification-received', event => received.push(event.detail));
  const data = { notification_id: 'private-fixture', type: 'on_route_proposal', token: 'SENSITIVE_FIXTURE',
    headers: { Authorization: 'Bearer SENSITIVE_FIXTURE' }, user_email: 'private@example.test' };
  await f.events.get('pushNotificationReceived')({ data });
  await f.events.get('pushNotificationReceived')({ data });
  await f.events.get('registrationError')({ message: 'Bearer SENSITIVE_FIXTURE', headers: data.headers });
  assert.equal(received.length, 1); assert.deepEqual(Object.keys(received[0]), ['type']);
  assert.equal(received[0].type, 'on_route_proposal');
  assert.doesNotMatch(JSON.stringify(f.logs), /SENSITIVE_FIXTURE|private@example/);
  assert.doesNotMatch(f.storage.get('silgapp_push_debug'), /SENSITIVE_FIXTURE|private@example/);
});

test('actual client hook preserves client_id during repeated token registration', () => {
  const registrations = [];
  const useClientNotifications = actualFunction('src/hooks/useClientNotifications.js', 'useClientNotifications', {
    useRef: value => ({ current: value }), useEffect: callback => callback(),
    registerPushToken: (...args) => { registrations.push(args); return Promise.resolve(); },
    subscribeToNotifications: () => () => {},
  });
  useClientNotifications(CLIENT.email, () => {}, CLIENT.client_id);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0][1].client_id, CLIENT.client_id);
  const app = read('src/pages/ClientExterneApp.jsx');
  const tree = ts.createSourceFile('ClientExterneApp.jsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let invocation;
  const walk = node => { if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useClientNotifications') invocation = node; ts.forEachChild(node, walk); };
  walk(tree);
  assert.equal(invocation.arguments[2]?.getText(tree), 'clientProfil?.id');
});

test('Swift source contract maps APNs to Firebase and forwards only FCM strings including refresh', () => {
  const swift = read('ios/App/App/AppDelegate.swift');
  assert.match(swift, /UIApplicationDelegate,\s*MessagingDelegate/);
  assert.match(swift, /Messaging\.messaging\(\)\.delegate\s*=\s*self/);
  assert.match(swift, /Messaging\.messaging\(\)\.apnsToken\s*=\s*deviceToken/);
  assert.match(swift, /Messaging\.messaging\(\)\.token\s*\{/);
  assert.match(swift, /didReceiveRegistrationToken\s+fcmToken:\s*String\?/);
  assert.match(swift, /object:\s*token\)/);
  assert.doesNotMatch(swift, /capacitorDidRegisterForRemoteNotifications,\s*object:\s*deviceToken/);
  assert.doesNotMatch(swift, /print\([^\n]*(?:fcmToken|deviceToken|\\\(token)/);
  const plugin = read('node_modules/@capacitor/push-notifications/ios/Plugin/PushNotificationsPlugin.swift');
  assert.match(plugin, /notification\.object as\? String/);
});

for (const os of ['ios', 'android']) {
  test(`${os}: registration keeps all four roles`, async () => {
    for (const user_type of ['client', 'admin', 'livreur', 'partenaire']) {
      const f = fixture(os);
      const user = { email: `${user_type}@example.test`, user_type, client_id: user_type === 'client' ? 'client-role-fixture' : '' };
      f.setUser(user);
      assert.equal(await f.register(user), FCM);
      assert.ok(f.writes.length);
      assert.ok(f.writes.every(({ payload }) => payload.user_type === user_type && payload.user_email === user.email));
    }
  });

  test(`${os}: logout refuses cached-token writes; login and rotation use the new account`, async () => {
    const f = fixture(os); await f.register(); f.writes.length = 0;
    f.setUser(null);
    assert.equal(await f.register(CLIENT), null, 'stale UI profile cannot override logged-out auth');
    await f.events.get('registration')?.({ value: 'LOGGED_OUT_ROTATION_FIXTURE_ONLY' });
    assert.equal(f.writes.length, 0);
    const next = { email: 'second@example.test', user_type: 'client', client_id: 'second-client-fixture' };
    f.setUser(next); await f.register(next); f.writes.length = 0;
    f.setToken('SECOND_ACCOUNT_ROTATION_FIXTURE_ONLY');
    await f.events.get('registration')?.({ value: 'SECOND_ACCOUNT_ROTATION_FIXTURE_ONLY' });
    // Android direct registration is retried by the existing foreground/login path.
    if (os === 'android') await f.register(next);
    assert.ok(f.writes.length);
    assert.ok(f.writes.every(({ payload }) => payload.user_email === next.email && payload.client_id === next.client_id));
    assert.ok(f.writes.every(({ payload }) => payload.token === 'SECOND_ACCOUNT_ROTATION_FIXTURE_ONLY'));
  });
}

test('delayed permission from an old iOS login cannot replace the new registration context', async () => {
  const f = fixture();
  let release;
  f.native.requestPermissions = () => new Promise(resolve => { release = resolve; });
  const old = f.auth.registerPushToken(null, CLIENT);
  await flush(); assert.equal(typeof release, 'function');
  const next = { email: 'second@example.test', user_type: 'client', client_id: 'second-client-fixture' };
  f.native.requestPermissions = async () => ({ receive: 'granted' });
  f.setUser(next); await f.register(next); f.writes.length = 0;
  release({ receive: 'granted' });
  assert.equal(await old, null);
  await f.events.get('registration')({ value: 'LATE_ROTATION_FIXTURE_ONLY' });
  assert.ok(f.writes.length);
  assert.ok(f.writes.every(({ payload }) => payload.user_email === next.email && payload.client_id === next.client_id));
});

test('an in-flight old-account failure cannot fall back after account switch', async () => {
  const f = fixture(); await f.register();
  let rejectOld, started;
  const startedPromise = new Promise(resolve => { started = resolve; });
  f.api.functions.invoke = () => new Promise((_, reject) => { rejectOld = reject; started(); });
  let entityWrites = 0;
  f.api.entities.NotificationToken.create = async () => { entityWrites++; };
  const old = f.events.get('registration')({ value: 'OLD_IN_FLIGHT_FIXTURE_ONLY' });
  await startedPromise;
  const next = { email: 'second@example.test', user_type: 'client', client_id: 'second-client-fixture' };
  f.setUser(next);
  f.api.functions.invoke = async (name, payload) => { f.writes.push({ name, payload }); return { data: { success: true } }; };
  const current = f.register(next);
  rejectOld(Error('Synthetic unavailable request')); await old; await current;
  assert.equal(entityWrites, 0, 'no old-account entity fallback');
  assert.equal(f.writes.at(-1).payload.user_email, next.email);
});

test('an old-account request already in flight finishes before the new account writes', async () => {
  const f = fixture(); await f.register();
  let release, started, owner;
  const startedPromise = new Promise(resolve => { started = resolve; });
  const invokeCurrent = async (name, payload) => { owner = payload.user_email; return { data: { success: true } }; };
  f.api.functions.invoke = async (name, payload) => {
    started();
    await new Promise(resolve => { release = resolve; });
    return invokeCurrent(name, payload);
  };
  const old = f.events.get('registration')({ value: 'IN_FLIGHT_SUCCESS_FIXTURE_ONLY' });
  await startedPromise;
  const next = { email: 'second@example.test', user_type: 'client', client_id: 'second-client-fixture' };
  f.setUser(next); f.api.functions.invoke = invokeCurrent;
  const current = f.register(next); await flush();
  release(); await old; await current;
  assert.equal(owner, next.email, 'old completion cannot overwrite the newer login');
});

test('an unavailable authentication check never falls back to a supplied stale profile', async () => {
  const f = fixture();
  f.api.auth.me = async () => { throw Error('Synthetic session unavailable'); };
  assert.equal(await f.register(), null);
  assert.equal(f.writes.length, 0);
});

test('iOS foreground receipt uses native presentation without an Android channel or duplicate local notification', async () => {
  const f = fixture(); let schedules = 0;
  f.native.schedule = async () => { schedules++; };
  await f.register();
  await f.events.get('pushNotificationReceived')({ title: 'Fixture', body: 'Fixture', data: { notification_id: 'fixture-only' } });
  assert.equal(f.androidCalls(), 0); assert.equal(schedules, 0);
  assert.match(read('capacitor.config.json'), /"presentationOptions"[\s\S]*"alert"/);
});

function backendFixture(initial = [], user = CLIENT) {
  const rows = structuredClone(initial), logs = [];
  let handler;
  const entities = { NotificationToken: {
    filter: async filter => rows.filter(row => Object.entries(filter).every(([key, value]) => row[key] === value)),
    update: async (id, payload) => { const row = rows.find(row => row.id === id); assert.ok(row); Object.assign(row, payload); return row; },
    create: async payload => { const row = { id: `fixture-${rows.length}`, created_date: '2026-01-01T00:00:00Z', ...payload }; rows.push(row); return row; },
  } };
  const source = ts.transpileModule(read('base44/functions/enregistrerTokenPush/entry.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  vm.runInNewContext(source, {
    exports: {}, require: () => ({ createClientFromRequest: () => ({ auth: { me: async () => user }, asServiceRole: { entities } }) }),
    Deno: { serve: callback => { handler = callback; } }, Response, Date, String, Promise,
    console: Object.fromEntries(['log', 'error'].map(name => [name, (...args) => logs.push(args)])),
  }, { timeout: 1000 });
  return { rows, logs, async register(payload) {
    const response = await handler({ method: 'POST', json: async () => payload });
    return { status: response.status, body: await response.json() };
  } };
}

for (const client_id of [undefined, null, '']) {
  test(`backend: ${String(client_id)} client_id preserves same-account identity, never old-account identity`, async () => {
    const initial = { id: 'existing', token: FCM, platform: 'ios', user_email: CLIENT.email, user_type: 'client', client_id: CLIENT.client_id, actif: true };
    const f = backendFixture([initial]);
    const payload = { token: FCM, platform: 'ios', user_email: CLIENT.email, user_type: 'client', client_id };
    assert.equal((await f.register(payload)).status, 200);
    assert.equal(f.rows[0].client_id, CLIENT.client_id);
    const other = backendFixture([{ ...initial, user_email: 'previous@example.test', client_id: 'previous-client' }]);
    assert.equal((await other.register(payload)).status, 200);
    assert.equal(other.rows[0].client_id, '');
    assert.equal(other.rows[0].user_email, CLIENT.email);
    assert.equal(JSON.stringify(f.logs).includes('FCM_FIXTURE_ONLY_'), false);
  });
}

test('backend: repeated registration is idempotent and does not deactivate another device', async () => {
  const f = backendFixture([{ id: 'other-device', token: 'OTHER_DEVICE_FIXTURE_ONLY', platform: 'ios', user_email: CLIENT.email,
    user_type: 'client', client_id: CLIENT.client_id, device_id: 'other', actif: true, created_date: '2025-01-01T00:00:00Z' }]);
  const payload = { token: FCM, platform: 'ios', user_email: CLIENT.email, user_type: 'client', client_id: CLIENT.client_id, device_id: 'current' };
  for (let i = 0; i < 5; i++) assert.equal((await f.register(payload)).status, 200);
  assert.equal(f.rows.length, 2); assert.equal(f.rows[0].actif, true);
  assert.equal(f.rows[1].client_id, CLIENT.client_id);
});

test('backend: non-admin cannot register for another account', async () => {
  const f = backendFixture();
  assert.equal((await f.register({ token: FCM, platform: 'ios', user_email: 'other@example.test', user_type: 'client' })).status, 403);
  assert.equal(f.rows.length, 0);
});

test('direct entity fallback preserves a known id only for the same account', async () => {
  for (const same of [true, false]) {
    const f = fixture();
    const existing = { id: 'existing', user_email: same ? CLIENT.email : 'previous@example.test', client_id: 'known-client' };
    const updates = [];
    f.api.functions.invoke = async () => { throw Error('Synthetic function outage'); };
    f.api.entities.NotificationToken.filter = async () => [existing];
    f.api.entities.NotificationToken.update = async (id, payload) => { updates.push(payload); };
    await f.register({ email: CLIENT.email, user_type: 'client', client_id: null });
    assert.ok(updates.length);
    assert.ok(updates.every(payload => payload.client_id === (same ? 'known-client' : '')));
  }
});

test('urgent native bridge runs only on Android while preserving start and stop arguments', async () => {
  for (const os of ['ios', 'android']) {
    const calls = [];
    const bindings = {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => os },
      SilgappPush: {
        startUrgentCourseAlert: async args => { calls.push(['start', args]); },
        stopUrgentCourseAlert: async () => { calls.push(['stop']); },
        stopUrgentCourseSound: async () => { calls.push(['stopSound']); },
      },
    };
    const start = actualFunction('src/lib/livreurUrgentAlert.js', 'startNativeUrgentAlert', bindings);
    const stop = actualFunction('src/lib/livreurUrgentAlert.js', 'stopNativeUrgentAlert', bindings);
    start({ courseId: 'fixture-course', notificationId: 'fixture-notification', showNotification: true }, { durationSeconds: 30, intervalSeconds: 5 });
    stop(true); stop(false); await flush();
    if (os === 'ios') assert.equal(calls.length, 0, 'iOS never calls the Android-only urgent plugin');
    else {
      assert.equal(calls.length, 3);
      assert.equal(calls[0][1].courseId, 'fixture-course');
      assert.equal(calls[0][1].durationMs, 30000); assert.equal(calls[0][1].intervalMs, 5000);
      assert.equal(calls[0][1].showNotification, true);
      assert.equal(calls[1][0], 'stop'); assert.equal(calls[2][0], 'stopSound');
    }
  }
});

test('iOS local notification schedules without Android channels and preserves tap routing in extra', async () => {
  const f = fixture('ios'); const scheduled = [], opened = [];
  f.native.schedule = async payload => { scheduled.push(payload); };
  await f.register();
  f.auth.subscribeToNotificationOpened(event => opened.push(event.detail), CLIENT.email);
  const data = { notification_id: 'ios-local-fixture', type: 'nouveau_message', conversation_id: 'fixture-conversation' };
  f.auth.showLocalNotification('Fixture', 'Body', { data }); await flush();
  assert.equal(f.androidCalls(), 0); assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].notifications[0].sound, 'default');
  assert.deepEqual(scheduled[0].notifications[0].extra, data);
  await f.events.get('localNotificationActionPerformed')({ actionId: 'tap', notification: { extra: data } });
  assert.equal(opened.length, 1); assert.equal(opened[0].conversation_id, data.conversation_id);
});

test('iOS local scheduling rejection stays contained and does not fall through to Android', async () => {
  const f = fixture('ios'); f.native.schedule = async () => { throw Error('fixture-only'); };
  f.auth.showLocalNotification('Fixture', 'Body', {}); await flush();
  assert.equal(f.androidCalls(), 0);
  assert.equal(JSON.stringify(f.logs).includes('fixture-only'), false);
});

test('iOS APNs registration failure does not log or forward raw native errors', () => {
  const swift=read('ios/App/App/AppDelegate.swift');
  assert.doesNotMatch(swift, /error\.localizedDescription|object: error\)/);
  assert.match(swift, /code: 2/);
});
