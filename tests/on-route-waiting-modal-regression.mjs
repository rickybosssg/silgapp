import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const text = readFileSync('src/pages/LivreurExterneApp.jsx', 'utf8');
const file = ts.createSourceFile('app.jsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let callback;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(file) === 'courseCandidates.find') callback = node.arguments[0];
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(callback);
const code = ts.transpile(`const predicate = ${callback.getText(file)};`, { target: ts.ScriptTarget.ES2022 });
let ordinaryCalls = 0;
const factory = new Function('isCourseDismissed', 'isV2Enabled', 'onRouteProposalCourseIds',
  'isCourseWaitingForLivreur', 'livreurId', `${code}; return predicate;`);
const predicate = factory(() => false, true, new Set(['proposal-course']),
  () => { ordinaryCalls++; return true; }, 'driver');
assert.equal(predicate({ id: 'proposal-course' }), false);
assert.equal(ordinaryCalls, 0);
assert.equal(predicate({ id: 'ordinary' }), true);
assert.equal(predicate({ id: 'v2', dispatch_status: 'disponible_push' }), false);
assert.match(text, /EcoProposal\?\.subscribe/);
assert.match(text, /n\.type === "on_route_proposal"/);
assert.match(text, /data\.type === "on_route_proposal"/);
assert.match(readFileSync('src/hooks/useOnRouteProposals.js', 'utf8'), /refetchInterval: 15000/);
console.log('PASS actual waiting-modal predicate and push/realtime source contracts (local, no FCM delivery)');
