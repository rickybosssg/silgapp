import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

const source=fs.readFileSync('base44/shared/onRoutePriorityReservation.ts','utf8');
const tree=ts.createSourceFile('reservation.ts',source,ts.ScriptTarget.Latest,true);
const declaration=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='createExclusiveReservation');
assert.ok(declaration);
const executable=ts.transpileModule(declaration.getText(tree).replace('export ',''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const context=vm.createContext({ON_ROUTE_PRIORITY_RUNTIME_READY:false});
vm.runInContext(executable,context);
const backend=new Proxy({}, {get(){throw Error('Disabled priority accessed backend');}});
for(const enabled of [false,true]) {
  const result=await context.createExclusiveReservation(backend,{id:'test'},{onRoutePriorityEnabled:enabled});
  assert.equal(result.created,false);
  assert.equal(result.reason,'priority_disabled');
}
const engine=fs.readFileSync('base44/shared/ecoOptimizationEngine.ts','utf8');
assert.match(engine,/onRoutePriorityEnabled:\s*false/);
const orchestrator=fs.readFileSync('base44/functions/courseEventOrchestrator/entry.ts','utf8');
assert.doesNotMatch(orchestrator,/exclusive_reservation_created/);
console.log('PASS: disabled exclusive priority performs no backend access and cannot suppress dispatch (isolated real function).');
for (const name of ['releaseExpiredReservationsLazy','releaseExpiredOnRouteReservations','releaseReservationAfterRefusal']) {
  const node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  const js=ts.transpileModule(node.getText(tree).replace('export ',''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInContext(js,context);
  const result=await context[name](backend,'BF');
  assert.equal(result.released===false||result.released===0,true);
}
assert.match(engine,/proposal\.is_exclusive === true.*exclusive_priority_disabled/);
const reader=fs.readFileSync('base44/functions/getOnRouteProposalsForLivreur/entry.ts','utf8');
assert.match(reader,/is_exclusive:\s*\{ \$ne: true \}/);
assert.doesNotMatch(reader,/await releaseExpiredReservationsLazy/);
console.log('PASS: deferred cleanup performs no writes; exclusive proposals cannot be shown or accepted.');
