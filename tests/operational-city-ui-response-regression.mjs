import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync('src/components/admin/OperationalCityManager.jsx', 'utf8');
const tree = ts.createSourceFile('manager.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let initializer;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'handleToggle') initializer = node.initializer.getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree); assert.ok(initializer);
for (const response of [{data:{success:true}}, {success:true}, {data:{success:false,error:'conflict'}}]) {
  const messages = [], pending = [], requests = []; let refreshes = 0;
  const handler = new Function('base44','activating','setActivating','toast','refetch','refreshPolicy','queryClient','selectedCountry','setPendingToggle', `return (${initializer});`)(
    { functions:{ invoke:async (name,body)=>{requests.push({name,body});return response;} } }, false, ()=>{},
    {success:s=>messages.push(['success',s]),error:s=>messages.push(['error',s])}, ()=>refreshes++, ()=>refreshes++, {invalidateQueries:()=>{}}, 'BF', s=>pending.push(s));
  await handler({country_code:'BF',nom:'ouagadougou',nom_affichage:'Ouagadougou',actif:false});
  assert.equal(requests[0].body.expected_active,false);
  if ((response.data??response).success) { assert.equal(refreshes,2);assert.deepEqual(pending,[null]);assert.equal(messages[0][0],'success'); }
  else { assert.equal(refreshes,0);assert.equal(pending.length,0);assert.deepEqual(messages,[['error','conflict']]); }
}
assert.ok(source.includes("['cities-for-country']"));
assert.ok(source.includes('setPendingToggle(city)'),'toggle opens confirmation, not direct mutation');
console.log('PASS actual city toggle handler: SDK envelopes, backend failure, confirmation, expected state and refresh (isolated)');
