import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { finishExpressCreation } from '../base44/shared/expressImmediateDispatch.js';
import { buildExpressCourse } from '../base44/shared/expressOrder.js';
import { resolveExpressClient, EXPRESS_PROFILE_MESSAGES } from '../base44/shared/expressClientContext.js';

// Execute the actual handler with ALL SDK calls substituted. No network/SDK import.
let source=readFileSync(new URL('../base44/functions/creerCourseClient/entry.ts',import.meta.url),'utf8');
source=source.replace(/^import .*;\r?\n/gm,'');
source=source.replace("await import('../../shared/cityResolution.ts')", '({ isCityDispatchEnabled: async () => false })');
source=source.replaceAll("await import('../../shared/dispatchV2.ts')", '({ publierCourseDansFil: publish, isV2Enabled: async () => true })');
const factory=new Function('finishExpressCreation','publish','createClientFromRequest','prepareEcoCreationFields','buildExpressCourse','resolveExpressClient','EXPRESS_PROFILE_MESSAGES',stripTypeScriptTypes(source).replace('export default async function(', 'return async function('));

function setup({ authenticated=true, foreign=false, blocked=false, enterprise=false, legacy=false, dispatchFails=false }={}) {
  const user={email:'client@example.invalid'};
  const client={id:'client-test',user_email:user.email,country_code:'BF',telephone:'TEST',bloque_frais_annulation:blocked,enterprise_id:enterprise?'private-enterprise':null};
  const q1={id:'q1',nom:'A',ville:'Test',country_code:'BF',actif:true,latitude:10,longitude:1};
  const q2={...q1,id:'q2',nom:'B',country_code:foreign?'CI':'BF',latitude:11};
  const mutex={id:'mutex',valeur:'[]',lock_owner:''}; const courses=[]; let ecoCalls=0;
  const sdk={
    auth:{me:async()=>authenticated?user:null},
    entities:{ClientExterne:{filter:async(filter)=>{assert.equal(filter.user_email,user.email);return [client];}},Quartier:{get:async(id)=>id==='q1'?q1:q2}},
    asServiceRole:{entities:{
      AppConfig:{filter:async()=>[mutex],get:async()=>mutex,updateMany:async(filter,update)=>{if(filter.lock_owner && filter.lock_owner!==mutex.lock_owner)return {updated:0};Object.assign(mutex,update.$set);return {updated:1};}},
      CourseExterne:{filter:async(filter)=>courses.filter(c=>c.request_id===filter.request_id&&c.client_user_email===filter.client_user_email),get:async(id)=>courses.find(c=>c.id===id),create:async(data)=>{const c={...data,id:'mock-course'};courses.push(c);return c;}},
    }},
  };
  let publishCalls=0;
  let chosenFactory=factory;
  if(legacy){let old=readFileSync(new URL('./fixtures/express-creation-before.ts.txt',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace("await import('../../shared/cityResolution.ts')",'({ isCityDispatchEnabled: async () => false })');chosenFactory=new Function('finishExpressCreation','publish','createClientFromRequest','prepareEcoCreationFields','buildExpressCourse','resolveExpressClient','EXPRESS_PROFILE_MESSAGES',stripTypeScriptTypes(old).replace('export default async function(', 'return async function('));}
  const handler=chosenFactory(finishExpressCreation, async (_, c) => {publishCalls++;assert.equal(mutex.lock_owner,'');if(dispatchFails)throw Error('synthetic dispatch failure'); c.statut="recherche_livreur";c.dispatch_status="disponible_push";return {success:true}; },()=>sdk,async(_,data)=>{ecoCalls++;assert.equal(data.enterprise_id,null);return {delivery_mode:'standard'};},buildExpressCourse,resolveExpressClient,EXPRESS_PROFILE_MESSAGES);
  return {courses,publishCalls:()=>publishCalls,ecoCalls:()=>ecoCalls,call:body=>handler(new Request('https://test.invalid',{method:'POST',body:JSON.stringify(body)}))};
}
const draft={depart_id:'q1',arrivee_id:'q2',prix:1000,confirmed:true};
test('handler réel : auth, confirmation, pays, blocage, prix et aucune écriture sur refus',async()=>{
  for(const [opts,body,status] of [
    [{authenticated:false},{express_draft:draft,request_id:'r'},401],
    [{},{express_draft:{...draft,confirmed:false},request_id:'r'},400],
    [{},{express_draft:draft},400],
    [{foreign:true},{express_draft:draft,request_id:'r'},400],
    [{enterprise:true},{express_draft:draft,request_id:'r'},403],
    [{blocked:true},{express_draft:draft,request_id:'r'},400],
    [{},{express_draft:{...draft,prix:-1},request_id:'r'},400],
    [{},{course_data:{commande_vocale_express:true},request_id:'r'},400],
  ]) {const h=setup(opts);assert.equal((await h.call(body)).status,status);assert.equal(h.courses.length,0);assert.equal(h.ecoCalls(),0);}
});
test('handler réel : reconstruction catalogue, identité authentifiée et idempotence existante',async()=>{
  const h=setup();
  const body={express_draft:draft,request_id:'stable-test',course_data:{client_user_email:'attacker',gps_arrivee_lat:55,enterprise_id:'other',prix_propose_client:1}};
  const first=await (await h.call(body)).json();
  assert.equal(first.success,true);assert.equal(h.courses.length,1);
  const course=h.courses[0];
  assert.equal(course.client_user_email,'client@example.invalid');assert.equal(course.gps_arrivee_lat,11);
  assert.equal(course.prix_propose_client,1000);assert.equal(course.enterprise_id,undefined);
  assert.equal(course.statut,'recherche_livreur');assert.equal(course.dispatch_status,'disponible_push');
  const second=await (await h.call(body)).json();
  assert.equal(second.idempotent,true);assert.equal(h.courses.length,1);assert.equal(h.ecoCalls(),1);
});
test('handler réel : parcours classique et champs sensibles restent filtrés',async()=>{
  const h=setup();
  const response=await (await h.call({request_id:'classic',course_data:{country_code:'BF',type_course:'expedier',adresse_depart:'A',statut:'livree',enterprise_id:'forbidden',prix_propose_client:1500}})).json();
  assert.equal(response.success,true);assert.equal(h.courses[0].statut,'nouvelle');assert.equal(h.courses[0].enterprise_id,undefined);assert.equal(h.courses[0].prix_propose_client,1500);
});

test('BEFORE actual handler returns new without starting publication; AFTER starts before response',async()=>{
 for(const legacy of [true,false]){const h=setup({legacy});const r=await(await h.call({express_draft:draft,request_id:'r'})).json();assert.equal(r.course.statut,legacy?'nouvelle':'recherche_livreur');assert.equal(h.publishCalls(),legacy?0:1);}
});
test('dispatch failure preserves successful creation and idempotent retry of same course',async()=>{
 const h=setup({dispatchFails:true}),body={express_draft:draft,request_id:'stable'};
 for(let i=0;i<2;i++){const r=await(await h.call(body)).json();assert.equal(r.success,true);assert.equal(r.course.id,'mock-course');assert.equal(r.course.statut,'nouvelle');assert.equal(r.dispatch.pending,true);}
 assert.equal(h.courses.length,1);
});
