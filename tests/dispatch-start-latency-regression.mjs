import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Executes current backend handlers/functions, with synthetic SDK/time only.
// The candidate is transformed in memory; this suite never edits backend source.
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const paths = {
  orchestrator: 'base44/functions/courseEventOrchestrator/entry.ts',
  dispatch: 'base44/functions/dispatchExterneAuto/entry.ts',
  v2: 'base44/shared/dispatchV2.ts',
  watchdog: 'base44/shared/dispatchWatchdog.ts',
};
const sources = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, read(path)]));
const evidence = { measuredAtUtc: new Date().toISOString(), scope: 'Synthetic adapters executing real current source; no production/network/device measurements', results: [], measurements: {} };
const silent = { log() {}, warn() {}, error() {} };

function stripImports(source) {
  const tree = ts.createSourceFile('backend.ts', source, ts.ScriptTarget.Latest, true);
  return tree.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(tree)).join('\n');
}
function compile(source, injected) {
  let handler;
  const module = { exports: {} };
  const context = { module, exports: module.exports, Response, Request, console: silent,
    Date, Set, Map, Promise, Deno: { serve: value => { handler = value; } }, ...injected };
  const js = ts.transpileModule(stripImports(source), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  vm.runInNewContext(js, context);
  return handler || module.exports.default || module.exports;
}
function declaration(source, name, injected = {}, prefix = '') {
  const tree = ts.createSourceFile('actual.ts', source, ts.ScriptTarget.Latest, true);
  const node = tree.statements.find(value => ts.isFunctionDeclaration(value) && value.name?.text === name);
  assert.ok(node, 'Actual declaration missing: ' + name);
  return compile(prefix + '\n' + node.getText(tree) + '\nexport default ' + name + ';', injected);
}
function candidate(source) {
  const tree = ts.createSourceFile('orchestrator.ts', source, ts.ScriptTarget.Latest, true);
  let createBranch;
  function visit(node) {
    if (ts.isIfStatement(node) && node.expression.getText(tree) === "eventType === 'create'") createBranch = node.thenStatement;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(createBranch);
  const statements = [...createBranch.statements];
  const start = statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(value => value.name.getText(tree) === 'v2Enabled'));
  if (!start) return source; // Parent may later integrate the reviewed candidate.
  const branch = statements[statements.indexOf(start) + 1];
  assert.ok(ts.isIfStatement(branch) && branch.expression.getText(tree) === 'v2Enabled');
  const yes = branch.thenStatement.statements[0];
  const no = branch.elseStatement.statements[0];
  assert.equal(yes.getText(tree), no.getText(tree), 'Only identical invocation branches may be collapsed');
  return source.slice(0, start.getStart(tree)) + yes.getText(tree) + source.slice(branch.end);
}
// Frozen pre-fix fragment, retained after the reviewed candidate is integrated.
// Only the CREATE preflight is restored in memory; UPDATE is always current code.
const beforeCreatePreflight = `const v2Enabled = await isV2Enabled(base44);
if (v2Enabled) {
  await fireInvoke('dispatchExterneAuto', {
    action: 'lancer_recherche_auto', course_id: courseId, event, data,
  });
  called.push('dispatchV2');
} else {
  await fireInvoke('dispatchExterneAuto', {
    action: 'lancer_recherche_auto', course_id: courseId, event, data,
  });
}`;
function getCreate(source) {
  const tree = ts.createSourceFile('orchestrator.ts', source, ts.ScriptTarget.Latest, true);
  let block;
  function visit(node) {
    if (ts.isIfStatement(node) && node.expression.getText(tree) === "eventType === 'create'") block = node.thenStatement;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(block);
  return { tree, block };
}
function frozenBefore(source) {
  const reviewed = candidate(source);
  const { tree, block } = getCreate(reviewed);
  const invocation = block.statements.find(node => ts.isExpressionStatement(node) &&
    node.expression.getText(tree).startsWith("await fireInvoke('dispatchExterneAuto'"));
  assert.ok(invocation, 'Reviewed CREATE must keep its dispatch invocation');
  return reviewed.slice(0, invocation.getStart(tree)) + beforeCreatePreflight + reviewed.slice(invocation.end);
}
const canonical = source => {
  const tree = ts.createSourceFile('actual.ts', source, ts.ScriptTarget.Latest, true);
  const signature = node => {
    const children = [];
    ts.forEachChild(node, child => { children.push(signature(child)); });
    return [node.kind, !ts.isSourceFile(node) && typeof node.text === 'string' ? node.text : null, children];
  };
  return JSON.stringify(signature(tree));
};
const proposed = candidate(sources.orchestrator);
const baseline = frozenBefore(sources.orchestrator);

function fixture({ source = baseline, enabled = true, course = {}, blockFirstConfig = false, missingReads = 0, senderError = false } = {}) {
  let now = Date.parse('2026-10-14T00:00:00Z');
  const epoch = now;
  const calls = [];
  let reads = 0;
  let configReads = 0;
  let unblock;
  const blocked = new Promise(resolve => { unblock = resolve; });
  let record = { id: 'synthetic-dispatch-course', country_code: 'BF', enterprise_id: null,
    statut: 'nouvelle', dispatch_status: 'en_attente', delivery_mode: 'standard',
    prix_propose_admin: 900, prix_final: 900, ...course };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const mark = (name, extra = {}) => calls.push({ name, atMs: now - epoch, ...extra });
  const sdk = { asServiceRole: { entities: {
    AppConfig: {
      filter: async query => {
        assert.equal(query.cle, 'DISPATCH_V2_ENABLED');
        configReads++; mark('AppConfig.filter', { read: configReads });
        if (blockFirstConfig && configReads === 1) await blocked;
        now += 1000;
        return [{ valeur: String(enabled) }];
      },
      create: async () => { throw Error('Synthetic setup always has explicit V2 config'); },
    },
    CourseExterne: {
      get: async id => { assert.equal(id, record.id); reads++; now += 20; mark('CourseExterne.get'); return reads <= missingReads ? null : { ...record }; },
      updateMany: async (filter, patch) => {
        assert.equal(filter.id, record.id);
        assert.deepEqual([...filter.dispatch_status.$nin], ['disponible_push', 'accepte', 'propose', 'redispatch']);
        assert.equal(filter.client_decision_attendue.$ne, true);
        now += 25; record = { ...record, ...patch.$set }; mark('published', { status: record.dispatch_status });
      },
    },
    Enterprise: { filter: async () => [{ actif: true, statut: 'actif' }] },
    Notification: { create: async () => { mark('admin-notification'); } },
    DispatchNotification: { filter: async () => [] },
  }, functions: { invoke: async (name, payload) => {
    mark('invoke', { target: name, payload: structuredClone(payload) });
    if (name === 'dispatchExterneAuto') {
      const response = await dispatch({ json: async () => structuredClone(payload) });
      const result = await response.json();
      if (!response.ok) throw Error(result.reason || result.error);
      return { data: result };
    }
    return { data: {} };
  } } } };
  const injected = { createClientFromRequest: () => sdk, Date: ClockDate,
    setTimeout: (fn, ms) => { now += ms; mark('retry-delay', { durationMs: ms }); fn(); return 0; },
    DISPATCH_V2_BUNDLE_VERSION: 'synthetic-actual-source' };
  function gate() {
    // Separate cold module scopes match independent orchestration/dispatch functions.
    return declaration(sources.v2, 'isV2Enabled', injected,
      'let V2_FLAG_CACHE = null; const V2_FLAG_TTL_MS = 120000;');
  }
  const publish = declaration(sources.v2, 'publierCourseDansFil', { ...injected,
    dispatchLog: () => {}, normalizeEnterpriseId: value => value || null,
    journaliserDispatch: () => {}, notifierLivreursEligiblesV2: async (_sdk, current, options) => {
      mark('T0-batch-start', { status: current.dispatch_status, priorityOnly: options.priorityOnly });
      now += 2000;
      if (senderError) throw Error('synthetic sender failure');
      return { notified: 0 };
    },
  });
  const dispatch = compile(sources.dispatch, { ...injected, isV2Enabled: gate(), publierCourseDansFil: publish });
  const orchestrator = compile(source, { ...injected, isV2Enabled: gate(),
    shouldHoldEcoCourseOnCreate: async (_sdk, value) => value.delivery_mode === 'eco' && value.eco_status === 'isolated' && !value.enterprise_id,
    processEcoCourseCreated: async () => { mark('eco-grouping'); return {}; },
    triggerOnRouteProposalsForNewCourse: async () => { mark('on-route'); return {}; },
    emitCourseCreated: async () => { mark('venus-created'); },
  });
  return { calls, run: (eventType = 'create', old_data = {}) => orchestrator({ json: async () => ({
    event: { type: eventType, entity_id: record.id }, data: { ...record }, old_data,
  }) }), dispatch: payload => dispatch({ json: async () => payload }), unblock,
  get record() { return record; }, get configReads() { return configReads; } };
}
async function check(name, run) {
  await test(name, async () => {
    try { await run(); evidence.results.push({ name, status: 'PASS' }); }
    catch (error) { evidence.results.push({ name, status: 'FAIL', error: error.message }); throw error; }
  });
}
await check('CREATE preflight can stall before the dispatch invocation even though both branches invoke it', async () => {
  const f = fixture({ blockFirstConfig: true }); const pending = f.run();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(f.configReads, 1);
  assert.equal(f.calls.some(value => value.name === 'invoke'), false);
  assert.equal(f.record.dispatch_status, 'en_attente');
  f.unblock(); await pending;
  assert.equal(f.record.dispatch_status, 'disponible_push');
});
await check('review-only CREATE candidate removes one cold AppConfig read while preserving the actual internal gate', async () => {
  const before = fixture(); const after = fixture({ source: proposed });
  await before.run(); await after.run();
  const firstPublish = f => f.calls.find(value => value.name === 'published').atMs;
  assert.equal(before.configReads, 2); assert.equal(after.configReads, 1);
  assert.equal(firstPublish(after), 1065);
  assert.equal(firstPublish(before) - firstPublish(after), 1000);
  assert.deepEqual(before.calls.filter(value => value.name === 'invoke'), after.calls.filter(value => value.name === 'invoke').map(value => ({ ...value, atMs: value.atMs + 1000 })));
  assert.equal(after.record.prix_final, 900); assert.equal(after.record.country_code, 'BF'); assert.equal(after.record.enterprise_id, null);
  evidence.measurements.coldConfig = { assumedAppConfigLatencyMs: 1000,
    before: { reads: before.configReads, publicationAtMs: firstPublish(before) },
    candidate: { reads: after.configReads, publicationAtMs: firstPublish(after) },
    actualNetworkLatencyMeasured: false };
});
await check('reviewed candidate changes only the CREATE preflight and diagnostic marker; UPDATE stays byte-identical', async () => {
  assert.equal(canonical(candidate(baseline)), canonical(proposed));
  const before = getCreate(baseline).block;
  const after = getCreate(proposed).block;
  assert.equal(baseline.slice(0, before.getStart()), proposed.slice(0, after.getStart()));
  assert.equal(baseline.slice(before.end), proposed.slice(after.end));
  const a = fixture(); const b = fixture({ source: proposed });
  const resultBefore = await (await a.run()).json(); const resultAfter = await (await b.run()).json();
  assert.ok(resultBefore.called.includes('dispatchV2'));
  assert.equal(resultAfter.called.includes('dispatchV2'), false);
  assert.deepEqual(resultBefore.called.filter(value => value !== 'dispatchV2'), resultAfter.called);
  assert.deepEqual(resultBefore.errors, resultAfter.errors);
});
await check('actual dispatch stays fail-closed with V2 OFF in the candidate', async () => {
  const f = fixture({ source: proposed, enabled: false });
  const response = await f.run(); const result = await response.json();
  assert.equal(f.record.dispatch_status, 'en_attente');
  assert.equal(f.calls.some(value => value.name === 'published'), false);
  assert.ok(result.errors.some(value => value.module === 'dispatchExterneAuto' && value.error === 'dispatch_v2_disabled'));
  assert.ok(result.called.includes('notifyClientSync'));
});
await check('candidate still holds isolated Eco before ordinary dispatch', async () => {
  const f = fixture({ source: proposed, course: { delivery_mode: 'eco', eco_status: 'isolated' } });
  const result = await (await f.run()).json();
  assert.equal(result.eco_hold, true); assert.equal(f.configReads, 0);
  assert.equal(f.calls.some(value => value.target === 'dispatchExterneAuto'), false);
  const direct = await (await f.dispatch({ action: 'lancer_recherche_auto', course_id: f.record.id })).json();
  assert.equal(direct.reason, 'eco_isolated_pending_grouping');
  assert.equal(f.record.dispatch_status, 'en_attente');
});
await check('candidate preserves client-decision hold and country-required guards', async () => {
  for (const course of [{ client_decision_attendue: true }, { country_code: null }]) {
    const f = fixture({ source: proposed, course }); await f.run();
    assert.equal(f.record.dispatch_status, 'en_attente');
    assert.equal(f.calls.some(value => value.name === 'published'), false);
  }
});
await check('actual publisher exposes the feed before awaiting the T0 notification batch', async () => {
  const f = fixture({ source: proposed }); await f.run();
  const published = f.calls.find(value => value.name === 'published');
  const batch = f.calls.find(value => value.name === 'T0-batch-start');
  assert.ok(published.atMs < batch.atMs); assert.equal(batch.status, 'disponible_push'); assert.equal(batch.priorityOnly, false);
  assert.equal(f.calls.some(value => value.name === 'retry-delay'), false);
  evidence.measurements.publicationBeforePush = { publicationAtMs: published.atMs, batchStartAtMs: batch.atMs, simulatedSenderLatencyMs: 2000 };
});
await check('actual eventual-consistency retry contributes 4 seconds of explicit backoff, not seven minutes', async () => {
  const f = fixture({ source: proposed, missingReads: 3 }); await f.run();
  const waits = f.calls.filter(value => value.name === 'retry-delay');
  assert.deepEqual(waits.map(value => value.durationMs), [2000, 2000]);
  assert.equal(f.record.dispatch_status, 'disponible_push');
  evidence.measurements.explicitMissingReadBackoffMs = waits.reduce((sum, value) => sum + value.durationMs, 0);
});
await check('missing CREATE automation cannot be repaired by a handler that was never invoked', async () => {
  const f = fixture({ source: proposed });
  assert.equal(f.calls.length, 0); assert.equal(f.record.dispatch_status, 'en_attente');
  await f.run(); assert.equal(f.record.dispatch_status, 'disponible_push');
});
await check('actual watchdog grace uses updated_date for recherche_livreur, so a fresh unrelated update postpones recovery', async () => {
  let record = { id: 'synthetic-watchdog-course', statut: 'recherche_livreur', dispatch_status: 'en_attente',
    country_code: 'BF', created_date: '2026-10-14T00:01:00Z', updated_date: '2026-10-14T00:09:00Z' };
  let publishes = 0;
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-14T00:10:00Z'])); } static now() { return Date.parse('2026-10-14T00:10:00Z'); } }
  const empty = { filter: async () => [], create: async () => ({}), update: async () => ({}) };
  const sdk = { asServiceRole: { entities: { CourseExterne: { ...empty,
    filter: async query => query.statut === 'recherche_livreur' ? [record] : [] },
    Notification: empty, DispatchNotification: empty, DispatchLog: empty, Livreur: empty } } };
  const config = { watchdogGraceMin: 2, proposeTimeoutGraceMin: 5, alertDedupMin: 30, disponiblePushTimeoutMin: 30,
    cycleEpuiseTimeoutMs: 300000, secoursV2DelayMin: 5, secoursV2NbLivreurs: 10, rappelT20DelayMin: 20, rappelT20NbLivreurs: 10 };
  const watchdog = compile(sources.watchdog, { Date: FixedDate, STATUTS_ACTIFS_COURSE: [], STATUTS_ACTIFS_VERIF: [],
    chargerConfigDispatch: async () => config, chargerConfigVaguesGPS: async () => ({}),
    publierCourseDansFil: async () => { publishes++; return {}; }, isV2Enabled: async () => true,
    journaliserDispatch: () => {}, gererPushGeneralT10: async () => {}, gererRappelPeriodique: async () => {},
    setTimeout: fn => { fn(); return 0; } }).runWatchdog;
  const fresh = await watchdog(sdk); assert.equal(publishes, 0); assert.equal(fresh.anomalies_count, 0);
  record = { ...record, updated_date: '2026-10-14T00:07:00Z' };
  const old = await watchdog(sdk); assert.equal(publishes, 1);
  assert.ok(old.anomalies.some(value => value.type === 'recherche_sans_vague'));
  evidence.measurements.watchdog = { courseAgeMs: 540000, noRecoveryWhenUpdatedAgoMs: 60000, recoveryWhenUpdatedAgoMs: 180000, graceMs: 120000 };
});

evidence.sourceHashes = Object.fromEntries(Object.entries(paths).map(([key, path]) => [path, createHash('sha256').update(sources[key]).digest('hex')]));
evidence.beforeFixture = { frozenCreatePreflight: beforeCreatePreflight, sha256: createHash('sha256').update(beforeCreatePreflight).digest('hex') };
evidence.candidate = { appliedToFunctionalSource: proposed === sources.orchestrator, change: 'Remove redundant CREATE V2 preflight; preserve actual dispatch internal V2 gate', calledArrayChange: 'CREATE no longer appends informational dispatchV2 marker; invoked-function entries and errors remain', productionIncidentExplained: false };
if (process.argv.includes('--write-evidence')) {
  const folder = new URL('../../release-validation/dispatch-next-step/', import.meta.url);
  mkdirSync(folder, { recursive: true });
  writeFileSync(new URL('synthetic-latency-evidence.json', folder), JSON.stringify(evidence, null, 2) + '\n');
  writeFileSync(new URL('orchestrator-create-candidate.json', folder), JSON.stringify({ sourcePath: paths.orchestrator,
    sourceSha256: evidence.sourceHashes[paths.orchestrator], candidateSource: proposed, applied: proposed === sources.orchestrator }, null, 2) + '\n');
}
console.log('DISPATCH_START_LATENCY_RESULTS=' + JSON.stringify({ passed: evidence.results.filter(value => value.status === 'PASS').length,
  failed: evidence.results.filter(value => value.status === 'FAIL').length, measurements: evidence.measurements }));
