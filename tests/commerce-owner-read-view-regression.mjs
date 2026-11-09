import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {ownerReadScope,ownerReadInvoke,readOwnerOrderPage} from '../src/lib/commerceOwnerReadView.js';
const scope=ownerReadScope({enabled:true,userId:'u'},'boutique','b','BF');
const row={id:'o',boutique_id:'b',pays_code:'BF',total:0};
function sdk(user={id:'u'},rows=[row],more=false,next=null) {const calls=[];return {calls,auth:{me:async()=>user},functions:{invoke:async(name,body)=>{calls.push({name,body});return {success:true,rows,has_more:more,next_offset:next};}}};}
test('owner read rejects missing gate country and identity',()=>{for(const args of [[{},'boutique','b','BF'],[{enabled:true,userId:'u'},'boutique','b',null],[{enabled:true,userId:'u'},'pharmacie','b','BF']])assert.throws(()=>ownerReadScope(...args));});
test('actual owner adapter preserves offset and stored zero',async()=>{const s=sdk(undefined,[row],true,100);const page=await readOwnerOrderPage(s,scope,50);assert.equal(page.rows[0].total,0);assert.equal(page.nextOffset,100);assert.equal(s.calls[0].body.offset,50);assert.equal(s.calls[0].body.country_code,'BF');});
test('wrong country parent duplicate and malformed pagination reject',async()=>{for(const rows of [[{...row,pays_code:'CI'}],[{...row,boutique_id:'other'}],[row,row]])await assert.rejects(readOwnerOrderPage(sdk(undefined,rows),scope));await assert.rejects(readOwnerOrderPage(sdk(undefined,[row],true,0),scope));});
test('session change admin enterprise and write attempts never invoke',async()=>{for(const user of [{id:'other'},{id:'u',role:'admin'},{id:'u',enterprise_id:'e'}]){const s=sdk(user);await assert.rejects(readOwnerOrderPage(s,scope));assert.equal(s.calls.length,0);}const s=sdk();await assert.rejects(ownerReadInvoke(s,scope)('manageCommerce',{}));assert.equal(s.calls.length,0);});
test('new views and wrappers parse without JSX errors; authorized owner migration is enabled',()=>{for(const name of ['PartenaireHome','CommandesManager','CommerceOwnerReadView']){const text=fs.readFileSync(`src/components/partenaire/${name}.jsx`,'utf8');const source=ts.createSourceFile(name+'.jsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);assert.equal(source.parseDiagnostics.length,0);}assert.match(fs.readFileSync('src/lib/commerceOwnerMigration.js','utf8'),/COMMERCE_OWNER_MIGRATION_ENABLED = true/);});
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
test('actual screen wrappers select isolated secure branch and fail closed without legacy mount',()=>{
  for(const name of ['PartenaireHome','CommandesManager']) {
    const source=fs.readFileSync(`src/components/partenaire/${name}.jsx`,'utf8');
    const wrapper=source.slice(source.lastIndexOf('export default function')).replace('export default ','');
    const js=ts.transpileModule(wrapper,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS}}).outputText;
    const view=name==='PartenaireHome'?'OwnerFinanceReadView':'OwnerOrdersReadView';
    const Component=new Function('React','ownerReadScope',view,'Legacy'+name,js+`;return ${name};`)(React,ownerReadScope,()=>React.createElement('p',null,'secure-view'),()=>React.createElement('p',null,'legacy-view'));
    const base={type:'boutique',etablissementType:'boutique',etablissementId:'b',countryCode:'BF',etablissement:{id:'b',pays_code:'BF',nom:'Shop'},onNavigate:()=>{}};
    const render=props=>renderToStaticMarkup(React.createElement(Component,props));
    assert.match(render(base),/legacy-view/);
    const enabled={...base,ownerCommerce:{enabled:true,userId:'u'}};
    assert.match(render(enabled),/secure-view/);assert.doesNotMatch(render(enabled),/legacy-view/);
    const invalid={...enabled,countryCode:null,etablissement:{id:'b'}};
    assert.match(render(invalid),/role="alert"/);assert.doesNotMatch(render(invalid),/legacy-view|secure-view/);
  }
});
