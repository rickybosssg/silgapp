import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {discoverAuthCommerce} from '../src/lib/commerceAuthDiscovery.js';
const user={id:'owner',email:'owner@example.test'};
function fixture({rows=[{id:'shop',pays_code:'BF',validation:'en_attente'}],fail=false,actor=user}={}) {
  const calls=[];const sdk={calls,auth:{me:async()=>actor},entities:Object.fromEntries(['Boutique','Restaurant','Pharmacie'].map(entity=>[entity,{filter:async filter=>{calls.push({entity,filter});return [];} }])),functions:{invoke:async(name,body)=>{calls.push({name,body});if(fail)throw Error('network');return {success:true,rows:body.type==='boutique'?rows:[],has_more:false,next_offset:null};}}};return sdk;
}
test('explicit OFF preserves legacy discovery and enterprise branch',async()=>{for(const [actor,enabled] of [[user,false],[{...user,enterprise_id:'e'},true],[{...user,role:'admin'},true]]){const sdk=fixture({actor});await discoverAuthCommerce(sdk,actor,enabled);assert.equal(sdk.calls.filter(x=>x.entity).length,3);assert.equal(sdk.calls.filter(x=>x.name).length,0);}});
test('secure discovery uses owner reader without direct shop entities and retains pending status',async()=>{const sdk=fixture();const [shops,restaurants,pharmacies]=await discoverAuthCommerce(sdk,user,true);assert.equal(shops[0].validation,'en_attente');assert.deepEqual(restaurants,[]);assert.deepEqual(pharmacies,[]);assert.deepEqual(sdk.calls.filter(x=>x.entity).map(x=>x.entity),['Pharmacie']);for(const call of sdk.calls.filter(x=>x.name)){assert.equal(call.name,'readCommerce');assert.equal(call.body.audience,'partner');assert.equal(call.body.action,'catalogue');}});
test('network errors malformed validation and session changes are never absence',async()=>{for(const options of [{fail:true},{rows:[{id:'s',pays_code:'BF'}]},{rows:[{id:'s',pays_code:'ZZZ',validation:'valide'}]},{actor:{id:'foreign'}}])await assert.rejects(discoverAuthCommerce(fixture(options),user,true),/OWNER_DISCOVERY_UNAVAILABLE/);});
test('pharmacy read failure prevents inferring absence in secured discovery',async()=>{const sdk=fixture();sdk.entities.Pharmacie.filter=async()=>{throw Error('blocked');};await assert.rejects(discoverAuthCommerce(sdk,user,true),/OWNER_DISCOVERY_UNAVAILABLE/);});
test('all discovery pages are checked before deciding role',async()=>{const sdk=fixture();sdk.functions.invoke=async(_name,body)=>{sdk.calls.push({body});return {success:true,rows:body.type==='restaurant'?[]:body.offset===0?[{id:'a',validation:'refuse',pays_code:'BF'}]:[{id:'b',validation:'valide',pays_code:'CI'}],has_more:body.type==='boutique'&&body.offset===0,next_offset:body.type==='boutique'&&body.offset===0?50:null};};const [shops]=await discoverAuthCommerce(sdk,user,true);assert.equal(shops.length,2);assert.ok(sdk.calls.some(c=>c.body?.offset===50));});
test('AuthGate parses and both discoveries use adapter while validation gates remain',()=>{const text=fs.readFileSync('src/components/auth/AuthGate.jsx','utf8');assert.equal(ts.createSourceFile('AuthGate.jsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX).parseDiagnostics.length,0);assert.equal((text.match(/await discoverAuthCommerce\(base44, user, commerceMigrationEnabled\)/g)||[]).length,2);for(const status of ['en_attente','refuse','suspendu'])assert.ok(text.includes(`etab.validation === "${status}"`));assert.match(text,/commerce_discovery_error/);});
import vm from 'node:vm';
function actualAuthCheck(){const source=ts.createSourceFile('AuthGate.jsx',fs.readFileSync('src/components/auth/AuthGate.jsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let found;function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='check')found=n;ts.forEachChild(n,walk);}walk(source);return found.getText(source);}
test('actual AuthGate check preserves restaurant blocks and refuses discovery failures',async()=>{
  for(const validation of ['en_attente','refuse','suspendu','valide']) {
    const states=[],calls=[];const actor={...user,silgapp_role:'partenaire'};
    const base44=fixture({actor});base44.auth.isAuthenticated=async()=>true;
    base44.functions.invoke=async(_name,body)=>({success:true,rows:body.type==='restaurant'?[{id:'r',pays_code:'BF',validation}]:[],has_more:false,next_offset:null});
    const context={base44,discoverAuthCommerce,commerceMigrationEnabled:true,detectedToken:true,mounted:true,initialResetToken:'',location:{},navigate(){},window:{location:{pathname:'/'}},localStorage:{getItem:()=>null},setState:s=>states.push(s),registerPushToken:async()=>{},onPartenaire:()=>calls.push('partner')};
    await vm.runInNewContext('('+actualAuthCheck()+')',context)();
    assert.deepEqual(states,[validation==='valide'?'partenaire':'partenaire_'+validation]);assert.equal(calls.length,validation==='valide'?1:0);
    states.length=0;calls.length=0;base44.functions.invoke=async()=>{throw Error('network');};
    await assert.rejects(vm.runInNewContext('('+actualAuthCheck()+')',context)(),/OWNER_DISCOVERY_UNAVAILABLE/);
    assert.equal(calls.length,0);assert.equal(states.length,0);
  }
});
test('authorized default discovery uses reader while explicit OFF remains available',async()=>{const sdk=fixture();await discoverAuthCommerce(sdk,user);assert.equal(sdk.calls.filter(x=>x.name==='readCommerce').length,2);assert.equal(sdk.calls.filter(x=>['Boutique','Restaurant'].includes(x.entity)).length,0);});
test('actual AuthGate discovers roleless owner with gate ON without direct shops',async()=>{
 const states=[],updates=[];const base44=fixture();base44.auth.isAuthenticated=async()=>true;base44.auth.updateMe=async patch=>updates.push(patch);for(const entity of ['ClientExterne','Livreur'])base44.entities[entity]={filter:async()=>[]};
 const context={base44,discoverAuthCommerce,commerceMigrationEnabled:true,detectedToken:true,mounted:true,initialResetToken:'',location:{},navigate(){},window:{location:{pathname:'/'}},localStorage:{getItem:()=>null},setState:s=>states.push(s),registerPushToken:async()=>{},onPartenaire:()=>{throw Error('pending owner must not enter');}};
 await vm.runInNewContext('('+actualAuthCheck()+')',context)();assert.deepEqual(states,['partenaire_en_attente']);assert.equal(updates[0].silgapp_role,'partenaire');assert.equal(base44.calls.filter(c=>['Boutique','Restaurant'].includes(c.entity)).length,0);
});
test('actual discovery error catch and retry button rerun successful owner check',async()=>{
 const source=ts.createSourceFile('AuthGate.jsx',fs.readFileSync('src/components/auth/AuthGate.jsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let catcher,button;
 function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(source)==='check().catch')catcher=n.arguments[0];if(ts.isIfStatement(n)&&n.expression.getText(source)==='state === "commerce_discovery_error"'){function inner(x){if(ts.isJsxAttribute(x)&&x.name.text==='onClick')button=x.initializer.expression;ts.forEachChild(x,inner);}inner(n);}ts.forEachChild(n,walk);}walk(source);assert.ok(catcher);assert.ok(button);
 let state='',retry=0;const setState=value=>{state=value;};const base44=fixture({actor:{...user,silgapp_role:'partenaire'},rows:[{id:'shop',pays_code:'BF',validation:'valide'}],fail:true});base44.auth.isAuthenticated=async()=>true;
 const context={base44,discoverAuthCommerce,commerceMigrationEnabled:true,detectedToken:true,mounted:true,initialResetToken:'',location:{},navigate(){},window:{location:{pathname:'/'}},localStorage:{getItem:()=>null},setState,registerPushToken:async()=>{},onPartenaire:()=>{}};
 const run=()=>vm.runInNewContext('('+actualAuthCheck()+')',context)();
 const failure=await run().then(()=>null,e=>e);vm.runInNewContext('('+catcher.getText(source)+')',{mounted:true,setState,console:{error(){}}})(failure);assert.equal(state,'commerce_discovery_error');
 vm.runInNewContext('('+button.getText(source)+')',{setState,setAuthRetry:fn=>{retry=fn(retry);}})();assert.equal(state,'loading');assert.equal(retry,1);
 base44.functions.invoke=async(_name,body)=>({success:true,rows:body.type==='boutique'?[{id:'shop',pays_code:'BF',validation:'valide'}]:[],has_more:false,next_offset:null});await run();assert.equal(state,'partenaire');
});
