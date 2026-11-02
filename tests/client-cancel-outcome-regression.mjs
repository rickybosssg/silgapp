import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { clientCourseOutcome, readClientCourseOutcome } from '../src/lib/clientCourseOutcome.js';
import { guestCourseView } from '../base44/shared/guestOrderPolicy.js';

test('guest contract keeps cancellation distinct from delivery', () => {
  const dto = guestCourseView({statut:'annulee',prix_propose_client:1000},'FCFA');
  assert.equal(dto.statut,'annulee'); assert.equal(dto.delivered,false);
  assert.equal(guestCourseView({statut:'livree'},'FCFA').delivered,true);
});
test('cancellation wins over stale success flags and successful status with cancellation marker', () => {
  assert.equal(clientCourseOutcome({statut:'annulee',delivered:true}),'cancelled');
  assert.equal(clientCourseOutcome({statut:'livree',annulation_user_id:'owner'}),'cancelled');
  for(const c of [null,{}, {statut:'en_livraison'}, {delivered:true}, {statut:'terminee'}]) assert.equal(clientCourseOutcome(c),null);
  assert.equal(clientCourseOutcome({statut:'livree'}),'delivered');
});
test('missing, active, foreign and failed reads cannot fabricate delivery', async () => {
  for(const row of [null,{}, {id:'c',statut:'en_livraison'},{id:'other',statut:'livree'}]) assert.equal(await readClientCourseOutcome('c',async()=>row),null);
  await assert.rejects(readClientCourseOutcome('c',async()=>{throw Error('429');}),/429/);
  for(const statut of ['annulee','livree']) assert.equal((await readClientCourseOutcome('c',async()=>({id:'c',statut}))).statut,statut);
});

function render(course) {
  const source=fs.readFileSync('src/components/client/EcranFinCourse.jsx','utf8');
  const ast=ts.createSourceFile('screen.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  const body=ast.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(ast)).join('\n').replace('export default function','function');
  const code=ts.transpileModule(body,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const div=({children,className})=>React.createElement('div',{className},children);
  const icon=()=>React.createElement('span');
  const deps={React,useState:()=>[true,()=>{}],useEffect:()=>{},motion:{div},AnimatePresence:div,
    Star:icon,MessageSquare:icon,FileText:icon,RotateCcw:icon,X:icon,CheckCircle2:icon,Sparkles:icon,
    toast:{info:()=>{}},clientCourseOutcome};
  const Component=new Function(...Object.keys(deps),code+';return EcranFinCourse;')(...Object.values(deps));
  return renderToStaticMarkup(React.createElement(Component,{course}));
}
test('cancelled screen contains no celebration, rating, receipt or delivery success actions',()=>{
  const html=render({statut:'annulee'});
  assert.match(html,/Course annulée/); assert.match(html,/Fermer/);
  for(const text of ['Livraison terminée','livré avec succès','Noter le livreur','Commenter','Reçu','Refaire']) assert.ok(!html.includes(text),text);
});
test('confirmed delivered screen preserves its normal content and actions',()=>{
  const html=render({statut:'livree'});
  for(const text of ['Livraison terminée','livré avec succès','Noter le livreur','Reçu','Refaire']) assert.ok(html.includes(text),text);
  assert.equal(render({statut:'en_livraison'}),'');
});
test('connected caller reads confirmation; guest successful block uses status, not delivered flag',()=>{
  const connected=fs.readFileSync('src/pages/ClientExterneApp.jsx','utf8');
  assert.match(connected,/readClientCourseOutcome\(id/);
  assert.ok(!connected.includes('prevCoursesRef.current[id] || { id, statut: "livree"'));
  const guest=fs.readFileSync('src/pages/GuestOrderPage.jsx','utf8');
  assert.match(guest,/clientCourseOutcome\(course\) === 'delivered' && <div className="guest-complete"/);
});
