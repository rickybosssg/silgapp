import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('base44/shared/ecoOptimizationEngine.ts', 'utf8');
const parsed = ts.createSourceFile('engine.ts', source, ts.ScriptTarget.Latest, true);
const fn = parsed.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'recalculateEcoMissionAfterCancellation');
const code = ts.transpile(fn.getText(parsed).replace('export ', ''), { target: ts.ScriptTarget.ES2022 });
const recalculate = new Function(`${code}; return recalculateEcoMissionAfterCancellation;`)();
function fixture({ picked = false, detachFails = false, casFails = false, readFails = false } = {}) {
  const rows = {
    a: { id: 'a', eco_mission_id: 'm', statut: 'en_attente', client_decision_attendue: true,
      heure_recuperation: picked ? '2026-10-11T10:00:00Z' : null, prix: 500, commission: 50 },
    b: { id: 'b', eco_mission_id: 'm', statut: 'en_livraison', heure_recuperation: '2026-10-11T10:00:00Z', prix: 1000, commission: 100 },
  };
  const mission = { id: 'm', status: 'in_progress', course_ids: ['a', 'b'], livreur_id: 'driver',
    route_plan_json: JSON.stringify([
      { course_id: 'a', type: 'pickup', order: 1, status: picked ? 'completed' : 'pending' },
      { course_id: 'b', type: 'pickup', order: 2, status: 'completed' },
      { course_id: 'a', type: 'delivery', order: 3, status: 'pending' },
      { course_id: 'b', type: 'delivery', order: 4, status: 'pending' },
    ]) };
  const entities = {
    CourseExterne: {
      get: async id => { if (readFails && id === 'b') throw Error('read'); return structuredClone(rows[id]); },
      update: async (id, patch) => { if (detachFails) { detachFails = false; throw Error('detach'); } Object.assign(rows[id], patch); },
      filter: async () => Object.values(rows).filter(c => c.statut === 'en_livraison'),
    },
    EcoMission: {
      get: async () => structuredClone(mission),
      updateMany: async (_, patch) => { if (casFails) return { updated: 0 }; Object.assign(mission, patch.$set); return { updated: 1 }; },
    },
    Livreur: { get: async () => { throw Error('must not release active driver'); } },
  };
  return { api: { asServiceRole: { entities } }, rows, mission };
}
let f = fixture();
await recalculate(f.api, 'a');
assert.equal(f.rows.a.eco_mission_id, null);
assert.equal(f.mission.status, 'invalidated');
assert.equal(f.mission.active_step_index, 1); // Array index, not obsolete order=4.
assert.deepEqual([f.rows.b.prix, f.rows.b.commission], [1000, 100]);
f = fixture({ picked: true });
await recalculate(f.api, 'a');
assert.equal(f.rows.a.eco_mission_id, 'm');
const route = JSON.parse(f.mission.route_plan_json);
assert.equal(route[0].status, 'completed');
assert.equal(route[2].status, 'cancelled');
f = fixture({ detachFails: true });
await assert.rejects(recalculate(f.api, 'a'), /detach/);
assert.equal(f.mission.status, 'invalidated');
await recalculate(f.api, 'a');
assert.equal(f.rows.a.eco_mission_id, null);
f = fixture({ casFails: true });
await assert.rejects(recalculate(f.api, 'a'), /mission_changed_retry/);
assert.equal(f.rows.a.eco_mission_id, 'm');
f = fixture({ readFails: true });
await assert.rejects(recalculate(f.api, 'a'), /read/);
assert.equal(f.mission.status, 'in_progress');
f = fixture();
f.rows.b.statut = 'annulee';
f.rows.b.heure_recuperation = null;
let driverReleased = false;
f.api.asServiceRole.entities.Livreur = {
  get: async () => ({ statut: 'en_course' }),
  update: async (_, patch) => { driverReleased = patch.statut === 'disponible'; },
};
await recalculate(f.api, 'a');
assert.equal(f.mission.status, 'cancelled');
assert.equal(driverReleased, true);
f = fixture();
f.mission.livreur_id = null;
f.rows.b.statut = 'recherche_livreur';
let candidateCompensated = false;
const withRelease = new Function('releaseEcoCandidate', `${code}; return recalculateEcoMissionAfterCancellation;`)(
  async () => { candidateCompensated = true; return true; }
);
await withRelease(f.api, 'a');
assert.equal(candidateCompensated, true);
assert.ok(f.mission.locked_at); // Durable marker for the existing recovery worker.
console.log('PASS actual cancellation recalculation: pickup trace, remaining index, failed reads, CAS and detach retry (simulated adapters)');
