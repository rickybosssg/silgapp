import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const source = fs.readFileSync('base44/functions/getClientsAutonomiser/entry.ts', 'utf8');
const compiled = ts.transpileModule(source.replace(/^import .*;\r?\n/, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
async function run(user, courses = [], failRead = false) {
  const calls = [];
  const client = {
    auth: { me: async () => { if (user instanceof Error) throw user; return user; } },
    get asServiceRole() {
      assert.equal(user?.role, 'admin', 'privileged access must follow authorization');
      return { entities: { CourseExterne: { filter: async (...args) => {
        calls.push(args);
        if (failRead) throw new Error('private backend credential detail');
        return courses.slice(args[3], args[3] + args[2]);
      } } } };
    },
  };
  const context = { exports: {}, Response, console: { error() {} }, createClientFromRequest: () => client };
  vm.runInNewContext(compiled, context);
  const response = await context.exports.default(new Request('http://localhost/test', {
    method: 'POST', body: JSON.stringify({ role: 'admin', serviceToken: 'spoofed' }),
  }));
  return { status: response.status, data: await response.json(), calls };
}
for (const user of [null, new Error('expired')]) {
  const result = await run(user);
  assert.equal(result.status, 401);
  assert.equal(result.calls.length, 0);
}
for (const role of ['client', 'livreur', 'partenaire', 'Admin', undefined]) {
  const result = await run({ role });
  assert.equal(result.status, 403);
  assert.equal(result.calls.length, 0);
}
const now = Date.now();
const fixtures = [];
function group(phone, sources, ageDays = 1) {
  for (const source of sources) fixtures.push({
    client_phone_normalized: phone, client_nom: phone, source,
    created_date: new Date(now - ageDays * 86400000).toISOString(),
    quartier_depart: 'Centre', statut: 'livree', secret: 'must-not-return',
  });
}
group('A', ['admin', 'admin', 'admin', 'admin', 'client']);
group('B', ['admin', 'admin', 'admin', 'client', 'client']);
group('C', ['admin', 'admin', 'client', 'client', 'client']);
group('D', ['admin', 'admin', 'admin', 'admin']);
group('E', ['admin', 'admin', 'admin', 'admin', 'admin'], 100);
const result = await run({ role: 'admin' }, fixtures);
assert.equal(result.status, 200);
assert.deepEqual(result.data.stats, { total: 4, aAccompagner: 2, utiliseApp: 1, autonome: 1 });
assert.deepEqual(result.data.clients.map(c => c.status), ['a_accompagner', 'utilise_app', 'autonome', 'a_accompagner']);
assert.equal(result.data.clients.at(-1).courses_30j, 0);
assert.equal(result.calls.length, 1);
assert.ok(!JSON.stringify(result.data).includes('must-not-return'));
assert.ok(result.data.clients.every(c => !('courses' in c) && !('email' in c)));
const failure = await run({ role: 'admin' }, [], true);
assert.equal(failure.status, 500);
assert.ok(!JSON.stringify(failure.data).includes('credential'));
const paged = await run({ role: 'admin' }, Array.from({ length: 4000 }, () => fixtures[0]));
assert.equal(paged.calls.length, 7);
assert.equal(paged.data.clients[0].admin_count, 3500);
assert.deepEqual(paged.calls.map(c => c[3]), [0, 500, 1000, 1500, 2000, 2500, 3000]);

// Compare against the original shipped algorithm, including historical quirks.
const old = execFileSync('git', ['show', '99191434:src/components/admin/ClientsAutonomiserPanel.jsx'], { encoding: 'utf8' });
const start = old.indexOf('  const computeAutonomyStatus');
const end = old.indexOf('\n  useEffect(', start);
const originalLogic = old.slice(start, end);
const legacy = { base44: { asServiceRole: { entities: { CourseExterne: { filter: async () => fixtures } } } },
  useCallback: fn => fn, setLoading() {}, setClients(c) { this.clients = c; }, setStats(s) { this.stats = s; }, console };
let legacyClients, legacyStats;
legacy.setClients = c => { legacyClients = c; };
legacy.setStats = s => { legacyStats = s; };
await vm.runInNewContext(`(async () => { ${originalLogic}; await loadClients(); })()`, legacy);
assert.deepEqual(result.data.stats, JSON.parse(JSON.stringify(legacyStats)));
for (const row of result.data.clients) {
  const expected = legacyClients.find(c => c.key === row.key);
  for (const [key, value] of Object.entries(row)) assert.equal(value, expected[key], key);
}

// Execute the panel's real hook logic and render output with a controlled SDK.
const panel = fs.readFileSync('src/components/admin/ClientsAutonomiserPanel.jsx', 'utf8');
const panelJs = ts.transpileModule(panel.replace(/^import .*;\r?\n/gm, ''), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
async function panelRun(reply, error) {
  const states = [], effects = [], calls = [];
  let index = 0;
  const context = { exports: {}, React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    Loader2: 'Loader2', AlertCircle: 'AlertCircle', Badge: 'Badge',
    useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
    useCallback: fn => fn, useEffect: fn => effects.push(fn),
    base44: { functions: { invoke: async (...args) => { calls.push(args); if (error) throw error; return reply; } } },
  };
  vm.runInNewContext(panelJs, context);
  context.exports.default();
  effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  index = 0;
  const tree = context.exports.default();
  assert.equal(states[1], false, 'loading resets');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'getClientsAutonomiser');
  return { states, tree };
}
for (const reply of [result.data, { data: result.data }]) {
  const p = await panelRun(reply);
  assert.equal(p.states[0].length, 4);
  assert.equal(p.states[3], '');
}
for (const status of [401, 403, 500]) {
  const p = await panelRun(null, { response: { status } });
  assert.equal(p.tree.props.role, 'alert');
  assert.ok(p.states[3].length > 0);
}
const malformed = await panelRun({});
assert.equal(malformed.tree.props.role, 'alert');
console.log('PASS: admin/non-admin/unauthenticated, spoof protection, pagination, legacy parity, minimal response, safe errors, panel direct/wrapped/error/loading. Production calls: 0.');
