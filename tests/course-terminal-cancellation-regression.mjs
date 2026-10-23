import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import { cancelCourseWithConfirmation, preserveConfirmedCancellation, isKnownCancelledCourse } from '../src/lib/courseCancellationState.js';

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
  DispatchNotification:{updateMany:async()=>{expired++;return {updated:1};}},
  EcoProposal:{updateMany:async()=>{invalidated++;return {updated:1};}},
 }}};
 return {api,row:()=>copy(row),beforeCAS:fn=>hook=fn,writes,counts:()=>({expired,invalidated})};
}
const cancelled=row=>Object.assign(row,{statut:'annulee',dispatch_status:'expire',updated_date:'cancel-revision',date_annulation:'2026-10-23T06:10:00Z'});

function publication(file,notifier){
 const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='publierCourseDansFil');assert.ok(fn);
 const code=ts.transpileModule(fn.getText(ast).replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function('isTerminalCourse','normalizeEnterpriseId','dispatchLog','DISPATCH_V2_BUNDLE_VERSION','journaliserDispatch','notifierLivreursEligiblesV2',code+';return publierCourseDansFil;')(guard.isTerminalCourse,v=>v||null,()=>{},'test',()=>{},notifier);
}
test('reproduces the old V2 terminal resurrection from the saved pre-fix source',async()=>{
 const m=model({...initial(),statut:'annulee',dispatch_status:'expire'});let offers=0;
 const publish=publication('tests/fixtures/cancellation-publisher-before.ts.txt',async()=>{offers++;return {pushed:1};});
 await publish(m.api,m.row());assert.equal(m.row().statut,'recherche_livreur');assert.equal(offers,1);
});
test('actual V2 publisher rejects a cancelled course and creates no offer',async()=>{
 const m=model({...initial(),statut:'annulee',dispatch_status:'expire'});let offers=0;
 const publish=publication('base44/shared/dispatchV2.ts',async()=>{offers++;return {pushed:1};});
 const result=await publish(m.api,m.row());assert.equal(result.success,false);assert.equal(m.row().statut,'annulee');assert.equal(offers,0);
});
test('actual V2 publication CAS loses to cancellation during a wave without notifying',async()=>{
 const m=model({...initial(),statut:'nouvelle',dispatch_status:'en_attente'});let offers=0;
 m.beforeCAS(cancelled);
 const publish=publication('base44/shared/dispatchV2.ts',async()=>{offers++;return {pushed:1};});
 await publish(m.api,m.row());assert.equal(m.row().statut,'annulee');assert.equal(offers,0);
});
test('ordinary V2 course still publishes and retains financial identifiers',async()=>{
 const m=model({...initial(),statut:'nouvelle',dispatch_status:'en_attente'});let offers=0;
 const publish=publication('base44/shared/dispatchV2.ts',async()=>{offers++;return {pushed:1};});
 await publish(m.api,m.row());assert.equal(m.row().statut,'recherche_livreur');assert.equal(offers,1);assert.equal(m.row().commission_silga,150);assert.equal(m.row().livreur_financier_id,'immutable');
});
test('cancellation wins an acceptance race; retained accepted_by never creates a false success',async()=>{
 const m=model();m.beforeCAS(row=>{cancelled(row);row.accepted_by_livreur_id='courier';});
 const result=await claimCourseForLivreur(m.api,'isolated','courier',['disponible_push'],{statut:'livreur_en_route',dispatch_status:'accepte',livreur_id:'courier'});
 assert.equal(result.claimed,false);assert.equal(m.row().statut,'annulee');
});
test('acceptance first then cancellation leaves a terminal course and preserves acceptance history',async()=>{
 const m=model();
 assert.equal((await claimCourseForLivreur(m.api,'isolated','courier',['disponible_push'],{statut:'livreur_en_route',dispatch_status:'accepte',livreur_id:'courier',heure_acceptation:'2026-10-23T06:19:54.552Z'})).claimed,true);
 const result=await guard.cancelCourseTerminal(m.api,'isolated','owner','admin',()=>({livreur_id:''}));
 assert.equal(result.success,true);assert.equal(m.row().statut,'annulee');assert.equal(m.row().heure_acceptation,'2026-10-23T06:19:54.552Z');assert.equal(result.before.livreur_id,'courier');
});
test('cancellation retries a concurrent assignment and returns the correct previous owner',async()=>{
 const m=model();m.beforeCAS(row=>Object.assign(row,{statut:'livreur_en_route',dispatch_status:'accepte',livreur_id:'new-courier',updated_date:'accepted-revision'}));
 const result=await guard.cancelCourseTerminal(m.api,'isolated','owner','client',()=>({livreur_id:''}));
 assert.equal(result.success,true);assert.equal(result.before.livreur_id,'new-courier');assert.equal(m.row().statut,'annulee');
});
test('repeat cancellation preserves first author, timestamp, notes and finances',async()=>{
 const m=model();await guard.cancelCourseTerminal(m.api,'isolated','first','admin',row=>({notes:row.notes+' cancelled'}));const before=m.row();
 const repeat=await guard.cancelCourseTerminal(m.api,'isolated','second','client',()=>({notes:'overwrite'}));
 assert.equal(repeat.already_cancelled,true);assert.deepEqual(m.row(),before);assert.equal(m.row().annulation_user_id,'first');assert.equal(m.row().commission_silga,150);
});

test('persistent terminal author prevents acceptance/publication after a legacy status-only overwrite',async()=>{
 const m=model();await guard.cancelCourseTerminal(m.api,'isolated','owner','admin',()=>({}));
 await m.api.asServiceRole.entities.CourseExterne.update('isolated',{statut:'recherche_livreur',dispatch_status:'disponible_push'});
 assert.equal(guard.isTerminalCourse(m.row()),true);
 assert.equal((await claimCourseForLivreur(m.api,'isolated','courier',['disponible_push'],{statut:'livreur_en_route',livreur_id:'courier'})).claimed,false);
 let offers=0;await publication('base44/shared/dispatchV2.ts',async()=>{offers++;})(m.api,m.row());assert.equal(offers,0);
 assert.equal(preserveConfirmedCancellation(m.row()).statut,'annulee');
});
test('watchdog, retry, redispatch and scheduled snapshots cannot overwrite terminal state',async()=>{
 for(const patch of [{statut:'recherche_livreur',dispatch_status:'en_attente'},{statut:'recherche_livreur',dispatch_status:'disponible_push'},{statut:'en_attente'},{statut:'livreur_en_route',livreur_id:'courier'}]){
  const m=model();const stale=m.row();m.beforeCAS(cancelled);assert.equal(await guard.updateActiveCourse(m.api,stale,patch),false);assert.equal(m.row().statut,'annulee');
 }
});
test('cancelled offers are expired, on-route proposals invalidated, active courses untouched',async()=>{
 const m=model();assert.equal(await guard.expireCancelledCourseOffers(m.api,'isolated'),false);assert.deepEqual(m.counts(),{expired:0,invalidated:0});
 await guard.cancelCourseTerminal(m.api,'isolated','owner','admin',()=>({}));assert.equal(await guard.expireCancelledCourseOffers(m.api,'isolated'),true);assert.deepEqual(m.counts(),{expired:1,invalidated:1});
});

test('cancellation identity guard rejects outsiders even when the handler has service-role access',async()=>{
 const api={asServiceRole:{},entities:{Livreur:{get:async()=>({user_email:'driver@example.invalid'})},ClientExterne:{get:async()=>({user_email:'client@example.invalid'})}}};
 const course={livreur_id:'driver',expediteur_client_id:'client'};
 assert.equal(await guard.canCancelCourse(api,{id:'outsider',email:'other@example.invalid'},course,'client'),false);
 assert.equal(await guard.canCancelCourse(api,{id:'outsider',email:'other@example.invalid'},course,'admin'),false);
 assert.equal(await guard.canCancelCourse(api,{id:'client',email:'client@example.invalid'},course,'client'),true);
 assert.equal(await guard.canCancelCourse(api,{id:'driver',email:'driver@example.invalid'},course,'livreur'),true);
});
test('client rejects wrapped SDK errors and success without terminal read-back',async()=>{
 let reads=0;const api={functions:{invoke:async()=>({data:{success:false,error:'refus'}})},entities:{CourseExterne:{get:async()=>{reads++;return {id:'ui-refused',statut:'nouvelle'};}}}};
 await assert.rejects(cancelCourseWithConfirmation(api,{course_id:'ui-refused'}),/refus/);assert.equal(reads,0);assert.equal(isKnownCancelledCourse('ui-refused'),false);
 api.functions.invoke=async()=>({data:{success:true}});await assert.rejects(cancelCourseWithConfirmation(api,{course_id:'ui-refused'}),/non confirmée/);assert.equal(isKnownCancelledCourse('ui-refused'),false);
});
test('late active network result cannot resurrect a cancellation confirmed by read-back',async()=>{
 const api={functions:{invoke:async()=>({data:{success:true}})},entities:{CourseExterne:{get:async()=>({id:'ui-terminal',statut:'annulee',dispatch_status:'expire'})}}};
 await cancelCourseWithConfirmation(api,{course_id:'ui-terminal'});
 const old=preserveConfirmedCancellation({id:'ui-terminal',statut:'livreur_en_route',dispatch_status:'accepte'});assert.equal(old.statut,'annulee');assert.equal(old.dispatch_status,'expire');
 assert.equal(preserveConfirmedCancellation({id:'unrelated',statut:'recherche_livreur'}).statut,'recherche_livreur');
});
test('watchdog state writes all use the snapshot CAS and cannot fall back to unguarded updates',()=>{
 const source=fs.readFileSync('base44/shared/dispatchWatchdog.ts','utf8');assert.equal((source.match(/updateActiveCourse\(base44, course,/g)||[]).length,7);assert.ok(!source.includes('CourseExterne.update(course.id,'));
});

function cancellationHandler(file,api){
 const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let declaration;
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='handleConfirmer')declaration=n;ts.forEachChild(n,visit);}visit(ast);assert.ok(declaration);
 const code=ts.transpileModule('const '+declaration.getText(ast)+';',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const notices={success:0,error:0,closed:0};
 const toast={success:()=>notices.success++,error:()=>notices.error++,warning:()=>{}};
 const fn=new Function('base44','cancelCourseWithConfirmation','cancellationLock','motif','motifDetail','MOTIFS','course','situation','clientId','setLoading','toast','navigator','onClose','onSuccess',code+';return handleConfirmer;')(api,cancelCourseWithConfirmation,{current:false},'client_change_avis','',[{id:'client_change_avis',label:'Test'}],{id:'ui-handler'}, {type:'gratuit'},null,()=>{},toast,{},()=>notices.closed++,()=>{});
 return {fn,notices};
}
test('reproduces the old client false-success on wrapped server refusal; fixed real handler refuses it',async()=>{
 const api={functions:{invoke:async()=>({data:{success:false,error:'isolated refusal'}})}};
 const old=cancellationHandler('tests/fixtures/cancellation-ui-before.jsx.txt',api);
 await old.fn();assert.equal(old.notices.success,1);
 const fixed=cancellationHandler('src/components/client/AnnulerCourseDialog.jsx',api);
 await fixed.fn();assert.equal(fixed.notices.success,0);assert.equal(fixed.notices.error,1);assert.equal(fixed.notices.closed,0);
});
test('real client handler locks repeated clicks before the first await',async()=>{
 let finish,calls=0;
 const api={functions:{invoke:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}},entities:{CourseExterne:{get:async()=>({id:'ui-handler',statut:'annulee'})}}};
 const h=cancellationHandler('src/components/client/AnnulerCourseDialog.jsx',api);const first=h.fn();await h.fn();assert.equal(calls,1);
 finish({data:{success:true}});await first;assert.equal(h.notices.success,1);assert.equal(h.notices.closed,1);
});
