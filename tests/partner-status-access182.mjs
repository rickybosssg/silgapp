import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {claimCommerceTransition} from '../base44/shared/commerceTransitionClaim.js';
const source=ts.transpileModule(fs.readFileSync(new URL('../base44/functions/changerStatutCommande/entry.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const grantSource=fs.readFileSync(new URL('../base44/shared/commerceAdminGrant.js',import.meta.url),'utf8').replace(/export /g,'');
async function run(o={}) {
 let handler;const reads=[],writes=[],calls=[];
 const user=o.noUser?null:{id:'owner',email:'owner@example.test',role:'user',...o.user};
 const order={id:'order',boutique_id:'shop',restaurant_id:'shop',pays_code:'BF',statut:'commande_envoyee',client_id:'client',...o.order};
 const shop={id:'shop',pays_code:'BF',partenaire_id:'owner',nom:'Fixture',...o.shop};
 const entities={ClientExterne:{get:async()=>{reads.push('client');return {user_email:'client@example.test'};}}};
 for(const n of ['CommandeBoutique','CommandeRestaurant'])entities[n]={get:async()=>{reads.push(n);return structuredClone(order);},updateMany:async(filter,update)=>{if(o.casThrow)throw Error('lost');if(o.casResult)return o.casResult;if(filter.statut!==order.statut)return {success:true,updated:0};assert.equal(filter.id,order.id);writes.push({entity:n,id:filter.id,patch:update.$set});Object.assign(order,update.$set);return {success:true,updated:1};},update:async(id,patch)=>{writes.push({entity:n,id,patch});return {...order,...patch};}};
 for(const n of ['Boutique','Restaurant'])entities[n]={get:async()=>{reads.push(n);return shop;}};
 entities.CourseExterne={create:async patch=>{writes.push({entity:'CourseExterne',id:'course',patch});return {id:'course'};},get:async()=>({id:'course',dispatch_status:'disponible_push'})};
 const sdk={auth:{me:async()=>user},asServiceRole:{entities},functions:{invoke:async(...args)=>calls.push(args)}};
 const config=o.grant?JSON.stringify({version:1,grants:[{user_id:'admin',scope:'pays',country_code:'BF',expires_at:'2099-01-01T00:00:00Z',...o.grant}]}):undefined;
 vm.runInNewContext(grantSource+'\n'+source,{crypto:globalThis.crypto,claimCommerceTransition,createClientFromRequest:()=>sdk,calculerDistance:()=>0,Response,console:{log(){},warn(){},error(){}},Deno:{env:{get:()=>config},serve:f=>handler=f}});
 const request=()=>({json:async()=>({commande_id:'order',type:'boutique',action:'verifier_paiement',...o.body})});
 if(o.parallel){const responses=await Promise.all(Array.from({length:o.parallel},()=>handler(request())));return {responses:await Promise.all(responses.map(async r=>({status:r.status,body:await r.json()}))),reads,writes,calls};}
 const response=await handler(request());
 return {status:response.status,body:await response.json(),reads,writes,calls};
}
for(const type of ['boutique','restaurant'])for(const [action,from,to] of [['verifier_paiement','commande_envoyee','paiement_verification'],['valider_paiement','paiement_verification','paiement_valide'],['commencer_preparation','paiement_valide','en_preparation'],['refuser_paiement','paiement_verification','paiement_refuse'],['annuler','commande_envoyee','annulee']])test(type+' owner '+action,async()=>{const r=await run({body:{type,action},order:{statut:from}});assert.equal(r.status,200);assert.equal(r.writes.length,1);assert.equal(r.writes[0].patch.statut,to);});
for(const [name,o,status] of [
 ['no auth',{noUser:true},401],['wrong owner',{user:{id:'other'}},403],['enterprise user',{user:{enterprise_id:'e'}},403],
 ['wrong order ID',{order:{id:'other'}},404],['wrong shop ID',{shop:{id:'other'}},404],['country mismatch',{order:{pays_code:'CI'}},403],['missing country',{shop:{pays_code:null}},403],['enterprise shop',{shop:{enterprise_id:'e'}},403],
 ['admin missing grant',{user:{id:'admin',role:'admin',admin_type:'global'}},403],['foreign grant',{user:{id:'admin',role:'admin'},grant:{country_code:'CI'}},403],['expired grant',{user:{id:'admin',role:'admin'},grant:{expires_at:'2000-01-01'}},403],['wrong grant identity',{user:{id:'admin',role:'admin'},grant:{user_id:'other'}},403]
])test(name,async()=>{const r=await run(o);assert.equal(r.status,status);assert.equal(r.writes.length,0);assert.equal(r.calls.length,0);if(name==='admin missing grant')assert.equal(r.reads.length,0);});
for(const scope of ['pays','global'])test('trusted admin '+scope,async()=>{const r=await run({user:{id:'admin',role:'admin',admin_type:'pays',country_code:'CI'},grant:{scope}});assert.equal(r.status,200);assert.equal(r.writes.length,1);});
test('invalid transition retains rejection with no effects',async()=>{const r=await run({order:{statut:'livree'}});assert.equal(r.body.success,false);assert.equal(r.writes.length,0);assert.equal(r.calls.length,0);});
test('unknown action unchanged',async()=>{const r=await run({body:{action:'unknown'}});assert.equal(r.status,400);assert.equal(r.writes.length,0);});
test('existing restaurant course stays idempotent path without dispatch',async()=>{const r=await run({body:{type:'restaurant',action:'commencer_preparation',preparation_time_minutes:10},order:{statut:'paiement_valide',course_id:'existing'}});assert.equal(r.body.already_exists,true);assert.equal(r.writes.length,0);assert.equal(r.calls.length,0);});

for(const casResult of [{success:true,updated:0},{success:true,updated:2},{success:true,updated:1,has_more:true},{}])test('unconfirmed CAS has no effects '+JSON.stringify(casResult),async()=>{const r=await run({casResult});assert.equal(r.status,409);assert.equal(r.writes.length,0);assert.equal(r.calls.length,0);});
test('lost CAS response is uncertain, no push or retry',async()=>{const r=await run({casThrow:true});assert.equal(r.status,409);assert.equal(r.body.uncertain,true);assert.equal(r.calls.length,0);});
test('concurrent same transition claims once and notifies once',async()=>{const r=await run({parallel:10});assert.equal(r.writes.length,1);assert.equal(r.calls.length,1);assert.equal(r.responses.filter(x=>x.status===200).length,1);});
test('concurrent ready action creates one synthetic course',async()=>{const r=await run({parallel:10,order:{statut:'en_preparation'},body:{action:'prete_recuperation'}});assert.equal(r.writes.filter(x=>x.entity==='CourseExterne').length,1);assert.equal(r.calls.filter(x=>x[0]==='dispatchExterneAuto').length,1);});
test('already cancelled does not notify again',async()=>{const r=await run({order:{statut:'annulee'},body:{action:'annuler'}});assert.equal(r.body.already_exists,true);assert.equal(r.calls.length,0);assert.equal(r.writes.length,0);});

for(const statut of ['livree','en_livraison','prete_recuperation','paiement_valide','en_preparation','unknown'])test('cancellation '+statut+' requires review before effects',async()=>{const r=await run({order:{statut},body:{action:'annuler'}});assert.equal(r.status,409);assert.equal(r.body.error,'ORDER_CANCELLATION_REQUIRES_REVIEW');assert.equal(r.writes.length,0);assert.equal(r.calls.length,0);});
test('delivery-linked cancellation requires review even with early order state',async()=>{const r=await run({order:{course_id:'course'},body:{action:'annuler'}});assert.equal(r.status,409);assert.equal(r.writes.length,0);assert.equal(r.calls.length,0);});
