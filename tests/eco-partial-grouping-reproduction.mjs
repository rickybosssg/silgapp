import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Fault-injected execution of real functions, not a Base44 transaction proof.
const source = readFileSync('base44/shared/ecoOptimizationEngine.ts', 'utf8');
const parsed = ts.createSourceFile('engine.ts', source, ts.ScriptTarget.Latest, true);
const names = ['releaseEcoCandidate', 'recoverEcoCandidates', 'processEcoCourseCreated', 'updateEcoMissionRouteProgress'];
const code = names.map(name => {
  const fn = parsed.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(fn, name);
  return ts.transpile(fn.getText(parsed).replace('export ', ''), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
}).join('\n');
const dependencies = {
  shouldHoldEcoCourseOnCreate: async () => true,
  loadEcoConfig: async () => ({ enabled: true, groupingEnabled: true, maxCoursesPerMission: 2 }),
  compatibilityScore: () => 90, TERMINAL_STATUSES: ['livree', 'annulee'],
  routePlanForEcoMission: () => ['a', 'b'].flatMap(course_id =>
    ['pickup', 'delivery'].map(type => ({ course_id, type, status: 'pending' }))),
  prixCourse: () => 500,
};
const functions = new Function(...Object.keys(dependencies), `${code}; return { ${names.join(',')} };`)(...Object.values(dependencies));
const matches = (row, filter) => Object.entries(filter).every(([key, value]) =>
  value && typeof value === 'object' && '$in' in value ? value.$in.includes(row[key] ?? null) : (row[key] ?? null) === value);
function adapter(fault) {
  const rows = new Map(['a','b'].map(id => [id, {
    id, country_code: 'BF', enterprise_id: null, statut: 'recherche_livreur',
    delivery_mode: 'eco', eco_status: 'isolated', dispatch_status: 'en_attente',
    eco_mission_id: null, livreur_id: null, accepted_by_livreur_id: null,
  }]));
  const missions = new Map();
  let progressRace = false;
  const entities = {
    CourseExterne: {
      get: async id => structuredClone(rows.get(id)),
      filter: async filter => [...rows.values()].filter(row => matches(row, filter)).map(row => structuredClone(row)),
      updateMany: async (filter, patch) => {
        if (!filter.id?.$in && fault === 'cleanup-failure') throw Error('release unavailable');
        let updated = 0;
        for (const row of rows.values()) {
          if (!matches(row, filter)) continue;
          Object.assign(row, patch.$set);
          updated++;
          if (filter.id?.$in && ['partial', 'throw-after-write', 'cleanup-failure'].includes(fault)) break;
        }
        if (filter.id?.$in && fault === 'throw-after-write') throw Error('lost response');
        return { updated };
      },
    },
    EcoMission: {
      create: async data => { const row = { id: 'm', ...data }; missions.set('m', row); return structuredClone(row); },
      get: async id => structuredClone(missions.get(id)),
      updateMany: async (filter, patch) => {
        const row = missions.get(filter.id);
        if (!matches(row, filter)) return { updated: 0 };
        if (filter.route_plan_json && fault === 'progress-race' && !progressRace) {
          progressRace = true;
          rows.get('b').statut = 'colis_recupere';
          return { updated: 0 };
        }
        if (patch.$set.status === 'available') {
          assert.equal([...rows.values()].filter(c => c.eco_mission_id === row.id).length, 2);
        }
        Object.assign(row, patch.$set);
        if (patch.$set.status === 'available' && fault === 'lost-publication-response') throw Error('network');
        return { updated: 1 };
      },
    },
  };
  return { api: { asServiceRole: { entities } }, rows, missions };
}
for (const fault of ['partial', 'throw-after-write']) {
  const { api, rows, missions } = adapter(fault);
  const result = await functions.processEcoCourseCreated(api, 'a');
  assert.equal(result.reason, 'atomic_grouping_lost');
  assert.equal(missions.get('m').status, 'invalidated');
  assert.ok([...rows.values()].every(c => c.eco_mission_id === null && c.eco_status === 'isolated'));
}
for (const fault of ['none', 'lost-publication-response']) {
  const { api, rows, missions } = adapter(fault);
  assert.equal((await functions.processEcoCourseCreated(api, 'a')).grouped, true);
  assert.equal(missions.get('m').status, 'available');
  assert.ok([...rows.values()].every(c => c.eco_mission_id === 'm'));
}
{
  const { api, rows, missions } = adapter('cleanup-failure');
  assert.equal((await functions.processEcoCourseCreated(api, 'a')).reason, 'grouping_recovery_required');
  assert.equal(missions.get('m').status, 'invalidated', 'fence publication before compensation');
  assert.ok(missions.get('m').locked_at, 'persist pending recovery after compensation outage');
  assert.equal(rows.get('a').eco_mission_id, 'm');
}
{
  const { api, rows, missions } = adapter('partial');
  await functions.processEcoCourseCreated(api, 'a');
  missions.get('m').status = 'candidate';
  rows.get('a').eco_mission_id = 'another';
  assert.equal(await functions.releaseEcoCandidate(api, missions.get('m')), true);
  assert.equal(rows.get('a').eco_mission_id, 'another', 'never release another mission');
}
{
  const { api, rows, missions } = adapter('progress-race');
  await functions.processEcoCourseCreated(api, 'a');
  missions.get('m').status = 'accepted';
  rows.get('a').statut = 'colis_recupere';
  assert.equal((await functions.updateEcoMissionRouteProgress(api, 'a')).updated, true);
  const mission = missions.get('m');
  assert.equal(mission.status, 'in_progress');
  const plan = JSON.parse(mission.route_plan_json);
  assert.equal(plan[0].status, 'completed');
  assert.equal(plan[2].status, 'completed', 'retry reads concurrent pickup');
  assert.equal(mission.active_step_index, 1, 'interleaved plan keeps first delivery next');
  rows.get('a').statut = 'livree';
  await functions.updateEcoMissionRouteProgress(api, 'a');
  assert.equal(mission.active_step_index, 3);
  mission.route_plan_json = 'malformed';
  assert.equal((await functions.updateEcoMissionRouteProgress(api, 'a')).reason, 'invalid_route_plan');
  assert.equal(mission.route_plan_json, 'malformed', 'never erase a damaged plan');
}
{
  const { api, rows, missions } = adapter('none');
  missions.set('m', { id: 'm', status: 'candidate', course_ids: ['a','b'], enterprise_id: null });
  rows.get('a').eco_mission_id = 'm';
  api.asServiceRole.entities.EcoMission.filter = async filter => {
    assert.equal(filter.country_code, 'BF');
    assert.ok(filter.$or[0].created_date.$lte);
    return [structuredClone(missions.get('m'))];
  };
  assert.equal((await functions.recoverEcoCandidates(api, 'BF'))[0].recovered, true);
  assert.equal(rows.get('a').eco_mission_id, null);
  assert.equal(missions.get('m').locked_at, null);
  assert.equal((await functions.recoverEcoCandidates(api, 'BF'))[0].recovered, true);
  missions.get('m').status = 'accepted';
  rows.get('a').eco_mission_id = 'm';
  assert.equal(await functions.releaseEcoCandidate(api, missions.get('m')), false);
  assert.equal(rows.get('a').eco_mission_id, 'm');
}
console.log('PASS: grouping compensation, crash recovery, ambiguous writes, isolation and concurrent route progress (simulated adapters)');
