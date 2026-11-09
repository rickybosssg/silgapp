import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { readCommerce } from '../base44/shared/commerceReadPolicy.js';
import { resolveCommerceAdminScope } from '../base44/shared/commerceAdminGrant.js';

function fixture(type='boutique') {
  const restaurant=type==='restaurant', parentKey=restaurant?'restaurant_id':'boutique_id';
  const user={id:'user-1',email:'owner@example.invalid'};
  const profile={id:'profile-1',user_email:user.email,country_code:'BF',actif:true};
  const parent={id:'shop-1',partenaire_id:user.id,pays_code:'BF',actif:true,nom:'Shop',montant_du_silga:900,user_email:'private@example.invalid',valide_par:'admin@example.invalid',commission_pct:9};
  let list=[parent];
  const calls=[];
  const entity={get:async key=>{calls.push(['parent.get',key]);return parent},filter:async (filter,sort,limit,offset)=>{calls.push(['filter',filter,sort,limit,offset]);return list}};
  const api={entities:{ClientExterne:{get:async key=>{calls.push(['profile.rls',key]);return profile}}},asServiceRole:{entities:{[restaurant?'Restaurant':'Boutique']:entity,[restaurant?'PlatRestaurant':'ProduitBoutique']:entity,[restaurant?'CommandeRestaurant':'CommandeBoutique']:entity}}};
  const body={type,action:'catalogue',profile_id:profile.id};
  const call=(patch,scope=null)=>readCommerce(api,user,{...body,...patch},scope);
  return {user,profile,parent,calls,api,body,call,setList:value=>list=value,parentKey};
}
for (const type of ['boutique','restaurant']) {
  test(type+' catalogue uses normal profile RLS and country, strips private fields',async()=>{
    const f=fixture(type), result=await f.call();
    assert.equal(f.calls[0][0],'profile.rls');
    assert.deepEqual(f.calls[1][1],{pays_code:'BF',actif:true});
    assert.deepEqual(result.rows,[{id:'shop-1',nom:'Shop',pays_code:'BF',actif:true}]);
  });
  for(const mutate of [
    f=>f.profile.user_email='foreign@example.invalid',
    f=>f.profile.id='foreign-profile',
    f=>f.profile.country_code='',
    f=>f.profile.actif=false,
    f=>f.profile.enterprise_id='tenant',
    f=>f.user.enterprise_id='tenant',
  ]) test(type+' rejects invalid caller profile before service read '+String(mutate),async()=>{
    const f=fixture(type);mutate(f);await assert.rejects(f.call());assert.equal(f.calls.length,1);
  });
  test(type+' catalogue rejects backend foreign/inactive rows',async()=>{
    const f=fixture(type);f.parent.pays_code='CI';await assert.rejects(f.call(),{code:'SCOPE_MISMATCH'});
    f.parent.pays_code='BF';f.parent.actif=false;await assert.rejects(f.call(),{code:'SCOPE_MISMATCH'});
  });
  test(type+' products require exact active parent in profile country',async()=>{
    const f=fixture(type);
    f.setList([{id:'item', [f.parentKey]:'shop-1',actif:true,disponible:true,prix:15,valide_par:'secret'}]);
    const out=await f.call({action:'products',parent_id:'shop-1'});
    assert.equal(out.rows[0].valide_par,undefined);
    f.parent.actif=false;await assert.rejects(f.call({action:'products',parent_id:'shop-1'}),{code:'CATALOGUE_FORBIDDEN'});
  });
  test(type+' rejects cross-parent product even if SDK ignored filter',async()=>{
    const f=fixture(type);f.setList([{[f.parentKey]:'foreign',actif:true,disponible:true}]);
    await assert.rejects(f.call({action:'products',parent_id:'shop-1'}),{code:'SCOPE_MISMATCH'});
  });
  test(type+' private order owner is ClientExterne id and items are projected',async()=>{
    const f=fixture(type);f.setList([{id:'order',client_id:f.profile.id,pays_code:'BF',items:'[{"id":"i","prix":50,"admin_secret":"hidden"}]',commission_montant:99,client_telephone:'hidden'}]);
    const out=await f.call({action:'orders'});
    assert.equal(f.calls.at(-1)[1].client_id,'profile-1');
    assert.deepEqual(out.rows,[{id:'order',pays_code:'BF',has_payment_proof:false,has_private_payment_proof:false,items:'[{"id":"i","prix":50}]'}]);
    f.setList([{client_id:f.user.id,pays_code:'BF',items:'[]'}]);
    await assert.rejects(f.call({action:'orders'}),{code:'SCOPE_MISMATCH'});
  });
  test(type+' partner orders authorized from parent, not forged order partner id',async()=>{
    const f=fixture(type);
    f.setList([{id:'order',[f.parentKey]:'shop-1',pays_code:'BF',partenaire_id:'someone-else',items:'[]'}]);
    assert.equal((await f.call({action:'orders',audience:'partner',parent_id:'shop-1'})).rows.length,1);
    assert.equal(f.calls[0][0],'parent.get');
    f.parent.partenaire_id='other';
    await assert.rejects(f.call({action:'orders',audience:'partner',parent_id:'shop-1'}),{code:'PARTNER_FORBIDDEN'});
  });

}
test('no arbitrary entity/filter/user or anonymous access',async()=>{
  const f=fixture();
  for (const patch of [{type:'__proto__'},{filter:{}},{entity:'User'},{action:'delete'},{audience:'public'}]) await assert.rejects(f.call(patch));
  f.user.id='';await assert.rejects(f.call(),{code:'AUTH_REQUIRED'});
});
test('read failure and malformed SDK response never become empty success',async()=>{
  const f=fixture();f.setList(null);await assert.rejects(f.call(),{code:'INVALID_READ_RESPONSE'});
  f.api.entities.ClientExterne.get=async()=>{throw Error('SDK secret')};
  await assert.rejects(f.call(),/SDK secret/);
});
test('bounded response explicitly reports truncation',async()=>{
  const f=fixture();f.setList(Array.from({length:101},()=>({...f.parent})));
  const out=await f.call();assert.equal(out.rows.length,100);assert.equal(out.has_more,true);
});
test('handler no-store, method/auth/JSON failure, SDK diagnostic redaction',async()=>{
  const f=fixture();f.api.auth={me:async()=>f.user};
  const source=fs.readFileSync('base44/functions/readCommerce/entry.ts','utf8');
  const ast=ts.createSourceFile('entry.ts',source,ts.ScriptTarget.Latest,true);
  const body=ast.statements.filter(s=>!ts.isImportDeclaration(s)).map(s=>s.getText(ast)).join('\n');
  const js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  let handler;
  new Function('Deno','createClientFromRequest','readCommerce','resolveCommerceAdminScope',js)({serve:fn=>handler=fn},()=>f.api,readCommerce,resolveCommerceAdminScope);
  let res=await handler(new Request('http://isolated.invalid'));assert.equal(res.status,405);
  res=await handler(new Request('http://isolated.invalid',{method:'POST',body:'{'}));assert.equal(res.status,400);
  f.api.auth.me=async()=>{throw Error('secret data')};
  res=await handler(new Request('http://isolated.invalid',{method:'POST',body:'{}'}));
  assert.equal(res.status,503);assert.equal(res.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await res.json(),{error:'READ_UNAVAILABLE'});
  f.api.auth.me=async()=>null;
  res=await handler(new Request('http://isolated.invalid',{method:'POST',body:'{}'}));assert.equal(res.status,401);
});



function grant(f,scope='pays',code='BF') {
  f.user.role='admin';
  return resolveCommerceAdminScope(f.user,JSON.stringify({version:1,grants:[{user_id:f.user.id,scope,country_code:code,expires_at:'2099-01-01T00:00:00Z'}]}));
}
for(const type of ['boutique','restaurant']) {
  test(type+' owner discovers only own shops without guessing country',async()=>{
    const f=fixture(type);f.parent.actif=false;f.parent.validation='en_attente';
    const out=await f.call({audience:'partner'});
    assert.deepEqual(f.calls[0][1],{partenaire_id:f.user.id});
    assert.equal(out.rows[0].validation,'en_attente');assert.equal(out.rows[0].user_email,undefined);
    assert.equal(out.rows[0].montant_du_silga,undefined);assert.equal(out.rows[0].commission_pct,undefined);
    f.parent.partenaire_id='foreign';await assert.rejects(f.call({audience:'partner'}),{code:'SCOPE_MISMATCH'});
  });
  test(type+' owner country filter remains exact and malformed stored country fails',async()=>{
    const f=fixture(type);await assert.rejects(f.call({audience:'partner',country_code:'CI'}),{code:'SCOPE_MISMATCH'});
    f.parent.pays_code='';await assert.rejects(f.call({audience:'partner'}),{code:'COUNTRY_REQUIRED'});
  });
  test(type+' owner products include unavailable/inactive with moderation but not admin identity',async()=>{
    const f=fixture(type);f.parent.actif=false;
    f.setList([{id:'item',[f.parentKey]:'shop-1',actif:false,disponible:false,validation:'refuse',motif_refus:'review',valide_par:'private'}]);
    const out=await f.call({action:'products',audience:'partner',parent_id:'shop-1'});
    assert.deepEqual(f.calls.at(-1)[1],{[f.parentKey]:'shop-1'});
    assert.equal(out.rows[0].validation,'refuse');assert.equal(out.rows[0].valide_par,undefined);
    f.parent.partenaire_id='foreign';await assert.rejects(f.call({action:'products',audience:'partner',parent_id:'shop-1'}),{code:'PARTNER_FORBIDDEN'});
  });
  test(type+' server grant overrides spoofed User global/country',async()=>{
    const f=fixture(type), scope=grant(f);
    f.user.admin_type='global';f.user.country_code='CI';
    f.setList([]); assert.deepEqual((await f.call({action:'orders',audience:'admin',country_code:'BF'},scope)).rows,[]);
    await assert.rejects(f.call({action:'orders',audience:'admin',country_code:'CI'},scope),{code:'ADMIN_COUNTRY_FORBIDDEN'});
    await assert.rejects(f.call({action:'orders',audience:'admin',country_code:'BF'}),{code:'TRUSTED_ADMIN_SCOPE_REQUIRED'});
    await assert.rejects(f.call({action:'orders',audience:'admin',country_code:'BF',trustedScope:scope},scope),{code:'INVALID_REQUEST'});
  });
  test(type+' admin catalogue filters notices and projects only required private fields',async()=>{
    const f=fixture(type), scope=grant(f);
    Object.assign(f.parent,{creation_directe:true,creation_admin_notifiee:false,validation:'en_attente'});
    const out=await f.call({audience:'admin',country_code:'BF',creation_directe:true,creation_admin_notifiee:false,validation:'en_attente'},scope);
    assert.equal(out.rows[0].user_email,'private@example.invalid');
    assert.equal(out.rows[0].creation_admin_notifiee,false);
    assert.equal(out.rows[0].commission_pct,undefined);assert.equal(out.rows[0].montant_du_silga,undefined);
    f.parent.pays_code='CI';await assert.rejects(f.call({audience:'admin',country_code:'BF'},scope),{code:'SCOPE_MISMATCH'});
  });
  test(type+' admin product parent country enforced before read',async()=>{
    const f=fixture(type), scope=grant(f);
    f.setList([{id:'item',[f.parentKey]:'shop-1',actif:false,valide_par:'moderator',validation:'refuse'}]);
    const out=await f.call({action:'products',audience:'admin',country_code:'BF',parent_id:'shop-1'},scope);
    assert.equal(out.rows[0].valide_par,'moderator');
    f.parent.pays_code='CI';await assert.rejects(f.call({action:'products',audience:'admin',country_code:'BF',parent_id:'shop-1'},scope),{code:'CATALOGUE_FORBIDDEN'});
  });
}
test('pagination limit/offset produce continuation and terminal marker',async()=>{
  const f=fixture();f.setList([f.parent,f.parent,f.parent]);
  let out=await f.call({limit:2,offset:4});
  assert.equal(out.rows.length,2);assert.equal(out.has_more,true);assert.equal(out.next_offset,6);
  assert.deepEqual(f.calls.at(-1).slice(2),['-created_date',3,4]);
  f.setList([f.parent]);out=await f.call({limit:2,offset:6});assert.equal(out.has_more,false);assert.equal(out.next_offset,null);
  for(const bad of [{limit:0},{limit:201},{offset:-1},{offset:1.5},{offset:1000001},{cursor:'forged'}]) await assert.rejects(f.call(bad));
});
test('private request filters cannot alter client catalogue or accept invalid moderation',async()=>{
  const f=fixture();for(const extra of [{validation:'valide'},{creation_directe:true}]) await assert.rejects(f.call(extra),{code:'INVALID_REQUEST'});
  const scope=grant(f);
  await assert.rejects(f.call({audience:'admin',country_code:'BF',validation:'anything'},scope),{code:'INVALID_REQUEST'});
});
test('handler resolves admin permission solely from server configuration',async()=>{
  const f=fixture();f.user.role='admin';f.user.admin_type='global';f.api.auth={me:async()=>f.user};
  const source=fs.readFileSync('base44/functions/readCommerce/entry.ts','utf8');
  const ast=ts.createSourceFile('entry.ts',source,ts.ScriptTarget.Latest,true);
  const sourceBody=ast.statements.filter(s=>!ts.isImportDeclaration(s)).map(s=>s.getText(ast)).join('\n');
  const js=ts.transpileModule(sourceBody,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  let handler,config;
  new Function('Deno','createClientFromRequest','readCommerce','resolveCommerceAdminScope',js)(
    {serve:fn=>handler=fn,env:{get:key=>{assert.equal(key,'COMMERCE_ADMIN_GRANTS_JSON');return config;}}},()=>f.api,readCommerce,resolveCommerceAdminScope);
  const request=()=>new Request('http://isolated.invalid',{method:'POST',body:JSON.stringify({type:'boutique',action:'catalogue',audience:'admin',country_code:'BF'})});
  let res=await handler(request());assert.equal(res.status,403);assert.deepEqual(await res.json(),{error:'TRUSTED_ADMIN_SCOPE_REQUIRED'});
  config=JSON.stringify({version:1,grants:[{user_id:f.user.id,scope:'pays',country_code:'BF',expires_at:'2099-01-01T00:00:00Z'}]});
  res=await handler(request());assert.equal(res.status,200);
});
test('pinned SDK 0.8.31 transmits offset through actual filter implementation',async t=>{
  const { pathToFileURL }=await import('node:url');
  const path=(process.env.LOCALAPPDATA||'')+'/deno/npm/registry.npmjs.org/@base44/sdk/0.8.31/dist/modules/entities.js';
  if(!fs.existsSync(path)) { t.skip('Pinned SDK cache unavailable; no network/package installation.');return; }
  const {createEntitiesModule}=await import(pathToFileURL(path).href);
  let captured;
  const entities=createEntitiesModule({appId:'synthetic',axios:{get:async(url,options)=>{captured={url,options};return [];}},getSocket:()=>null});
  await entities.Boutique.filter({partenaire_id:'owner'},'-created_date',3,4);
  assert.deepEqual(captured.options.params,{q:'{"partenaire_id":"owner"}',sort:'-created_date',limit:3,skip:4});
});




for(const type of ['boutique','restaurant']) {
  test(type+' financial actions deny clients and foreign partners before data read',async()=>{
    const f=fixture(type);
    for(const action of ['finance_establishment','finance_orders','payments']) {
      await assert.rejects(f.call({action,parent_id:'shop-1'}),{code:'FINANCE_FORBIDDEN'});
      f.parent.partenaire_id='foreign';
      await assert.rejects(f.call({action,audience:'partner',parent_id:'shop-1'}),{code:'PARTNER_FORBIDDEN'});
    }
  });
  test(type+' finance establishment preserves raw null/missing balance without computing',async()=>{
    const f=fixture(type);f.parent.commission_pct=null;delete f.parent.montant_du_silga;
    const out=await f.call({action:'finance_establishment',audience:'partner',parent_id:'shop-1'});
    assert.equal(out.rows[0].commission_pct,null);
    assert.equal(Object.hasOwn(out.rows[0],'montant_du_silga'),false);
    assert.equal(out.rows[0].user_email,undefined);
    assert.equal(out.has_more,false);
  });
  test(type+' finance orders project historical money and exclude customer/proof data',async()=>{
    const f=fixture(type);f.setList([{id:'o',[f.parentKey]:'shop-1',pays_code:'BF',total:1200,commission_montant:120,client_nom:'private',preuve_paiement_url:'https://example.invalid/private',items:'secret'}]);
    const out=await f.call({action:'finance_orders',audience:'partner',parent_id:'shop-1'});
    assert.deepEqual(out.rows,[{id:'o',[f.parentKey]:'shop-1',pays_code:'BF',total:1200,commission_montant:120}]);
    f.setList([{[f.parentKey]:'foreign',pays_code:'BF'}]);
    await assert.rejects(f.call({action:'finance_orders',audience:'partner',parent_id:'shop-1'}),{code:'SCOPE_MISMATCH'});
  });
  test(type+' payments require exact parent owner type and country, redact proof URL',async()=>{
    const f=fixture(type);
    const payment={id:'pay',etablissement_id:'shop-1',partenaire_id:f.user.id,type,pays_code:'BF',montant:500,statut:'confirme',preuve_url:'https://example.invalid/private',traite_par:'secret'};
    f.api.asServiceRole.entities.PaiementPartenaire={filter:async(filter,sort,limit,offset)=>{f.calls.push(['payment',filter,sort,limit,offset]);return [payment];}};
    const out=await f.call({action:'payments',audience:'partner',parent_id:'shop-1'});
    assert.deepEqual(f.calls.at(-1)[1],{etablissement_id:'shop-1',partenaire_id:f.user.id,type,pays_code:'BF'});
    assert.equal(out.rows[0].has_payment_proof,true);assert.equal(out.rows[0].preuve_url,undefined);assert.equal(out.rows[0].traite_par,undefined);
    for(const key of ['etablissement_id','partenaire_id','type','pays_code']) {
      const prior=payment[key];payment[key]='foreign';await assert.rejects(f.call({action:'payments',audience:'partner',parent_id:'shop-1'}),{code:'SCOPE_MISMATCH'});payment[key]=prior;
    }
  });
  test(type+' admin finance rejects foreign parent country despite valid grant',async()=>{
    const f=fixture(type), scope=grant(f);f.parent.pays_code='CI';
    for(const action of ['finance_establishment','finance_orders','payments']) await assert.rejects(f.call({action,audience:'admin',country_code:'BF',parent_id:'shop-1'},scope),{code:'FINANCE_FORBIDDEN'});
  });
}
test('order proof presence is available without disclosing durable storage URL',async()=>{
  const f=fixture();f.setList([{client_id:f.profile.id,pays_code:'BF',items:'[]',preuve_paiement_url:'https://example.invalid/receipt'}]);
  const out=await f.call({action:'orders'});assert.equal(out.rows[0].has_payment_proof,true);assert.equal(out.rows[0].preuve_paiement_url,undefined);
});


test('client and owner endpoint reads succeed without consulting admin configuration',async()=>{
  for(const type of ['boutique','restaurant']) {
    const f=fixture(type);f.api.auth={me:async()=>f.user};
    const source=fs.readFileSync('base44/functions/readCommerce/entry.ts','utf8');
    const ast=ts.createSourceFile('entry.ts',source,ts.ScriptTarget.Latest,true);
    const body=ast.statements.filter(s=>!ts.isImportDeclaration(s)).map(s=>s.getText(ast)).join('\n');
    const js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    let handler;
    new Function('Deno','createClientFromRequest','readCommerce','resolveCommerceAdminScope',js)(
      {serve:fn=>handler=fn,env:{get:()=>{throw Error('Admin env must not be read');}}},()=>f.api,readCommerce,resolveCommerceAdminScope);
    for(const request of [
      {type,action:'catalogue',audience:'client',profile_id:'profile-1'},
      {type,action:'catalogue',audience:'partner'},
    ]) {
      const res=await handler(new Request('http://isolated.invalid',{method:'POST',body:JSON.stringify(request)}));
      assert.equal(res.status,200);assert.equal((await res.json()).rows[0].id,'shop-1');
    }
    f.parent.partenaire_id='foreign';
    const res=await handler(new Request('http://isolated.invalid',{method:'POST',body:JSON.stringify({type,action:'products',audience:'partner',parent_id:'shop-1'})}));
    assert.equal(res.status,403);
  }
});

