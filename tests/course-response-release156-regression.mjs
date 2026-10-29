import { captureDeliveryGps } from '../src/lib/deliveryGps.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { normalizeCourseFunctionResult } from '../src/lib/courseFunctionResult.js';
import { confirmedDeliverySnapshot } from '../src/lib/confirmedDelivery.js';
import { finaliserLivraisonSafe } from '../src/lib/safeDeliveryFinalization.js';
import { readConfirmedParcelPickup, recoverUncertainParcelPickup, pickupRead, pickupTransition } from '../src/lib/pickupConfirmation.js';

const handlers = [];
for (const file of ['CourseActiveCard', 'EcoMissionDashboard']) {
  const source = fs.readFileSync(new URL(`../src/components/livreur/${file}.jsx`, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(file + '.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'res' && node.initializer?.getText(tree) === 'normalizeCourseFunctionResult(rawRes)') {
      let parent = node;
      while (parent && !ts.isArrowFunction(parent) && !ts.isFunctionExpression(parent)) parent = parent.parent;
      handlers.push({ file, text: parent.getText(tree) });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}
assert.equal(handlers.length, 9);
function fixture(index, response, rejection, pending = false) {
  const errors = [], successes = [], effects = [], calls = [], rollbacks = [];
  let reads = 0;
  const context = vm.createContext({ Date, Error, captureDeliveryGps, normalizeCourseFunctionResult, finaliserLivraisonSafe, confirmedDeliverySnapshot, readConfirmedParcelPickup, recoverUncertainParcelPickup, pickupRead, pickupTransition,
    generation: 1, pickupGenerationRef: { current: 1 }, pickupConfirmationRef: { current: false },
    deliveryConfirmationRef: { current: false },
    course: { id: 'synthetic-course', statut: 'livreur_en_route', livreur_id: 'synthetic-driver', source: 'client' },
    mission: { id: 'synthetic-mission' }, now: '2026-10-27T00:00:00Z', isClientContactePhase: true,
    deliveryBoutonPending: pending, actionPending: pending,
    base44: { functions: { invoke: async (...args) => { calls.push(args); if (rejection) throw rejection; return response; } },
      entities: { CourseExterne: { get: async () => rejection || ++reads === 1 ? ({ id: 'synthetic-course', statut: 'en_route_expediteur' }) : ({ id: 'synthetic-course', statut: 'colis_recupere', pickup_confirmed_at: '2026-10-27T00:00:00Z' }) } } },
    toast: { error: value => errors.push(value), success: value => successes.push(value) },
    queryClient: { cancelQueries: async () => {}, setQueriesData() {}, invalidateQueries: value => effects.push(['invalidate', value]) },
    setConfirmedPickup() {},
    setOptimisticStatut: value => rollbacks.push(value), updateOptimisticStatut() {}, setDeliveryBoutonPending() {},
    setPickupBoutonPending() {}, setActionPending() {}, setPendingDeliveryData() {}, setShowPrixModal() {},
    onColisRecupere: () => effects.push(['pickup']), onColisLivre: () => effects.push(['delivered']),
    onDeliveryVictory: () => effects.push(['victory']), onDeliveryConfirmed: () => effects.push(['confirmed']) });
  const run = vm.runInContext('(' + handlers[index].text + ')', context);
  return { run: () => index === 0 ? run(response) : index >= 7 ? run('synthetic-course', 'colis_recupere', {}) : run(), errors, successes, effects, calls, rollbacks };
}
for (let index = 0; index < handlers.length; index++) {
  test(`${index}: real handler accepts direct/wrapped success and idempotent skipped`, async () => {
    for (const response of [{ success: true }, { data: { success: true } }, { skipped: 'already_at_target' }, { data: { skipped: 'already_at_target' } }]) {
      const f = fixture(index, response); await f.run(); assert.equal(f.errors.length, 0);
      assert.equal(f.calls.length, index === 0 ? 0 : 1); assert.equal(f.rollbacks.length, index === 4 ? 1 : 0);
    }
  });
  test(`${index}: empty, contradictory, string flags and malformed envelopes cannot succeed`, async () => {
    for (const response of [undefined, null, {}, [], { data: null, success: true }, { data: {} }, { data: 'malformed' },
      { success: 'false' }, { success: 1 }, { skipped: {} }, { success: true, error: 'Refus métier' },
      { data: { success: false, error: 'Refus métier' } }, { status: 403, data: { success: true } }]) {
      const f = fixture(index, response); await f.run(); assert.equal(f.errors.length, 1);
      assert.equal(f.successes.length, 0); assert.equal(f.effects.length, 0); assert.equal(f.calls.length, index === 0 ? 0 : 1);
    }
  });
  if (index !== 0) test(`${index}: network and HTTP errors retain useful errors without retries`, async () => {
    for (const status of ['network', 400, 403, 429, 500]) {
      const error = Object.assign(new Error('Refus ' + status), { status });
      const f = fixture(index, null, error); await f.run();
      if ([6,8].includes(index) && (status === 'network' || status === 500)) assert.match(f.errors[0], /livraison incertain/);
      else assert.equal(f.errors[0], error.message);
      assert.equal(f.calls.length, 1); assert.equal(f.effects.length, 0);
    }
  });
}
for (const index of [6, 7, 8]) test(`${index}: rendered pending guard suppresses additional invocation`, async () => {
  const f = fixture(index, { data: { success: true } }, null, true);
  await f.run(); await f.run(); assert.equal(f.calls.length, 0);
});
test('Eco skipped does not replay Victory', async () => {
  const f = fixture(8, { data: { skipped: 'already_delivered' } }); await f.run();
  assert.equal(f.effects.some(effect => effect[0] === 'confirmed'), false);
});
test('Standard confirmed result invokes delivery/Victory callbacks once', async () => {
  const f = fixture(6, { data: { success: true } }); await f.run(); assert.equal(f.calls.length, 1);
  assert.equal(f.effects.filter(effect => effect[0] === 'delivered').length, 1);
  assert.equal(f.effects.filter(effect => effect[0] === 'victory').length, 1);
});
test('loaded dynamic BF rule preserves zero, spacing and +226; other countries keep their rules', async () => {
  let source = fs.readFileSync(new URL('../src/lib/phoneUtils.js', import.meta.url), 'utf8');
  source = source.replace(/import \{ base44 \} from [^;]+;/, '');
  const rows = [{ code: 'BF', indicatif: '+226', phone_min_length: 8, phone_max_length: 8, phone_pattern: '^[05-7][0-9]{7}$' },
    { code: 'CI', indicatif: '+225', phone_min_length: 10, phone_max_length: 10, phone_pattern: '^0[1-9][0-9]{8}$' }];
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: module.exports, base44: { entities: { Country: { filter: async () => rows } } }, console });
  await module.exports.loadCountryPhoneConfigs();
  for (const input of ['04040101', '04 04 01 01', '+226 04 04 01 01', '50123456', '60123456', '70123456']) assert.equal(module.exports.validateLocalPhone(input, 'BF').valid, true, input);
  for (const input of ['0404010', '040401010', '40123456', '90123456', '']) assert.equal(module.exports.validateLocalPhone(input, 'BF').valid, false, input);
  assert.equal(module.exports.validateLocalPhone('+225 07 01 23 45 67', 'CI').valid, true);
  assert.equal(module.exports.validateLocalPhone('04040101', 'CI').valid, false);
});
