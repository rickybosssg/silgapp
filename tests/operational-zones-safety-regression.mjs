import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { normalizeCityName, resolveOperationalName, canSeeOperationalCourse } from '../base44/shared/cityNames.js';
import { invalidateOperationalCityCache, getOperationalZoneCityNames } from '../base44/shared/operationalZones.ts';
import { invalidateQuartierCache } from '../base44/shared/cityResolution.ts';
import { verifyCityCompatibility, buildLivreurCityFilter } from '../base44/shared/cityDispatchFilter.ts';

const cities = [{ id: 'ouaga', nom: 'ouagadougou', country_code: 'BF', actif: true, communes_rattachees: '["Ouagadougou","Saaba"]' },
  { id: 'bobo', nom: 'bobo-dioulasso', country_code: 'BF', actif: false }];
const sdk = { asServiceRole: { entities: { OperationalCity: { filter: async () => cities }, Quartier: { filter: async () => [] } } } };
const reset = () => { invalidateOperationalCityCache(); invalidateQuartierCache(); };
reset();
assert.equal(resolveOperationalName('SAABA', cities), 'ouagadougou');
assert.ok((await getOperationalZoneCityNames(sdk, 'BF', 'ouagadougou')).includes('saaba'), 'commune mapping does not require a GPS quartier');
const ouagaCourse = { country_code: 'BF', ville_depart: 'Ouagadougou' };
assert.equal((await verifyCityCompatibility(sdk, ouagaCourse, { country_code: 'BF', ville: 'Saaba' })).compatible, true);
assert.equal((await verifyCityCompatibility(sdk, ouagaCourse, { country_code: 'BF', ville: null })).compatible, false, 'unknown driver cannot bypass active zone');
assert.equal((await verifyCityCompatibility(sdk, { ...ouagaCourse, ville_depart: 'Bobo-Dioulasso' }, { country_code: 'BF', ville: 'Ouagadougou' })).compatible, true, 'inactive course retains historical eligibility');
assert.equal(canSeeOperationalCourse(ouagaCourse, 'Bobo-Dioulasso', cities, []), false);
assert.equal(canSeeOperationalCourse(ouagaCourse, 'SAABA', cities, []), true);
reset(); cities.forEach(c => { c.actif = false; });
sdk.asServiceRole.entities.Quartier.filter = async () => { throw Error('OFF must not query geographic data'); };
assert.deepEqual(await buildLivreurCityFilter(sdk, ouagaCourse), {});
assert.equal((await verifyCityCompatibility(sdk, ouagaCourse, {})).compatible, true);
reset(); sdk.asServiceRole.entities.OperationalCity.filter = async () => { throw Error('network'); };
await assert.rejects(verifyCityCompatibility(sdk, ouagaCourse, {}), /configuration_unavailable/);

const source = fs.readFileSync('base44/functions/manageOperationalCity/entry.ts', 'utf8');
const executable = ts.transpile(source.replace(/^import .*;\r?\n/gm, '')
  .replaceAll("'../../shared/operationalZones.ts'", JSON.stringify(new URL('../base44/shared/operationalZones.ts', import.meta.url).href)), { target: ts.ScriptTarget.ES2022 });
let handler, activeUser, writes = 0;
const row = { id: 'z', country_code: 'BF', nom: 'ouagadougou', actif: false, updated_date: 'v1' };
const entities = {
  Country: { filter: async () => [{ code: 'BF' }] },
  Quartier: { filter: async () => [{ ville: 'Saaba', ville_operationnelle: 'ouagadougou' }] },
  OperationalCity: { filter: async () => [row], updateMany: async (condition, update) => {
    assert.equal(condition.updated_date, row.updated_date); writes++; Object.assign(row, update.$set); return { updated: 1 };
  } },
};
new Function('Deno', 'createClientFromRequest', 'normalizeCityName', 'resolveOperationalName', executable)(
  { serve: fn => { handler = fn; } }, () => ({ auth: { me: async () => activeUser }, get asServiceRole() {
    if (activeUser?.role !== 'admin' || activeUser.enterprise_id) throw Error('unauthorized service access');
    return { entities };
  } }), normalizeCityName, resolveOperationalName);
const request = body => handler(new Request('https://isolated.invalid', { method: 'POST', body: JSON.stringify(body) }));
for (const user of [{ role: 'user' }, { role: 'admin', enterprise_id: 'private-enterprise' }]) {
  activeUser = user; assert.equal((await request({ action: 'activate' })).status, 403);
}
activeUser = { role: 'admin', email: 'admin@example.test' };
const payload = { action: 'activate', country_code: 'BF', city_name: 'Ouagadougou', expected_active: false };
assert.equal((await request({ ...payload, city_name: 'Saaba' })).status, 409, 'no independent Saaba zone');
assert.equal(writes, 0);
assert.equal((await request(payload)).status, 200);
assert.equal(writes, 1); assert.equal(row.historique_modifications.length, 1);
assert.equal((await request(payload)).status, 409, 'stale state rejected');
assert.equal((await request({ ...payload, expected_active: true })).status, 200, 'idempotent active write');
assert.equal(writes, 1);
const schema = JSON.parse(fs.readFileSync('base44/entities/OperationalCity.jsonc', 'utf8'));
for (const operation of ['create', 'update', 'delete']) assert.equal(schema.rls[operation], false, 'mutations must use authenticated backend');
console.log('PASS operational zones: OFF equivalence, actual aliases, active-zone guard, errors, privileged authorization, state fencing and audit (isolated adapters)');
