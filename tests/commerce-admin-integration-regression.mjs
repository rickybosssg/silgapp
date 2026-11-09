import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as policy from '../base44/shared/commerceAccess.js';
import {resolveCommerceAdminScope} from '../base44/shared/commerceAdminGrant.js';
import {createCommerceSingletonJournal} from '../base44/shared/commerceSingletonJournal.js';
import {hashCommerceCreation} from '../base44/shared/commerceCreationHash.js';
import {readCommerce} from '../base44/shared/commerceReadPolicy.js';
import {COMMERCE_ADMIN_MIGRATION_ENABLED,commerceAdminScope,createCommerceAdmin} from '../src/lib/commerceAdminMigration.js';
const context={sessionId:'admin',countryCode:'BF'};
function handler(name,sdk,config){
 const source=fs.readFileSync('base44/functions/'+name+'/entry.ts','utf8');const ast=ts.createSourceFile('entry.ts',source,ts.ScriptTarget.Latest,true);
 const js=ts.transpileModule(ast.statements.filter(s=>!ts.isImportDeclaration(s)).map(s=>s.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 let serve;const env={...policy,resolveCommerceAdminScope,createCommerceSingletonJournal,hashCommerceCreation,readCommerce,createClientFromRequest:()=>sdk,Deno:{serve:f=>serve=f,env:{get:key=>key==='COMMERCE_ADMIN_GRANTS_JSON'?config:undefined}},Response,Request,URL,crypto:globalThis.crypto,TextEncoder,console};new Function(...Object.keys(env),js)(...Object.values(env));return serve;
}
function fixture(granted=true){
 const user={id:'admin',email:'admin@example.invalid',role:'admin',admin_type:'global',country_code:'CI'};
 const config=granted?JSON.stringify({version:1,grants:[{user_id:'admin',scope:'pays',country_code:'BF',expires_at:'2099-01-01T00:00:00.000Z'}]}):undefined;
 const records=new Map([['b',{id:'b',entity:'Boutique',pays_code:'BF',partenaire_id:'owner',nom:'Shop',validation:'en_attente',creation_directe:true,creation_admin_notifiee:false}],['foreign',{id:'foreign',entity:'Boutique',pays_code:'CI',partenaire_id:'other',validation:'valide'}],['p',{id:'p',entity:'ProduitBoutique',boutique_id:'b',nom:'Product',prix:0,validation:'en_attente'}]]);
 const writes=[],requests=[];let lose=false;
 const entity=name=>({get:async id=>records.get(id),filter:async(q,_sort,limit,offset=0)=>[...records.values()].filter(r=>r.entity===name&&Object.entries(q).every(([k,v])=>r[k]===v)).slice(offset,offset+limit),update:async(id,data)=>{writes.push({name,id,data});const row={...records.get(id),...data};records.set(id,row);return row;}});
 const sdk={auth:{me:async()=>user},entities:new Proxy({},{get(){throw Error('DIRECT_ENTITIES_FORBIDDEN');}}),asServiceRole:{entities:Object.fromEntries(['Boutique','Restaurant','ProduitBoutique','PlatRestaurant'].map(n=>[n,entity(n)]))},functions:{}};
 const handlers={readCommerce:handler('readCommerce',sdk,config),manageCommerce:handler('manageCommerce',sdk,config)};
 sdk.functions.invoke=async(name,body)=>{requests.push({name,body});const response=await handlers[name](new Request('https://isolated.invalid',{method:'POST',body:JSON.stringify(body)}));const result={status:response.status,data:await response.json()};if(lose&&name==='manageCommerce'){lose=false;throw Error('lost response');}if(response.status>=400)throw Object.assign(Error('SDK HTTP refusal'),{response:result});return result;};
 return{user,records,writes,requests,sdk,api:createCommerceAdmin({sdk,context}),loseWrite:()=>{lose=true;}};
}
test('admin gate enabled without inferred country/global scope',()=>{assert.equal(COMMERCE_ADMIN_MIGRATION_ENABLED,true);for(const c of [null,{sessionId:'a',admin_type:'global'},{sessionId:'a',countryCode:''}])assert.throws(()=>commerceAdminScope(c));});
test('real reader refuses forged global User without server grant',async()=>{const f=fixture(false);await assert.rejects(f.api.list('boutique'));assert.equal(f.writes.length,0);});
test('actual admin handlers list explicit country, read absent commission and write confirmed zero',async()=>{const f=fixture();const page=await f.api.list('boutique',{newOnly:true});assert.deepEqual(page.rows.map(r=>r.id),['b']);assert.equal(await f.api.commission('boutique','b'),undefined);await f.api.mutate({type:'boutique',id:'b',operation:'commission',commission:0});assert.equal(await f.api.commission('boutique','b'),0);assert.equal(f.writes.length,1);assert.ok(f.requests.filter(r=>r.name==='readCommerce').every(r=>r.body.country_code==='BF'));});
test('actual acknowledgement and establishment/product moderation verify receipts',async()=>{const f=fixture();await f.api.mutate({type:'boutique',id:'b',operation:'acknowledge'});assert.equal(f.records.get('b').creation_admin_notifiee,true);await f.api.mutate({type:'boutique',id:'b',operation:'moderate',action:'valider'});assert.equal(f.records.get('b').validation,'valide');await f.api.mutate({type:'boutique',id:'b',productId:'p',operation:'moderate',action:'refuser',motif:'Test'});assert.equal(f.records.get('p').validation,'refuse');assert.equal((await f.api.products('boutique','b')).rows[0].prix,0);});
test('foreign country and unsupported deletion never reach mutation; enterprise session rejected',async()=>{const f=fixture();await assert.rejects(f.api.mutate({type:'boutique',id:'foreign',operation:'commission',commission:10}));await assert.rejects(f.api.mutate({type:'boutique',id:'b',operation:'delete'}));await assert.rejects(f.api.mutate({type:'restaurant',id:'r',productId:'p',operation:'moderate',action:'valider'}));assert.equal(f.writes.length,0);f.user.enterprise_id='e';await assert.rejects(f.api.list('boutique'));});
test('lost mutation response locks same controller against automatic or voluntary repeat',async()=>{const f=fixture();f.loseWrite();await assert.rejects(f.api.mutate({type:'boutique',id:'b',operation:'commission',commission:8}),/OUTCOME_UNCERTAIN/);await assert.rejects(f.api.mutate({type:'boutique',id:'b',operation:'commission',commission:8}),/OUTCOME_UNCERTAIN/);assert.equal(f.writes.length,1);});
test('real reader paginates without claiming first page is complete',async()=>{const f=fixture();for(let n=0;n<54;n++)f.records.set('s'+n,{id:'s'+n,entity:'Boutique',pays_code:'BF',validation:'valide'});const first=await f.api.list('boutique');assert.equal(first.rows.length,50);assert.equal(first.hasMore,true);const next=await f.api.list('boutique',{offset:first.nextOffset});assert.equal(next.rows.length,5);assert.equal(next.hasMore,false);});
test('actual five wrappers preserve legacy OFF and select secure surface ON',()=>{
 for(const [path,name] of [['src/pages/','GestionBoutiques'],['src/pages/','GestionRestaurants'],['src/components/admin/','PartenaireDetailDialog'],['src/components/admin/','BoutiqueProductsSection'],['src/components/admin/','DemandesPartenairesPopup']]){
  const source=fs.readFileSync(path+name+'.jsx','utf8');const ast=ts.createSourceFile(name+'.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);assert.equal(ast.parseDiagnostics.length,0);
  const wrapper=source.slice(source.lastIndexOf('export default function')).replace('export default ','');const js=ts.transpileModule(wrapper,{compilerOptions:{jsx:ts.JsxEmit.React}}).outputText;
  const Component=new Function('React','COMMERCE_ADMIN_MIGRATION_ENABLED','CommerceAdminSurface','Legacy'+name,js+';return '+name)(React,COMMERCE_ADMIN_MIGRATION_ENABLED,()=>React.createElement('p',null,'secure'),()=>React.createElement('p',null,'legacy'));
  assert.match(renderToStaticMarkup(React.createElement(Component,{commerceMigrationEnabled:false})),/legacy/);assert.match(renderToStaticMarkup(React.createElement(Component,{open:true,commerceAdminContext:context})),/secure/);
  if(name==='PartenaireDetailDialog')assert.match(renderToStaticMarkup(React.createElement(Component,{open:true,type:'pharmacie'})),/legacy/);
 }
});
test('real detail action cancellation never invokes mutation',async()=>{
 const source=ts.createSourceFile('surface.jsx',fs.readFileSync('src/components/admin/CommerceAdminSurface.jsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let fn;function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='act')fn=n;ts.forEachChild(n,walk);}walk(source);
 let calls=0;const act=new Function('globalThis','controller','setPending','setError',fn.getText(source)+';return act;')({confirm:()=>false},{mutate:()=>calls++},()=>calls++,()=>calls++);await act('commission');assert.equal(calls,0);
});
test('country selection initial render remains blank despite privileged-looking User profile',()=>{
 const raw=fs.readFileSync('src/components/admin/CommerceAdminSurface.jsx','utf8');const ast=ts.createSourceFile('surface.jsx',raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 assert.equal(ast.parseDiagnostics.length,0);
 const body=ast.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(ast)).join('\n').replace('export default function','function');
 const js=ts.transpileModule(body,{compilerOptions:{jsx:ts.JsxEmit.React}}).outputText;
 const env={React,useState:React.useState,useEffect:React.useEffect,useMemo:React.useMemo,commerceAdminScope,base44:{auth:{me:async()=>({id:'admin',role:'admin',admin_type:'global',country_code:'BF'})}}};
 const Component=new Function(...Object.keys(env),js+';return CommerceAdminSurface;')(...Object.values(env));
 const html=renderToStaticMarkup(React.createElement(Component,{}));assert.match(html,/value=""/);assert.match(html,/Choisissez explicitement un pays/);assert.doesNotMatch(html,/value="BF"|value="global"/);
});
test('selected CI cannot expand real BF grant and foreign product parent cannot be moderated',async()=>{
 const f=fixture();await assert.rejects(createCommerceAdmin({sdk:f.sdk,context:{...context,countryCode:'CI'}}).list('boutique'));
 f.records.set('foreign-product',{id:'foreign-product',entity:'ProduitBoutique',boutique_id:'foreign'});
 await assert.rejects(f.api.mutate({type:'boutique',id:'b',productId:'foreign-product',operation:'moderate',action:'valider'}));assert.equal(f.writes.length,0);
});
test('active popup preserves pharmacy modal and invokes no direct commerce queries',async()=>{
 const source=fs.readFileSync('src/components/admin/DemandesPartenairesPopup.jsx','utf8');const ast=ts.createSourceFile('popup.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='LegacyDemandesPartenairesPopup');const js=ts.transpileModule(fn.getText(ast),{compilerOptions:{jsx:ts.JsxEmit.React}}).outputText;
 let index=0;const configs=[],calls=[];const icon=()=>null;const pharmacy={id:'ph',nom:'Pharmacie historique',_type:'pharmacie',validation:'en_attente'};
 const env={React,useState:initial=>{const i=index++;return [i===0?true:i===3?{id:'admin',role:'admin',admin_type:'pays',country_code:'BF'}:typeof initial==='function'?initial():initial,()=>{}];},useEffect:()=>{},useQueryClient:()=>({invalidateQueries(){}}),useQuery:config=>{configs.push(config);const name=config.queryKey[0];return {data:name.includes('pharmacies')?[pharmacy]:[{id:'legacy-commerce-cache',nom:'NEVER_SHOW'}]};},base44:{entities:{Pharmacie:{filter:async q=>{calls.push(q);return[pharmacy];}},Boutique:new Proxy({},{get(){throw Error('DIRECT_BOUTIQUE_FORBIDDEN');}}),Restaurant:new Proxy({},{get(){throw Error('DIRECT_RESTAURANT_FORBIDDEN');}})}},Store:icon,UtensilsCrossed:icon,Pill:icon,X:icon,Bell:icon,PartenaireDetailDialog:()=>null};
 const Legacy=new Function(...Object.keys(env),js+';return LegacyDemandesPartenairesPopup;')(...Object.values(env));
 const html=renderToStaticMarkup(Legacy({pharmacyOnly:true}));assert.match(html,/Pharmacie historique/);assert.doesNotMatch(html,/NEVER_SHOW/);
 const commerce=configs.filter(c=>!c.queryKey[0].includes('pharmacies'));assert.equal(commerce.length,3);assert.ok(commerce.every(c=>c.enabled===false));await Promise.all(configs.map(c=>c.queryFn()));assert.equal(calls.length,1);assert.equal(calls[0].pays_code,'BF');
});
test('secure popup opens real modal for new rows and acknowledges only via controller',async()=>{
 const source=fs.readFileSync('src/components/admin/CommerceAdminSurface.jsx','utf8');const ast=ts.createSourceFile('surface.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='AdminScopedView');
 const js=ts.transpileModule(fn.getText(ast),{compilerOptions:{jsx:ts.JsxEmit.React}}).outputText;
 const slots=[],refs=[],effects=[],configs=[],mutations=[];let index=0,ri=0;const list={data:{rows:[{id:'b',nom:'Nouvelle boutique',creation_directe:true}],hasMore:false,nextOffset:null},isFetching:false,isError:false,refetch:async()=>{}};
 const env={React,useState:initial=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef:initial=>{const i=ri++;return refs[i]||(refs[i]={current:initial});},useMemo:f=>f(),useEffect:f=>effects.push(f),useQuery:config=>{configs.push(config);return list;},createCommerceAdmin:()=>({mutate:async r=>mutations.push(r)}),base44:{},AdminDetail:()=>null,globalThis:{confirm:()=>true}};
 const View=new Function(...Object.keys(env),js+';return AdminScopedView;')(...Object.values(env));
 const render=()=>{index=0;ri=0;effects.length=0;return View({scope:context,mode:'popup'});};
 let tree=render();assert.doesNotMatch(renderToStaticMarkup(tree),/role="dialog"/);effects.forEach(f=>f());tree=render();assert.match(renderToStaticMarkup(tree),/role="dialog"/);assert.match(renderToStaticMarkup(tree),/Nouvelle boutique/);assert.equal(configs[0].refetchInterval({state:{error:null}}),30000);assert.equal(configs[0].refetchInterval({state:{error:new Error('denied')}}),false);assert.equal(configs[0].refetchIntervalInBackground,false);
 let ack,close;function walk(node){if(!node||typeof node!=='object')return;if(node.type==='button'&&node.props.children==='Confirmer la lecture')ack=node.props.onClick;if(node.type==='button'&&node.props.children==='Fermer les notifications')close=node.props.onClick;React.Children.forEach(node.props?.children,walk);}walk(tree);assert.ok(ack);assert.ok(close);close();assert.equal(mutations.length,0);tree=render();effects.forEach(f=>f());assert.equal(slots[3],false);assert.doesNotMatch(renderToStaticMarkup(render()),/role="dialog"/);await ack();assert.deepEqual(mutations,[{type:'boutique',id:'b',operation:'acknowledge'}]);
 slots[4]=false;render();assert.equal(configs.at(-1).refetchInterval({state:{error:null}}),false);
});
