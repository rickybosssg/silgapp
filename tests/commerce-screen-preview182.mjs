import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readPartnerProductPreview as read} from '../src/lib/commerceScreenPreview.js';
const request={type:'boutique',parentId:'shop'};
const session=(result)=>({userId:'owner',queries:{partnerProducts:async()=>result}});
const page={rows:[{id:'p',boutique_id:'shop',prix:1200,photo_url:'fixture'}],hasMore:false,nextOffset:null};
test('preview preserves persisted price and photo',async()=>assert.deepEqual(await read(session(page),request),page));
test('preview requires identity partition',async()=>assert.rejects(read({...session(page),userId:''},request),/SESSION/));
test('preview scopes query and pagination',async()=>{let got;const s={userId:'owner',queries:{partnerProducts:async x=>(got=x,{rows:[],hasMore:true,nextOffset:100})}};await read(s,{...request,offset:50});assert.deepEqual(got,{...request,offset:50,limit:50});});
test('preview rejects wrong parent',async()=>assert.rejects(read(session({...page,rows:[{id:'p',boutique_id:'other'}]}),request),/PAGE/));
test('preview rejects wrong cursor',async()=>assert.rejects(read(session({...page,hasMore:true,nextOffset:0}),request),/CURSOR/));
test('preview rejects malformed data',async()=>assert.rejects(read(session({...page,rows:null}),request),/PAGE/));
test('preview propagates denied reads without fallback or retry',async()=>{let calls=0;const s={userId:'owner',queries:{partnerProducts:async()=>{calls++;throw Error('FORBIDDEN')}}};await assert.rejects(read(s,request),/FORBIDDEN/);assert.equal(calls,1)});
test('preview disallows unknown type',async()=>assert.rejects(read(session(page),{...request,type:'pharmacie'}),/SCOPE/));
test('screen qualification blocks all legacy mutation paths and defaults off',()=>{const s=readFileSync(new URL('../src/components/partenaire/ProduitsManager.jsx',import.meta.url),'utf8');assert.match(s,/commercePreview = null/);assert.ok(s.includes('if (readOnlyPreview || !confirm'));assert.ok(s.includes('if (readOnlyPreview) return;'));assert.match(s,/showForm && !readOnlyPreview/);assert.ok(s.includes("disabled={readOnlyPreview || mutationBlocked}"));});

import ts from 'typescript';
import vm from 'node:vm';
function queryConfig(preview, response) {
 const source=readFileSync('src/components/partenaire/ProduitsManager.jsx','utf8');
 const tree=ts.createSourceFile('screen.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let expression;
 function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(tree)==='useQuery')expression=n.arguments[0].getText(tree);ts.forEachChild(n,visit)}visit(tree);
 let legacy=0,secure=0;
 const config=vm.runInNewContext('('+expression+')',{type:'boutique',etablissementId:'shop',serverOwner:false,ownerCommerce:null,readOnlyPreview:preview,commercePreview:preview?{userId:'owner'}:null,offset:0,entityName:'ProduitBoutique',idField:'boutique_id',base44:{entities:{ProduitBoutique:{filter:async()=>{legacy++;return response}}}},readPartnerProductPreview:async()=>{secure++;return response}});
 return {config,counts:()=>({legacy,secure})};
}
test('actual default screen query retains legacy read and renders page rows',async()=>{const f=queryConfig(false,page.rows);assert.deepEqual((await f.config.queryFn()).rows,page.rows);assert.deepEqual(f.counts(),{legacy:1,secure:0})});
test('actual preview query uses server only and partitions owner cache',async()=>{const f=queryConfig(true,page);assert.equal(await f.config.queryFn(),page);assert.deepEqual(f.counts(),{legacy:0,secure:1});assert.equal(f.config.retry,false);assert.ok(f.config.queryKey.includes('owner'));assert.ok(f.config.queryKey.includes('server-preview'))});
test('actual legacy read still rejects another shop',async()=>{const f=queryConfig(false,[{id:'p',boutique_id:'other'}]);await assert.rejects(f.config.queryFn());});

import {createCommerceQueries} from '../src/lib/commerceQueries.js';
for (const [method, action] of [['financialFacts','finance_establishment'],['financialOrders','finance_orders'],['payments','payments']]) test('financial facade scopes '+method, async()=>{let sent;const q=createCommerceQueries(async(name,body)=>{sent={name,body};return {success:true,rows:[],has_more:false,next_offset:null}});await q[method]({type:'boutique',audience:'admin',parentId:'shop',countryCode:'BF'});assert.equal(sent.name,'readCommerce');assert.equal(sent.body.action,action);assert.equal(sent.body.parent_id,'shop');assert.equal(sent.body.country_code,'BF');assert.equal(sent.body.audience,'admin');});
