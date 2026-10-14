import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { cityNamePattern, normalizeCityName, cityNamesPattern, operationalCityAliases, resolveOperationalName, canSeeOperationalCourse } from '../base44/shared/cityNames.js';
import { invalidateCityFlagCache, invalidateQuartierCache, resolveCityFromGPS, shouldUpdateDriverCity, getDriverOperationalCity } from '../base44/shared/cityResolution.ts';
import { verifyCityCompatibility } from '../base44/shared/cityDispatchFilter.ts';
import { acceptEcoMission, createOnRouteProposal } from '../base44/shared/ecoOptimizationEngine.ts';

const cityPattern = new RegExp(cityNamePattern('Bobo-Dioulasso'), 'i');
assert.ok(cityPattern.test(' BOBO-DIOULASSO '));
assert.ok(!cityPattern.test('Grand Bobo-Dioulasso Nord'));
assert.ok(new RegExp(cityNamePattern('Lome'), 'i').test('Lomé'));
assert.ok(!new RegExp(cityNamePattern('A.*'), 'i').test('Abidjan'));
assert.equal(normalizeCityName('  ÉTÉ  '), 'ete');

import { invalidateOperationalCityCache } from '../base44/shared/operationalZones.ts';
let flag = false, writes = 0;
const driver = { id: 'd', user_email: 'driver@example.test', country_code: 'BF', ville: 'Ouagadougou',
  type_livreur: 'externe', validation: 'valide', actif: true, statut: 'disponible', enterprise_id: null };
const mission = { id: 'm', country_code: 'BF', enterprise_id: null, status: 'available', course_ids: ['a', 'b'] };
const courses = ['a', 'b'].map((id, i) => ({ id, country_code: 'BF', enterprise_id: null, ville_depart: i ? 'Bobo-Dioulasso' : 'Ouagadougou',
  eco_mission_id: 'm', eco_status: 'grouped', statut: 'recherche_livreur', dispatch_status: 'en_attente' }));
const sdk = { auth: { me: async () => ({ email: driver.user_email }) }, asServiceRole: { entities: {
  AppConfig: { filter: async query => typeof query.cle === 'string' ? (flag ? [{ valeur: 'true' }] : []) :
    ['ENABLED', 'GROUPING_ENABLED', 'ON_ROUTE_ENABLED'].map(key => ({ cle: `ECO:BF:${key}`, valeur: 'true' })) },
  OperationalCity: { filter: async () => ['ouagadougou', 'bobo-dioulasso'].map(nom => ({ nom, actif: flag })) },
  Livreur: { get: async () => driver },
  EcoMission: { get: async () => mission, updateMany: async () => { writes++; throw Error('Unexpected write'); } },
  CourseExterne: { get: async id => courses.find(c => c.id === id) },
  Quartier: { filter: async () => [{ ville: 'Ouagadougou', latitude: 12.37, longitude: -1.52 },
    { ville: 'Bobo-Dioulasso', latitude: 11.17, longitude: -4.30 },
    { nom: 'Not a city', latitude: 0, longitude: 0 }] },
} } };
invalidateCityFlagCache(); invalidateOperationalCityCache(); invalidateQuartierCache();
assert.equal((await verifyCityCompatibility(sdk, courses[1], driver)).compatible, true);
flag = true; invalidateCityFlagCache(); invalidateOperationalCityCache();
assert.equal((await verifyCityCompatibility(sdk, courses[1], driver)).compatible, false);
assert.equal((await acceptEcoMission(sdk, 'm', 'd')).reason, 'city_mismatch');
assert.equal(writes, 0, 'second incompatible parcel rejected before any claim');
assert.equal((await createOnRouteProposal(sdk, 'b', 'd')).reason, 'city_mismatch');
assert.equal(await resolveCityFromGPS(sdk, 0, 0, 'BF'), null, 'neighbourhood name is not a city');
assert.equal(await getDriverOperationalCity(sdk, { latitude: 12.37, longitude: -1.52, country_code: 'BF', last_seen_at: new Date().toISOString() }), null);
for (const accuracy of [undefined, NaN, -1, 101]) assert.equal((await shouldUpdateDriverCity(sdk, driver, 11.17, -4.3, accuracy)).shouldUpdate, false);
assert.equal((await shouldUpdateDriverCity(sdk, { ...driver, statut: 'en_course' }, 11.17, -4.3, 10)).shouldUpdate, false);
assert.equal((await shouldUpdateDriverCity(sdk, driver, 11.17, -4.3, 10)).newCity, 'bobo-dioulasso');
assert.equal((await shouldUpdateDriverCity(sdk, { ...driver, ville: 'Bobo-Dioulasso' }, 12.37, -1.52, 10)).newCity, 'ouagadougou');
invalidateCityFlagCache(); invalidateOperationalCityCache();
sdk.asServiceRole.entities.OperationalCity.filter = async () => { throw Error('network'); };
await assert.rejects(verifyCityCompatibility(sdk, courses[1], driver), /configuration_unavailable/);

const v2 = readFileSync('base44/shared/dispatchV2.ts', 'utf8');
const tree = ts.createSourceFile('v2.ts', v2, ts.ScriptTarget.Latest, true);
const busy = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'getLivreursEnCourse').getText(tree);
assert.ok(!busy.includes('ville') && !busy.includes('CityFilter'), 'interurban busy drivers remain busy');
const hook = readFileSync('src/hooks/useCoursesDisponibles.js', 'utf8');
assert.ok(hook.includes('course_ids.every'));
assert.ok(hook.includes('cityLoading || coursesLoading || missionsLoading'));
assert.ok(hook.includes('cityError || coursesError || missionsError'));
assert.ok(hook.includes('EcoMission.subscribe'));
assert.ok(hook.includes('dispatch_status: "en_attente"'));
// Execute the production hook's query functions, not copied query logic.
for (const enabled of [false, true]) {
  const queries = new Map(), reads = [];
  const uiSdk = { entities: {
    CourseExterne: { filter: async filter => { reads.push(filter); return filter.id ? courses : []; } },
    EcoMission: { filter: async () => [mission] },
  } };
  const compiledHook = ts.transpile(hook.replace(/^import .*;\r?\n/gm, '').replace('export function', 'function'), { target: ts.ScriptTarget.ES2022 });
  const useFeed = new Function('useEffect', 'useMemo', 'useState', 'useQuery', 'useQueryClient', 'base44', 'cityNamesPattern', 'operationalCityAliases', 'resolveOperationalName', 'canSeeOperationalCourse', `${compiledHook};return useCoursesDisponibles;`)(
    () => {}, fn => fn(), initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    query => { queries.set(query.queryKey[0], query); return query.queryKey[0] === 'operational-zone-policy' ? { data: { cities: [{ nom: 'ouagadougou', actif: enabled }, { nom: 'bobo-dioulasso', actif: enabled }], quartiers: [] } } : {}; },
    () => ({}), uiSdk, cityNamesPattern, operationalCityAliases, resolveOperationalName, canSeeOperationalCourse);
  useFeed(driver);
  await queries.get('courses-externes-disponibles').queryFn();
  assert.equal(Boolean(reads[0].ville_depart), enabled);
  assert.equal(Boolean(reads[1].ville_depart), enabled, 'isolated Eco uses the same city filter');
  const visible = await queries.get('eco-missions-disponibles').queryFn();
  assert.equal(visible.length, enabled ? 0 : 1, 'mixed-city mission hidden only ON; Eco-only preserved OFF');
  assert.equal(reads.some(r => r.id), enabled, 'OFF adds no mission-course lookups');
}
const setter = readFileSync('base44/functions/setCityDispatchConfig/entry.ts', 'utf8');
const executable = ts.transpile(setter.replace(/^import .*;\r?\n/gm, ''), { target: ts.ScriptTarget.ES2022 });
let handler;
new Function('Deno', 'createClientFromRequest', 'invalidateCityFlagCache', executable)(
  { serve: fn => { handler = fn; } }, () => ({ auth: { me: async () => ({ role: 'user' }) },
    get asServiceRole() { throw Error('Service access before authorization'); } }), () => {});
assert.equal((await handler(new Request('https://test.invalid', { method: 'POST', body: '{}' }))).status, 403);
console.log('PASS city runtime safety: OFF/ON, second parcel, on-route, regex, GPS, permissions and historical busy guard (isolated adapters)');
