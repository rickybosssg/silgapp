import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function renderAdmin(course) {
  let index = 0;
  const react = { __esModule: true, default: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState: value => [index++ === 5 ? false : value, () => {}], useEffect: () => {}, useMemo: fn => fn() };
  const require = name => {
    if (name === 'react') return react;
    if (name === '@tanstack/react-query') return { useQueryClient: () => ({}) };
    if (name === '@/api/base44Client') return { base44: {} };
    if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
    if (name === 'date-fns') return { format: () => '' };
    if (name === 'date-fns/locale') return { fr: {} };
    if (name === 'sonner') return { toast: {} };
    throw Error('Unexpected import ' + name);
  };
  const module = { exports: {} };
  const js = ts.transpileModule(read('src/components/courses/ProposedLivreursListV2.jsx'), { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require, Date, Set, Map });
  const node = module.exports.default({ course: { id: 'synthetic-course', country_code: 'BF', statut: 'recherche_livreur', ...course } });
  const words = [];
  const walk = value => { if (Array.isArray(value)) value.forEach(walk); else if (typeof value === 'string' || typeof value === 'number') words.push(String(value));
    else if (value && typeof value === 'object') walk(value.props?.children); };
  walk(node); return words.join(' ');
}
for (const status of ['en_attente', 'nouvelle', null]) test('Admin does not claim diffusion before publication: ' + status, () => {
  const text = renderAdmin({ dispatch_status: status });
  assert.equal(text.includes('En diffusion'), false); assert.equal(text.includes('Diffusion active'), false);
  assert.ok(text.includes('Publication en attente'));
});
for (const status of ['disponible_push', 'propose']) test('Admin acknowledges a published feed without claiming delivery of notifications: ' + status, () => {
  const text = renderAdmin({ dispatch_status: status }); assert.ok(text.includes('En diffusion'));
  assert.ok(text.includes('Diffusion active')); assert.ok(text.includes('Notifi')); assert.ok(text.includes('0'));
});
test('accepted, terminal and pending-client courses never show active diffusion', () => {
  for (const course of [{ livreur_id: 'synthetic-driver' }, { statut: 'annulee' }, { statut: 'livree' }, { client_decision_attendue: true }]) {
    const text = renderAdmin({ dispatch_status: 'disponible_push', ...course });
    assert.equal(text.includes('En diffusion'), false); assert.equal(text.includes('Diffusion active'), false);
  }
});
test('Eco waiting is explicitly grouping, not Standard publication', () => {
  const text = renderAdmin({ dispatch_status: 'en_attente', delivery_mode: 'eco', eco_status: 'isolated' });
  assert.ok(text.includes('regroupement')); assert.equal(text.includes('Diffusion active'), false);
});

test('expired published course is distinct from active diffusion and waiting publication', () => {
  for (const dispatch_status of ['disponible_push', 'propose']) {
    const text = renderAdmin({ dispatch_status, timeout_expires_at: '2000-01-01T00:00:00Z' });
    assert.ok(text.includes('Publication expirée'));
    assert.ok(text.includes("Délai d'acceptation dépassé"));
    assert.equal(text.includes('En diffusion'), false);
    assert.equal(text.includes('Diffusion active'), false);
    assert.equal(text.includes('Publication en attente'), false);
  }
  const assigned = renderAdmin({ dispatch_status: 'accepte', livreur_id: 'driver', timeout_expires_at: '2000-01-01T00:00:00Z' });
  assert.ok(assigned.includes('Livreur affecté')); assert.equal(assigned.includes('Publication expirée'), false);
});
test('recent driver count does not pretend to prove GPS eligibility or receipt', () => {
  const text = renderAdmin({ dispatch_status: 'disponible_push' });
  assert.equal(text.includes('GPS actif'), false); assert.ok(text.includes('disponibles r'));
});
function publisherFixture(initial, failNotify = false) {
  let record = { id: 'synthetic-course', country_code: 'BF', enterprise_id: null, statut: 'recherche_livreur', dispatch_status: 'en_attente', ...initial };
  const calls = [];
  const base44 = { asServiceRole: { entities: { CourseExterne: {
    get: async () => ({ ...record }), updateMany: async (filter, patch) => { calls.push(['publish', patch.$set.dispatch_status]); record = { ...record, ...patch.$set }; },
  } }, functions: { invoke: async (name, payload) => { calls.push(['invoke', name, payload]); return {}; } } } };
  const source = read('base44/shared/dispatchV2.ts');
  const tree = ts.createSourceFile('dispatchV2.ts', source, ts.ScriptTarget.Latest, true);
  const fn = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'publierCourseDansFil');
  const js = ts.transpileModule(fn.getText(tree).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const publish = new Function('dispatchLog', 'DISPATCH_V2_BUNDLE_VERSION', 'normalizeEnterpriseId', 'journaliserDispatch', 'notifierLivreursEligiblesV2', js + '; return publierCourseDansFil;')(
    () => {}, 'synthetic', value => value || null, () => {}, async (sdk, current, options) => {
      calls.push(['notify', current.dispatch_status, options.priorityOnly]); if (failNotify) throw Error('synthetic sender failure'); return { notified: 0 };
    });
  return { run: () => publish(base44, record), calls, get record() { return record; } };
}
test('actual V2 publishes before its awaited T0 batch for all priorities, no cron or 20-second wait', async () => {
  const f = publisherFixture({}); await f.run();
  assert.deepEqual(f.calls, [['publish', 'disponible_push'], ['notify', 'disponible_push', false]]);
  assert.equal(f.record.dispatch_status, 'disponible_push');
});
test('a sender failure after publication leaves available status, not en_attente', async () => {
  const f = publisherFixture({}, true); await assert.rejects(f.run(), /synthetic sender failure/);
  assert.equal(f.record.dispatch_status, 'disponible_push');
});
test('actual V2 does not publish a course awaiting the client decision', async () => {
  const f = publisherFixture({ client_decision_attendue: true }); const result = await f.run();
  assert.equal(result.reason, 'client_decision_attendue'); assert.deepEqual(f.calls, []);
});
test('actual V2 preserves isolated Eco grouping and sends no Standard batch', async () => {
  const f = publisherFixture({ delivery_mode: 'eco', eco_status: 'isolated' }); const result = await f.run();
  assert.equal(result.reason, 'eco_isolated_pending_grouping'); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][1], 'ecoOptimizationOrchestrator'); assert.equal(f.record.dispatch_status, 'en_attente');
});
