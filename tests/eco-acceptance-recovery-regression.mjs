import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync('base44/shared/ecoOptimizationEngine.ts', 'utf8');
const parsed = ts.createSourceFile('engine.ts', source, ts.ScriptTarget.Latest, true);
const code = ['completeEcoAcceptance', 'compensateEcoAcceptance'].map(name => {
  const fn = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  return ts.transpile(fn.getText(parsed).replace('export ', ''), { target: ts.ScriptTarget.ES2022 });
}).join('\n');
const { complete, compensate } = new Function('normalizeEnterpriseId', 'TERMINAL_STATUSES', 'ACTIVE_STATUSES', 'marquerAccepte', 'evaluerAvantageCommission', 'champsLockCommission', `${code}; return { complete: completeEcoAcceptance, compensate: compensateEcoAcceptance };`)(
  value => value || null, ['annulee', 'livree'], ['livreur_en_route', 'colis_recupere'], async () => {},
  async () => ({ taux_applique: 0, mode: 'pass_zero' }),
  (a, time) => ({ commission_locked_at: time, commission_taux_applique: a.taux_applique, commission_mode: a.mode }));
const matches = (row, filter) => Object.entries(filter).every(([key, expected]) =>
  expected && typeof expected === 'object' ? expected.$in.includes(row[key] ?? null) : (row[key] ?? null) === expected);
function fixture(fault) {
  const mission = { id: 'm', status: 'accepting', country_code: 'BF', course_ids: ['a', 'b'], livreur_id: 'driver', accepted_at: '2026-10-12T00:00:00Z' };
  const rows = ['a', 'b'].map(id => ({ id, eco_mission_id: 'm', eco_status: 'grouped', country_code: 'BF',
    enterprise_id: null, statut: 'recherche_livreur', dispatch_status: 'en_attente', livreur_id: null, accepted_by_livreur_id: null }));
  let fail = fault === 'lost-response';
  const api = { asServiceRole: { entities: {
    CourseExterne: { get: async id => structuredClone(rows.find(row => row.id === id)),
      filter: async filter => rows.filter(row => matches(row, filter)),
      updateMany: async (filter, patch) => {
        const row = rows.find(row => matches(row, filter));
        if (!row) return { updated: 0 };
        Object.assign(row, patch.$set);
        if (fail) { fail = false; throw Error('lost write response'); }
        return { updated: 1 };
      } },
    EcoMission: { get: async () => structuredClone(mission), updateMany: async (filter, patch) => {
      if (patch.$set.status === 'accepted') assert.ok(rows.every(row => row.livreur_id === 'driver' && row.accepted_by_livreur_id === 'driver'));
      if (!matches(mission, filter)) return { updated: 0 };
      Object.assign(mission, patch.$set); return { updated: 1 };
    } }, Livreur: { update: async () => {}, updateMany: async () => ({ updated: 1 }) },
  } } };
  return { api, rows, mission };
}
const patch = { livreur_id: 'driver', accepted_by_livreur_id: 'driver', statut: 'livreur_en_route', dispatch_status: 'accepte', heure_acceptation: '2026-10-12T00:00:00Z' };
{
  const f = fixture('lost-response');
  const first = await complete(f.api, f.mission, patch);
  assert.equal(first.success, false);
  assert.equal(f.mission.status, 'accepting');
  assert.equal(f.rows.filter(row => row.livreur_id).length, 1);
  assert.equal((await complete(f.api, f.mission, patch)).success, true);
  assert.equal(f.mission.status, 'accepted');
  assert.ok(f.rows.every(row => row.livreur_id === 'driver'));
  assert.ok(f.rows.every(row => row.commission_locked_at && row.commission_taux_applique === 0 && row.commission_mode === 'pass_zero'));
}
for (const conflict of ['cancelled', 'other-owner']) {
  const f = fixture();
  if (conflict === 'cancelled') f.rows[1].statut = 'annulee';
  else { f.rows[1].livreur_id = 'other'; f.rows[1].accepted_by_livreur_id = 'other'; }
  assert.equal((await complete(f.api, f.mission, patch)).success, false);
  assert.equal(f.mission.status, 'accepting');
  if (conflict === 'other-owner') assert.equal(f.rows[1].livreur_id, 'other');
}
{
  const f = fixture();
  assert.equal((await complete(f.api, { ...f.mission, livreur_id: 'intruder' }, patch)).success, false);
  assert.ok(f.rows.every(row => !row.livreur_id));
}
console.log('PASS Eco acceptance lost-response recovery, partial failure quarantine, cancellation, ownership fencing (isolated adapters, not Base44 transaction proof)');
{
  const f = fixture('lost-response');
  await complete(f.api, f.mission, patch);
  f.rows[1].statut = 'annulee';
  const update = f.api.asServiceRole.entities.CourseExterne.updateMany;
  let fail = true;
  f.api.asServiceRole.entities.CourseExterne.updateMany = async (...args) => {
    const result = await update(...args);
    if (fail) { fail = false; throw Error('compensation interrupted'); }
    return result;
  };
  await assert.rejects(compensate(f.api, f.mission, structuredClone(f.rows)));
  assert.equal(f.mission.status, 'invalidated');
  assert.equal(await compensate(f.api, f.mission, structuredClone(f.rows)), true);
  assert.ok(f.rows.every(row => !row.eco_mission_id && !row.livreur_id));
  assert.equal(f.rows[0].eco_status, 'isolated');
  assert.equal(f.rows[1].statut, 'annulee');
  assert.equal(f.mission.locked_at, null);
}
{
  const f = fixture();
  f.rows[0].statut = 'colis_recupere';
  assert.equal(await compensate(f.api, f.mission, f.rows), false);
  assert.equal(f.mission.status, 'accepting');
}
console.log('PASS interrupted cancellation compensation resumes; collected parcels never released (isolated adapters)');
{
  const f = fixture();
  const third = { ...structuredClone(f.rows[0]), id: 'third-course' };
  f.rows.push(third);
  f.mission.course_ids.push(third.id);
  const result = await complete(f.api, f.mission, patch);
  assert.equal(result.success, true);
  assert.equal(f.mission.course_ids.length, 3);
  assert.ok(f.rows.every(row => row.livreur_id === 'driver' && row.accepted_by_livreur_id === 'driver'));
  assert.ok(f.rows.every(row => row.commission_locked_at && row.commission_taux_applique === 0));
}
console.log('PASS three-course acceptance retains per-course locks and commission invariants (isolated adapter)');
