import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createScopedRefreshQueue } from '../src/lib/scopedRefreshQueue.js';

const read = name => readFileSync(process.env.SILGAPP_PERF_BASELINE_ROOT && name.startsWith('src/pages/')
  ? resolve(process.env.SILGAPP_PERF_BASELINE_ROOT, name) : new URL('../' + name, import.meta.url), 'utf8');
function tree(name) { return ts.createSourceFile(name, read(name), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); }
function find(root, predicate) {
  if (predicate(root)) return root;
  return ts.forEachChild(root, node => find(node, predicate));
}
function effectContaining(root, text) {
  return find(root, n => ts.isCallExpression(n) && n.expression.getText(root) === 'useEffect' && n.arguments[0]?.getText(root).includes(text));
}
function evaluate(text, context) {
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return vm.runInNewContext(js, context);
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

function timerFixture() {
  let now = 0, sequence = 0, cleanup, previousDeps;
  const timers = new Map(), calls = [];
  const context = {
    clientProfil: { country_code: 'BF' }, position: { latitude: 1, longitude: 2 }, lastPosRef: { current: null },
    loadLivreursProches: pos => calls.push({ at: now, latitude: pos.latitude }),
    setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; },
    setInterval: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: now + delay, delay }); return id; },
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
  };
  const root = tree('src/pages/ClientExterneApp.jsx'), node = effectContaining(root, 'const pollLivreurs');
  assert.ok(node, 'execute the actual courier-counter effect');
  const render = () => {
    context.lastPosRef.current = context.position;
    context.hasCounterPosition = !!context.position;
    const deps = evaluate(node.arguments[1].getText(root), context);
    if (!previousDeps || deps.some((value, i) => !Object.is(value, previousDeps[i]))) {
      cleanup?.(); cleanup = evaluate('(' + node.arguments[0].getText(root) + ')', context)(); previousDeps = deps;
    }
  };
  const advance = end => {
    while (true) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      const [id, task] = next; now = task.at;
      if (task.delay) task.at += task.delay; else timers.delete(id);
      task.fn();
    }
    now = end;
  };
  return { calls, context, render, advance, stop: () => cleanup?.(), timers };
}
test('GPS every 15s does not restart the 120s counter; latest position and cleanup remain', () => {
  const f = timerFixture(); f.render();
  for (let at = 15000; at <= 120000; at += 15000) {
    f.advance(at); f.context.position = { latitude: at / 15000 + 1, longitude: 2 }; f.render();
  }
  f.advance(130000);
  console.info('PERF_MEASURE ' + JSON.stringify({ scenario: 'GPS every 15s / 130s', counterRequests: f.calls.length }));
  assert.equal(f.calls.length, 2, JSON.stringify(f.calls));
  assert.equal(f.calls[0].at, 5000); assert.equal(f.calls[1].at, 120000);
  assert.equal(f.calls[1].latitude, 8, '120s refresh uses the latest acquired GPS');
  f.stop(); assert.equal(f.timers.size, 0); f.advance(300000); assert.equal(f.calls.length, 2);
});
test('country change restarts the counter once and keeps the same cadence', () => {
  const f = timerFixture(); f.render(); f.advance(10000);
  f.context.clientProfil = { country_code: 'CI' }; f.render(); f.advance(16000);
  assert.deepEqual(f.calls.map(x => x.at), [5000, 15000]); f.stop(); assert.equal(f.timers.size, 0);
});
test('a late first GPS still loads the counter after 5s instead of waiting 120s', () => {
  const f = timerFixture(); f.context.position = null; f.render(); f.advance(30000);
  assert.equal(f.calls.length, 0);
  f.context.position = { latitude: 3, longitude: 2 }; f.render(); f.advance(36000);
  assert.equal(JSON.stringify(f.calls), JSON.stringify([{ at: 35000, latitude: 3 }]));
  f.stop(); assert.equal(f.timers.size, 0);
});

function statusFixture() {
  const gate = deferred(), writes = [], calls = [], errors = [];
  let first = true, activeReads = 0, peakReads = 0, records = [];
  const queue = createScopedRefreshQueue(); queue.setScope('BF/client-a');
  const profil = { id: 'client-a', user_email: 'fixture@example.invalid', country_code: 'BF', enterprise_id: null };
  const context = {
    statusRefreshRef: { current: queue }, statusScope: 'BF/client-a', userIdRef: { current: 'user-a' }, clientProfil: profil,
    STATUTS_SUIVABLES_CLIENT: ['recherche_livreur', 'livreur_en_route'],
    courseAnnuleeRelance: null, courseDecisionClient: null,
    setCoursesActives: value => writes.push({ type: 'courses', value }),
    setNotifications: value => writes.push({ type: 'notifications', value }),
    setCourseAnnuleeRelance: value => writes.push({ type: 'cancel', value }),
    setCourseDecisionClient: value => writes.push({ type: 'decision', value }),
    console: { error: (...args) => errors.push(args) },
    base44: { entities: {
      CourseExterne: { filter: async query => {
        calls.push({ type: 'course', query }); activeReads++; peakReads = Math.max(peakReads, activeReads);
        try { if (first) { first = false; await gate.promise; } return records; } finally { activeReads--; }
      } },
      Notification: { filter: async query => { calls.push({ type: 'notification', query }); return []; }, update: async () => {} },
      Livreur: { filter: async () => [] },
    } },
  };
  const root = tree('src/pages/ClientExterneApp.jsx');
  const node = find(root, n => ts.isVariableDeclaration(n) && n.name.getText(root) === 'checkStatus');
  const check = evaluate('(' + node.initializer.getText(root) + ')', context);
  return { context, profil, queue, check, gate, calls, writes, errors, peak: () => peakReads, setRows: value => { records = value; } };
}
test('20 triggers during a slow dashboard read collapse to one active plus one fresh read', async () => {
  const f = statusFixture(); const first = f.check(null, f.profil); await tick();
  const pending = Array.from({ length: 20 }, () => f.check(null, f.profil)); await tick();
  f.gate.resolve(); await Promise.all([first, ...pending]);
  console.info('PERF_MEASURE ' + JSON.stringify({ scenario: 'one slow refresh + 20 triggers', courseReads: f.calls.filter(x => x.type === 'course').length,
    notificationReads: f.calls.filter(x => x.type === 'notification').length, totalReads: f.calls.length, peakCourseReads: f.peak() }));
  assert.equal(f.peak(), 1); assert.equal(f.calls.filter(x => x.type === 'course').length, 6);
  assert.equal(f.calls.filter(x => x.type === 'notification').length, 2);
  assert.equal(f.writes.filter(x => x.type === 'courses').length, 2, 'trailing read is retained');
  assert.equal(f.errors.length, 0);
});
test('new account/country does not wait for or accept the old in-flight result', async () => {
  const f = statusFixture(); const first = f.check(null, f.profil); await tick();
  const stale = f.check(null, f.profil);
  f.queue.setScope('CI/client-b'); f.context.statusScope = 'CI/client-b'; f.context.userIdRef.current = 'user-b';
  const profil = { id: 'client-b', user_email: 'new@example.invalid', country_code: 'CI', enterprise_id: 'tenant-b' };
  f.context.clientProfil = profil;
  try {
    await f.check(null, profil);
    assert.equal(f.writes.filter(x => x.type === 'courses').length, 1, 'new account completes while old HTTP is pending');
    const before = f.calls.length, writes = f.writes.length;
    f.gate.resolve(); await Promise.all([first, stale]);
    assert.equal(f.calls.length, before, 'obsolete read stops and queued old read is discarded');
    assert.equal(f.writes.length, writes, 'old response never replaces new account data');
    assert.ok(f.calls.some(x => x.query.destinataire_client_id === 'client-b'));
  } finally { f.gate.resolve(); await Promise.all([first, stale]); }
});
test('unmount cancels queued work and ignores the active response', async () => {
  const f = statusFixture(); const first = f.check(null, f.profil); await tick(); const queued = f.check(null, f.profil);
  f.queue.cancelScope('BF/client-a'); f.gate.resolve(); await Promise.all([first, queued]);
  assert.equal(f.writes.length, 0); assert.equal(f.calls.length, 1);
});
test('a legitimate later dashboard event still refreshes after the previous batch', async () => {
  const f = statusFixture(); f.gate.resolve(); await f.check(null, f.profil);
  f.setRows([{ id: 'new-public', statut: 'recherche_livreur', enterprise_id: null },
    { id: 'private', statut: 'recherche_livreur', enterprise_id: 'other-tenant' }]);
  await f.check(null, f.profil);
  assert.equal(f.calls.filter(x => x.type === 'course').length, 6);
  assert.equal(f.writes.filter(x => x.type === 'courses').length, 2);
  assert.equal(f.writes.filter(x => x.type === 'courses').at(-1).value[0].id, 'new-public');
  assert.equal(f.writes.filter(x => x.type === 'courses').at(-1).value.length, 1, 'tenant filtering remains');
});
test('8s polling reads current profile/GPS/callback without restarting on GPS changes', () => {
  const root = tree('src/pages/ClientExterneApp.jsx');
  const node = find(root, n => ts.isCallExpression(n) && n.expression.getText(root) === 'useEffect'
    && n.arguments[0]?.getText(root).includes('8000'));
  const calls = [], context = { onboardingDone: true, userId: 'user-a', clientProfil: { id: 'a' }, position: { latitude: 1 },
    clientProfilRef: { current: { id: 'a' } }, positionRef: { current: { latitude: 1 } },
    checkStatusRef: { current: (pos, profil) => calls.push([pos.latitude, profil.id]) },
    checkStatus: (pos, profil) => calls.push([pos.latitude, profil.id]),
    setInterval: fn => { context.timer = fn; return 1; }, clearInterval: () => { context.timer = null; } };
  const deps = evaluate(node.arguments[1].getText(root), context);
  const stop = evaluate('(' + node.arguments[0].getText(root) + ')', context)();
  context.position = { latitude: 2 }; context.positionRef.current = context.position;
  context.clientProfilRef.current = { id: 'b' }; context.timer();
  const after = evaluate(node.arguments[1].getText(root), context);
  assert.ok(deps.every((value, i) => Object.is(value, after[i])), 'GPS does not reset the timer');
  assert.equal(JSON.stringify(calls), JSON.stringify([[2, 'b']])); stop(); assert.equal(context.timer, null);
});
test('scope cleanup cannot cancel a newer identity; remount and errors recover', async () => {
  const queue = createScopedRefreshQueue(), calls = [];
  queue.setScope('old'); queue.setScope('new'); queue.cancelScope('old');
  await queue.run('new', () => calls.push('new'));
  await assert.rejects(queue.run('new', () => { throw Error('synthetic'); }), /synthetic/);
  await queue.run('new', () => calls.push('retry'));
  queue.cancelScope('new'); queue.setScope('new'); await queue.run('new', () => calls.push('remount'));
  assert.deepEqual(calls, ['new', 'retry', 'remount']);
});
test('driver page leaves course-feed events to the existing shared hook', () => {
  const root = tree('src/pages/LivreurExterneApp.jsx');
  const duplicate = effectContaining(root, 'queryKey: ["courses-disponibles-count"]');
  assert.equal(Boolean(duplicate), false);
  const hook = read('src/hooks/useCoursesDisponibles.js');
  assert.ok(hook.includes('CourseExterne.subscribe(refresh)'));
  assert.ok(hook.includes('EcoMission.subscribe(refresh)'));
});
