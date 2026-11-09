import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import { guestAdEligible, guestAdHttps, createGuestAdsService } from '../base44/shared/guestAds.js';
const now = Date.parse('2026-11-09T12:00:00Z');
const ad = { id: 'ad1', titre: 'Public', description: 'Test', type_media: 'image', media_url: 'https://cdn.example.com/ad.png', actif: true, visible_invites: true, cible: 'clients', format: 'carrousel', pays_cibles: '["BF"]', moment_affichage: 'ouverture_app' };
const service = (rows = [ad], extra = {}) => createGuestAdsService({ listAds: async () => rows, getAd: async () => ad, now: () => now, ...extra });
for (const [name, patch] of Object.entries({ legacy: {visible_invites: undefined}, false: {visible_invites:false}, string: {visible_invites:'true'}, inactive:{actif:false}, driver:{cible:'livreurs'}, fullscreen:{format:'plein_ecran'}, tenant:{enterprise_id:'private'}, expired:{date_fin:'2026-11-09T12:00:00Z'}, future:{date_debut:'2026-12-01T00:00:00Z'}, badDate:{date_fin:'garbage'}, countryMalformed:{pays_cibles:'oops'}, countryMissing:{pays_cibles:undefined}, searchOnly:{moment_affichage:'recherche_livreur'}, unsafeMedia:{media_url:'javascript:alert(1)'}, missingTitle:{titre:''} })) {
  test(`excludes ${name}`, () => assert.equal(guestAdEligible({...ad,...patch}, 'BF', now), false));
}
test('country is strict; absent country only explicit global', () => {
  assert.equal(guestAdEligible(ad, '', now), false); assert.equal(guestAdEligible(ad, 'CI', now), false);
  assert.equal(guestAdEligible(ad, 'BF', now), true); assert.equal(guestAdEligible({...ad,pays_cibles:'tous'}, '', now), true);
});
test('custom opening moment accepted only well formed', () => {
  assert.equal(guestAdEligible({...ad,moment_affichage:'personnalise',moments_personnalises:'["ouverture_app"]'}, 'BF', now), true);
  assert.equal(guestAdEligible({...ad,moment_affichage:'personnalise',moments_personnalises:'{}'}, 'BF', now), false);
});
test('strict URL schemes, credentials, local literals', () => {
  for (const url of ['http://example.com/a','javascript:alert(1)','https://user:pass@example.com/a','https://127.0.0.1/a','https://[::1]/a','https://box.local/a','https://localhost/a','https://example.com:8443/a','https://example.com/a b']) assert.equal(guestAdHttps(url), '');
});
test('projection contains no contacts, identifiers, metrics or private content', async () => {
  const result = await service([{...ad,annonceur_contact:'secret',client_id:'private',nb_affichages:99,lien_url:'javascript:alert(1)',lien_telephone:'bad'}])({action:'list',country_code:'BF'});
  assert.equal(result.tracking_enabled, false); assert.deepEqual(Object.keys(result.ads[0]).sort(), ['id','titre','description','type_media','media_url','lien_url','lien_telephone','lien_whatsapp','annonceur_nom'].sort());
  assert.equal(result.ads[0].lien_url, ''); assert.equal(result.ads[0].lien_telephone, '');
});
test('bounded list and deterministic priority', async () => {
  const result = await service(Array.from({length:30},(_,i)=>({...ad,id:`ad${i}`,ordre:30-i})))({action:'list',country_code:'BF'});
  assert.equal(result.ads.length,12); assert.equal(result.ads[0].id,'ad29');
});
test('unknown action and sensitive extra fields rejected before data read', async () => {
  let reads=0; const run=service([], {listAds:async()=>{reads++;return[];}});
  for (const input of [{action:'delete'},{action:'list',telephone:'123'},{action:'list',country_code:'bf'},null]) await assert.rejects(run(input));
  assert.equal(reads,0);
});
const event = { action:'event',country_code:'BF',publicite_id:'ad1',event_id:'00000000-0000-4000-8000-000000000001',kind:'affichage' };
test('metrics disabled unless both safety review and durable adapter present', async () => {
  for (const extra of [{},{metricsSafetyReviewed:true},{recordEventAtomic:async()=>{throw Error('must not call');}}]) await assert.rejects(service([ad],extra)(event),{code:'TRACKING_DISABLED'});
});
test('metrics validate, recheck campaign and use atomic adapter exactly once', async () => {
  const seen=new Set(); const rows=[];
  const run=service([ad],{metricsSafetyReviewed:true,recordEventAtomic:async row=>{if(seen.has(row.event_id))return'duplicate';seen.add(row.event_id);rows.push(row);return'recorded';}});
  const result=await Promise.all([run(event),run(event)]); assert.equal(result.filter(r=>r.recorded).length,1); assert.equal(rows.length,1);
  assert.deepEqual(Object.keys(rows[0]).sort(),['publicite_id','event_id','kind','country_code','at'].sort());
  await assert.rejects(run({...event,kind:'unknown'}),{code:'EVENT_INVALID'});
  await assert.rejects(run({...event,country_code:'CI'}),{code:'AD_UNAVAILABLE'});
  assert.equal(rows.length,1);
});
test('atomic adapter quotas fail closed; retracted ad is rejected',async()=>{
  await assert.rejects(service([ad],{metricsSafetyReviewed:true,recordEventAtomic:async()=> 'limited'})(event),{code:'RATE_LIMITED'});
  await assert.rejects(service([ad],{metricsSafetyReviewed:true,getAd:async()=>({...ad,visible_invites:false}),recordEventAtomic:async()=>{throw Error('must not call');}})(event),{code:'AD_UNAVAILABLE'});
});
const source=readFileSync(new URL('../base44/functions/guestAds/entry.ts',import.meta.url),'utf8');
const stripped=source.replace(/^import .*;\r?\n/gm,'').replace('export default async function','async function handler');
const code=ts.transpileModule(stripped,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const handler=vm.runInNewContext(code+';handler',{Response,TextDecoder,createGuestAdsService,createClientFromRequest:()=>{throw Error('Unexpected SDK call');}});
test('handler malformed JSON, method, stream cap and disabled event without SDK',async()=>{
  assert.equal((await handler(new Request('https://example.com',{method:'GET'}))).status,405);
  assert.equal((await handler(new Request('https://example.com',{method:'POST',body:'{'}))).status,400);
  assert.equal((await handler(new Request('https://example.com',{method:'POST',body:'x'.repeat(2049)}))).status,413);
  const result=await handler(new Request('https://example.com',{method:'POST',body:JSON.stringify(event)}));
  assert.equal(result.status,503); assert.equal((await result.json()).code,'TRACKING_DISABLED');
});

import { createGuestAdMetricsStore } from '../base44/shared/guestAdMetricsStore.js';
function metricsFixture() {
  const root={id:'root',cle:'guest-ads-v1',revision:0,enabled:true,safety_reviewed:true,events:'[]'};
  let writes=0;
  const entity={filter:async()=>[structuredClone(root)],updateMany:async(filter,patch)=>{writes++; if(Object.entries(filter).some(([key,value])=>root[key]!==value))return{updated:0}; Object.assign(root,patch.$set);return{updated:1};}};
  return {root,entity,store:createGuestAdMetricsStore(entity,()=>now),writes:()=>writes};
}
const storedEvent={publicite_id:'ad1',event_id:event.event_id,kind:'affichage',country_code:'BF',at:new Date(now).toISOString()};
test('CAS store simultaneous duplicate only inserts once',async()=>{
  const f=metricsFixture(); const results=await Promise.all([f.store.recordEventAtomic(storedEvent),f.store.recordEventAtomic(storedEvent)]);
  assert.deepEqual(results.sort(),['duplicate','recorded']);assert.equal(JSON.parse(f.root.events).length,1);assert.equal(f.root.revision,1);
});
test('CAS store enforces per-ad budget and collision scope',async()=>{
  const f=metricsFixture();for(let i=0;i<20;i++)assert.equal(await f.store.recordEventAtomic({...storedEvent,event_id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`}), 'recorded');
  assert.equal(await f.store.recordEventAtomic({...storedEvent,event_id:'00000000-0000-4000-8000-000000000021'}),'limited');
  assert.equal(await f.store.recordEventAtomic({...storedEvent,publicite_id:'different'}),'limited');
  assert.equal(JSON.parse(f.root.events).length,20);
});
test('CAS refuses disabled/malformed state and unexpected personal fields',async()=>{
  const f=metricsFixture();f.root.enabled=false;await assert.rejects(f.store.recordEventAtomic(storedEvent));assert.equal(f.writes(),0);
  f.root.enabled=true;f.root.events='invalid';await assert.rejects(f.store.recordEventAtomic(storedEvent));assert.equal(f.writes(),0);
  await assert.rejects(f.store.recordEventAtomic({...storedEvent,phone:'private'}));assert.equal(f.writes(),0);
});
test('CAS uncertain write response never automatically retries',async()=>{
  const f=metricsFixture();let writes=0;f.entity.updateMany=async()=>{writes++;return{};};
  await assert.rejects(f.store.recordEventAtomic(storedEvent));assert.equal(writes,1);
});
test('CAS OFF race cannot commit after review withdrawn',async()=>{
  const f=metricsFixture();const update=f.entity.updateMany;f.entity.updateMany=async(filter,patch)=>{f.root.safety_reviewed=false;return update(filter,patch);};
  await assert.rejects(f.store.recordEventAtomic(storedEvent));assert.equal(f.root.events,'[]');
});
test('CAS rejects legacy oversized ledgers before any quota write',async()=>{
  const f=metricsFixture();const rows=Array.from({length:100},(_,i)=>({...storedEvent,publicite_id:`ad${i}`,event_id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`}));
  f.root.events=JSON.stringify(rows);
  await assert.rejects(f.store.recordEventAtomic({...storedEvent,event_id:'00000000-0000-4000-8000-000000001001'}));
  f.root.events=JSON.stringify(Array.from({length:2000},(_,i)=>({...storedEvent,at:'2026-01-01T00:00:00Z',event_id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`})));
  await assert.rejects(f.store.recordEventAtomic({...storedEvent,event_id:'00000000-0000-4000-8000-000000002001'}));assert.equal(f.writes(),0);
});
test('calendar-invalid and timezone-less dates are rejected',()=>{
  for (const date_fin of ['2026-02-30T23:59:59Z','2027-01-01T12:00:00']) assert.equal(guestAdEligible({...ad,date_fin},'BF',now),false);
});

test('noncanonical local DNS targets are rejected',()=>{
  for(const value of ['https://box.local./a','https://localhost./a','https://box.internal/a','https://box.home.arpa/a'])assert.equal(guestAdHttps(value),'');
});
test('metrics reject wrong ID from dependency rather than recording another campaign',async()=>{
  let writes=0; const run=service([ad],{metricsSafetyReviewed:true,getAd:async()=>({...ad,id:'other'}),recordEventAtomic:async()=>{writes++;return'recorded';}});
  await assert.rejects(run(event),{code:'AD_UNAVAILABLE'});assert.equal(writes,0);
});
test('explicit null country is malformed, not worldwide targeting',async()=>{
  await assert.rejects(service([{...ad,pays_cibles:'tous'}])({action:'list',country_code:null}),{code:'COUNTRY_INVALID'});
});
test('24:00 is rejected instead of normalized to next day',()=>{
  assert.equal(guestAdEligible({...ad,date_fin:'2026-11-10T24:00:00Z'},'BF',now),false);
});
test('CAS refuses unscoped or absent root identity before any write',async()=>{
  for(const patch of [{id:undefined},{id:''},{cle:'other'}]){
    const f=metricsFixture();Object.assign(f.root,patch);await assert.rejects(f.store.recordEventAtomic(storedEvent));assert.equal(f.writes(),0);
  }
});
test('CAS refuses duplicate roots and never provisions absent root',async()=>{
  for(const count of [0,2]){
    const f=metricsFixture();f.entity.filter=async()=>Array.from({length:count},()=>structuredClone(f.root));
    await assert.rejects(f.store.recordEventAtomic(storedEvent));assert.equal(f.writes(),0);
  }
});
test('CAS repeated conflicts bounded at three and cannot report successful count',async()=>{
  const f=metricsFixture();let calls=0;f.entity.updateMany=async()=>{calls++;return{updated:0};};
  assert.equal(await f.store.recordEventAtomic(storedEvent),'limited');assert.equal(calls,3);assert.equal(f.root.events,'[]');
});
test('CAS thrown uncertain result never automatically retries',async()=>{
  const f=metricsFixture();let calls=0;f.entity.updateMany=async()=>{calls++;throw Error('network after commit?');};
  await assert.rejects(f.store.recordEventAtomic(storedEvent));assert.equal(calls,1);
});
test('private metrics schema blocks every client CRUD permission',()=>{
  const schema=JSON.parse(readFileSync(new URL('../base44/entities/GuestAdMetrics.jsonc',import.meta.url),'utf8').replace(/^\uFEFF/,''));
  assert.deepEqual(schema.rls,{read:false,create:false,update:false,delete:false});
  assert.equal(schema.properties.enabled.default,false);assert.equal(schema.properties.safety_reviewed.default,false);
});
test('handler performs only bounded opted-in public-ad query and strips private fields',async()=>{
  let calls=0;
  const mock=createClientFromRequest=>vm.runInNewContext(code+';handler',{Response,TextDecoder,createGuestAdsService,createClientFromRequest});
  const run=mock(()=>({asServiceRole:{entities:{Publicite:{filter:async(filter,sort,limit)=>{calls++;assert.equal(JSON.stringify(filter),JSON.stringify({actif:true,visible_invites:true,format:'carrousel'}));assert.equal(limit,100);assert.equal(sort,'ordre');return[{...ad,annonceur_contact:'secret'}];}}}}}));
  const result=await run(new Request('https://example.com',{method:'POST',body:JSON.stringify({action:'list',country_code:'BF'})}));
  assert.equal(result.status,200);const body=await result.json();assert.equal(body.ads.length,1);assert.equal(body.ads[0].annonceur_contact,undefined);assert.equal(calls,1);
});
test('handler does not disclose SDK errors and propagates quota cooldown',async()=>{
  for(const status of [403,429]){
    const run=vm.runInNewContext(code+';handler',{Response,TextDecoder,createGuestAdsService,createClientFromRequest:()=>{throw Object.assign(new Error('secret credential or private record'),{status});}});
    const result=await run(new Request('https://example.com',{method:'POST',body:'{"action":"list"}'}));
    assert.equal(result.status,status===429?429:503);assert.equal((await result.text()).includes('secret'),false);
    if(status===429)assert.equal(result.headers.get('Retry-After'),'60');
  }
});

test('CAS write byte budget rejects before 4096 bytes without eviction',async()=>{
  const f=metricsFixture();let limited=false;let accepted=0;
  for(let i=0;i<40;i++){
    const before=f.root.events;const writes=f.writes();
    const outcome=await f.store.recordEventAtomic({...storedEvent,publicite_id:`ad${i}`.padEnd(100,'x'),event_id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`});
    assert.ok(new TextEncoder().encode(f.root.events).byteLength<=4096);
    if(outcome==='limited'){limited=true;assert.equal(f.root.events,before);assert.equal(f.writes(),writes);break;}
    accepted++;
  }
  assert.ok(limited);assert.ok(accepted>0);assert.equal(JSON.parse(f.root.events).length,accepted);
});
test('CAS read accepts exactly 4096 bytes and rejects 4097 before update',async()=>{
  const f=metricsFixture();f.root.events='[]'.padEnd(4096,' ');
  assert.equal(await f.store.recordEventAtomic(storedEvent),'recorded');
  f.root.events='[]'.padEnd(4097,' ');const before=f.writes();
  await assert.rejects(f.store.recordEventAtomic({...storedEvent,event_id:'00000000-0000-4000-8000-000000000099'}));assert.equal(f.writes(),before);
});
test('CAS applies UTF-8 bytes not string length and schema bounds characters',async()=>{
  const f=metricsFixture();f.root.events='["'+ 'é'.repeat(2500)+'"]';assert.ok(f.root.events.length<4096);
  await assert.rejects(f.store.recordEventAtomic(storedEvent));assert.equal(f.writes(),0);
  const schema=JSON.parse(readFileSync(new URL('../base44/entities/GuestAdMetrics.jsonc',import.meta.url),'utf8').replace(/^\uFEFF/,''));assert.equal(schema.properties.events.maxLength,4096);
});
