import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

function node(file, name) {
 const source=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let found;
 const visit=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(tree)===name)found=n.initializer.getText(tree);ts.forEachChild(n,visit);};visit(tree);assert.ok(found,name);return found;
}
function partnerFixture(update){
 const events=[],errors=[],invalidations=[],rows=[{id:'shop',validation:'en_attente'}],selection={current:'true:boutique:shop'},pending={current:false};let calls=0;
 const fn=vm.runInNewContext('('+node('src/components/admin/PartenaireDetailDialog.jsx','handleValidation')+')',{
  validationPending:pending,selectionRef:selection,setValidationError:x=>errors.push(x),setActionLoading(){},entityName:'Boutique',type:'boutique',etablissement:{id:'shop'},motif:'',
  base44:{auth:{me:async()=>({email:'test@example.invalid'})},entities:{Boutique:{update:async(...args)=>{calls++;return update(...args);}}}},
  queryClient:{invalidateQueries:q=>invalidations.push(q.queryKey[0]),setQueriesData:(q,fn)=>{rows.splice(0,rows.length,...fn(rows));}},
  window:{dispatchEvent:()=>events.push('refresh')},Event:class {},onClose:()=>events.push('close')});
 return {fn,events,errors,invalidations,rows,selection,pending,calls:()=>calls};
}
for(const wrapped of [false,true])test(`partner confirmed validation${wrapped?' enveloped':''} closes, replaces stale row and refreshes all counters`,async()=>{
 const row={id:'shop',validation:'valide',actif:true};const f=partnerFixture(async()=>wrapped?{data:row}:row);await f.fn('valider');
 assert.equal(f.calls(),1);assert.deepEqual(f.events,['refresh','close']);assert.equal(f.rows[0].validation,'valide');
 for(const key of ['admin-boutiques','partenaires-en-attente-boutiques','partenaires-en-attente-restaurants','partenaires-en-attente-pharmacies'])assert.ok(f.invalidations.includes(key));
});
test('partner refusal or malformed result keeps dialog and allows an explicit retry',async()=>{
 for(const response of [null,{id:'shop',validation:'en_attente'},{data:{id:'wrong',validation:'valide'}}]){
  const f=partnerFixture(async()=>response);await f.fn('valider');assert.equal(f.events.length,0);assert.ok(f.errors.at(-1));assert.equal(f.pending.current,false);
 }
 const f=partnerFixture(async()=>{throw Error('network refused');});await f.fn('valider');await f.fn('valider');assert.equal(f.calls(),2);assert.equal(f.events.length,0);assert.equal(f.errors.at(-1),'network refused');
});
test('partner double click is one update and a late response cannot close a different shop',async()=>{
 let resolve;const f=partnerFixture(()=>new Promise(r=>resolve=r));const first=f.fn('valider');await f.fn('valider');await new Promise(r=>setTimeout(r,0));assert.equal(f.calls(),1);
 f.selection.current='true:boutique:other';resolve({id:'shop',validation:'valide'});await first;assert.equal(f.events.includes('close'),false);assert.equal(f.pending.current,false);
});
function actualProductQuery(){
 const file='src/components/admin/BoutiqueProductsSection.jsx',source=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);let query;
 const visit=n=>{if(ts.isCallExpression(n)&&n.expression.getText(tree)==='useQuery')query=n.arguments[0].getText(tree);ts.forEachChild(n,visit);};visit(tree);return query;
}
test('actual catalogue query enforces the exact shop and distinguishes empty, data, malformed and network error',async()=>{
 for(const response of [[],[{id:'p',boutique_id:'shop'}]]){
  const calls=[];const config=vm.runInNewContext('('+actualProductQuery()+')',{boutiqueId:'shop',base44:{entities:{ProduitBoutique:{filter:async q=>{calls.push(q);return response;}}}}});
  const result=await config.queryFn();assert.equal(result.length,Array.isArray(response)?response.length:1);assert.equal(calls[0].boutique_id,'shop');assert.equal(config.retry,false);
 }
 for(const response of [null,{},{data:[{id:'p',boutique_id:'shop'}]},[{id:'p',boutique_id:'another-shop'}]]){
  const config=vm.runInNewContext('('+actualProductQuery()+')',{boutiqueId:'shop',base44:{entities:{ProduitBoutique:{filter:async()=>response}}}});await assert.rejects(config.queryFn());
 }
 const config=vm.runInNewContext('('+actualProductQuery()+')',{boutiqueId:'other',base44:{entities:{ProduitBoutique:{filter:async()=>{throw Error('network');}}}}});await assert.rejects(config.queryFn(),/network/);assert.equal(config.queryKey[1],'other');
 const source=fs.readFileSync('src/components/admin/BoutiqueProductsSection.jsx','utf8');assert.ok(source.indexOf('loading ?')<source.indexOf('productsError ?'));assert.ok(source.indexOf('productsError ?')<source.indexOf('products.length === 0 ?'));
});
test('actual product action confirms matching result, prevents duplicates and retains errors',async()=>{
 const body=node('src/components/admin/BoutiqueProductsSection.jsx','handleProductValidation');let resolve,calls=0;const errors=[],pending={current:false};
 const context={boutiqueId:'shop',pendingRef:pending,selectionRef:{current:'shop'},setActionError:e=>errors.push(e),setActionLoading(){},loadProducts:async()=>{},queryClient:{invalidateQueries(){}},
  base44:{auth:{me:async()=>null},entities:{ProduitBoutique:{update:async()=>{calls++;return new Promise(r=>resolve=r);}}}}};
 const fn=vm.runInNewContext('('+body+')',context),first=fn('product','valider');await fn('product','valider');await new Promise(r=>setTimeout(r,0));assert.equal(calls,1);
 resolve({id:'product',boutique_id:'shop',validation:'valide'});await first;assert.equal(pending.current,false);assert.equal(errors.at(-1),null);
 context.base44.entities.ProduitBoutique.update=async()=>{throw Error('network refused');};await fn('product','valider');assert.equal(errors.at(-1).message,'network refused');
});
