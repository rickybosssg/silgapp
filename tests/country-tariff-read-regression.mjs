import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerConfigPays } from '../base44/shared/dispatchConstants.ts';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const api = filter => ({ asServiceRole: { entities: { Country: { filter } } } });
for (const [country, status] of [['BF', 429], ['CI', 500]]) {
  test(`actual country loader propagates HTTP${status}, never a false absent tariff`, async () => {
    const error = { response: { status }, message: 'isolated read failure' };
    await assert.rejects(chargerConfigPays(api(async () => { throw error; }), country), e => e === error);
  });
}
test('missing country is not cached; actual dynamic tariff and commission remain unchanged', async () => {
  let calls = 0;
  const sdk = api(async query => {
    assert.deepEqual(query, { code: 'TG', actif: true }); calls++;
    return calls === 1 ? [] : [{ code: 'TG', prix_minimum: 725, commission_pct: 12 }];
  });
  assert.equal(await chargerConfigPays(sdk, 'TG'), null);
  const result = await chargerConfigPays(sdk, 'TG');
  assert.equal(result.prix_minimum, 725); assert.equal(result.commission_pct, 12);
  assert.equal(await chargerConfigPays(sdk, 'TG'), result); assert.equal(calls, 2);
});
test('country configuration cache never shares a country tariff with another country', async () => {
  const sdk = api(async query => [{ code: query.code, prix_minimum: query.code === 'BJ' ? 600 : 900 }]);
  assert.equal((await chargerConfigPays(sdk, 'BJ')).prix_minimum, 600);
  assert.equal((await chargerConfigPays(sdk, 'GH')).prix_minimum, 900);
});
test('actual acceptance catch returns an honest technical error and preserves HTTP429', async () => {
  const source = readFileSync('base44/functions/dispatchExterneAuto/entry.ts', 'utf8');
  const tree = ts.createSourceFile('entry.ts', source, ts.ScriptTarget.Latest, true);
  let caught;
  const visit = node => { if (ts.isTryStatement(node) && node.tryBlock.getText(tree).includes('const countryConfig = await chargerConfigPays(base44, course.country_code);') && node.catchClause?.getText(tree).includes('country_config_unavailable')) caught = node; ts.forEachChild(node, visit); };
  visit(tree); assert.ok(caught);
  const code = ts.transpileModule(caught.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = new Function('chargerConfigPays', `return async()=>{let PRIX_MIN=null;const base44={},course={country_code:'BF'};${code};return PRIX_MIN;}`);
  for (const [error, status] of [[{ response: { status: 429 } }, 429], [{ message: 'Rate limit exceeded: entity_list allows 140 requests' }, 429], [Error('network failure'), 503]]) {
    const response = await run(async () => { throw error; })();
    assert.equal(response.status, status); assert.equal((await response.json()).success, false);
  }
  assert.equal(await run(async () => ({ prix_minimum: 725 }))(), 725);
});
