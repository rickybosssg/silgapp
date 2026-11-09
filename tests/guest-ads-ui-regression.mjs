import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { guestAdLink } from '../src/lib/guestAdsClient.js';
function harness() {
 const states=[], effects=[], requests=[]; let cursor=0, pending=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children},children}),useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useEffect(fn,deps){const i=cursor++;if(!effects[i]||deps.some((v,j)=>v!==effects[i].deps[j])){pending.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()};});}}};
 const imports={'react':React,'@/api/base44Client':{base44:{}},'@/lib/guestAdsClient':{guestAdLink,loadGuestAds:(_,country)=>new Promise((resolve,reject)=>requests.push({country,resolve,reject}))},'@/lib/guestPhone':{guestCountryName:c=>c}};
 const module={exports:{}};
 vm.runInNewContext(transformSync(fs.readFileSync('src/components/guest/GuestAds.jsx','utf8'),{loader:'jsx',format:'cjs'}).code,{module,exports:module.exports,require:n=>imports[n]});
 const render=()=>{cursor=0;return module.exports.default({countries:['BF','CI']});};
 return {requests,render,flush(){const batch=pending;pending=[];batch.forEach(f=>f());},close(){effects.forEach(e=>e?.cleanup?.());}};
}
const walk=(node,predicate)=>{if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of (node.children||[]).flat(Infinity)){const found=walk(child,predicate);if(found)return found;}return null;};
const text=node=>JSON.stringify(node);
const tick=()=>new Promise(r=>setImmediate(r));
test('country change immediately hides old ad; older requests cannot overwrite new country',async()=>{
 const h=harness(); h.render();h.flush();h.requests[0].resolve([{id:'global',titre:'GLOBAL'}]);await tick();assert.match(text(h.render()),/GLOBAL/);
 walk(h.render(),n=>n.type==='select').props.onChange({target:{value:'BF'}});assert.doesNotMatch(text(h.render()),/GLOBAL/);h.flush();assert.equal(h.requests[1].country,'BF');
 walk(h.render(),n=>n.type==='select').props.onChange({target:{value:'CI'}});h.render();h.flush();h.requests[2].resolve([{id:'ci',titre:'CI_ONLY'}]);await tick();h.requests[1].resolve([{id:'bf',titre:'BF_ONLY'}]);await tick();const output=text(h.render());assert.match(output,/CI_ONLY/);assert.doesNotMatch(output,/BF_ONLY/);h.close();
});
test('public API error is distinct from no campaigns and does not throw',async()=>{const h=harness();h.render();h.flush();h.requests[0].reject(Error('offline'));await tick();assert.match(text(h.render()),/temporairement indisponibles/);h.close();});
test('carousel manual navigation and unmount do not trigger extra requests',async()=>{const h=harness();h.render();h.flush();h.requests[0].resolve([{id:'a',titre:'FIRST'},{id:'b',titre:'SECOND'}]);await tick();walk(h.render(),n=>n.type==='button'&&text(n).includes('Suivante')).props.onClick();assert.match(text(h.render()),/SECOND/);assert.equal(h.requests.length,1);h.close();});
