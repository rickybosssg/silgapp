import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { confirmDelivery, functionBody } from '../src/lib/deliveryConfirmation.js';

for (const response of [{ success: true }, { data: { success: true } }, { data: { data: { success: true } } }]) {
  assert.equal(functionBody(response).success, true);
}
let writes = 0;
let reads = 0;
function api(response, saved, throws = false) {
  return {
    functions: { invoke: async () => { writes++; if (throws) throw new Error('network'); return response; } },
    entities: { CourseExterne: { get: async () => { reads++; return saved; } } },
  };
}
assert.equal((await confirmDelivery(api({ data: { success: true } }), 'a')).success, true);
assert.equal(reads, 0);
assert.equal((await confirmDelivery(api(null, { id: 'a', statut: 'livree' }, true), 'a')).confirmedByRead, true);
await assert.rejects(confirmDelivery(api({ success: false, error: 'refus' }, { id: 'a', statut: 'colis_recupere' }), 'a'), /refus/);
await assert.rejects(confirmDelivery(api({ skipped: true }, { id: 'a', statut: 'colis_recupere' }), 'a'));
await assert.rejects(confirmDelivery(api(null, { id: 'other', statut: 'livree' }, true), 'a'));
assert.equal(writes, 5, 'one financial invocation per attempt, no automatic retry');

const helpers = readFileSync('src/lib/ecoMissionHelpers.js', 'utf8');
const progressSource = helpers.slice(helpers.indexOf('export function computeActiveStepIndex'), helpers.indexOf('export function getStepCourse'));
const progress = new Function(`${progressSource.replace('export ', '')}; return computeActiveStepIndex;`)();
const plan = [{ type: 'pickup', course_id: 'a' }, { type: 'delivery', course_id: 'a' }, { type: 'pickup', course_id: 'b' }, { type: 'delivery', course_id: 'b' }];
const courses = (a, b) => [{ id: 'a', statut: a }, { id: 'b', statut: b }];
assert.equal(progress(plan, courses('livreur_en_route', 'livreur_en_route')), 0);
assert.equal(progress(plan, courses('colis_recupere', 'livreur_en_route')), 1);
assert.equal(progress(plan, courses('livree', 'livreur_en_route')), 2);
assert.equal(progress(plan, courses('annulee', 'livreur_en_route')), 2);
assert.equal(progress(plan, courses('livree', 'colis_recupere')), 3);
assert.equal(progress(plan, courses('livree', 'livree')), 4);

const mobile = readFileSync('src/components/layout/MobileNav.jsx', 'utf8');
assert.ok(!mobile.includes('{p.emoji_flag} {p.nom}'));
assert.ok(mobile.includes('appearance-none bg-white text-gray-900'));
const card = readFileSync('src/components/livreur/CourseActiveCard.jsx', 'utf8');
const buttonFlow = card.slice(card.indexOf('/* ── EXTERNE : bouton direct COLIS LIVRÉ'), card.indexOf('/* ── INTERNE : bouton classique avec GPS'));
assert.ok(buttonFlow.includes('confirmDelivery(base44, course.id)'));
assert.ok(!buttonFlow.includes('updateOptimisticStatut("livree",'));
console.log('OCTOBER_DELIVERY_REGRESSION=PASS (unit tests with fake API; no production writes)');
