import { playVictorySoundOnce } from '../src/lib/victorySound.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { deliveryRecapValues, pickupRecordedAt, formatRecordedTime } from '../src/lib/deliveryRecap.js';
import { confirmedDeliverySnapshot } from '../src/lib/confirmedDelivery.js';
import { finaliserLivraisonSafe } from '../src/lib/safeDeliveryFinalization.js';
import { splitAmountByCommission } from '../src/lib/commissionUtils.js';
import { isEcoDeliveryCourse } from '../src/lib/availableCourseOffers.js';

function arrow(file, name) {
  const source=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let found;
  const visit=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(tree)===name)found=n.initializer.getText(tree);ts.forEachChild(n,visit);};visit(tree);assert.ok(found,name);return found;
}
for(const price of [500,1000,2500])test(`stored recap${price} never applies an artificial minimum or writes accounting`,()=>{
 const row={prix_final:price,commission_silga:price/5,montant_livreur:price*4/5};const before=JSON.stringify(row);
 assert.deepEqual(deliveryRecapValues(row),{price,commission:price/5,driver:price*4/5});assert.equal(JSON.stringify(row),before);
});
test('missing accounting remains missing; zero commission is preserved',()=>{
 for(const value of [null,undefined,'',false,'bad',-1])assert.equal(deliveryRecapValues({prix_final:value}).price,null);
 assert.deepEqual(deliveryRecapValues({prix_final:500,commission_silga:0,montant_livreur:500}),{price:500,commission:0,driver:500});
 assert.deepEqual(deliveryRecapValues({}),{price:null,driver:null,commission:null});
});
test('pickup uses recorded fields only, with UTC and explicit timezone handling',()=>{
 const date='2026-10-27T16:28:00.000';
 assert.equal(formatRecordedTime(date,'Africa/Ouagadougou'),'16:28');
 assert.equal(formatRecordedTime(date,'Europe/Paris'),'17:28');
 assert.equal(formatRecordedTime('2026-10-27T17:28:00+01:00','Africa/Ouagadougou'),'16:28');
 assert.equal(pickupRecordedAt({pickup_confirmed_at:date,heure_livraison:'2026-10-27T18:00:00Z'}),date);
 assert.equal(pickupRecordedAt({heure_recuperation:'bad',pickup_confirmed_at:date}),date);
 assert.equal(pickupRecordedAt({heure_livraison:date}),null);assert.equal(formatRecordedTime(null),'—');
});
test('confirmation rejects malformed, refused, cancelled and mismatched receipts',()=>{
 const course={id:'isolated'};
 for(const receipt of [{},{success:false,error:'refused'},{success:true,course_id:'other'},{success:true,course:{id:'isolated',statut:'annulee'}},{data:null,success:true}])assert.throws(()=>confirmedDeliverySnapshot(course,receipt));
 assert.equal(confirmedDeliverySnapshot(course,{data:{success:true,prix_final:500}}).prix_final,500);
 assert.equal(confirmedDeliverySnapshot(course,{success:true}).prix_final,null);
});
function parentFixture(response={data:{success:true,prix_final:500,commission_silga:100,montant_livreur:400}}){
 const events=[],requests=[],pending={current:null},deliveries={current:new Map()},celebrated={current:new Set()};
 const ctx={playVictorySoundOnce,confirmedDeliverySnapshot,finaliserLivraisonSafe,splitAmountByCommission,isEcoDeliveryCourse,deliveryRequestsRef:deliveries,pendingVictoryRecapRef:pending,celebratedCourseIdsRef:celebrated,
  commissionPct:20,livreurProfil:{id:'driver',country_code:'BF'},queryClient:{invalidateQueries:()=>{}},toast:{success:()=>{},error:e=>events.push(['error',e])},
  base44:{functions:{invoke:async(name,args)=>{requests.push({name,args});return typeof response==='function'?response():response;}},entities:{CourseExterne:{get:async()=>({id:'course',statut:'annulee'})}}},
  verifierEncoursApresCourse:async()=>{},remettreDisponibleSiAutorise:async()=>events.push(['availability']),setVictoryCourseId:id=>events.push(['victory',id]),haversineKm:()=>null};
 const handler=vm.runInNewContext('('+arrow('src/pages/LivreurExterneApp.jsx','handleColisLivre')+')',ctx);
 return {handler,events,requests,pending};
}
test('actual admin parent finalizes once, confirms first, then schedules Victory/recap without repricing',async()=>{
 let resolve;const f=parentFixture(()=>new Promise(r=>resolve=r));const course={id:'course',source:'admin',prix_propose_admin:500,country_code:'BF'};
 const first=f.handler(course,500),second=f.handler(course,500);assert.equal(first,second);assert.equal(f.requests.length,1);assert.equal(f.events.length,0);
 resolve({data:{success:true,course_id:'course',prix_final:500,commission_silga:100,montant_livreur:400}});const confirmed=await first;
 assert.equal(confirmed.prix_final,500);assert.equal(f.pending.current.id,'course');assert.equal(f.events.filter(e=>e[0]==='victory').length,1);
 await f.handler(course,500);assert.equal(f.requests.length,1,'resolved confirmation is not replayed');
});
test('actual admin parent refuses failed backend and does not celebrate',async()=>{
 const f=parentFixture({data:{success:false,error:'refused'}});await assert.rejects(f.handler({id:'course',source:'admin'},500),/refused/);
 assert.equal(f.pending.current,null);assert.equal(f.events.length,0);assert.equal(f.requests.length,1);
});
for(const origin of ['classic','express','eco'])test(`actual ${origin} confirmed callback never refinalizes; Eco keeps mission view`,async()=>{
 const f=parentFixture(),course={id:'course',source:'client',statut:'livree',delivery_mode:origin==='eco'?'eco':'standard',...(origin==='express'?{commande_vocale_express:true}:{})};
 await f.handler(course,null,{confirmedResult:{success:true,course_id:'course',prix_final:500}});
 assert.equal(f.requests.length,0);assert.equal(f.events.filter(e=>e[0]==='victory').length,1);assert.equal(!!f.pending.current,origin!=='eco');
});
test('actual admin modal awaits confirmation, blocks same-tick duplicates and stays open on failure',async()=>{
 const body=arrow('src/components/livreur/CourseActiveCard.jsx','handleConfirmerLivraison');
 for(const rejected of [false,true]){
  let resolve,reject,calls=0;const closed=[],errors=[],ref={current:false};
  const fn=vm.runInNewContext('('+body+')',{deliveryConfirmationRef:ref,isDeplacement:false,isExterne:true,course:{id:'course',source:'admin',prix_propose_admin:500},
   setDeliveryBoutonPending(){},setPendingDeliveryData(){},setShowPrixModal:x=>closed.push(x),setPrixReel(){},toast:{error:e=>errors.push(e)},
   onColisLivre:()=>{calls++;return new Promise((ok,no)=>{resolve=ok;reject=no;});}});
  const pending=fn();await fn();assert.equal(calls,1);assert.equal(closed.length,0);
  if(rejected)reject(Error('refused'));else resolve({id:'course',statut:'livree'});await pending;
  assert.equal(ref.current,false);assert.equal(closed.includes(false),!rejected);assert.equal(errors.length,rejected?1:0);
 }
});
test('Victory actual effect lasts nine seconds, uses latest close callback and does no business IO',()=>{
 const source=fs.readFileSync('src/components/livreur/LivreurVictoryOverlay.jsx','utf8'),tree=ts.createSourceFile('overlay.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let effect;
 const visit=n=>{if(ts.isCallExpression(n)&&n.expression.getText(tree)==='useEffect')effect=n.arguments[0].getText(tree);ts.forEachChild(n,visit);};visit(tree);
 const storage=new Map(),timers=[],visible=[],last={current:null},started={current:0},close={current:()=>{}},fakeDate={now:()=>1000};let closed=0;
 const ctx={closedRef:{current:false},playVictorySoundOnce,courseId:'course',lastCourseIdRef:last,startedAtRef:started,onCloseRef:close,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
  setVisible:v=>visible.push(v),window:{matchMedia:()=>({matches:true})},Date:fakeDate,DURATION_MS:9000,confetti:null,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){}};
 const run=()=>vm.runInNewContext('('+effect+')',ctx)();const cleanup=run();assert.equal(timers[0].ms,9000);
 cleanup();fakeDate.now=()=>1100;run();assert.equal(timers[1].ms,8900,'effect replay resumes the remaining duration');
 close.current=()=>closed++;timers[1].fn();assert.equal(closed,1);assert.equal(visible.at(-1),false);
 ctx.lastCourseIdRef={current:null};const before=timers.length;run();assert.equal(timers.length,before,'reload cannot replay a seen delivery');assert.equal(closed,2);
 assert.doesNotMatch(source,/functions\.invoke|entities\./);
});
