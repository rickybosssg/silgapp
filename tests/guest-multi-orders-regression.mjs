import { canStartGuestOrder, assertGuestOrderCapability, GUEST_SINGLE_ORDER_NOTICE } from '../src/lib/guestOrderCapability.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { guestSavedEntries, guestSessionReceipt, rememberGuestReceipt, guestSessionTransaction, withGuestSessionLock } from '../src/lib/guestOrderSession.js';
import { nextGuestDraft, readGuestStart, GUEST_ACCESS_UNAVAILABLE } from '../src/lib/guestAccessRecovery.js';
import { reconcileGuestCourse, preferredGuestCountry } from '../src/lib/guestTrackingState.js';

const access=(n,statut='en_livraison')=>({request_id:`order-${n}`,read_token:`read-${n}`,action_token:`act-${n}`,device_token:'device',draft:{confirmed:true},reference:`R${n}`,last_course:{reference:`R${n}`,statut,depart:`Départ ${n}`,arrivee:`Arrivée ${n}`,prix:1000,devise:'FCFA'}});
const nativeLock=work=>withGuestSessionLock(work,true);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const walk=(node,match)=>{if(!node||typeof node!=='object')return null;if(match(node))return node;for(const child of (node.children||[]).flat(Infinity)){const found=walk(child,match);if(found)return found;}return null;};
function harness(initial, replies={}) {
  const states=[],effects=[];let cursor=0,pending=[],stored=structuredClone(initial),sequence=10;const calls=[];
  const React={createElement:(type,props,...children)=>({type,props:{...props,children},children}),
    useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},
    useRef(initial){const i=cursor++;if(!(i in states))states[i]={current:initial};return states[i];},
    useMemo(fn,deps){const i=cursor++;if(!states[i]||deps.some((v,j)=>v!==states[i].deps[j]))states[i]={value:fn(),deps};return states[i].value;},
    useEffect(fn,deps){const i=cursor++;if(!effects[i]||deps.some((v,j)=>v!==effects[i].deps[j]))pending.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()};});}};
  const call=async(action,input={})=>{calls.push({action,input});if(action==='config')return{enabled:true,countries:[],multi_orders_supported:true};if(replies[action])return replies[action](input);if(action==='track'){const e=guestSavedEntries(stored).find(e=>e.request_id===input.request_id);return {success:true,course:{...e.last_course},expires_at:'2026-11-15'};}throw Error(action);};
  const storage={transaction:nativeLock,read:async()=>structuredClone(stored),save:async value=>{stored=structuredClone(value);},readCountry:async()=>''};
  const deps={'@/lib/guestOrderCapability':{canStartGuestOrder,assertGuestOrderCapability,GUEST_SINGLE_ORDER_NOTICE},react:{...React,default:React,__esModule:true},'react-router-dom':{useNavigate:()=>()=>{}},'@capacitor/core':{Capacitor:{isNativePlatform:()=>false}},'@capacitor/app':{App:{}},
    '@/lib/guestOrderSession':{guestSavedEntries,guestSessionTransaction,rememberGuestReceipt},'@/lib/guestAccessRecovery':{nextGuestDraft,readGuestStart,GUEST_ACCESS_UNAVAILABLE},
    '@/lib/guestOrderClient':{guestApi:()=>call,guestStorage:()=>storage,newGuestAccess:device=>({...access(++sequence),device_token:device}),createGuestSubmission:()=>Object.assign(async()=>{throw Error('No unsolicited creation');},{reset(){}})},
    '@/lib/clientCourseOutcome':{clientCourseOutcome:c=>c.statut==='annulee'?'cancelled':null},'../../base44/shared/clientDecisionView.js':{clientDecisionView:()=>({waiting:false})},
    '@/lib/guestCoursePresentation':{guestCoursePresentation:x=>x},'@/hooks/useClientCourseEvents':{useClientCourseEvents:()=>null},
    '@/lib/guestTrackingState':{preferredGuestCountry,reconcileGuestCourse},'@/lib/courseStatuses':{getCourseStatusLabel:x=>x},'@/lib/expressWrittenContext':{expressCurrency:()=>''},
    '@/lib/guestPhone':{guestCountryFlag:()=>'',guestCountryName:x=>x,guestNationalInput:x=>x,normalizeGuestPhone:x=>x}};
  const module={exports:{}};
  vm.runInNewContext(transformSync(fs.readFileSync('src/pages/GuestOrderPage.jsx','utf8'),{loader:'jsx',format:'cjs'}).code,{module,exports:module.exports,require:name=>deps[name]||new Proxy({__esModule:true,default:name},{get:(value,key)=>key in value?value[key]:key}),window:{addEventListener(){},removeEventListener(){},confirm:()=>true},document:{addEventListener(){},removeEventListener(){},visibilityState:'visible'},navigator:{onLine:true},setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout,Date,Promise});
  const render=()=>{cursor=0;return module.exports.default({call,storage,isolatedMap:true});};
  return {render,calls,get stored(){return stored;},async flush(){const batch=pending;pending=[];batch.forEach(fn=>fn());await tick();},close(){effects.forEach(e=>e?.cleanup?.());}};
}
const home=tree=>walk(tree,n=>n.type==='@/components/guest/GuestClientHome');

test('portfolio keeps every independent capability and hides only the unconfirmed draft',()=>{
  const first=access(1),second=access(2),draft={...access(3),draft_rejected:true,previous:[first,second]};
  assert.deepEqual(guestSavedEntries(draft),[first,second]);
  assert.deepEqual(guestSavedEntries({...second,previous:[first]}),[first,second]);
});
test('receipt updates exactly its archived order, preserving terminal states and the latest draft',()=>{
  const first=access(1,'livree'),second=access(2),saved={...second,previous:[first]};
  const next=guestSessionReceipt(saved,first.request_id,{course:{reference:'R1',statut:'recherche_livreur'},expires_at:'2026-11-15'});
  assert.equal(next.request_id,second.request_id);assert.equal(next.last_course.reference,'R2');assert.equal(next.previous[0].last_course.statut,'livree');assert.equal(next.previous[0].read_token,first.read_token);
});
test('concurrent receipt saves merge instead of overwriting another course',async()=>{
  let saved={...access(2),previous:[access(1)]};const storage={transaction:nativeLock,read:async()=>structuredClone(saved),save:async v=>{await tick();saved=structuredClone(v);}};
  await Promise.all([rememberGuestReceipt(storage,'order-1',{course:{reference:'R1',statut:'livree'}}),rememberGuestReceipt(storage,'order-2',{course:{reference:'R2',statut:'annulee'}})]);
  assert.equal(saved.previous[0].last_course.statut,'livree');assert.equal(saved.last_course.statut,'annulee');
});
test('failed session operation releases lock without a duplicate work invocation',async()=>{
  let n=0;await assert.rejects(nativeLock(async()=>{n++;throw Error('disk');}));await nativeLock(async()=>{n++;});assert.equal(n,2);
});
test('actual page reopens each course without hiding the newest course; old cancellation targets only selected access',async()=>{
  const a=access(1),b=access(2);a.last_course.can_cancel=true;
  const h=harness({...b,previous:[a]},{cancel:input=>({success:true,course:{...a.last_course,statut:'annulee'},expires_at:'2026-11-15'})});
  h.render();await h.flush();let tree=h.render();assert.equal(home(tree).props.course.reference,'R2');assert.deepEqual(home(tree).props.previous.map(x=>x.request_id),['order-1']);
  await home(tree).props.onPrevious(a);tree=h.render();assert.match(JSON.stringify(tree),/R1/);
  const cancel=walk(tree,n=>n.type==='button'&&n.children.includes('Annuler la commande'));await cancel.props.onClick();
  assert.equal(h.calls.find(x=>x.action==='cancel').input.request_id,'order-1');assert.equal(h.calls.find(x=>x.action==='cancel').input.action_token,'act-1');
  assert.equal(h.stored.last_course.reference,'R2');assert.equal(h.stored.previous[0].last_course.statut,'annulee');
  const back=walk(h.render(),n=>n.type==='button'&&n.props.title);assert.ok(back,"header back exists");back.props.onClick();tree=h.render();assert.ok(home(tree),JSON.stringify(tree));assert.deepEqual(home(tree).props.previous.map(x=>x.request_id),['order-2']);
  await home(tree).props.onPrevious(b);assert.match(JSON.stringify(h.render()),/R2/);h.close();
});
test('actual page permits new draft during confirmed delivery; repeated clicks do not allocate twice or send create',async()=>{
  const h=harness({...access(2),previous:[access(1)]});h.render();await h.flush();const entry=home(h.render());
  await Promise.all([entry.props.onOrder(),entry.props.onOrder()]);
  assert.equal(h.stored.previous.length,2);assert.equal(h.stored.draft_rejected,true);assert.equal(h.calls.some(x=>x.action==='create'),false);
  assert.ok(walk(h.render(),n=>n.type==='form'));h.close();
});
test('actual page preserves uncertain attempt and does not open another form',async()=>{
  const h=harness(access(1),{track:()=>({pending:true})});h.render();await h.flush();await home(h.render()).props.onOrder();assert.equal(h.stored.request_id,'order-1');assert.equal(walk(h.render(),n=>n.type==='form'),null);assert.equal(h.calls.some(x=>x.action==='create'),false);h.close();
});
test('actual home renders distinguishable saved references, routes and honest cached statuses',()=>{
  const React={createElement:(type,props,...children)=>({type,props,children})};const module={exports:{}};
  vm.runInNewContext(transformSync(fs.readFileSync('src/components/guest/GuestClientHome.jsx','utf8'),{loader:'jsx',format:'cjs'}).code,{module,exports:module.exports,require:name=>name==='react'?React:name==='@/lib/courseStatuses'?{getCourseStatusLabel:x=>x}:new Proxy({},{get:(_,key)=>key})});
  const tree=module.exports.default({enabled:true,course:access(3).last_course,previous:[access(1),access(2)]});const text=JSON.stringify(tree);assert.match(text,/R1/);assert.match(text,/R2/);assert.match(text,/R3/);assert.match(text,/Départ 1/);assert.match(text,/Derniers états connus/);
});


test('web writes without cross-tab locks fail closed instead of risking capability loss',async()=>{
  let writes=0;await assert.rejects(withGuestSessionLock(async()=>{writes++;}),{code:'SESSION_LOCK_UNAVAILABLE'});assert.equal(writes,0);
});
