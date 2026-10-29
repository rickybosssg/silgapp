import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('tests/fixtures/android170-history/release167-evidence-20261028/heartbeat-stage/base44/functions/heartbeatAuto/entry.ts', 'utf8').replace(/^import .*;\n/, '');
async function run({ type='livreur', session='s', row={}, fresh={}, fail, device=false }={}) {
  let handler; const calls=[];
  const initial={id:'p',user_email:'test@example.test',session_active_id:'s',statut:'en_course',...row};
  const entity={filter:async()=>{calls.push('filter');if(fail)throw fail;return [initial]},get:async()=>{calls.push('get');return {...initial,...fresh}},update:async(id,data)=>{calls.push({id,data})}};
  const api={auth:{me:async()=>({email:initial.user_email})},asServiceRole:{entities:{Livreur:entity,ClientExterne:entity,DeviceSession:{filter:async()=>[],update:async()=>assert.fail('unexpected device write')}},functions:{invoke:async()=>assert.fail('no external message')}}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{createClientFromRequest:()=>api,Deno:{serve:fn=>handler=fn},Response,console:{log(){},error(){}}});
  const response=await handler({json:async()=>({user_type:type,session_id:session,device_id:device?'d':undefined})});
  return {status:response.status,data:await response.json(),retry:response.headers.get('retry-after'),calls};
}
for(const type of ['livreur','client'])test(type+' keeps fresh profile but removes duplicate filter',async()=>{
  const r=await run({type});assert.equal(r.status,200);assert.deepEqual(r.calls.slice(0,2),['filter','get']);assert.equal(r.calls.filter(x=>x==='filter').length,1);assert.equal(r.calls.filter(x=>typeof x==='object').length,1);
});
test('session mismatch stops before any presence mutation',async()=>{const r=await run({session:'other'});assert.equal(r.status,409);assert.deepEqual(r.calls,['filter']);});
test('legacy heartbeat without session retains one lookup',async()=>{const r=await run({session:null});assert.equal(r.status,200);assert.equal(r.calls.filter(x=>x==='filter').length,1);assert.equal(r.calls.includes('get'),false);});
for(const fresh of [{statut:'en_course'},{statut:'hors_ligne',manual_hors_ligne:true},{statut:'hors_ligne',admin_hors_ligne:true}])test('fresh presence flags are preserved '+JSON.stringify(fresh),async()=>{
 const r=await run({fresh});assert.equal(r.calls.find(x=>typeof x==='object').data.statut,undefined);
});
test('fresh owner mismatch prevents update',async()=>{const r=await run({fresh:{user_email:'other@example.test'}});assert.equal(r.status,500);assert.equal(r.calls.filter(x=>typeof x==='object').length,0);});
for(const fail of [Object.assign(Error('quota'),{response:{status:429,headers:{'retry-after':'90'}}}),Error('Rate limit exceeded: entity_list allows 140 requests. Retry after 7s')])test('quota remains 429, not false success/500 '+fail.message,async()=>{
 const r=await run({fail});assert.equal(r.status,429);assert.equal(r.data.success,false);assert.ok(Number(r.retry)>0);assert.deepEqual(r.calls,['filter']);
});
test('unrelated server errors remain errors',async()=>{const r=await run({fail:Error('database unavailable')});assert.equal(r.status,500);assert.match(r.data.error,/database unavailable/);});
for(const status of [401,403])test('authentication error stays HTTP '+status,async()=>{const r=await run({fail:Object.assign(Error('denied'),{status})});assert.equal(r.status,status);assert.equal(r.data.success,false);});

test('actual web heartbeat blocks concurrent sends and respects Retry-After even on forced resume',async()=>{
 const raw=fs.readFileSync('src/hooks/useHeartbeat.js','utf8'),tree=ts.createSourceFile('heartbeat.js',raw,ts.ScriptTarget.Latest,true);let body;
 const visit=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='syncHeartbeat')body=n.initializer.getText(tree);ts.forEachChild(n,visit)};visit(tree);
 const {isRateLimited}=await import('../src/lib/feedReadBudget.js');const {retryDelayMs}=await import('../src/lib/guestTrackingState.js');
 let calls=0,finish;const context={enabled:true,Date,getConfig:()=>({heartbeat_web_interval_ms:30000}),lastSyncRef:{current:null},inFlightRef:{current:false},retryAtRef:{current:0},isNativeMobile:()=>false,position:null,user_type:'livreur',session_id:'s',onSessionExpired:()=>assert.fail('quota is not logout'),debugLabel:'',document:{visibilityState:'visible'},navigator:{userAgent:'isolated'},base44:{functions:{invoke:()=>{calls++;return new Promise((_,reject)=>finish=reject)}}},console:{error(){}},isRateLimited,retryDelayMs};
 const fn=vm.runInNewContext('('+body+')',context);const pending=fn(null,true);await fn(null,true);assert.equal(calls,1);finish(Object.assign(Error('limited'),{response:{status:429,headers:{'retry-after':'90'}}}));await pending;await fn(null,true);assert.equal(calls,1);assert.ok(context.retryAtRef.current-Date.now()>85000);
});
