import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { parcelProgressIndex } from '../src/lib/parcelProgress.js';
import { readConfirmedParcelPickup, pickupRead, pickupTransition, optionalPickupPosition, recoverUncertainParcelPickup } from '../src/lib/pickupConfirmation.js';
import { normalizeCourseFunctionResult } from '../src/lib/courseFunctionResult.js';
import { buildRepeatCourseDraft } from '../src/lib/repeatCourseDraft.js';

const card='src/components/livreur/CourseActiveCard.jsx', form='src/pages/CourseExterneFormSync.jsx';
function initializer(file,name){const source=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let found;const walk=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(tree)===name)found=n.initializer.getText(tree);ts.forEachChild(n,walk)};walk(tree);assert.ok(found,name);return found;}
function autoEffect(source){const tree=ts.createSourceFile('card.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let found;const walk=n=>{if(ts.isCallExpression(n)&&n.expression.getText(tree)==='useEffect'&&n.arguments[0].getText(tree).includes('statut_cible: "en_livraison"'))found=n.arguments[0].getText(tree);ts.forEachChild(n,walk)};walk(tree);assert.ok(found);return found;}
test('actual old effect reproduces premature delivery transition before pending pickup; new effect waits for persisted pickup',async()=>{
 const before=fs.readFileSync('tests/fixtures/android170-history/release159-evidence/before/'+card,'utf8'),after=fs.readFileSync(card,'utf8');
 for(const [source,expected]of [[before,1],[after,0]]){
  const calls=[],timers=[];const context={course:{id:'test',statut:'en_route_expediteur'},effectiveStatut:'colis_recupere',isDeplacement:false,isExterne:true,setTimeout:fn=>{timers.push(fn);return 1},clearTimeout(){},setOptimisticStatut(){},queryClient:{setQueryData(){},invalidateQueries(){}},base44:{functions:{invoke:async(n,p)=>{calls.push(p);return{success:true}}}},normalizeCourseFunctionResult,toast:{error(){}}};
  vm.runInNewContext('('+autoEffect(source)+')',context)();for(const fn of timers)fn();await new Promise(r=>setImmediate(r));assert.equal(calls.length,expected);
 }
});
for(const source of ['admin','express','client'])for(const status of ['client_contacte','en_route_expediteur','arrive_prise_en_charge'])test(`${source} Contacte remains reached in ${status}`,()=>assert.equal(parcelProgressIndex(status,null),1));
test('parcel progress survives reload and uses recorded contact proof without changing statuses',()=>{
 const row={statut:'livreur_en_route',heure_contact_client:'2026-10-27T18:00:00Z'};assert.equal(parcelProgressIndex(row.statut,row.heure_contact_client),1);assert.equal(parcelProgressIndex('en_livraison'),2);assert.equal(parcelProgressIndex('livree'),3);assert.equal(parcelProgressIndex('livreur_en_route'),0);assert.equal(row.statut,'livreur_en_route');
});
for(const wrapped of [false,true])test(`pickup receipt${wrapped?' enveloped':''} preserves server timestamp`,async()=>{
 const saved={id:'c',statut:'colis_recupere',heure_recuperation:'2026-10-27T18:31:00Z'};let reads=0;
 const result=normalizeCourseFunctionResult(wrapped?{data:{success:true,course:saved}}:{success:true,course:saved});
 const actual=await readConfirmedParcelPickup({entities:{CourseExterne:{get:()=>{reads++;throw Error('unnecessary read')}}}},'c',result);assert.equal(actual,saved);assert.equal(reads,0);
});
test('missing receipt is read once; missing stored time, stale cancellation, wrong id and network failures are not success',async()=>{
 for(const saved of [{id:'c',statut:'colis_recupere'},{id:'c',statut:'annulee',pickup_confirmed_at:'2026-10-27T18:31:00Z'},{id:'other',statut:'colis_recupere',pickup_confirmed_at:'2026-10-27T18:31:00Z'}]){
  let reads=0;const api={entities:{CourseExterne:{get:async()=>{reads++;return saved}}}};await assert.rejects(readConfirmedParcelPickup(api,'c',{success:true}));assert.equal(reads,1);
 }
 for(const result of [normalizeCourseFunctionResult({}),normalizeCourseFunctionResult({success:true,error:'refused'}),normalizeCourseFunctionResult({data:null,success:true})])await assert.rejects(readConfirmedParcelPickup({},'c',result));
 await assert.rejects(readConfirmedParcelPickup({entities:{CourseExterne:{get:async()=>{throw Error('HTTP 429')}}}},'c',{success:true}),/429/);
});
test('actual pickup handler has an immediate mutex, fences late navigation, and does not invent timestamps',()=>{
 const source=fs.readFileSync(card,'utf8');const start=source.indexOf('if (pickupConfirmationRef.current || pickupBoutonPending)');const end=source.indexOf('disabled={isPending || pickupBoutonPending}',start);const body=source.slice(start,end);
 assert.ok(start>0&&end>start);assert.match(body,/pickupConfirmationRef.current = true/);assert.match(body,/generation !== pickupGenerationRef.current/);assert.doesNotMatch(body,/updateOptimisticStatut|new Date/);assert.match(body,/onColisRecupere\(saved\)/);assert.match(body,/readConfirmedParcelPickup/);
});
test('actual pickup callback prevents double clicks, waits for server, and ignores results after navigation',async()=>{
 const source=fs.readFileSync(card,'utf8'),tree=ts.createSourceFile(card,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let body;
 const walk=n=>{if(ts.isJsxAttribute(n)&&n.name.getText(tree)==='onClick'&&n.initializer?.getText(tree).includes('if (pickupConfirmationRef.current || pickupBoutonPending)'))body=n.initializer.expression.getText(tree);ts.forEachChild(n,walk)};walk(tree);assert.ok(body);
 for(const late of [false,true]){
  let gps,resolve;const events=[],calls=[];const ctx={pickupConfirmationRef:{current:false},pickupGenerationRef:{current:1},pickupBoutonPending:false,course:{id:'c'},setPickupBoutonPending:x=>events.push(['pending',x]),setOptimisticStatut(){},navigator:{geolocation:{getCurrentPosition:success=>gps=success}},base44:{functions:{invoke:async(...a)=>{calls.push(a);return new Promise(ok=>resolve=ok)}}},normalizeCourseFunctionResult,readConfirmedParcelPickup,queryClient:{invalidateQueries(){}},onColisRecupere:row=>events.push(['picked',row]),toast:{success:()=>events.push(['success']),error:e=>events.push(['error',e])}};
  Object.assign(ctx,{pickupRead,pickupTransition,optionalPickupPosition,recoverUncertainParcelPickup});
  ctx.setConfirmedPickup = row => events.push(['confirmed-receipt', row]);
  ctx.queryClient.cancelQueries = async () => {};
  ctx.queryClient.setQueriesData = () => {};
  ctx.base44.entities={CourseExterne:{get:async()=>({id:'c',statut:'en_route_expediteur'})}};
  const fn=vm.runInNewContext('('+body+')',ctx);const pending=fn();await fn();assert.equal(calls.length,0);gps({coords:{latitude:12,longitude:-1}});await new Promise(r=>setImmediate(r));assert.equal(calls.length,1);assert.equal(events.some(e=>e[0]==='success'),false);if(late)ctx.pickupGenerationRef.current++;
  resolve({data:{success:true,course:{id:'c',statut:'colis_recupere',pickup_confirmed_at:'2026-10-27T18:00:00Z'}}});await pending;assert.equal(events.filter(e=>e[0]==='picked').length,late?0:1);assert.equal(events.filter(e=>e[0]==='success').length,late?0:1);
 }
});
for(const price of [500,1000,2500])test(`repeat${price} is an editable proposal, not old accounting or assignment`,()=>{
 const course={id:'old',statut:'livree',type_course:'expedier',prix_propose_client:price,prix_final:9999,montant_livreur:1,commission_silga:2,livreur_id:'d',heure_recuperation:'old',delivery_mode:'eco',adresse_depart:'Saaba',adresse_arrivee:'Kamboincin',country_code:'BF',enterprise_id:'old',gps_depart_lat:0,gps_depart_lng:0,gps_depart_source:'exact'};
 const previous=JSON.stringify(course),draft=buildRepeatCourseDraft(course);assert.equal(draft.prix_propose_client,price);assert.equal(draft.delivery_mode,'eco');assert.equal(draft.gps_depart_lat,0);
 for(const key of ['id','statut','prix_final','montant_livreur','commission_silga','livreur_id','heure_recuperation','country_code','enterprise_id'])assert.equal(key in draft,false,key);assert.equal(JSON.stringify(course),previous);
});
test('repeat rejects active courses, never invents a price, excludes approximate GPS and keeps passenger mode standard',()=>{
 assert.equal(buildRepeatCourseDraft({statut:'annulee'}),null);const draft=buildRepeatCourseDraft({statut:'livree',type_course:'deplacement',prix_final:500,delivery_mode:'eco',gps_depart_lat:12,gps_depart_source:'quartier'});assert.equal(draft.prix_propose_client,0);assert.equal(draft.delivery_mode,'standard');assert.equal(draft.gps_depart_lat,null);
});
test('actual Refaire button only navigates once; historical page supplies current client profile and position',()=>{
 const events=[],context={navigating:{current:false},course:{id:'old',statut:'livree',type_course:'expedier',delivery_mode:'eco'},buildRepeatCourseDraft,position:{latitude:12},clientProfil:{id:'client',country_code:'BF'},onNavigate:(...args)=>events.push(args)};
 const fn=vm.runInNewContext('('+initializer('src/components/client/RefaireCourseButton.jsx','handleClick')+')',context);fn();fn();assert.equal(events.length,1);assert.equal(events[0][1].prefillCourse.delivery_mode,'eco');
 const nav=[],history=vm.runInNewContext('('+initializer('src/components/client/HistoriqueCoursesClient.jsx','handleRefaireCourse')+')',{localStorage:{removeItem(){}},navigate:(...a)=>nav.push(a),clientProfil:context.clientProfil,position:context.position});history(...events[0]);assert.equal(nav[0][1].state.clientProfil.id,'client');
});
test('actual final confirmation handles same-tick clicks and refuses close while pending; cancel before confirmation creates nothing',()=>{
 const ref={current:false},calls=[],states=[];const context={pendingRecap:{_mutationPayload:{request_id:'stable',delivery_mode:'eco'}},confirming:false,confirmationInFlight:ref,setConfirming:x=>states.push(x),createMutation:{mutate:p=>calls.push(p)},setPendingRecap:x=>states.push(x)};
 const confirm=vm.runInNewContext('('+initializer(form,'handleConfirmCreation')+')',context),close=vm.runInNewContext('('+initializer(form,'handleCloseConfirmation')+')',context);close();assert.equal(calls.length,0);confirm();confirm();close();assert.equal(calls.length,1);assert.equal(calls[0].request_id,'stable');assert.equal(states.at(-1),true);
});
test('fixed-price final modal is not an input; actual variable-price and passenger paths remain available',()=>{
 const source=fs.readFileSync(card,'utf8');assert.match(source,/Confirmer la remise du colis \?/);assert.match(source,/data-testid="confirmed-delivery-amount"/);assert.match(source,/course.prix_propose_admin\)\.toLocaleString/);assert.match(source,/\) : <div className="relative">\s*<Input/);assert.match(source,/Confirmer la livraison/);assert.match(source,/if \(isDeplacement\)/);
});
test('actual tracking-page profile effect passes the authenticated profile to history and fences account changes',async()=>{
 const file='src/pages/ClientSuiviCourse.jsx',source=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let effect;const walk=n=>{if(ts.isCallExpression(n)&&n.expression.getText(tree)==='useEffect'&&n.arguments[0].getText(tree).includes('setClientProfil(clients[0])'))effect=n.arguments[0].getText(tree);ts.forEachChild(n,walk)};walk(tree);assert.ok(effect);assert.match(source,/<HistoriqueCoursesClient\s+clientProfil=\{clientProfil\}/);
 for(const late of [false,true]){let resolve;const profiles=[];const fn=vm.runInNewContext('('+effect+')',{userId:'user',setClientProfil:x=>profiles.push(x),setClientProfilId(){},base44:{auth:{me:async()=>({id:'user',email:'test@example.invalid'})},entities:{ClientExterne:{filter:async()=>new Promise(ok=>resolve=ok)}}}});const cleanup=fn();await new Promise(r=>setImmediate(r));if(late)cleanup();resolve([{id:'profile',country_code:'BF'}]);await new Promise(r=>setImmediate(r));assert.equal(profiles.filter(Boolean).length,late?0:1);if(!late)assert.equal(profiles.at(-1).country_code,'BF');}
});
test('Refaire can retry a late-loaded profile and only opens a canonical form route',()=>{
 const errors=[],calls=[];let profile;const context={localStorage:{removeItem(){}},navigate:(...a)=>calls.push(a),clientProfil:profile,position:null,toast:{error:e=>errors.push(e)}};
 const history=vm.runInNewContext('('+initializer('src/components/client/HistoriqueCoursesClient.jsx','handleRefaireCourse')+')',context);assert.equal(history('/client/course/expedier',{}),false);assert.equal(calls.length,0);assert.equal(errors.length,1);context.clientProfil={country_code:'BF'};history('/client/course/expedier',{});assert.equal(calls.length,1);
 const routes=[],ref={current:false},button=vm.runInNewContext('('+initializer('src/components/client/RefaireCourseButton.jsx','handleClick')+')',{navigating:ref,course:{statut:'livree',type_course:'legacy-invalid'},buildRepeatCourseDraft,position:null,clientProfil:null,onNavigate:route=>{routes.push(route);return false}});button();button();assert.equal(routes.length,2);assert.equal(routes[0],'/client/course/expedier');assert.equal(ref.current,false);
});
