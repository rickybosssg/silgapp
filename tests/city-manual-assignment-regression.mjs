import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { invalidateOperationalCityCache } from '../base44/shared/operationalZones.ts';
import { invalidateQuartierCache } from '../base44/shared/cityResolution.ts';
const source = fs.readFileSync('base44/functions/assignerLivreurAdmin/entry.ts', 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export default async function', 'async function handler')
  .replace("'../../shared/cityDispatchFilter.ts'", JSON.stringify(new URL('../base44/shared/cityDispatchFilter.ts', import.meta.url).href));
let user, course, driver, active = false, serviceReads = 0;
const entities = {
  CourseExterne: { get: async () => course }, Livreur: { get: async () => driver },
  OperationalCity: { filter: async () => [{ nom: 'ouagadougou', country_code: 'BF', actif: active }] },
  Quartier: { filter: async () => [] },
};
const sdk = { auth: { me: async () => user }, get asServiceRole() { serviceReads++; return { entities }; } };
const handler = new Function('createClientFromRequest', 'figerCommissionAcceptation', ts.transpile(source, {target: ts.ScriptTarget.ES2022}) + ';return handler;')(() => sdk, () => { throw Error('Unexpected finance write'); });
const invoke = () => handler(new Request('https://isolated.invalid', { method: 'POST', body: JSON.stringify({ course_id: 'c', livreur_id: 'd' }) }));
user = { role: 'user' }; assert.equal((await invoke()).status, 403); assert.equal(serviceReads, 0);
user = { role: 'admin' };
course = { country_code: 'BF', ville_depart: 'Ouagadougou', statut: 'livreur_en_route', livreur_id: 'd' };
driver = { country_code: 'CI', ville: 'Bobo-Dioulasso', actif: true, validation: 'valide' };
assert.equal((await invoke()).status, 403);
driver.country_code = 'BF'; driver.enterprise_id = 'private'; assert.equal((await invoke()).status, 403);
driver.enterprise_id = null; user = { role: 'admin', admin_type: 'pays', country_code: 'CI' }; assert.equal((await invoke()).status, 403);
user = { role: 'admin' }; invalidateOperationalCityCache(); invalidateQuartierCache();
assert.equal((await invoke()).status, 200, 'all OFF preserves idempotent assignment');
active = true; invalidateOperationalCityCache(); invalidateQuartierCache();
assert.equal((await invoke()).status, 409, 'manual assignment cannot bypass active zone');
driver.ville = 'Ouagadougou'; assert.equal((await invoke()).status, 200);
console.log('PASS manual assignment: authenticated admin, tenant/country scope, OFF equivalence and active-zone enforcement (isolated)');
