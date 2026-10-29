import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { confirmedDeliverySnapshot } from '../src/lib/confirmedDelivery.js';
const source=fs.readFileSync('src/components/livreur/CourseActiveCard.jsx','utf8');
const tree=ts.createSourceFile('card.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
let handler;
const visit=node=>{
 if(ts.isJsxAttribute(node)&&node.name.getText(tree)==='onClick'&&node.initializer?.getText(tree).includes('prix_final_livreur: deplacementRecap.prix_final'))handler=node.initializer.expression.getText(tree);
 ts.forEachChild(node,visit);
};visit(tree);assert.ok(handler);
for(const reject of [false,true])test('actual TERMINER waits, deduplicates and preserves error '+reject,async()=>{
 const calls=[],errors=[],closed=[],ref={current:false};let resolve,fail;
 const fn=vm.runInNewContext('('+handler+')',{
  deliveryConfirmationRef:ref,setDeliveryBoutonPending(){},base44:{},course:{id:'only-test',statut:'arrivee'},deplacementRecap:{prix_final:1000},
  finaliserLivraisonSafe:()=>{calls.push('write');return new Promise((ok,no)=>{resolve=ok;fail=no;});},confirmedDeliverySnapshot,
  onColisLivre:async(row,price,options)=>{assert.equal(row.statut,'livree');assert.ok(options.confirmedResult);calls.push('confirmed');},
  queryClient:{invalidateQueries(){}},setDeplacementRecap:value=>closed.push(value),toast:{error:value=>errors.push(value)},
 });
 const pending=fn();await fn();assert.deepEqual(calls,['write']);assert.equal(closed.length,0);
 if(reject)fail(Error('HTTP401'));else resolve({data:{success:true,course:{id:'only-test',statut:'livree',prix_final:1000}}});
 await pending;assert.equal(ref.current,false);
 assert.deepEqual(calls,reject?['write']:['write','confirmed']);assert.equal(errors.length,reject?1:0);assert.equal(closed.length,reject?0:1);
});
