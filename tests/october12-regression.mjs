import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { captureDeliveryGps } from '../src/lib/deliveryGps.js';

const read = p => readFileSync(p, 'utf8');
const js = s => ts.transpile(s, { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React });
const gpsSource = js(read('base44/shared/deliveryGps.ts').replaceAll('export ', ''));
const resolve = new Function(`${gpsSource};return resolveDeliveryGps;`)();
const now = Date.now();
const fresh = { latitude: 12.3, longitude: -1.5, gps_timestamp: now, gps_accuracy: 20 };
assert.deepEqual(resolve(fresh, {}, now).gps, { latitude: 12.3, longitude: -1.5 });
for (const patch of [{ gps_timestamp: now - 120001 }, { gps_accuracy: 101 }, { gps_accuracy: null }, { latitude: 91 }, { gps_timestamp: now + 6000 }]) {
  assert.equal(resolve({ ...fresh, ...patch }, {}, now).gps, null);
}
const driver = { latitude: 12.4, longitude: -1.6, derniere_position_date: new Date(now - 20000).toISOString(), gps_accuracy: 20 };
assert.equal(resolve({}, driver, now).reason, 'recent_driver_fix');
assert.equal(resolve({ gps_reason: 'permission_denied' }, driver, now).gps, null);
assert.equal(resolve({}, { ...driver, derniere_position_date: null, last_seen_at: new Date(now).toISOString() }, now).gps, null);
assert.equal((await captureDeliveryGps({ getCurrentPosition: ok => ok({ timestamp: now - 130000, coords: { latitude: 12.3, longitude: -1.5, accuracy: 10 } }) })).gps_reason, 'stale_or_inaccurate_fix');

// Render the production available-feed component with isolated hooks/entities.
const component = js(read('src/components/livreur/CoursesDisponibles.jsx')
  .replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function'));
let state;
const noop = () => {};
const icon = () => React.createElement('i');
const Component = new Function('React', 'useState', 'useEffect', 'useMemo', 'useRef', 'useQueryClient', 'useCoursesDisponibles', 'EcoMissionCard', 'Flame', 'Lock',
  `${component};return CoursesDisponibles;`)(React, v => [v, noop], noop, f => f(), v => ({ current: v }), () => ({}), () => state,
  ({ mission }) => React.createElement('article', { 'data-mission': mission.id }, mission.id), icon, icon);
const render = overrides => {
  state = { eligibleCourses: [], courses: [], ecoMissions: [], livreurPeutVoirFil: true, livreurDisponible: true, ...overrides };
  return renderToStaticMarkup(React.createElement(Component, { livreurProfil: { id: 'driver', country_code: 'BF' } }));
};
assert.match(render({ ecoMissions: [{ id: 'only-eco' }] }), /data-mission="only-eco"/);
assert.doesNotMatch(render({ ecoMissions: [{ id: 'only-eco' }] }), /Aucune course disponible/);
assert.match(render({}), /Aucune course disponible/);
assert.doesNotMatch(render({ isLoading: true }), /Aucune course disponible/);
assert.match(render({ isError: true }), /role="alert"/);
assert.doesNotMatch(render({ livreurPeutVoirFil: false, ecoMissions: [{ id: 'hidden' }] }), /data-mission/);

// Execute actual mission progress against changing per-course backend states.
const source = read('base44/shared/ecoOptimizationEngine.ts');
const parsed = ts.createSourceFile('engine.ts', source, ts.ScriptTarget.Latest, true);
const fn = parsed.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'updateEcoMissionRouteProgress');
const progress = new Function(`${js(fn.getText(parsed).replace('export ', ''))};return updateEcoMissionRouteProgress;`)();
const rows = Object.fromEntries(['a','b'].map(id => [id, { id, eco_mission_id: 'm', statut: 'livreur_en_route' }]));
const mission = { id:'m', status:'accepted', course_ids:['a','b'], active_step_index:0, route_plan_json: JSON.stringify([
  { course_id:'a', type:'pickup', status:'pending' }, { course_id:'a', type:'delivery', status:'pending' },
  { course_id:'b', type:'pickup', status:'pending' }, { course_id:'b', type:'delivery', status:'pending' },
]) };
let writes = 0;
const api = { asServiceRole:{entities:{
  CourseExterne:{get:async id => structuredClone(rows[id])},
  EcoMission:{get:async()=>structuredClone(mission),updateMany:async(filter,patch)=>{
    assert.equal(filter.route_plan_json, mission.route_plan_json);
    Object.assign(mission,patch.$set); writes++; return {updated:1};
  }},
}}};
for (const [id, status, index] of [['a','colis_recupere',1],['a','livree',2],['b','colis_recupere',3],['b','livree',4]]) {
  rows[id].statut=status; await progress(api,id); assert.equal(mission.active_step_index,index);
  const before=writes; await progress(api,id); assert.equal(writes,before,'repeated confirmation is idempotent');
}
assert.equal(JSON.parse(mission.route_plan_json).filter(s=>s.status==='completed').length,4);
rows.a.statut='colis_recupere'; await progress(api,'a'); assert.equal(mission.active_step_index,4,'completed steps never regress');

const soundSource=read('src/lib/victorySound.js').replace(/^import .*;\r?\n/gm,'').replace('export async function','async function');
let sounds=0;
const sound=new Function('Capacitor','registerPlugin',`${soundSource};return playVictorySoundOnce;`)({getPlatform:()=> 'android'},()=>({playVictorySound:async()=>{sounds++;}}));
await sound('a'); await sound('a'); await sound('b'); assert.equal(sounds,2);
const native=read('android/app/src/main/java/com/silgapp2/app/SilgappNativePlugin.java');
for(const guard of ['getRingerMode()', 'RINGER_MODE_NORMAL', 'STREAM_NOTIFICATION', 'INTERRUPTION_FILTER_ALL', 'prefs.edit().putBoolean(id, true).commit()']) assert.ok(native.includes(guard));
const history=read('src/pages/ClientSuiviCourse.jsx');
assert.ok(history.includes('!isLoading && !coursesError'));
assert.ok(history.includes('Chargement de vos courses...'));
assert.ok(read('src/hooks/useCoursesDisponibles.js').includes('coursesLoading || missionsLoading'));
const card = ts.createSourceFile('card.jsx', read('src/components/livreur/CourseActiveCard.jsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let transitionNode;
const visit = n => { if (ts.isVariableDeclaration(n) && n.name.getText(card) === 'transitionDeplacement') transitionNode = n.initializer; ts.forEachChild(n, visit); };
visit(card);
let backendSuccess = false, confirmed = 0, errors = 0, modal = 0;
const transition = new Function('transitionPendingRef','functionBody','base44','course','captureDeliveryGps','updateOptimisticStatut','queryClient','setShowPrixModal','toast',`return ${js(transitionNode.getText(card))}`)(
  {current:false}, r=>r.data, {functions:{invoke:async()=>({data:{success:backendSuccess,error:'backend_refused'}})}}, {id:'a'}, async()=>fresh,
  ()=>confirmed++, {invalidateQueries:()=>{}}, ()=>modal++, {success:()=>{},error:()=>errors++});
await transition('pris_en_charge'); assert.equal(confirmed,0); assert.equal(errors,1);
backendSuccess=true; await transition('pris_en_charge'); assert.equal(confirmed,1);
await transition('arrivee'); assert.equal(modal,1);
assert.ok(read('src/components/layout/AppLayout.jsx').includes('showVenus={!desktop}'));
console.log('PASS October12: rendered Eco-only feed, loading/error/access states; real GPS validation; actual route progression/idempotence; sound call deduplication; native guard source contracts. Not device or Base44 execution.');
