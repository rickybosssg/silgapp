import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { newestCourseRows, reconcilePickupView } from '../src/lib/confirmedPickupView.js';
import { commitConfirmedDeliveryView, confirmedDeliverySnapshot } from '../src/lib/confirmedDelivery.js';
import { normalizeCourseFunctionResult, readLivreurCoursesResponse } from '../src/lib/courseFunctionResult.js';
import { finaliserLivraisonSafe } from '../src/lib/safeDeliveryFinalization.js';
const old={id:'c',statut:'en_route_expediteur',updated_date:'2026-10-29T00:00:00Z'};
const picked={...old,statut:'colis_recupere',heure_recuperation:'2026-10-29T00:01:00Z',updated_date:'2026-10-29T00:01:00Z'};
const done={...picked,statut:'livree',prix_final:1000,commission_silga:200,montant_livreur:800,updated_date:'2026-10-29T00:02:00Z'};
test('merge independent sources by newest server revision irrespective of source order',()=>{
 for(const rows of [[old,picked],[picked,old]]) assert.deepEqual(newestCourseRows(rows),[picked]);
 for(const rows of [[picked,done],[done,picked]]) assert.deepEqual(newestCourseRows(rows),[done]);
});
test('observed cancellation never resurrects through merger or cached receipt',async()=>{
 const cancelled={...done,statut:'annulee'};
 for(const rows of [[done,cancelled],[cancelled,done]])assert.deepEqual(newestCourseRows(rows),[cancelled]);
 let cache=[cancelled];const client={cancelQueries:async()=>{},setQueriesData:(_,fn)=>{cache=fn(cache);}};
 await assert.rejects(commitConfirmedDeliveryView(client,done),/annulée/);assert.deepEqual(cache,[cancelled]);
 assert.equal(reconcilePickupView(cancelled,done),cancelled);
});
test('confirmed delivery updates driver and mission cache without changing sibling course',async()=>{
 const sibling={id:'d',statut:'en_livraison'};let caches=[[picked,sibling],[picked,sibling]];const calls=[];
 const client={cancelQueries:async({queryKey})=>calls.push(queryKey),setQueriesData:({queryKey},fn)=>{const i=queryKey[0]==='mes-courses-externes'?0:1;caches[i]=fn(caches[i]);}};
 await commitConfirmedDeliveryView(client,done,'m');assert.equal(calls.length,2);
 for(const cache of caches){assert.equal(cache[0].statut,'livree');assert.equal(cache[1],sibling);}
});
test('direct and wrapped course lists accepted, malformed/refused lists never treated as empty success',()=>{
 for(const response of [{courses:[picked]},{data:{courses:[picked]}}])assert.deepEqual(readLivreurCoursesResponse(response),[picked]);
 for(const response of [null,{}, {data:null}, {courses:{}},{courses:[],success:false},{data:{courses:[],error:'refused'}},{status:403,data:{courses:[]}}])assert.throws(()=>readLivreurCoursesResponse(response));
 assert.deepEqual(readLivreurCoursesResponse({courses:[]}),[]);
});
test('success receipt with a non-delivered course cannot fabricate delivery',()=>{
 assert.throws(()=>confirmedDeliverySnapshot(picked,{success:true,course:picked}));
});
function initializer(name){const src=fs.readFileSync('src/components/livreur/EcoMissionDashboard.jsx','utf8'),tree=ts.createSourceFile('eco.jsx',src,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let found;const visit=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(tree)===name)found=n.initializer.getText(tree);ts.forEachChild(n,visit);};visit(tree);assert.ok(found);return found;}
test('real Eco finalization locks same-tick click, commits receipt before victory and never repeats sibling',async()=>{
 let resolve,writes=0,cache=[picked,{id:'sibling',statut:'en_livraison'}];const events=[],lock={current:false};
 const api={functions:{invoke:async(name,payload)=>{assert.equal(payload.latitude,12);assert.equal(payload.longitude,-1);assert.equal(payload.gps_timestamp,1710000000000);assert.equal(payload.gps_accuracy,5);writes++;return new Promise(ok=>resolve=ok);}}};
 const ctx={captureDeliveryGps:async()=>({latitude:12,longitude:-1,gps_timestamp:1710000000000,gps_accuracy:5}),actionLock:lock,setActionPending(){},base44:api,finaliserLivraisonSafe,normalizeCourseFunctionResult,confirmedDeliverySnapshot,commitConfirmedDeliveryView,courses:cache,mission:{id:'m'},queryClient:{cancelQueries:async()=>{},setQueriesData:(_,fn)=>{cache=fn(cache);},invalidateQueries(){}},toast:{success:()=>events.push('success'),error:e=>events.push(e)},onDeliveryConfirmed:()=>{assert.equal(cache[0].statut,'livree');events.push('victory');}};
 const fn=vm.runInNewContext('('+initializer('handleFinalize')+')',ctx);const a=fn('c');await fn('c');await new Promise(r=>setImmediate(r));assert.equal(writes,1);assert.deepEqual(events,[]);
 resolve({data:{success:true,course:done}});await a;assert.equal(cache[1].id,'sibling');assert.equal(lock.current,false);assert.deepEqual(events,['success','victory']);
});
test('Eco finalization refusal does not update cache or celebrate',async()=>{
 const events=[];const ctx={captureDeliveryGps:async()=>({latitude:12,longitude:-1,gps_timestamp:1710000000000,gps_accuracy:5}),actionLock:{current:false},setActionPending(){},base44:{functions:{invoke:async()=>({success:false,error:'refused'})}},finaliserLivraisonSafe,normalizeCourseFunctionResult,courses:[picked],mission:{id:'m'},queryClient:{invalidateQueries(){events.push('invalidate');}},toast:{success:()=>events.push('success'),error:e=>events.push(e)}};
 await vm.runInNewContext('('+initializer('handleFinalize')+')',ctx)('c');assert.deepEqual(events,['refused']);
});
test('mission partial read is not silently filtered into a completed mission',()=>{
 const src=fs.readFileSync('src/components/livreur/EcoMissionDashboard.jsx','utf8');
 assert.match(src,/courses.length === mission\?\.course_ids\?\.length/);
 assert.match(src,/Lecture de mission incomplète/);
 assert.doesNotMatch(src,/CourseExterne.get\(id\)\.catch\(\(\) => null\)/);
});
