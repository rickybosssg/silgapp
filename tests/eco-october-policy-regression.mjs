import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('base44/shared/ecoOptimizationEngine.ts', 'utf8');
const parsed = ts.createSourceFile('engine.ts', source, ts.ScriptTarget.Latest, true);
let enabled = false;
let configReads = 0;
const scope = {
  normalizeDeliveryMode: mode => mode === 'eco' ? 'eco' : 'standard',
  normalizeEnterpriseId: value => value || null,
  isPublicCourse: course => !course?.enterprise_id,
  loadEcoConfig: async () => { configReads++; return { enabled, groupingEnabled: false, convertDelayMin: 45 }; },
};
function load(name) {
  const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, name);
  const code = ts.transpile(declaration.getText(parsed).replace('export ', ''), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
  return new Function(...Object.keys(scope), `${code}; return ${name};`)(...Object.values(scope));
}
const prepare = load('prepareEcoCreationFields');
const hold = load('shouldHoldEcoCourseOnCreate');
assert.equal((await prepare({}, { delivery_mode: 'standard', country_code: 'BF' })).delivery_mode, 'standard');
assert.equal(configReads, 0, 'no new config request for Standard');
await assert.rejects(prepare({}, { delivery_mode: 'eco', country_code: 'BF' }), /non active/);
enabled = true;
await assert.rejects(prepare({}, { delivery_mode: 'eco', country_code: 'BF', enterprise_id: 'x' }), /publiques/);
for (const price of [500, 1000, 2000, 3000]) {
  const data = await prepare({}, { delivery_mode: 'eco', country_code: 'BF', prix_propose_client: price });
  assert.equal(data.delivery_mode, 'eco');
  assert.equal(data.eco_status, 'isolated');
  assert.ok(!('prix_propose_client' in data), 'mode preparation cannot replace price');
  assert.equal(Date.parse(data.eco_convert_after_at) - Date.parse(data.eco_created_at), 45 * 60000);
}
enabled = false;
const beforeHold = configReads;
assert.equal(await hold({}, { delivery_mode: 'eco', eco_status: 'isolated' }), true);
assert.equal(configReads, beforeHold, 'hold guard costs no backend read');
assert.equal(await hold({}, { delivery_mode: 'standard' }), false);
assert.equal(await hold({}, { delivery_mode: 'eco', eco_status: 'isolated', enterprise_id: 'x' }), false);
const cleanup = load('cleanupStuckEcoMissions');
async function cleanupCase({ readFails = false, updateFails = false, adminBlocked = false, hasActive = false } = {}) {
  const updates = [];
  const entities = {
    EcoMission: {
      filter: async () => [{ id: 'm', course_ids: ['a', 'b'], livreur_id: 'd', status: 'accepted' }],
      update: async () => { if (updateFails) throw new Error('offline'); return { id: 'm' }; },
    },
    CourseExterne: {
      get: async id => ({ id, statut: 'livree' }),
      filter: async () => { if (readFails) throw new Error('offline'); return hasActive ? [{ id: 'c', statut: 'en_livraison' }] : []; },
    },
    Livreur: {
      get: async () => ({ id: 'd', statut: 'en_course', admin_hors_ligne: adminBlocked }),
      update: async (id, value) => { updates.push(value); return { id }; },
    },
  };
  await cleanup({ asServiceRole: { entities } }, 'BF');
  return updates;
}
assert.deepEqual(await cleanupCase({ readFails: true }), [], 'failed read must not free driver');
assert.deepEqual(await cleanupCase({ updateFails: true }), [], 'failed close must not free driver');
assert.equal((await cleanupCase({ adminBlocked: true }))[0].statut, 'hors_ligne');
assert.equal((await cleanupCase({ hasActive: true }))[0].statut, 'en_course');
assert.equal((await cleanupCase())[0].statut, 'disponible');
console.log('ECO_OCTOBER_POLICY=PASS (extracted real functions, fake configuration; no backend calls)');
