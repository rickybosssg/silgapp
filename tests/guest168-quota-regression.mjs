import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { retryDelayMs, withRequestDeadline } from '../src/lib/guestTrackingState.js';
const compile=code=>ts.transpileModule(code.replace(/^import .*;\r?\n/gm,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

test('actual client preserves attempt and blocks reads/creates during Retry-After',async()=>{
 let calls=0,time=100000;const exports={};
 vm.runInNewContext(compile(fs.readFileSync('src/lib/guestOrderClient.js','utf8')),{exports,crypto,Preferences:{},base44:{},retryDelayMs,withRequestDeadline,Date:{now:()=>time}});
 const call=exports.guestApi({functions:{invoke:async()=>{calls++;throw {response:{status:429,data:{error:'Service trop sollicite',code:'RATE_LIMITED'},headers:{'retry-after':'90'}}}}}});
 await assert.rejects(call('create',{}),e=>e.status===429&&e.retryAfterMs===90000&&/90 secondes/.test(e.message));
 await assert.rejects(call('track',{}),e=>e.status===429);assert.equal(calls,1);
 time+=91000;await assert.rejects(call('track',{}));assert.equal(calls,2);
});

for(const seconds of [7,90,3600])test('server preserves upstream Retry-After '+seconds,async()=>{
 const exports={},logs=[];const source=fs.readFileSync('tests/fixtures/android170-history/release168-evidence-20261028/guest-stage/base44/functions/guestOrders/entry.ts','utf8');
 const error={response:{status:429,headers:{'retry-after':String(seconds)}}};
 vm.runInNewContext(compile(source),{exports,crypto,Response,TextDecoder,Date,genererReferenceCourse:()=>assert.fail('no course'),console:{warn:(...x)=>logs.push(x)},createClientFromRequest:()=>({asServiceRole:{entities:{}}}),createGuestStore:()=>({}),createGuestOrdersService:()=>({catalog:async()=>{throw error}})});
 const r=await exports.default(new Request('https://isolated.test',{method:'POST',body:JSON.stringify({action:'catalog',country_code:'BF'})}));
 assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),String(seconds));assert.match(r.headers.get('Access-Control-Expose-Headers'),/Retry-After/);
 const data=await r.json();assert.equal(data.retry_after_seconds,seconds);assert.equal(data.code,'RATE_LIMITED');assert.equal(logs[0][1].action,'catalog');assert.equal(logs[0][1].origin,'upstream');
});
