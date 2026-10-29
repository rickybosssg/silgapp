import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createFeedReadBudget, acquireFeedReadBudget, retryFeedRead } from '../src/lib/feedReadBudget.js';
import { createRealtimeRefresh } from '../src/lib/sharedQuerySubscription.js';

for (const status of [400, 403, 429, 500]) test(`HTTP ${status} remains an error, never a false empty success`, async () => {
  const budget = createFeedReadBudget();
  const error = Object.assign(Error('synthetic refusal'), { response: { status } });
  await assert.rejects(budget.read(() => Promise.reject(error)), e => e === error);
  assert.equal(retryFeedRead(0, error), status !== 429);
  assert.equal(retryFeedRead(1, error), false);
});
test('429 blocks repeated events, polling and retries, then permits recovery', async () => {
  let clock = 0, calls = 0;
  const budget = createFeedReadBudget(() => clock);
  const error = Object.assign(Error('quota'), { response: { status: 429, headers: { 'retry-after': '1' } } });
  await assert.rejects(budget.read(async () => { calls++; throw error; }));
  for (let i = 0; i < 140; i++) await assert.rejects(budget.read(async () => { calls++; return []; }), e => e === error);
  assert.equal(calls, 1);
  clock = 15000;
  assert.deepEqual(await budget.read(async () => { calls++; return ['recovered']; }), ['recovered']);
  assert.equal(calls, 2);
});
test('Retry-After date and missing header retain an adequate cooldown', async () => {
  for (const headers of [{ 'Retry-After': new Date(90000).toUTCString() }, {}]) {
    let clock = 0;
    const budget = createFeedReadBudget(() => clock);
    await assert.rejects(budget.read(async () => { throw { response: { status: 429, headers } }; }));
    clock = 59000; await assert.rejects(budget.read(async () => 1));
    clock = 90000; assert.equal(await budget.read(async () => 1), 1);
  }
});
test('query clients, accounts, countries and tenants do not share errors', async () => {
  const owner = {};
  const first = acquireFeedReadBudget(owner, 'BF/a/public');
  assert.equal(first, acquireFeedReadBudget(owner, 'BF/a/public'));
  await assert.rejects(first.read(async () => { throw { status: 429 }; }));
  for (const budget of [acquireFeedReadBudget(owner, 'CI/a/public'), acquireFeedReadBudget(owner, 'BF/b/private'), acquireFeedReadBudget({}, 'BF/a/public')]) {
    assert.equal(await budget.read(async () => 1), 1);
  }
});
test('continuous realtime updates retain a trailing refresh without a tight loop', async () => {
  let calls = 0;
  const queue = createRealtimeRefresh(async () => { calls++; }, 1, 100);
  queue.schedule(); await new Promise(r => setTimeout(r, 15));
  for (let i = 0; i < 100; i++) queue.schedule();
  await new Promise(r => setTimeout(r, 25)); assert.equal(calls, 1);
  await new Promise(r => setTimeout(r, 120)); assert.equal(calls, 2);
  queue.stop();
});
test('actual feed queries use the shared budget and refuse automatic 429 retry', async () => {
  const source = readFileSync('src/hooks/useCoursesDisponibles.js', 'utf8');
  const tree = ts.createSourceFile('hook.js', source, ts.ScriptTarget.Latest, true);
  const queries = [];
  const visit = n => { if (ts.isCallExpression(n) && n.expression.getText(tree) === 'useQuery') queries.push(n.arguments[0]); ts.forEachChild(n, visit); };
  visit(tree); assert.equal(queries.length, 6);
  let calls = 0;
  const budget = createFeedReadBudget();
  await assert.rejects(budget.read(async () => { throw { status: 429 }; }));
  for (const query of queries) {
    const fn = query.properties.find(p => p.name?.getText(tree) === 'queryFn');
    const retry = query.properties.find(p => p.name?.getText(tree) === 'retry');
    assert.equal(retry.initializer.getText(tree), 'retryFeedRead');
    const execute = new Function('readBudget', `return (${fn.initializer.getText(tree)});`)(budget);
    await assert.rejects(execute(), e => e.status === 429);
    calls++;
  }
  assert.equal(calls, 6);
});
test('nearby-driver query identity excludes GPS coordinates; distance stays local', () => {
  const source = readFileSync('src/components/livreur/ActiviteTempsReel.jsx', 'utf8');
  assert.match(source, /queryKey: \["activite-nearby-drivers", country_code, livreurId\]/);
  assert.match(source, /\[nearbyDrivers, latitude, longitude, rayonKm\]/);
  assert.match(source, /Dernière valeur connue/);
  assert.match(source, /Données indisponibles/);
  assert.doesNotMatch(source, /data: nearbyDriversCount = 0/);
});
