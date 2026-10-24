import { selectAvailableCourseOffers } from '../src/lib/availableCourseOffers.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { registerHooks } from 'node:module';
import { currentDriverGpsCity, currentGpsFix, currentGpsCityQuery, gpsFixTime, CITY_GPS_MAX_AGE_MS } from '../base44/shared/currentGpsCity.js';
import { cityNamesPattern, operationalCityAliases, resolveOperationalName, canSeeOperationalCourse } from '../base44/shared/cityNames.js';
import { invalidateQuartierCache, getDriverOperationalCity } from '../base44/shared/cityResolution.ts';
import { invalidateOperationalCityCache } from '../base44/shared/operationalZones.ts';
import { verifyCityCompatibility, verifyCurrentCityAtClaim, filterCurrentCityCandidates, buildLivreurCityFilter } from '../base44/shared/cityDispatchFilter.ts';
import { acceptEcoMission } from '../base44/shared/ecoOptimizationEngine.ts';

// Only the platform background-task API is adapted; execute the real V2 code.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'base44:runtime') return { url: 'data:text/javascript,export function waitUntil(){throw new Error("Unexpected background task in isolated test")}', shortCircuit: true };
  return nextResolve(specifier, context);
} });
globalThis.Deno = { env: { get: () => undefined } };
const { accepterCourseV2 } = await import('../base44/shared/dispatchV2.ts');
const { notifierLivreursUnifie } = await import('../base44/shared/dispatchPushUnifie.ts');

const cities = ['ouagadougou', 'bobo-dioulasso'].map(nom => ({ country_code: 'BF', nom, actif: true,
  communes_rattachees: JSON.stringify(nom === 'ouagadougou' ? ['Ouagadougou', 'Saaba'] : ['Bobo-Dioulasso']) }));
const quartiers = [{ country_code: 'BF', ville: 'Ouagadougou', latitude: 12.37, longitude: -1.52 },
  { country_code: 'BF', ville: 'Bobo-Dioulasso', latitude: 11.17, longitude: -4.30 },
  { country_code: 'BF', ville: 'Saaba', latitude: 12.38, longitude: -1.42 }];
const fix = (city = 'bobo', patch = {}) => ({ id: 'driver', user_email: 'driver@example.test', country_code: 'BF', enterprise_id: null,
  type_livreur: 'externe', validation: 'valide', actif: true, statut: 'disponible', ville: city === 'bobo' ? 'Ouagadougou' : 'Bobo-Dioulasso',
  latitude: city === 'bobo' ? 11.17 : 12.37, longitude: city === 'bobo' ? -4.30 : -1.52,
  gps_fix_valid: true, gps_fix_date: new Date().toISOString(), gps_accuracy: 20,
  gps_operational_city: city === 'bobo' ? 'bobo-dioulasso' : 'ouagadougou', ...patch });
const course = (city = 'Bobo-Dioulasso', patch = {}) => ({ id: 'course', country_code: 'BF', enterprise_id: null, ville_depart: city,
  statut: 'recherche_livreur', dispatch_status: 'disponible_push', ...patch });
const reset = () => { invalidateOperationalCityCache(); invalidateQuartierCache(); };
const sdk = (driver, configured = cities) => ({ auth: { me: async () => ({ email: driver.user_email }) }, asServiceRole: { entities: {
  OperationalCity: { filter: async () => configured }, Quartier: { filter: async () => quartiers },
  Livreur: { get: async () => driver, filter: async query => {
    const matched = (!query.gps_operational_city || driver.gps_operational_city === query.gps_operational_city) &&
      driver.country_code === query.country_code && currentGpsFix(driver);
    return matched ? [driver] : [];
  } },
} } });

test('GPS Bobo overrides profile Ouaga; reverse and Saaba use canonical GPS only', async () => {
  reset();
  assert.equal(currentDriverGpsCity(fix(), cities, quartiers), 'bobo-dioulasso');
  assert.equal(currentDriverGpsCity(fix('ouaga'), cities, quartiers), 'ouagadougou');
  assert.equal(currentDriverGpsCity(fix('ouaga', { latitude: 12.38, longitude: -1.42 }), cities, quartiers), 'ouagadougou');
  assert.equal(await getDriverOperationalCity(sdk(fix()), fix()), 'bobo-dioulasso');
  assert.equal((await verifyCityCompatibility(sdk(fix()), course(), fix())).compatible, true);
  assert.equal((await verifyCityCompatibility(sdk(fix()), course('Ouagadougou'), fix())).compatible, false);
});

test('missing, old, future, inaccurate or invalid acquisition proof never falls back to profile', () => {
  for (const patch of [{ gps_fix_valid: false }, { gps_fix_date: null }, { gps_fix_date: 'invalid' },
    { gps_fix_date: new Date(Date.now() - 120001).toISOString() }, { gps_fix_date: new Date(Date.now() + 5000).toISOString() },
    { gps_accuracy: null }, { gps_accuracy: -1 }, { gps_accuracy: 101 }, { gps_accuracy: NaN },
    { latitude: null }, { latitude: 91 }, { longitude: 181 }, { latitude: '' }, { latitude: NaN }]) {
    assert.equal(currentDriverGpsCity(fix('bobo', patch), cities, quartiers), null, JSON.stringify(patch));
  }
  const now = Date.now();
  assert.ok(currentGpsFix(fix('bobo', { gps_fix_date: new Date(now - 120000).toISOString(), gps_accuracy: 100 }), now));
  assert.equal(CITY_GPS_MAX_AGE_MS, 120000);
});

test('native normalization preserves device acquisition time and never invents freshness or precision', () => {
  const source = readFileSync('src/lib/nativeAndroid.js', 'utf8');
  const tree = ts.createSourceFile('native.js', source, ts.ScriptTarget.Latest, true);
  const fn = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'normalizePosition').getText(tree);
  const normalize = new Function('nativeSource', `${fn}; return normalizePosition;`)(() => 'test');
  const base = { latitude: 11.17, longitude: -4.3, accuracy: 20 };
  assert.equal(normalize({ ...base, time: 1234 }).timestamp, 1234, 'background-geolocation time is the real fix time');
  assert.equal(normalize({ ...base, timestamp: 5678 }).timestamp, 5678);
  assert.equal(normalize(base).timestamp, null);
  assert.equal(normalize({ latitude: 11.17, longitude: -4.3 }).accuracy, null);
  assert.equal(normalize({ latitude: null, longitude: null }), null);
  const service = readFileSync('android/app/src/main/java/com/silgapp2/app/SilgappLocationService.java', 'utf8');
  assert.ok(service.includes('\\"gps_timestamp\\":%d'));
  assert.ok(service.includes('location.getTime(),'));
  assert.ok(service.includes('location.getAccuracy()) : "null"'));
});

test('new protected work fails closed while inactive origins and all OFF keep historical eligibility', async () => {
  const unknown = fix('bobo', { gps_fix_valid: false }); reset();
  assert.equal((await verifyCityCompatibility(sdk(unknown), course(), unknown)).compatible, false);
  assert.equal(canSeeOperationalCourse(course(), null, cities, quartiers), false);
  const partiallyActive = cities.map(c => ({ ...c, actif: c.nom === 'ouagadougou' })); reset();
  assert.equal((await verifyCityCompatibility(sdk(unknown, partiallyActive), course(), unknown)).compatible, true);
  assert.equal(canSeeOperationalCourse(course(), null, partiallyActive, quartiers), true);
  const boboOnly = cities.map(c => ({ ...c, actif: c.nom === 'bobo-dioulasso' })); reset();
  assert.equal((await verifyCityCompatibility(sdk(unknown, boboOnly), course(), unknown)).compatible, false, 'Bobo ON is GPS-protected');
  assert.equal((await verifyCityCompatibility(sdk(unknown, boboOnly), course('Ouagadougou'), unknown)).compatible, true, 'Ouaga OFF stays historical');
  assert.equal((await verifyCityCompatibility(sdk(fix(), boboOnly), course(), fix())).compatible, true);
  assert.equal((await verifyCityCompatibility(sdk(fix('ouaga'), boboOnly), course(), fix('ouaga'))).compatible, false);
  assert.equal(canSeeOperationalCourse(course(), null, boboOnly, quartiers), false);
  assert.equal(canSeeOperationalCourse(course('Ouagadougou'), null, boboOnly, quartiers), true);
  reset(); const off = sdk(unknown, cities.map(c => ({ ...c, actif: false })));
  off.asServiceRole.entities.Quartier.filter = async () => { throw Error('OFF must not resolve GPS'); };
  assert.equal((await verifyCityCompatibility(off, course(), unknown)).compatible, true);
  assert.deepEqual(await buildLivreurCityFilter(off, course()), {});
});

test('selection uses expiring GPS index, never a profile-city query', async () => {
  reset(); const filter = await buildLivreurCityFilter(sdk(fix()), course());
  assert.equal(filter.gps_operational_city, 'bobo-dioulasso');
  assert.equal(filter.gps_fix_valid, true); assert.equal(filter.ville, undefined);
  assert.equal(Date.parse(filter.gps_fix_date.$lte) - Date.parse(filter.gps_fix_date.$gte), 120000);
});

test('GPS change after selection is re-read before notification and claim', async () => {
  reset(); const selected = fix(); const current = fix('ouaga'); const api = sdk(current);
  assert.deepEqual(await filterCurrentCityCandidates(api, course(), [selected]), []);
  assert.equal((await verifyCurrentCityAtClaim(api, course(), selected)).compatible, false);
  api.asServiceRole.entities.NotificationToken = { filter: async () => { throw Error('No token lookup for a moved driver'); } };
  assert.equal((await notifierLivreursUnifie(api, course(), [selected])).notified, 0);
  Object.assign(current, fix());
  assert.equal((await filterCurrentCityCandidates(api, course(), [selected])).length, 1);
  assert.equal((await verifyCurrentCityAtClaim(api, course(), selected)).compatible, true);
  current.gps_fix_valid = false;
  assert.equal((await verifyCurrentCityAtClaim(api, course(), selected)).compatible, false);
});

test('fresh candidate verification preserves independent country and enterprise isolation', async () => {
  for (const patch of [{ country_code: 'CI' }, { enterprise_id: 'other' }]) {
    reset(); const current = fix('bobo', patch); const api = sdk(current);
    assert.deepEqual(await filterCurrentCityCandidates(api, course(), [fix()]), []);
    assert.equal((await verifyCurrentCityAtClaim(api, course(), fix())).compatible, false);
  }
  assert.equal(currentDriverGpsCity(fix('bobo', { country_code: 'CI' }), cities, quartiers), null);
  reset(); const off = sdk(fix(), cities.map(c => ({ ...c, actif: false })));
  assert.deepEqual(await filterCurrentCityCandidates(off, course(), [fix('bobo', { country_code: 'CI' }), fix('bobo', { enterprise_id: 'other' })]), []);
});

test('direct Standard acceptance rejects GPS mismatch before any claim; scope checks remain first', async () => {
  for (const [patch, expected] of [[{}, 'city_mismatch'], [{ country_code: 'CI' }, 'country_mismatch'], [{ enterprise_id: 'private' }, 'enterprise_mismatch']]) {
    reset(); const driver = fix('ouaga', patch); const api = sdk(driver); let writes = 0;
    api.asServiceRole.entities.CourseExterne = { get: async () => course(), updateMany: async () => { writes++; return { updated: 1 }; } };
    const result = await accepterCourseV2(api, 'course', 'driver');
    assert.equal(result.reason || result.error, expected); assert.equal(writes, 0);
  }
});

test('already accepted Eco mission is retrievable without valid GPS', async () => {
  reset(); const driver = fix('bobo', { gps_fix_valid: false, statut: 'en_course' }); const api = sdk(driver);
  api.asServiceRole.entities.EcoMission = { get: async () => ({ id: 'mission', status: 'accepted', country_code: 'BF', enterprise_id: null, livreur_id: 'driver', course_ids: ['a', 'b'] }) };
  api.asServiceRole.entities.AppConfig = { filter: async () => [] };
  assert.equal((await acceptEcoMission(api, 'mission', 'driver')).idempotent, true);
});

test('real heartbeat binds city proof to acquisition time; invalid new fixes revoke it', async () => {
  const source = readFileSync('base44/functions/heartbeatAuto/entry.ts', 'utf8');
  const tree = ts.createSourceFile('heartbeat.ts', source, ts.ScriptTarget.Latest, true);
  const body = tree.statements.filter(n => !ts.isImportDeclaration(n)).map(n => n.getText(tree)).join('\n')
    .replaceAll("'../../shared/", "'" + new URL('../base44/shared/', import.meta.url).href);
  const compiled = ts.transpile(body, { target: ts.ScriptTarget.ES2022 });
  let handler;
  const driver = fix('bobo', { statut: 'en_course' }); const api = sdk(driver);
  api.asServiceRole.entities.Livreur.filter = async () => [driver];
  api.asServiceRole.entities.Livreur.update = async (_id, patch) => { Object.assign(driver, patch); return driver; };
  new Function('Deno', 'createClientFromRequest', 'currentGpsFix', 'currentDriverGpsCity', 'gpsFixTime', compiled)(
    { serve: fn => { handler = fn; } }, () => api, currentGpsFix, currentDriverGpsCity, gpsFixTime);
  const invoke = async payload => {
    reset(); const response = await handler(new Request('https://isolated.invalid', { method: 'POST',
      body: JSON.stringify({ user_type: 'livreur', ...payload }) }));
    assert.equal(response.status, 200); return response;
  };
  const acquired = Date.now() - 1000;
  await invoke({ latitude: 11.17, longitude: -4.3, accuracy: 20, gps_timestamp: acquired });
  assert.equal(driver.gps_fix_date, new Date(acquired).toISOString());
  assert.equal(driver.derniere_position_date, new Date(acquired).toISOString(), 'GPS display also uses acquisition, not receipt');
  assert.equal(driver.gps_operational_city, 'bobo-dioulasso');
  assert.equal(driver.ville, 'Ouagadougou', 'profile kept during an existing mission');
  assert.equal(currentDriverGpsCity(driver, cities, quartiers), 'bobo-dioulasso');
  const savedDate = driver.gps_fix_date;
  await invoke({}); assert.equal(driver.gps_fix_date, savedDate, 'heartbeat cannot refresh acquisition');
  for (const patch of [{ latitude: 91 }, { accuracy: 101 }, { accuracy: null }, { gps_timestamp: null },
    { gps_timestamp: Date.now() - 120001 }, { gps_timestamp: Date.now() + 10000 }]) {
    await invoke({ latitude: 11.17, longitude: -4.3, accuracy: 20, gps_timestamp: Date.now(), ...patch });
    assert.equal(driver.gps_fix_valid, false); assert.equal(driver.gps_operational_city, null);
    assert.equal(currentDriverGpsCity(driver, cities, quartiers), null);
  }
});

test('production hook query functions use current GPS and preserve Public/Enterprise isolation', async () => {
  const source = readFileSync('src/hooks/useCoursesDisponibles.js', 'utf8');
  const compiled = ts.transpile(source.replace(/^import .*;\r?\n/gm, '').replace('export function', 'function'), { target: ts.ScriptTarget.ES2022 });
  for (const driver of [fix(), fix('ouaga'), fix('bobo', { gps_fix_valid: false })]) {
    const queries = new Map(); const records = [course(), course('Ouagadougou', { id: 'ouaga' }), course('Bobo-Dioulasso', { id: 'private', enterprise_id: 'private' })];
    const api = { entities: { CourseExterne: { filter: async () => records }, EcoMission: { filter: async () => [] }, Livreur: { get: async () => driver } } };
    const useFeed = new Function('useEffect', 'useMemo', 'useState', 'useQuery', 'useQueryClient', 'base44',
      'cityNamesPattern', 'operationalCityAliases', 'resolveOperationalName', 'canSeeOperationalCourse',
      'currentDriverGpsCity', 'gpsFixTime', 'CITY_GPS_MAX_AGE_MS', 'selectAvailableCourseOffers', `${compiled};return useCoursesDisponibles;`)(
      () => {}, fn => fn(), initial => [typeof initial === 'function' ? initial() : initial, () => {}],
      query => { queries.set(query.queryKey[0], query); if (query.queryKey[0] === 'operational-zone-policy') return { data: { cities, quartiers } };
        if (query.queryKey[0] === 'driver-current-gps') return { data: driver };
        if (query.queryKey[0] === 'courses-externes-disponibles') return { data: records }; return {}; },
      () => ({}), api, cityNamesPattern, operationalCityAliases, resolveOperationalName, canSeeOperationalCourse,
      currentDriverGpsCity, gpsFixTime, CITY_GPS_MAX_AGE_MS, selectAvailableCourseOffers);
    const feed = useFeed(driver);
    assert.deepEqual(feed.eligibleCourses.map(c => c.id), driver.gps_fix_valid ? [driver.latitude === 11.17 ? 'course' : 'ouaga'] : []);
    assert.equal(await queries.get('driver-current-gps').queryFn(), driver);
    assert.ok((await queries.get('courses-externes-disponibles').queryFn()).every(c => c.ville_depart === (driver.latitude === 11.17 ? 'Bobo-Dioulasso' : 'Ouagadougou')) || !driver.gps_fix_valid);
  }
});

test('single-course push guard checks GPS, country and tenant before delivery', async () => {
  const source = readFileSync('base44/functions/envoiNotificationPush/entry.ts', 'utf8');
  const tree = ts.createSourceFile('push.ts', source, ts.ScriptTarget.Latest, true);
  const names = ['normalizeCountryCode', 'countryMismatchPayload', 'assertNotificationCountry'];
  const code = tree.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(tree)).join('\n');
  const guard = new Function('verifyCityCompatibility', `${ts.transpile(code, { target: ts.ScriptTarget.ES2022 })};return assertNotificationCountry;`)(verifyCityCompatibility);
  for (const [patch, expected] of [[{}, 409], [{ country_code: 'CI' }, 403], [{ enterprise_id: 'private' }, 403]]) {
    reset(); const driver = fix('ouaga', patch); const api = sdk(driver);
    api.asServiceRole.entities.CourseExterne = { get: async () => course() };
    const result = await guard(api, { course_id: 'course', livreur_id: 'driver', type: 'nouvelle_course' });
    assert.equal(result.status, expected);
  }
  reset(); const api = sdk(fix()); api.asServiceRole.entities.CourseExterne = { get: async () => course() };
  assert.equal((await guard(api, { course_id: 'course', livreur_id: 'driver', type: 'nouvelle_course' })).ok, true);
  api.asServiceRole.entities.Livreur.get = async () => fix('bobo', { gps_fix_valid: false });
  assert.equal((await guard(api, { course_id: 'course', livreur_id: 'driver', type: 'livraison' })).ok, true, 'accepted-work notices are preserved');
});

test('new-offer popup reuses eligible feed and cancels an old async result after GPS change', async () => {
  const source = readFileSync('src/pages/LivreurExterneApp.jsx', 'utf8');
  const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' && node.arguments[0]?.getText(tree).includes('direct-proposed-course-poll-error')) effect = node.arguments[0].getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.ok(effect);
  const invoke = new Function('livreurId', 'livreurProfil', 'cityEligibleCourses', 'cityEligibleCourseIds', 'base44', 'FINAL_COURSE_STATUSES',
    'isV2Enabled', 'setCourseProposeeDirecte', 'logAcceptationLivreur', 'setInterval', 'clearInterval', `return (${effect})();`);
  const updates = []; let resolveNotification; let selected = {id:'previous-zone-offer'};
  const record = course('Bobo-Dioulasso', { dispatch_status: 'propose' });
  const api = { entities: { CourseExterne: { filter: () => { throw Error('No duplicated course polling'); } },
    DispatchNotification: { filter: () => new Promise(resolve => { resolveNotification = resolve; }) } } };
  const stop = invoke('driver', fix(), [record], new Set(['course']), api, new Set(), true, value => { selected = typeof value === 'function' ? value(selected) : value; updates.push(selected); },
    error => { throw Error(error); }, () => 1, () => {});
  stop(); resolveNotification([{ course_id: 'course' }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(updates, [null], 'old ineligible offer is cleared immediately; a late response cannot reopen it');
});
