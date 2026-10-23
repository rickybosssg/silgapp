import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import {withdrawDriverCourse,synchronizeDriverCourseStatus} from '../base44/shared/driverWithdrawal.ts';
import {createDriverWithdrawalRequest,isConfirmedDriverWithdrawal} from '../src/lib/driverWithdrawalClient.js';
import {isTerminalCourse} from '../base44/shared/courseTerminalGuard.ts';

const actor={id:'u-driver',email:'driver@example.invalid'};
const input={motif:'panne_vehicule',motif_detail:'Fictitious isolated test',request_id:'withdrawal-isolated-0001'};
const course=id=>({id,country_code:'BF',enterprise_id:null,livreur_id:'driver',statut:'livreur_en_route',dispatch_status:'accepte',updated_date:'revision-1',prix_propose_client:1500,commission_silga:150,heure_acceptation:'2026-10-23T01:00:00Z'});
const clone=v=>structuredClone(v);
function model(grouped=false){
 const tables={CourseExterne:[course('a'),course('b')],Livreur:[{id:'driver',user_email:actor.email,country_code:'BF',enterprise_id:null,statut:'en_course',updated_date:'revision-1'}],EcoMission:[],ColisExterne:[]};
 if(grouped){tables.CourseExterne.forEach(c=>c.eco_mission_id='mission');tables.EcoMission.push({id:'mission',livreur_id:'driver',country_code:'BF',enterprise_id:null,status:'accepted',course_ids:['a','b'],updated_date:'revision-1',total_price:3000,active_step_index:0,route_plan_json:JSON.stringify([{course_id:'a',type:'pickup',status:'pending',order:1},{course_id:'b',type:'pickup',status:'pending',order:2},{course_id:'a',type:'delivery',status:'pending',order:3},{course_id:'b',type:'delivery',status:'pending',order:4}])});}
 const writes=[];let revision=2,hook=null;
 const matches=(row,filter)=>Object.entries(filter).every(([key,value])=>value&&typeof value==='object'&&'$in'in value?value.$in.includes(row[key]??null):JSON.stringify(row[key])===JSON.stringify(value));
 const entities=Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,{
  get:async id=>clone(rows.find(r=>r.id===id)||null),
  filter:async(filter,_sort,limit)=>clone(rows.filter(r=>matches(r,filter)).slice(0,limit??rows.length)),
  updateMany:async(filter,update)=>{
   if(hook){const fn=hook;hook=null;fn(name,filter,update,tables);}
   const row=rows.find(r=>matches(r,filter));if(!row)return{updated:0};
   writes.push({entity:name,id:row.id,patch:clone(update.$set)});Object.assign(row,clone(update.$set),{updated_date:'revision-'+revision++});return{updated:1};
  },
 }]));
 const api={auth:{me:async()=>actor},entities:{Livreur:entities.Livreur},asServiceRole:{entities}};
 return{api,tables,writes,hook:fn=>hook=fn};
}
const withdraw=m=>withdrawDriverCourse(m.api,actor,'a',input);

test('two independent courses: withdraw one, preserve the other and En course, without redispatch or money writes',async()=>{
 const m=model();const before=clone(m.tables.CourseExterne[1]);const r=await withdraw(m);
 assert.equal(r.success,true);assert.equal(r.withdrawn,true);assert.equal(r.client_decision_attendue,true);assert.equal(r.course_redispatch,false);
 assert.equal(m.tables.CourseExterne[0].statut,'en_attente');assert.equal(m.tables.CourseExterne[0].livreur_id,null);
 assert.deepEqual(m.tables.CourseExterne[1],before);assert.equal(m.tables.Livreur[0].statut,'en_course');
 assert.ok(m.writes.every(w=>w.entity==='CourseExterne'&&w.id==='a'));assert.equal(m.tables.CourseExterne[0].commission_silga,150);
});

test('grouped mission: removing either pre-pickup course preserves remaining custody/progress and audit',async()=>{
 for(const id of ['a','b']){
  const m=model(true);const other=m.tables.CourseExterne.find(c=>c.id!==id);Object.assign(other,{statut:'colis_recupere',heure_recuperation:'2026-10-23T02:00:00Z'});const original=clone(other);
  const result=await withdrawDriverCourse(m.api,actor,id,input);assert.equal(result.success,true);
  const mission=m.tables.EcoMission[0];assert.equal(mission.status,'invalidated');assert.deepEqual(mission.course_ids,[other.id]);assert.equal(mission.total_price,1500);
  assert.deepEqual(other,{...original,eco_mission_id:null,updated_date:other.updated_date});assert.equal(other.commission_silga,150);assert.equal(other.statut,'colis_recupere');
  const route=JSON.parse(mission.route_plan_json);assert.ok(route.every(s=>s.course_id===other.id));assert.equal(route[0].status,'completed');assert.equal(mission.active_step_index,1);
  assert.deepEqual(JSON.parse(mission.withdrawal_audit_json)[0].course_ids,['a','b']);assert.equal(m.tables.Livreur[0].statut,'en_course');
 }
});

test('pickup timestamp, custody status or an individually recovered parcel blocks withdrawal with zero writes',async()=>{
 for(const variant of ['timestamp','status','parcel']){
  const m=model(true);if(variant==='timestamp')m.tables.CourseExterne[0].heure_recuperation='recorded';
  if(variant==='status')m.tables.CourseExterne[0].statut='colis_recupere';
  if(variant==='parcel')m.tables.ColisExterne.push({id:'parcel',course_id:'a',statut:'recupere'});
  const result=await withdraw(m);assert.equal(result.success,false);assert.equal(result.code,'CUSTODY_INCIDENT_REQUIRED');assert.equal(m.writes.length,0);assert.equal(m.tables.CourseExterne[0].livreur_id,'driver');
 }
});

test('legacy multi-parcel pickup writers require administrator handling before any release',async()=>{
 for(const variant of ['flag','children']){
  const m=model(true);if(variant==='flag')m.tables.CourseExterne[0].is_multi_colis=true;
  else m.tables.ColisExterne.push({id:'p1',course_id:'a',statut:'en_attente'},{id:'p2',course_id:'a',statut:'en_attente'});
  const result=await withdraw(m);assert.equal(result.code,'MULTIPARCEL_REVIEW_REQUIRED');assert.equal(result.success,false);assert.equal(m.writes.length,0);assert.equal(m.tables.CourseExterne[0].livreur_id,'driver');
 }
});

test('already cancelled and cancellation concurrent with withdrawal never republish or free the driver',async()=>{
 for(const race of [false,true]){
  const m=model(true);const cancel=()=>Object.assign(m.tables.CourseExterne[0],{statut:'annulee',annulation_user_id:'admin',dispatch_status:'expire',updated_date:'cancelled-revision'});
  if(race)m.hook(cancel);else cancel();
  assert.equal((await withdraw(m)).success,false);assert.equal(m.tables.CourseExterne[0].statut,'annulee');assert.equal(m.writes.length,0);assert.equal(m.tables.Livreur[0].statut,'en_course');
 }
});

test('simultaneous withdrawals commit once; repeated same withdrawal has no second audit entry',async()=>{
 const m=model(true);const results=await Promise.all([withdraw(m),withdraw(m)]);assert.ok(results.some(r=>r.success));
 assert.equal(m.writes.filter(w=>w.entity==='CourseExterne'&&w.patch.client_decision_attendue).length,1);
 assert.equal((await withdraw(m)).already_withdrawn,true);assert.equal(JSON.parse(m.tables.EcoMission[0].withdrawal_audit_json).length,1);
});

test('mission failure after course CAS can be resumed without losing the remaining course',async()=>{
 const m=model(true);const original=m.api.asServiceRole.entities.EcoMission.updateMany;let fail=true;
 m.api.asServiceRole.entities.EcoMission.updateMany=async(...args)=>{if(fail){fail=false;throw Error('simulated crash');}return original(...args);};
 const first=await withdraw(m);assert.equal(first.success,false);assert.equal(first.withdrawal_committed,true);assert.equal(m.tables.CourseExterne[0].client_decision_attendue,true);
 assert.equal((await withdraw(m)).success,true);assert.equal(m.tables.CourseExterne[1].livreur_id,'driver');assert.equal(m.tables.Livreur[0].statut,'en_course');
});

test('ownership, country and Enterprise mismatches deny before writes',async()=>{
 for(const variation of ['owner','country','enterprise']){
  const m=model();if(variation==='owner')m.tables.Livreur[0].user_email='other@example.invalid';if(variation==='country')m.tables.Livreur[0].country_code='CI';if(variation==='enterprise')m.tables.Livreur[0].enterprise_id='private';
  assert.equal((await withdraw(m)).success,false);assert.equal(m.writes.length,0);
 }
});

test('frontend unwraps data, prevents double click and preserves the same ID after uncertain network response',async()=>{
 const calls=[];let finish;const api={functions:{invoke:async(_name,payload)=>{calls.push(payload);if(calls.length===1)return new Promise(resolve=>finish=resolve);return{data:{success:true,withdrawn:true,course_id:'a',client_decision_attendue:true,withdrawal_contract:'per-course-v1'}};}}};
 const submit=createDriverWithdrawalRequest(api,()=> 'stable-request-0001');const pending=submit({courseId:'a',motif:'autre',detail:'test'});assert.equal(await submit({courseId:'a',motif:'autre',detail:'test'}),null);
 finish({data:{success:false,error:'concurrent',course_id:'a'}});await assert.rejects(pending);assert.equal((await submit({courseId:'a',motif:'autre',detail:'test'})).withdrawn,true);assert.equal(calls[0].request_id,calls[1].request_id);
});

test('actual cancellation handler blocks custody and cancelled rows without notification or financial writes',async()=>{
 const source=ts.transpileModule(fs.readFileSync('base44/functions/annulerCourseExterne/entry.ts','utf8').replace(/^import .*;\r?\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const state of ['colis_recupere','annulee']){
  const m=model(true);m.tables.CourseExterne[0].statut=state;let handler;
  new Function('Deno','createClientFromRequest','normalizeEnterpriseId','recalculateEcoMissionAfterCancellation','canCancelCourse','cancelCourseTerminal','expireCancelledCourseOffers','withdrawDriverCourse',source)({serve:fn=>handler=fn},()=>m.api,x=>x||null,()=>{throw Error('No mission mutation');},()=>true,()=>{throw Error('No terminal mutation');},()=>{},withdrawDriverCourse);
  const res=await handler(new Request('https://isolated.invalid',{method:'POST',body:JSON.stringify({course_id:'a',source:'livreur',motif:'panne_vehicule'})}));assert.equal((await res.json()).success,false);assert.equal(m.writes.length,0);
 }
});

test('confirmed withdrawal ignores stale active responses but permits a genuinely newer acceptance',async()=>{
 const submit=createDriverWithdrawalRequest({functions:{invoke:async()=>({data:{success:true,withdrawn:true,course_id:'stale-test',client_decision_attendue:true,withdrawal_contract:'per-course-v1',withdrawn_at:'2026-10-23T03:00:00Z'}})}});
 await submit({courseId:'stale-test',driverId:'driver',motif:'autre',detail:'isolated'});
 const stale={id:'stale-test',livreur_id:'driver',statut:'livreur_en_route',heure_acceptation:'2026-10-23T02:00:00Z'};
 assert.equal(isConfirmedDriverWithdrawal(stale,'driver'),true);assert.equal(isConfirmedDriverWithdrawal(stale,'another-driver'),false);
 assert.equal(isConfirmedDriverWithdrawal({...stale,heure_acceptation:'2026-10-23T04:00:00Z'},'driver'),false);
});

test('availability reconciliation keeps an independent active course after admin cancellation and rechecks new assignments',async()=>{
 const m=model();m.tables.CourseExterne[0].statut='annulee';assert.equal((await synchronizeDriverCourseStatus(m.api,'driver')).statut,'en_course');
 m.tables.CourseExterne[1].statut='livree';m.hook((name)=>{if(name==='Livreur')m.tables.CourseExterne.push(course('new-assignment'));});
 await synchronizeDriverCourseStatus(m.api,'driver');assert.equal(m.tables.Livreur[0].statut,'en_course');
});

test('stale assignment snapshot and concurrent pickup confirmation cannot withdraw the newer custody',async()=>{
 const m=model();assert.equal((await withdrawDriverCourse(m.api,actor,'a',{...input,expected_acceptance_at:'old-assignment'})).code,'ASSIGNMENT_CHANGED');assert.equal(m.writes.length,0);
 m.hook(()=>{m.tables.CourseExterne[0].pickup_confirmed_at='new-confirmation';});assert.equal((await withdraw(m)).success,false);assert.equal(m.writes.length,0);
});

test('actual Dispatch V2 publisher refuses a withdrawn course until client decision without offers',async()=>{
 const m=model();await withdraw(m);let offers=0;
 const file='base44/shared/dispatchV2.ts',text=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
 const declaration=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='publierCourseDansFil');
 const code=ts.transpileModule(declaration.getText(ast).replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const publish=new Function('isTerminalCourse','normalizeEnterpriseId','dispatchLog','DISPATCH_V2_BUNDLE_VERSION','journaliserDispatch','notifierLivreursEligiblesV2',code+';return publierCourseDansFil;')(isTerminalCourse,x=>x||null,()=>{},'isolated',()=>{},()=>{offers++;});
 const result=await publish(m.api,m.tables.CourseExterne[0]);assert.equal(result.reason,'client_decision_attendue');assert.equal(offers,0);assert.equal(m.tables.CourseExterne[0].statut,'en_attente');
});
