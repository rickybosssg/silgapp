import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {createCommerceFinancePreview,financeRecordedNumber} from '../src/lib/commerceFinancePreview.js';

const scope={sessionId:'user-1',parentId:'shop-1',type:'boutique',audience:'partner',countryCode:'BF'};
const response=(rows,more=false,next=null)=>({data:{success:true,rows,has_more:more,next_offset:next}});
const order=(id='o',extra={})=>({id,boutique_id:'shop-1',pays_code:'BF',total:1000,commission_montant:100,...extra});
const payment=(extra={})=>({id:'p',etablissement_id:'shop-1',type:'boutique',pays_code:'BF',montant:200,...extra});
const facts=(extra={})=>({id:'shop-1',pays_code:'BF',...extra});
test('construction dormant and invalid scope clears previous private data',async()=>{
  let calls=0;const m=createCommerceFinancePreview({invoke:async()=>{calls++;return response([facts()]);}});
  assert.equal(calls,0);await assert.rejects(m.load('facts'),/SCOPE_REQUIRED/);
  m.setScope(scope);await m.load('facts');assert.equal(calls,1);
  assert.throws(()=>m.setScope({...scope,countryCode:''}),/SCOPE_REQUIRED/);
  assert.equal(m.snapshot().scope,null);assert.equal(m.snapshot().sections.facts.rows.length,0);
});
test('requests use exact actor parent country action and pagination without finance recomputation',async()=>{
  const calls=[];const m=createCommerceFinancePreview({invoke:async(name,body)=>{calls.push({name,body});return response([facts({commission_pct:null})]);}});
  m.setScope(scope);await m.load('facts');
  assert.deepEqual(calls[0],{name:'readCommerce',body:{type:'boutique',audience:'partner',action:'finance_establishment',parent_id:'shop-1',country_code:'BF',offset:0,limit:50}});
  const row=m.snapshot().sections.facts.rows[0];assert.equal(row.commission_pct,null);assert.equal(Object.hasOwn(row,'montant_du_silga'),false);
  assert.equal(Object.hasOwn(m.snapshot(),'solde'),false);
});
test('zero remains zero and missing/nonfinite/string numbers are unavailable',()=>{
  assert.equal(financeRecordedNumber(0),'0');
  for(const value of [null,undefined,NaN,Infinity,'0']) assert.equal(financeRecordedNumber(value),'Indisponible');
});
test('manual pagination preserves scope, next offset, partial state and stops at last page',async()=>{
  const calls=[];const m=createCommerceFinancePreview({invoke:async(_name,body)=>{calls.push(body);return body.offset===0?response([order('a')],true,50):response([order('b')]);}});
  m.setScope(scope);await m.load('orders');assert.equal(m.snapshot().sections.orders.hasMore,true);
  await m.load('orders',{next:true});
  assert.equal(calls[1].offset,50);assert.equal(calls[1].parent_id,scope.parentId);
  assert.deepEqual(m.snapshot().sections.orders.rows.map(r=>r.id),['a','b']);
  assert.equal(m.snapshot().sections.orders.nextOffset,null);
  await assert.rejects(m.load('orders',{next:true}),/NEXT_PAGE_UNAVAILABLE/);
});
test('shifted duplicate offset page refuses a falsely complete ledger',async()=>{
  let calls=0;const m=createCommerceFinancePreview({invoke:async()=>++calls===1?response([order()],true,50):response([order()])});
  m.setScope(scope);await m.load('orders');await m.load('orders',{next:true});
  assert.equal(m.snapshot().sections.orders.status,'error');assert.equal(m.snapshot().sections.orders.error,'FINANCE_PAGINATION_CHANGED');
  assert.equal(m.snapshot().sections.orders.rows.length,1);
});
test('wrong country parent type and raw proof/client fields are rejected or projected away',async()=>{
  for(const [section,row] of [
    ['facts',facts({pays_code:'CI'})],['facts',facts({id:'other'})],
    ['orders',order('o',{boutique_id:'other'})],['orders',order('o',{pays_code:'CI'})],
    ['payments',payment({type:'restaurant'})],['payments',payment({etablissement_id:'other'})],
  ]) {
    const m=createCommerceFinancePreview({invoke:async()=>response([row])});m.setScope(scope);await m.load(section);
    assert.equal(m.snapshot().sections[section].error,'FINANCE_SCOPE_MISMATCH');
  }
  const m=createCommerceFinancePreview({invoke:async()=>response([payment({preuve_url:'private',traite_par:'private',has_payment_proof:true})])});
  m.setScope(scope);await m.load('payments');const row=m.snapshot().sections.payments.rows[0];
  assert.equal(row.preuve_url,undefined);assert.equal(row.traite_par,undefined);assert.equal(row.has_payment_proof,true);
});
test('failed section remains error rather than zero/empty success; other sections independent',async()=>{
  const m=createCommerceFinancePreview({invoke:async(_n,r)=>{if(r.action==='payments')throw Error('sensitive diagnostic');return response([facts()]);}});
  m.setScope(scope);await m.load('facts');await m.load('payments');
  assert.equal(m.snapshot().sections.facts.status,'ready');assert.equal(m.snapshot().sections.payments.status,'error');
  assert.equal(m.snapshot().sections.payments.error,'FINANCE_READ_UNAVAILABLE');
});
test('late old scope responses and failures cannot fill new scope or logout',async()=>{
  for(const rejectOld of [false,true]) {
    let resolve,reject;const delayed=new Promise((r,j)=>{resolve=r;reject=j;});
    const m=createCommerceFinancePreview({invoke:async()=>delayed});m.setScope(scope);
    const work=m.load('orders');m.setScope({...scope,sessionId:'new-user',parentId:'new-parent',countryCode:'CI'});
    if(rejectOld)reject(Error('old'));else resolve(response([order()]));
    assert.deepEqual(await work,{ignored:true});assert.equal(m.snapshot().sections.orders.status,'idle');assert.deepEqual(m.snapshot().sections.orders.rows,[]);
    m.setScope(null);assert.equal(m.snapshot().scope,null);
  }
});
test('double load does not issue duplicate reads and dispose drops pending response',async()=>{
  let resolve,calls=0;const m=createCommerceFinancePreview({invoke:()=>{calls++;return new Promise(r=>{resolve=r;});}});
  m.setScope(scope);const first=m.load('orders'),second=m.load('orders');assert.equal(calls,1);
  m.dispose();resolve(response([order()]));assert.deepEqual(await first,{ignored:true});assert.deepEqual(await second,{ignored:true});
  assert.equal(m.snapshot().scope,null);await assert.rejects(m.load('orders'),/SCOPE_REQUIRED/);
});
test('invalid pagination and incomplete facts stay errors',async()=>{
  for(const payload of [response([order()],true,0),response([order()],false,10)]) {
    const m=createCommerceFinancePreview({invoke:async()=>payload});m.setScope(scope);await m.load('orders');
    assert.equal(m.snapshot().sections.orders.error,'COMMERCE_PAGINATION_INVALID');
  }
  const m=createCommerceFinancePreview({invoke:async()=>response([])});m.setScope(scope);await m.load('facts');
  assert.equal(m.snapshot().sections.facts.error,'FINANCE_FACTS_INVALID');
});
const source=fs.readFileSync('src/components/partenaire/CommerceFinancePreview.jsx','utf8');
const ast=ts.createSourceFile('preview.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
const body=ast.statements.filter(s=>!ts.isImportDeclaration(s)).map(s=>s.getText(ast)).join('\n').replace('export default function','function');
const js=ts.transpileModule(body,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
const Preview=new Function('React','financeRecordedNumber',js+';return CommerceFinancePreview;')(React,financeRecordedNumber);
test('dormant view renders missing facts partial pages and inaccessible proof with no payment link',async()=>{
  const m=createCommerceFinancePreview({invoke:async(_n,r)=>r.action==='finance_establishment'?response([facts({commission_pct:0})]):r.action==='finance_orders'?response([order()],true,50):response([payment({has_payment_proof:true})])});
  m.setScope(scope);for(const section of ['facts','orders','payments'])await m.load(section);
  const html=renderToStaticMarkup(React.createElement(Preview,{state:m.snapshot(),onLoad:()=>{}}));
  for(const text of ['Aucun solde à payer calculé','Indisponible','Liste partielle','accès indisponible','non payable']) assert.ok(html.includes(text));
  assert.ok(!html.includes('<img'));assert.ok(!html.includes('<a '));assert.ok(!html.includes('https://'));
});
test('view renders loading/error states without displaying stale previous rows',()=>{
  const state={scope,sections:{facts:{status:'loading',rows:[]},orders:{status:'error',rows:[order('stale-private')]},payments:{status:'idle',rows:[]}}};
  const html=renderToStaticMarkup(React.createElement(Preview,{state,onLoad:()=>{}}));
  assert.ok(html.includes('role="status"'));assert.ok(html.includes('role="alert"'));assert.ok(!html.includes('stale-private'));assert.ok(html.includes('disabled=""'));
});
test('preview stays unwired and does not subscribe or perform financial writes',()=>{
  assert.ok(!/subscribe\(|functions\.invoke|setInterval|setTimeout/.test(source));
  const production=fs.readFileSync('src/App.jsx','utf8')+fs.readFileSync('src/pages/PartenaireDashboard.jsx','utf8');
  assert.ok(!production.includes('CommerceFinancePreview'));
});

