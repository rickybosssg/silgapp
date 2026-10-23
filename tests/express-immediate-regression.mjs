import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import { createExpressSubmission } from '../base44/shared/expressOrder.js';
import { openCreatedExpressCourse, reconcileCreatedExpressCourse, isExpressAwaitingDispatch } from '../src/lib/expressTracking.js';
import { finishExpressCreation } from '../base44/shared/expressImmediateDispatch.js';

const loadTs=async file=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const guard=await loadTs('base44/shared/courseTerminalGuard.ts');
const {claimCourseForLivreur}=await loadTs('base44/shared/courseAcceptanceLock.ts');
const initial=()=>({id:'isolated',statut:'recherche_livreur',dispatch_status:'disponible_push',country_code:'BF',updated_date:'revision-1',notes:'history',commission_silga:150,livreur_financier_id:'immutable'});
const copy=value=>structuredClone(value);
function model(value=initial()){
 let row=copy(value),revision=1,hook=null;const writes=[];let expired=0,invalidated=0;
 const matches=(data,filter)=>Object.entries(filter).every(([key,value])=>{
  if(value&&typeof value==='object'){
   if('$in' in value)return value.$in.includes(data[key]) || (data[key] === undefined && value.$in.includes(null));
   if('$nin' in value)return !value.$nin.includes(data[key]);
   if('$ne' in value)return data[key]!==value.$ne;
  }return data[key]===value;
 });
 const entity={get:async()=>copy(row),updateMany:async(filter,update)=>{
   if(hook){const h=hook;hook=null;h(row);}
   writes.push({filter:copy(filter),patch:copy(update.$set)});
   if(!matches(row,filter))return {updated:0};Object.assign(row,update.$set,{updated_date:'revision-'+(++revision)});return {updated:1};
  },update:async(id,patch)=>{assert.equal(id,row.id);Object.assign(row,patch,{updated_date:'revision-'+(++revision)});return copy(row);}};
 const api={asServiceRole:{entities:{
  CourseExterne:entity,
  DispatchNotification:{filter:async()=>[],updateMany:async()=>{expired++;return {updated:1};}},
  EcoProposal:{updateMany:async()=>{invalidated++;return {updated:1};}},
 }}};
 return {api,row:()=>copy(row),beforeCAS:fn=>hook=fn,writes,counts:()=>({expired,invalidated})};
}
const cancelled=row=>Object.assign(row,{statut:'annulee',dispatch_status:'expire',updated_date:'cancel-revision',date_annulation:'2026-10-23T06:10:00Z'});

function publication(file,notifier){
 const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='publierCourseDansFil');assert.ok(fn);
 const code=ts.transpileModule(fn.getText(ast).replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function('isTerminalCourse','normalizeEnterpriseId','dispatchLog','DISPATCH_V2_BUNDLE_VERSION','journaliserDispatch','notifierLivreursEligiblesV2','Date',code+';return publierCourseDansFil;')(guard.isTerminalCourse,v=>v||null,()=>{},'test',()=>{},notifier,class extends Date { constructor(...args){super(...(args.length?args:['2026-10-23T00:00:00Z']));} });
}

const express=()=>({...initial(),commande_vocale_express:true,client_user_email:'test@example.invalid',statut:'nouvelle',dispatch_status:'en_attente'});
test('terminal confirmation cannot reopen a course or restore an active row',()=>{
 const actions={opened:{current:null},invalidatePending:()=>assert.fail('Must not invalidate'),setCourses:()=>assert.fail('Must not restore'),select:()=>assert.fail('Must not select')};
 for(const state of ['annulee','livree','terminee','expire']) assert.equal(openCreatedExpressCourse({...express(),statut:state},actions),false);
 assert.equal(openCreatedExpressCourse({...express(),annulation_user_id:'canceller'},actions),false);
});
test('pending Express dispatch never pretends to be an engaged search; classic display is unchanged',()=>{
 assert.equal(isExpressAwaitingDispatch(express()),true);
 assert.equal(isExpressAwaitingDispatch({...express(),statut:'recherche_livreur',dispatch_status:'disponible_push'}),false);
 assert.equal(isExpressAwaitingDispatch({...express(),commande_vocale_express:false}),false);
 assert.equal(isExpressAwaitingDispatch({...express(),statut:'annulee'}),false);
 const parent=fs.readFileSync('src/pages/ClientExterneApp.jsx','utf8');
 if(parent.includes('<RechercheLivreurScreen')){
  const view=fs.readFileSync('src/components/client/RechercheLivreurScreen.jsx','utf8');
  assert.match(view,/awaitingExpressDispatch \? "En attente de diffusion" : "Recherche en cours"/);
  assert.match(view,/La recherche n’a pas encore démarré/);
 }else{
  const view=fs.readFileSync('src/components/client/SuiviCourseFullscreen.jsx','utf8');
  assert.match(view,/isExpressAwaitingDispatch\(course\) \? "Commande enregistrée — en attente de diffusion"/);
  assert.ok(!parent.includes('import RechercheLivreurScreen'));
 }
});
test('concurrent Express creation/orchestrator publication, same timestamp: exactly one T=0 batch',async()=>{
 const m=model(express());let batches=0;const publish=publication('base44/shared/dispatchV2.ts',async()=>{batches++;return {notified:1};});
 await Promise.all([publish(m.api,m.row()),publish(m.api,m.row())]);assert.equal(batches,1);assert.equal(m.row().statut,'recherche_livreur');
});
for(const state of [{statut:'annulee',dispatch_status:'expire'},{statut:'livree'},{statut:'livreur_en_route',livreur_id:'d',dispatch_status:'accepte'},{statut:'recherche_livreur',accepted_by_livreur_id:'d'},{statut:'recherche_livreur',client_decision_attendue:true},{statut:'expire',dispatch_status:'expire'}]){
 test('Express publisher CAS cannot restart changed state '+JSON.stringify(state),async()=>{
 const m=model(express());m.beforeCAS(r=>Object.assign(r,state));let batches=0;
 await publication('base44/shared/dispatchV2.ts',async()=>{batches++;return {}; })(m.api,m.row());assert.equal(batches,0);for(const [k,v]of Object.entries(state))assert.equal(m.row()[k],v);
 });
}
test('scope mismatch refuses publication; fresh terminal state is returned after publication race',async()=>{
 const m=model(express());let calls=0;await assert.rejects(finishExpressCreation(m.api,{...m.row(),country_code:'CI'},async()=>calls++));assert.equal(calls,0);
 const result=await finishExpressCreation(m.api,m.row(),async()=>{await m.api.asServiceRole.entities.CourseExterne.update('isolated',{statut:'annulee',dispatch_status:'expire'});});assert.equal(result.course.statut,'annulee');
});
test('direct tracking selects confirmed ID once, preserves other courses and rejects a missing ID',()=>{
 let rows=[{id:'other'}],selected,search,full,invalidations=0;const a={opened:{current:null},invalidatePending:()=>invalidations++,setCourses:f=>rows=f(rows),select:id=>selected=id,research:v=>search=v,tracking:v=>full=v};
 assert.equal(openCreatedExpressCourse({},a),false);
 const c=express();assert.equal(openCreatedExpressCourse(c,a),true);assert.equal(selected,c.id);assert.equal(search,true);assert.equal(full,false);assert.equal(rows[1].id,'other');assert.equal(openCreatedExpressCourse(c,a),false);assert.equal(invalidations,1);
 const parent=fs.readFileSync('src/pages/ClientExterneApp.jsx','utf8');assert.match(parent,/onCreated=\{handleExpressCreated\}/);assert.ok(!parent.includes('onCreated={course => navigate("/client/suivi"'));
});
test('already accepted Express response opens existing full tracking without another creation',()=>{
 let full,search;openCreatedExpressCourse({...express(),statut:'livreur_en_route',livreur_id:'d'},{opened:{current:null},invalidatePending:()=>{},setCourses:()=>{},select:()=>{},research:v=>search=v,tracking:v=>full=v});assert.equal(full,true);assert.equal(search,false);
});

test('indexed list lag and uncertain detail read retain exact created course without false delivery',async()=>{
 const c=express(),pending={current:c},profile={user_email:c.client_user_email,country_code:'BF'};
 assert.equal((await reconcileCreatedExpressCourse([],pending,async()=>c,profile))[0].id,c.id);
 await assert.rejects(reconcileCreatedExpressCourse([],pending,async()=>{throw Error('offline');},profile));assert.equal(pending.current.id,c.id);
 const terminal=await reconcileCreatedExpressCourse([],pending,async()=>({...c,statut:'annulee'}),profile);assert.equal(terminal.length,0);assert.equal(pending.current,null);
});

test('late detail response cannot clear or replace a newer Express course',async()=>{
 let resolve;
 const first=express(),next={...first,id:'newer'},pending={current:first};
 const result=reconcileCreatedExpressCourse([],pending,()=>new Promise(r=>resolve=r),{user_email:first.client_user_email,country_code:'BF'});
 pending.current=next;resolve({...first,statut:'annulee'});
 assert.deepEqual(await result,[]);assert.equal(pending.current,next);
});
test('explicit success required at server envelope; refusals with misleading data never open tracking',async()=>{
 for(const response of [{course:{id:'false'}},{success:false,data:{success:true,course:{id:'false'}}},{data:{success:false,course:{id:'false'}}},{data:{ok:false,success:true,course:{id:'false'}}}]){
 await assert.rejects(createExpressSubmission(async()=>response,()=> 'same-request')({}));
 }
});

test('BEFORE concurrent Express publishers both send T=0 when no offer has been indexed yet',async()=>{
 const m=model(express());let batches=0;const publish=publication('tests/fixtures/express-publisher-before.ts.txt',async()=>{batches++;return {notified:1};});
 await Promise.all([publish(m.api,m.row()),publish(m.api,m.row())]);assert.equal(batches,2);
});
test('BEFORE actual Express callback routes to intermediate ClientSuiviCourse instead of dashboard search',()=>{
 const callback=fs.readFileSync('tests/fixtures/express-navigation-before.txt','utf8');let target;
 new Function('navigate','return '+callback)((path)=>{target=path;})({id:'confirmed-id'});
 assert.equal(target,'/client/suivi');const routes=fs.readFileSync('src/App.jsx','utf8');assert.match(routes,/path="\/client\/suivi" element=\{<ClientSuiviCourse/);
});
