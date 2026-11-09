import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import * as events from '../src/lib/clientCourseEvents.js';
import { guestCourseView } from '../base44/shared/guestOrderPolicy.js';

function harness(storage = new Map()) {
  let cursor = 0, effects = [], calls = [], hidden;
  const slots = [];
  const react = {
    useRef(value) { const i = cursor++; return slots[i] ||= {current:value}; },
    useState(value) { const ref = react.useRef(value); return [ref.current,v=>{ref.current=v;}]; },
    useEffect(fn,deps) { const i=cursor++; const old=slots[i]; if (!old || deps.some((v,j)=>v!==old.deps[j])) effects.push(()=>{old?.cleanup?.(); slots[i]={deps,cleanup:fn()};}); }
  };
  const document = {visibilityState:'visible',addEventListener(_,fn){hidden=fn;},removeEventListener(){hidden=null;}};
  const imports = {'react':react,'@/lib/clientCourseEvents':events,'@/lib/clientCourseAudio':{playClientCourseAudio(kind,owner){calls.push(['play',kind,owner]);},stopClientCourseAudio(owner){calls.push(['stop',owner]);}}};
  const module={exports:{}};
  vm.runInNewContext(transformSync(fs.readFileSync('src/hooks/useClientCourseEvents.js','utf8'),{format:'cjs'}).code,{module,exports:module.exports,require:n=>imports[n],document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},Date,Map,Symbol});
  return {render(course,terminal){cursor=0;module.exports.useClientCourseEvents(course,terminal);effects.splice(0).forEach(fn=>fn());},plays:()=>calls.filter(c=>c[0]==='play').map(c=>c[1]),stops:()=>calls.filter(c=>c[0]==='stop').length,hide(){document.visibilityState='hidden';hidden();},unmount(){slots.forEach(s=>s?.cleanup?.());},storage};
}
const initial={id:'local-only',reference_course:'LOCAL-ONLY',statut:'nouvelle',created_date:'2000-01-01T00:00:00Z',updated_date:'2026-11-09T01:00:00Z'};
function timeline(){return [initial,{...initial,livreur_id:'mock',heure_acceptation:'2026-11-09T01:01:00Z',updated_date:'2026-11-09T01:01:00Z'},{...initial,client_decision_attendue:true,livreur_retrait_operation_id:'withdrawal',updated_date:'2026-11-09T01:02:00Z'},{...initial,client_relaunch_state:'publishing',client_relaunch_operation_id:'relaunch',updated_date:'2026-11-09T01:03:00Z'},{...initial,client_relaunch_state:'done',client_relaunch_operation_id:'relaunch',prix_propose_client:1500,updated_date:'2026-11-09T01:04:00Z'},{...initial,statut:'annulee',updated_date:'2026-11-09T01:05:00Z'}];}
for (const guest of [false,true]) {
  test(`${guest?'guest DTO':'connected'}: confirmed transitions only, repeated reads and stale responses silent`,()=>{
    const h=harness(); const rows=timeline().map(c=>guest?guestCourseView(c,'F'):c);
    rows.forEach(row=>{h.render(row);h.render({...row});});
    assert.deepEqual(h.plays(),['acceptance','refusal','search','refusal']);
    h.render(rows[0]); assert.equal(h.plays().length,4);
    const reload=harness(h.storage);reload.render(rows.at(-1));assert.deepEqual(reload.plays(),[]);
  });
}
test('confirmed connected cancellation survives removal from active list',()=>{const h=harness();h.render(initial);h.render(null,{...initial,statut:'annulee'});h.render(null,{...initial,statut:'annulee'});assert.deepEqual(h.plays(),['refusal']);});
test('clear, course switch, hidden tab and unmount stop audio',()=>{const h=harness();h.render(initial);const a=h.stops();h.render(null);assert.equal(h.stops(),a+1);h.render({...initial,id:'other',reference_course:'OTHER'});assert.equal(h.stops(),a+2);h.hide();h.unmount();assert.equal(h.stops(),a+4);});
test('creation plays search once, unchanged price edits alone do not invent a sound',()=>{const h=harness();h.render(null);const c={...initial,created_date:new Date(Date.now()+60000).toISOString()};h.render(c);h.render({...c,prix_propose_client:1500});assert.deepEqual(h.plays(),['search']);});
test('delivery stops the active search without a false acceptance or refusal',()=>{const h=harness();h.render(initial);const a=h.stops();h.render({...initial,statut:'livree'});assert.equal(h.stops(),a+1);assert.deepEqual(h.plays(),[]);});
test('audio ownership, interruption, volume, hidden and rejected playback',async()=>{
  const instances=[];globalThis.document={visibilityState:'visible'};
  globalThis.Audio=class {constructor(src){this.src=src;this.volume=1;instances.push(this);}addEventListener(){}pause(){this.paused=true;}async play(){if(this.constructor.blocked)throw Error('blocked');}};
  const audio=await import('../src/lib/clientCourseAudio.js');
  try{const first=Symbol(),second=Symbol();await audio.playClientCourseAudio('search',first);assert.equal(instances[0].volume,1);assert.equal(instances[0].loop,false);audio.stopClientCourseAudio(second);assert.equal(instances[0].paused,undefined);await audio.playClientCourseAudio('acceptance',second);assert.equal(instances[0].paused,true);assert.equal(instances[0].currentTime,0);audio.stopClientCourseAudio(first);assert.equal(instances[1].paused,undefined);audio.stopClientCourseAudio(second);assert.equal(instances[1].paused,true);document.visibilityState='hidden';assert.equal(await audio.playClientCourseAudio('search',first),false);document.visibilityState='visible';Audio.blocked=true;assert.equal(await audio.playClientCourseAudio('search',first),false);}finally{audio.stopClientCourseAudio();delete globalThis.Audio;delete globalThis.document;}
});
