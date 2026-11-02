import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clientEventSnapshot, nextClientEvent } from '../src/lib/clientCourseEvents.js';
import { displayedPriceQuote } from '../base44/shared/coursePriceQuote.js';
import { searchAttempt, readSearchActivity } from '../base44/shared/courseSearchActivity.js';
import { updateInvitation, OFFICIAL_STORES } from '../src/lib/appUpdatePolicy.js';

const read = file => fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('price cards transmit displayed price and revision, not a later re-read',()=>{
  assert.deepEqual(displayedPriceQuote({prix_propose_client:1500,client_price_revision:2}),{observed_price:1500,observed_price_revision:2});
  for(const file of ['src/components/livreur/CoursesDisponibles.jsx','src/components/livreur/CourseEnAttenteModalExterne.jsx','src/pages/LivreurExterneApp.jsx']) assert.match(read(file),/displayedPriceQuote\(/);
});
test('search counters deduplicate identities within current attempt and state partial coverage',async()=>{
  const course={id:'isolated',client_price_revision:2};const attempt=searchAttempt(course);
  const rows=[{course_id:course.id,attempt,driver_id:'d',kind:'view'},{course_id:course.id,attempt,driver_id:'d',kind:'view'},{course_id:course.id,attempt:'old',driver_id:'old',kind:'refusal'}];
  const result=await readSearchActivity({CourseSearchActivity:{filter:async()=>rows}},course);
  assert.equal(result.views,1);assert.equal(result.refusals,0);assert.equal(result.coverage,'partial');
});
test('confirmed events do not repeat on initial load or refresh',()=>{
  const searching=clientEventSnapshot({reference:'isolated',statut:'en_attente',updated_at:'2026-11-02T10:00:00Z'});
  const found=clientEventSnapshot({reference:'isolated',statut:'livreur_en_route',assigned:true,accepted_at:'2026-11-02T10:01:00Z',updated_at:'2026-11-02T10:01:00Z'});
  assert.equal(nextClientEvent(null,searching),null);assert.equal(nextClientEvent(searching,found),'acceptance');assert.equal(nextClientEvent(found,found),null);assert.equal(nextClientEvent(found,searching),null);
});
test('iOS invitation requires an available official store version',()=>{
  const cfg={enabled:true,store_available:true,version:'1.0.70',verified_at:'2026-11-02T10:00:00Z'};
  assert.equal(updateInvitation(cfg,'ios','1.0.66',Date.parse('2026-11-02T12:00:00Z')).url,OFFICIAL_STORES.ios);
  assert.equal(updateInvitation({...cfg,store_available:false},'ios','1.0.66'),null);
});
test('shared search and guest transport preserve iOS session and messaging adapters',()=>{
  assert.match(read('src/pages/ClientExterneApp.jsx'),/<RechercheLivreurScreen/);
  assert.match(read('src/pages/GuestOrderPage.jsx'),/<RechercheLivreurScreen/);
  assert.match(read('src/components/chat/ChatWindow.jsx'),/transport\.read\(/);
  assert.match(read('src/components/chat/ChatWindow.jsx'),/conversation_id/);
  assert.match(read('src/components/chat/ChatWindow.jsx'),/loadOlder/);
  assert.match(read('src/pages/LivreurExterneApp.jsx'),/subscribeToNotificationOpened/);
  assert.match(read('src/pages/LivreurExterneApp.jsx'),/await logoutPersistent\(/);
});
test('audio interrupts preceding sound, never loops, and tolerates autoplay refusal',async()=>{
  const instances=[];globalThis.document={visibilityState:'visible'};
  globalThis.Audio=class{constructor(src){this.src=src;instances.push(this);}addEventListener(){}pause(){this.paused=true;}async play(){if(this.constructor.blocked)throw Error('NotAllowedError');}};
  const {playClientCourseAudio,stopClientCourseAudio}=await import('../src/lib/clientCourseAudio.js');
  try{assert.equal(await playClientCourseAudio('search'),true);assert.equal(await playClientCourseAudio('acceptance'),true);assert.equal(instances[0].paused,true);assert.equal(instances[1].loop,false);Audio.blocked=true;assert.equal(await playClientCourseAudio('search'),false);}finally{stopClientCourseAudio();delete globalThis.document;delete globalThis.Audio;}
});
