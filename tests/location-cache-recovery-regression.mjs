import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as core from '../src/lib/locationSearchCore.js';
import * as budgets from '../src/lib/feedReadBudget.js';

function load(filter) {
  const source = readFileSync('src/lib/locationSearch.js', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const storage = new Map(), module = { exports: {} };
  const api = { entities: Object.fromEntries(['Quartier', 'Boutique', 'Restaurant', 'Pharmacie', 'LieuSilgapp'].map(name => [name, { filter: query => filter(name, query) }])) };
  new Function('require', 'exports', 'localStorage', code)(name => {
    if (name.includes('base44Client')) return { base44: api };
    if (name.includes('locationSearchCore')) return core;
    if (name.includes('feedReadBudget')) return budgets;
    throw Error(name);
  }, module.exports, { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) });
  return { ...module.exports, storage };
}
test('two fields and concurrent mounts share exactly five catalogue reads, not one set per field', async () => {
  let calls = 0;
  const api = load(async () => { calls++; await new Promise(r => setTimeout(r, 5)); return []; });
  await Promise.all(Array.from({ length: 10 }, () => api.refreshCountryLocationIndex('BF')));
  assert.equal(calls, 5);
  await api.refreshCountryLocationIndex('BF'); assert.equal(calls, 5);
});
test('partial catalogue error is not cached as a successful six-hour empty catalogue', async () => {
  let fail = true, calls = 0;
  const api = load(async name => {
    calls++;
    if (name !== 'Quartier') return [];
    if (fail) throw Error('network interrupted');
    return [{ id: 'q', nom: 'Cissin', ville: 'Ouagadougou' }];
  });
  assert.deepEqual(await api.refreshCountryLocationIndex('BF'), []);
  assert.equal(api.storage.size, 0);
  fail = false;
  const recovered = await api.refreshCountryLocationIndex('BF');
  assert.equal(calls, 10); assert.equal(recovered[0].id, 'q');
  assert.equal(api.getCachedLocationSuggestions('BF', 'Cissin')[0].id, 'q');
  assert.deepEqual(api.getCachedLocationSuggestions('CI', 'Cissin'), []);
});
test('429 on catalogue does not amplify when both fields retry; known cached suggestions remain', async () => {
  let calls = 0;
  const api = load(async () => { calls++; throw { response: { status: 429 } }; });
  await api.refreshCountryLocationIndex('BF'); assert.equal(calls, 5);
  await Promise.all([api.refreshCountryLocationIndex('BF'), api.refreshCountryLocationIndex('BF')]);
  assert.equal(calls, 5); assert.equal(api.storage.size, 0);
});
