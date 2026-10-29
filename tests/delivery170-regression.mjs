import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { finaliserLivraisonSafe } from '../src/lib/safeDeliveryFinalization.js';
const delivered={id:'synthetic',statut:'livree',heure_livraison:'2026-10-28T22:29:00Z',prix_final:1000,commission_silga:200,montant_livreur:800};
const fail=status=>Object.assign(new Error('HTTP '+status),{response:{status}});
function fixture({response={data:{success:true,course:delivered}},error,me={id:'test-user'},meError,row=delivered}={}) {
 const calls={writes:0,reads:0,me:0,logout:0};
 const api={functions:{invoke:async()=>{calls.writes++;if(error)throw error;return response;}},entities:{CourseExterne:{get:async()=>{calls.reads++;return row;}}},auth:{me:async()=>{calls.me++;if(meError)throw meError;return me;},logout:()=>{calls.logout++;throw Error('forbidden logout');},redirectToLogin:()=>{calls.logout++;throw Error('forbidden redirect');}}};
 return {api,calls};
}
for(const session of ['valid','invalid','network','quota'])test('401 preserves credentials with '+session+' session check',async()=>{
 const f=fixture({error:fail(401),meError:session==='invalid'?fail(401):session==='network'?Error('offline'):session==='quota'?fail(429):undefined});
 await assert.rejects(finaliserLivraisonSafe(f.api,{course_id:'synthetic'}),e=>e.status===401&&e.code===(session==='invalid'?'REAUTH_REQUIRED':'DELIVERY_UNAUTHORIZED'));
 assert.deepEqual(f.calls,{writes:1,reads:0,me:1,logout:0});
});
for(const status of [400,403,429])test('HTTP '+status+' stays a real refusal',async()=>{
 const f=fixture({error:fail(status)});await assert.rejects(finaliserLivraisonSafe(f.api,{course_id:'synthetic'}));assert.deepEqual(f.calls,{writes:1,reads:0,me:0,logout:0});
});
for(const error of [fail(500),Error('offline')])test('uncertain response reads confirmed delivery without repeating accounting '+error.message,async()=>{
 const f=fixture({error});const res=await finaliserLivraisonSafe(f.api,{course_id:'synthetic'});assert.equal(res.course,delivered);assert.equal(res.reconciled,true);assert.equal(f.calls.writes,1);assert.equal(f.calls.reads,1);
});
test('uncertain response cannot confirm a different, cancelled or incomplete course',async()=>{
 for(const row of [{...delivered,id:'other'},{...delivered,statut:'annulee'},{...delivered,heure_livraison:null},{id:'synthetic',statut:'en_livraison'}]) {
  const f=fixture({error:fail(500),row});await assert.rejects(finaliserLivraisonSafe(f.api,{course_id:'synthetic'}),/incertain/);assert.equal(f.calls.writes,1);
 }
});
test('same tick duplicates share one operation',async()=>{
 const f=fixture();const a=finaliserLivraisonSafe(f.api,{course_id:'synthetic'}),b=finaliserLivraisonSafe(f.api,{course_id:'synthetic'});assert.equal(a,b);await a;assert.equal(f.calls.writes,1);
});
test('resolved HTTP401 envelope is never success even if body claims delivery',async()=>{
 const f=fixture({response:{status:401,data:{success:true,course:delivered}}});
 await assert.rejects(finaliserLivraisonSafe(f.api,{course_id:'synthetic'}),e=>e.status===401);
 assert.equal(f.calls.reads,0);assert.equal(f.calls.logout,0);assert.equal(f.calls.me,1);
});
test('after failed response next click reads existing delivery before any write',async()=>{
 const f=fixture({error:fail(500),row:{id:'synthetic',statut:'en_livraison'}});await assert.rejects(finaliserLivraisonSafe(f.api,{course_id:'synthetic'}));
 f.api.entities.CourseExterne.get=async()=>delivered;
 assert.equal((await finaliserLivraisonSafe(f.api,{course_id:'synthetic'})).course,delivered);assert.equal(f.calls.writes,1);
});
test('malformed response reconciles, refusal never becomes success',async()=>{
 const f=fixture({response:{}});assert.equal((await finaliserLivraisonSafe(f.api,{course_id:'synthetic'})).reconciled,true);
 const refused=fixture({response:{data:{success:false,error:'refused'}}});await assert.rejects(finaliserLivraisonSafe(refused.api,{course_id:'synthetic'}),/refused/);assert.equal(refused.calls.reads,0);
});
test('Base44 blind logout not integrated; price draft cannot finalize',()=>{
 const card=fs.readFileSync('src/components/livreur/CourseActiveCard.jsx','utf8');
 assert.doesNotMatch(card,/clearPersistedToken|redirectToLogin|autoSetPrice/);
 const draft=card.slice(card.indexOf('if (isDeplacement) {',card.indexOf('const handleConfirmerLivraison')),card.indexOf('if (course.pricing_mode',card.indexOf('const handleConfirmerLivraison')));
 assert.doesNotMatch(draft,/finaliserLivraison|new Date/);
 assert.match(card,/await onColisLivre\(finalData, null, \{ confirmedResult: receipt \}\)/);
 assert.match(card,/Prix de la course :/);
});
