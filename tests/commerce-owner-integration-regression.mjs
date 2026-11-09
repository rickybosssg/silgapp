import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as policy from '../base44/shared/commerceAccess.js';
import {resolveCommerceAdminScope} from '../base44/shared/commerceAdminGrant.js';
import {createCommerceSingletonJournal} from '../base44/shared/commerceSingletonJournal.js';
import {hashCommerceCreation} from '../base44/shared/commerceCreationHash.js';
import {readCommerce} from '../base44/shared/commerceReadPolicy.js';
import {createCommerceCreationIntent} from '../src/lib/commerceCreationIntent.js';
import {createOwnerCommerce,ownerCreationScope,COMMERCE_OWNER_MIGRATION_ENABLED,ownerMigrationActive} from '../src/lib/commerceOwnerMigration.js';
function storageFixture() {
 const data=new Map();let sequence=0,queue=Promise.resolve();
 const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const withLock=(_key,work)=>{const next=queue.then(work);queue=next.catch(()=>{});return next;};
 const newIntents=()=>createCommerceCreationIntent({storage,uuid:()=> 'request-'+(++sequence),withLock});
 return {storage,newIntents,sequence:()=>sequence};
}
function handler(name,sdk) {
 const source=fs.readFileSync('base44/functions/'+name+'/entry.ts','utf8');
 const ast=ts.createSourceFile('entry.ts',source,ts.ScriptTarget.Latest,true);
 const body=ast.statements.filter(s=>!ts.isImportDeclaration(s)).map(s=>s.getText(ast)).join('\n');
 const js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 let serve;
 const env={...policy,resolveCommerceAdminScope,createCommerceSingletonJournal,hashCommerceCreation,readCommerce,
 createClientFromRequest:()=>sdk,Deno:{serve:f=>serve=f,env:{get:key=>key==='COMMERCE_MUTATION_JOURNAL_ID'?'journal':undefined}},
 Response,Request,URL,crypto:globalThis.crypto,TextEncoder,console};
 new Function(...Object.keys(env),js)(...Object.values(env));return serve;
}
function fixture() {
 const local=storageFixture(),writes=[],requests=[],records=new Map();
 const user={id:'owner',email:'owner@example.invalid',role:'user'};
 const parent={id:'shop',pays_code:'BF',partenaire_id:'owner',nom:'Shop',validation:'valide',actif:true};
 records.set('shop',parent);
 let journal={id:'journal',revision:0,state:'ready',ledger:'[]'},lostResponse=false,deniedDirect=0;
 const entity=name=>({
  get:async id=>records.get(id),
  filter:async(query,_sort,limit=50,offset=0)=>[...records.values()].filter(row=>row.entity===name||row.id==='shop'&&['Boutique','Restaurant'].includes(name)).filter(row=>Object.entries(query).every(([k,v])=>row[k]===v)).slice(offset,offset+limit),
  create:async data=>{const row={id:'created-'+writes.length,entity:name,...data};records.set(row.id,row);writes.push({op:'create',name,data});return row;},
  update:async(id,data)=>{const row={...records.get(id),...data};records.set(id,row);writes.push({op:'update',name,id,data});return row;},
  delete:async id=>{records.delete(id);writes.push({op:'delete',name,id});},
 });
 const entities=Object.fromEntries(['Boutique','Restaurant','ProduitBoutique','PlatRestaurant','CommandeBoutique','CommandeRestaurant','PaiementPartenaire'].map(n=>[n,entity(n)]));
 entities.CommerceMutationJournal={get:async()=>structuredClone(journal),updateMany:async(filter,update)=>{
  if(Object.entries(filter).some(([k,v])=>journal[k]!==v))return {success:true,updated:0};
  journal={...journal,...update.$set};return {success:true,updated:1};
 }};
 const sdk={auth:{me:async()=>user},entities:{Country:{filter:async()=>[{code:'BF',actif:true}]},ClientExterne:{filter:async()=>[{id:'profile',user_email:user.email,country_code:'BF',actif:true}]},
 Boutique:{get:async()=>{deniedDirect++;throw Error('Direct RLS deny');}},ProduitBoutique:{create:async()=>{deniedDirect++;throw Error('Direct RLS deny');}}},
 asServiceRole:{entities},functions:{}};
 const handlers={manageCommerce:handler('manageCommerce',sdk),readCommerce:handler('readCommerce',sdk)};
 sdk.functions.invoke=async(name,body)=>{
  requests.push({name,body});
  const response=await handlers[name](new Request('https://isolated.invalid',{method:'POST',body:JSON.stringify(body)}));
  const result={status:response.status,data:await response.json()};
  if(lostResponse){lostResponse=false;throw Error('transport lost after server response');}
  if(response.status>=400)throw Object.assign(new Error('SDK HTTP failure'),{response:result});
  return result;
 };
 let intents=local.newIntents();
 return {sdk,user,parent,writes,requests,records,local,intents,loseNext:()=>{lostResponse=true;},reload:()=>{intents=local.newIntents();return createOwnerCommerce({sdk,actorId:'owner',intents});},api:()=>createOwnerCommerce({sdk,actorId:'owner',intents}),directCalls:()=>deniedDirect};
}
const product={nom:'Produit',prix:1250,description:'Test',disponible:true,photo_url:'https://example.invalid/a.jpg',photos_urls:'["https://example.invalid/a.jpg"]',video_url:''};
test('release gate enabled and still excludes admin/enterprise/pharmacy',()=>{
 assert.equal(COMMERCE_OWNER_MIGRATION_ENABLED,true);
 for(const user of [{id:'o',role:'admin'},{id:'o',enterprise_id:'x'},{}])assert.equal(ownerMigrationActive(true,user),false);
 assert.equal(ownerMigrationActive(true,{id:'o'},'pharmacie'),false);
 assert.equal(ownerMigrationActive(false,{id:'o'}),false);
});
test('owner product creation traverses actual handler and persists media/price without direct SDK writes',async()=>{
 const f=fixture(),api=f.api();
 const result=await api.saveProduct({type:'boutique',parentId:'shop',data:{...product,actif:false,valide_par:'forged',commission_pct:0}});
 assert.equal(result.record.prix,1250);assert.equal(result.record.photo_url,product.photo_url);
 assert.equal(result.record.boutique_id,'shop');assert.equal(f.directCalls(),0);
 assert.equal(f.writes.length,1);assert.equal(f.writes[0].data.valide_par,undefined);
 assert.equal(f.requests[0].body.request_id,'request-1');
 const page=await api.products('boutique','shop');assert.equal(page.rows[0].id,result.record.id);
});
test('lost result reload and voluntary reconciliation reuse journal receipt, exactly one synthetic create',async()=>{
 const f=fixture();f.loseNext();
 await assert.rejects(f.api().saveProduct({type:'boutique',parentId:'shop',data:product}),/transport lost/);
 assert.equal(f.intents.read(ownerCreationScope('owner','boutique','shop')).status,'uncertain');
 const api=f.reload();
 await assert.rejects(api.saveProduct({type:'boutique',parentId:'shop',data:product}),/RECONCILIATION_REQUIRED/);
 const replay=await api.saveProduct({type:'boutique',parentId:'shop',data:product,reconcile:true});
 assert.equal(replay.record.nom,'Produit');assert.equal(f.writes.length,1);
 assert.equal(f.requests.filter(x=>x.name==='manageCommerce').length,2);
 assert.equal(f.local.sequence(),1);
});
test('serialized duplicate submissions cannot mint two IDs',async()=>{
 const f=fixture(),api=f.api();
 const results=await Promise.allSettled([api.saveProduct({type:'boutique',parentId:'shop',data:product}),api.saveProduct({type:'boutique',parentId:'shop',data:product})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.writes.length,1);assert.equal(f.local.sequence(),1);
});
test('actual handler rejects foreign parent, and auth rejects changed session before invoke',async()=>{
 const f=fixture();f.parent.partenaire_id='foreign';
 await assert.rejects(f.api().saveProduct({type:'boutique',parentId:'shop',data:product}),/OWNER_COUNTRY_FORBIDDEN/);
 assert.equal(f.writes.length,0);
 const count=f.requests.length;f.user.id='new-user';
 await assert.rejects(f.api().products('boutique','shop'),/OWNER_SESSION_CHANGED/);
 assert.equal(f.requests.length,count);
});
test('creation/update shop obey server identity, immutable country and restaurant approval',async()=>{
 for(const type of ['boutique','restaurant']) {
  const f=fixture(),api=f.api();
  const result=await api.saveShop({type,data:{nom:'New',pays_code:'BF',commission_pct:99,montant_du_silga:88,validation:'valide'}});
  assert.equal(result.record.partenaire_id,'owner');assert.equal(result.record.commission_pct,null);assert.equal(result.record.montant_du_silga,undefined);
  assert.equal(result.record.validation,type==='boutique'?'valide':'en_attente');
  await assert.rejects(api.saveShop({type,existing:result.record,data:{nom:'Edit',pays_code:'CI'}}),/COUNTRY_CHANGE_UNAVAILABLE/);
 }
});
test('availability and deletion use actual manage handler with exact product-parent scope',async()=>{
 const f=fixture(),api=f.api();const created=await api.saveProduct({type:'boutique',parentId:'shop',data:product});
 await api.setAvailable({type:'boutique',parentId:'shop',id:created.record.id,available:false});
 assert.equal(f.records.get(created.record.id).disponible,false);
 await api.removeProduct({type:'boutique',parentId:'shop',id:created.record.id});
 assert.equal(f.records.has(created.record.id),false);assert.equal(f.directCalls(),0);
});
test('owner discovery follows actual endpoint offset pages and never converts read failure to empty',async()=>{
 const f=fixture();
 for(let i=0;i<54;i++)f.records.set('shop-'+i,{...f.parent,id:'shop-'+i,entity:'Boutique'});
 const rows=await f.api().allEstablishments('boutique');assert.equal(rows.length,55);
 assert.deepEqual(f.requests.map(x=>x.body.offset),[0,50]);
 f.sdk.functions.invoke=async()=>{throw Error('503');};
 await assert.rejects(f.api().allEstablishments('boutique'),/503/);
});
test('broken storage and missing lock refuse before remote mutation',async()=>{
 const f=fixture();
 const intents=createCommerceCreationIntent({storage:{getItem(){throw Error('blocked')}},withLock:async(_k,fn)=>fn()});
 const api=createOwnerCommerce({sdk:f.sdk,actorId:'owner',intents});
 await assert.rejects(api.saveProduct({type:'boutique',parentId:'shop',data:product}),/STORAGE_UNAVAILABLE/);
 assert.equal(f.requests.length,0);
});
function actualSubmit(file,context) {
 const source=fs.readFileSync(file,'utf8');
 const ast=ts.createSourceFile('screen.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let initializer;
 function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='handleSave')initializer=node.initializer.getText(ast);ts.forEachChild(node,visit);}
 visit(ast);assert.ok(initializer);
 return vm.runInNewContext('('+initializer+')',context);
}
test('actual product form submit runs server interface and confirms success only after receipt',async()=>{
 const f=fixture();let saved=0,uncertain=false;
 const context={confirm:()=>true,serverOwner:true,ownerCommerce:{userId:'owner'},base44:f.sdk,createOwnerCommerce,browserCommerceIntents:()=>f.intents,type:'boutique',etablissementId:'shop',existing:null,form:product,photos:[product.photo_url],videoUrl:'',mediaBusy:false,uncertain:false,savePending:{current:false},
 setSaveError:()=>{},setSaving:()=>{},setUncertain:v=>{uncertain=v;},onSaved:()=>{saved++;}};
 const submit=actualSubmit('src/components/partenaire/ProduitsManager.jsx',context);
 await submit(false);assert.equal(saved,1);assert.equal(uncertain,false);assert.equal(f.writes.length,1);assert.equal(context.savePending.current,false);
});
test('actual establishment form lost response locks submission; explicit reconciliation uses same request',async()=>{
 const f=fixture();let saved=0,uncertain=false;
 const context={confirm:()=>true,serverOwner:true,ownerCommerce:{userId:'owner'},base44:f.sdk,createOwnerCommerce,browserCommerceIntents:()=>f.intents,type:'boutique',existing:null,
 form:{nom:'Shop new',pays_code:'BF',ouvert:true},uploading:false,saveUncertain:false,savePending:{current:false},telValide:true,telDepotValide:true,
 setSaving:()=>{},setSaveUncertain:v=>{uncertain=v;},toast:{success:()=>{},error:()=>{}},onSaved:()=>{saved++;},console:{error:()=>{}}};
 f.loseNext();await actualSubmit('src/components/partenaire/EtablissementForm.jsx',context)(false);
 assert.equal(saved,0);assert.equal(uncertain,true);assert.equal(f.writes.length,1);
 context.saveUncertain=true;
 await actualSubmit('src/components/partenaire/EtablissementForm.jsx',context)(false);assert.equal(f.requests.length,1);
 await actualSubmit('src/components/partenaire/EtablissementForm.jsx',context)(true);assert.equal(saved,1);assert.equal(f.writes.length,1);assert.equal(f.local.sequence(),1);
});
test('three JSX files parse without syntax diagnostics; default dashboard does not opt in',()=>{
 for(const file of ['src/pages/PartenaireDashboard.jsx','src/components/partenaire/EtablissementForm.jsx','src/components/partenaire/ProduitsManager.jsx']) {
  const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(ast.parseDiagnostics,[]);
 }
 const app=fs.readFileSync('src/App.jsx','utf8');assert.ok(!app.includes('commerceMigrationEnabled={true}'));
});



function actualQuery(file,needle,context) {
 const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let expression;
 function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast).includes(needle)&&node.initializer&&ts.isCallExpression(node.initializer)&&node.initializer.expression.getText(ast)==='useQuery')expression=node.initializer.arguments[0].getText(ast);ts.forEachChild(node,visit);}
 visit(ast);assert.ok(expression);return vm.runInNewContext('('+expression+')',context);
}
test('actual owner catalogue query uses secure reader and actor-partitioned cache',async()=>{
 const f=fixture();await f.api().saveProduct({type:'boutique',parentId:'shop',data:product});
 const query=actualQuery('src/components/partenaire/ProduitsManager.jsx','productPage',{
  type:'boutique',etablissementId:'shop',readOnlyPreview:false,serverOwner:true,commercePreview:null,ownerCommerce:{userId:'owner'},offset:0,ownerApi:()=>f.api(),entityName:'ProduitBoutique',idField:'boutique_id',base44:f.sdk,
 });
 assert.equal((await query.queryFn()).rows[0].prix,1250);
 assert.ok(query.queryKey.includes('server-owner'));assert.ok(query.queryKey.includes('owner'));assert.equal(query.retry,false);
});
test('actual dashboard discovery uses secure reader, errors do not become absent establishment',async()=>{
 const f=fixture();const query=actualQuery('src/pages/PartenaireDashboard.jsx','maBoutique',{user:f.user,ownerEnabled:true,ownerApi:()=>f.api(),base44:f.sdk});
 assert.equal((await query.queryFn()).id,'shop');
 f.sdk.functions.invoke=async()=>{throw Error('503 unavailable');};
 await assert.rejects(query.queryFn(),/503 unavailable/);
 assert.ok(query.queryKey.includes('owner'));assert.equal(query.retry,false);
});
test('new explicit intention only after confirmed receipt receives a new ID',async()=>{
 const f=fixture(),scope=ownerCreationScope('owner','boutique','shop');
 await f.api().saveProduct({type:'boutique',parentId:'shop',data:product});
 await f.intents.startNew(scope);
 await f.api().saveProduct({type:'boutique',parentId:'shop',data:{...product,nom:'Second'}});
 assert.equal(f.writes.length,2);assert.equal(f.requests[0].body.request_id,'request-1');assert.equal(f.requests[1].body.request_id,'request-2');
});
test('native lock unavailable fails closed before any remote creation',async t=>{
 if(globalThis.navigator?.locks?.request){t.skip('Native lock is present in this runtime.');return;}
 const f=fixture(),intents=createCommerceCreationIntent({storage:f.local.storage});
 await assert.rejects(createOwnerCommerce({sdk:f.sdk,actorId:'owner',intents}).saveProduct({type:'boutique',parentId:'shop',data:product}),/LOCK_UNAVAILABLE/);
 assert.equal(f.requests.length,0);
});


for(const screen of ['ProduitsManager','EtablissementForm'])test('actual '+screen+' reconciliation cancellation performs no remote action',async()=>{
 const f=fixture();let saved=0;
 const context={confirm:()=>false,serverOwner:true,ownerCommerce:{userId:'owner'},base44:f.sdk,createOwnerCommerce,browserCommerceIntents:()=>f.intents,
 type:'boutique',etablissementId:'shop',existing:null,form:{...product,pays_code:'BF'},photos:[product.photo_url],videoUrl:'',mediaBusy:false,uncertain:true,
 uploading:false,saveUncertain:true,savePending:{current:false},telValide:true,telDepotValide:true,setSaveError:()=>{},setSaving:()=>{},setUncertain:()=>{},setSaveUncertain:()=>{},toast:{error:()=>{},success:()=>{}},onSaved:()=>{saved++;}};
 await actualSubmit('src/components/partenaire/'+screen+'.jsx',context)(true);
 assert.equal(f.requests.length,0);assert.equal(f.writes.length,0);assert.equal(f.local.sequence(),0);assert.equal(saved,0);
});

