// Isolated regression: executes the real hook and backend city guards, never a live SDK.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = process.env.SILGAPP_TEST_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireDependency = createRequire(path.join(root, 'package.json'));
const ts = requireDependency('typescript');
const load = relative => import(pathToFileURL(path.join(root, relative)).href);
const names = await load('base44/shared/cityNames.js');
const gps = await load('base44/shared/currentGpsCity.js');
const { getCourseDepartureCity, invalidateQuartierCache } = await load('base44/shared/cityResolution.ts');
const { invalidateOperationalCityCache } = await load('base44/shared/operationalZones.ts');
const { verifyCityCompatibility, filterCurrentCityCandidates } = await load('base44/shared/cityDispatchFilter.ts');
const offers = await load('src/lib/availableCourseOffers.js');
const subscriptions = await load('src/lib/sharedQuerySubscription.js');
globalThis.fetch = () => { throw Error('Network forbidden in isolated regression'); };
const now = Date.now();
const catalog = [
  { country_code: 'BF', nom: 'ouagadougou', communes_rattachees: '["Ouagadougou","Ouaga","Saaba"]' },
  { country_code: 'BF', nom: 'bobo-dioulasso', communes_rattachees: '["Bobo-Dioulasso","Bobo Dioulasso","Bobo"]' },
];
const quartiers = [
  { country_code: 'BF', actif: true, nom: 'O', ville: 'Ouagadougou', latitude: 12.37, longitude: -1.52 },
  { country_code: 'BF', actif: true, nom: 'B', ville: 'Bobo-Dioulasso', latitude: 11.17, longitude: -4.30 },
  { country_code: 'BF', actif: true, nom: 'S', ville: 'Saaba', ville_operationnelle: 'ouagadougou', latitude: 12.38, longitude: -1.42 },
];
const policy = mask => ({ cities: catalog.map((c, i) => ({ ...c, actif: Boolean(mask & (1 << i)) })), quartiers });
const driver = (zone = 'ouagadougou', patch = {}) => ({ id: 'driver', country_code: 'BF', enterprise_id: null,
  user_email: 'driver@example.test', type_livreur: 'externe', validation: 'valide', actif: true,
  statut: 'disponible', ville: null, gps_fix_valid: true, gps_fix_date: new Date(now).toISOString(), gps_accuracy: 20,
  gps_operational_city: zone, latitude: zone === 'ouagadougou' ? 12.37 : 11.17,
  longitude: zone === 'ouagadougou' ? -1.52 : -4.3, ...patch });
const course = (id, patch = {}) => ({ id, country_code: 'BF', enterprise_id: null, ville_depart: null,
  statut: 'recherche_livreur', dispatch_status: 'disponible_push', delivery_mode: 'standard',
  gps_depart_lat: 12.37, gps_depart_lng: -1.52, ...patch });
const reset = () => { invalidateOperationalCityCache(); invalidateQuartierCache(); };
function matches(row, query) {
  return Object.entries(query).every(([key, wanted]) => {
    const value = row[key];
    if (wanted === null) return value == null;
    if (typeof wanted !== 'object') return value === wanted;
    if ('$in' in wanted) return wanted.$in.includes(value);
    if ('$not' in wanted) return !new RegExp(wanted.$not.$regex, wanted.$not.$options).test(value ?? '');
    if ('$ne' in wanted && value === wanted.$ne) return false;
    if ('$gte' in wanted && !(value >= wanted.$gte)) return false;
    if ('$lte' in wanted && !(value <= wanted.$lte)) return false;
    return true;
  });
}
function backend(p, d) {
  return { asServiceRole: { entities: {
    OperationalCity: { filter: async q => p.cities.filter(c => matches(c, q)) },
    Quartier: { filter: async q => quartiers.filter(c => matches(c, q)) },
    Livreur: { get: async () => d, filter: async q => matches(d, q) ? [d] : [] },
  } } };
}
const hookJS = ts.transpileModule(readFileSync(process.env.SILGAPP_HOOK_SOURCE || path.join(root, 'src/hooks/useCoursesDisponibles.js'), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
async function actualFeed({ p, d = driver(), rows = [], missions = [], dismissed = [], refused = [], policyError = false }) {
  const queries = new Map(), cache = new Map([
    ['dispatch-v2-enabled', true], ['operational-zone-policy', p], ['driver-current-gps', d],
    ['dispatch-refused-courses', refused],
  ]), reads = [];
  const entities = {
    CourseExterne: { filter: async (query, sort, limit) => { reads.push({ name: 'CourseExterne', query, sort, limit }); return rows.filter(r => matches(r, query)).slice(0, limit); } },
    EcoMission: { filter: async query => missions.filter(r => matches(r, query)) },
    OperationalCity: { filter: async query => p.cities.filter(r => matches(r, query)) },
    Quartier: { filter: async (query, sort, limit) => { reads.push({ name: 'Quartier', query, sort, limit }); return quartiers.filter(r => matches(r, query)).slice(0, limit); } },
    Livreur: { get: async () => d },
  };
  const require = name => {
    if (name === 'react') return { useMemo: fn => fn(), useEffect: () => {}, useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}] };
    if (name === '@tanstack/react-query') return { useQueryClient: () => ({}), useQuery: query => {
      const key = query.queryKey[0]; queries.set(key, query);
      return { data: cache.get(key), isLoading: false, isError: key === 'operational-zone-policy' && policyError };
    } };
    if (name === '@/api/base44Client') return { base44: { entities } };
    if (name === '@/lib/availableCourseOffers') return offers;
    if (name === '@/lib/sharedQuerySubscription') return subscriptions;
    if (name.endsWith('cityNames.js')) return names;
    if (name.endsWith('currentGpsCity.js')) return gps;
    throw Error('Unexpected hook dependency ' + name);
  };
  const module = { exports: {} };
  vm.runInNewContext(hookJS, { module, exports: module.exports, require, console, Date, Map, Set,
    localStorage: { getItem: () => JSON.stringify(Object.fromEntries(dismissed.map(id => [id, now]))),
      setItem: () => { throw Error('Unexpected storage write'); } },
  });
  const render = () => module.exports.useCoursesDisponibles(d);
  render();
  for (const key of ['operational-zone-policy', 'courses-externes-disponibles', 'eco-missions-disponibles']) {
    const q = queries.get(key);
    if (q.enabled && !policyError) { cache.set(key, await q.queryFn()); render(); }
  }
  return { result: render(), reads };
}

for (let mask = 0; mask < 4; mask++) {
  test(`feed and backend agree: active mask ${mask} (Ouaga=1, Bobo=2)`, async () => {
    const p = policy(mask);
    const origins = [
      [course('gps-o'), 'ouagadougou'],
      [course('gps-b', { gps_depart_lat: 11.17, gps_depart_lng: -4.3 }), 'bobo-dioulasso'],
      [course('saaba', { ville_depart: ' SAABA ' }), 'ouagadougou'],
      [course('bobo-alias', { ville_depart: 'Bobo Dioulasso' }), 'bobo-dioulasso'],
      [course('stored-wins', { ville_depart: 'Bobo' }), 'bobo-dioulasso'],
      [course('unknown', { gps_depart_lat: null, gps_depart_lng: null }), null],
    ];
    for (const d of [driver(), driver('bobo-dioulasso'), driver('ouagadougou', { gps_fix_valid: false }),
      driver('ouagadougou', { gps_fix_date: new Date(now - 180000).toISOString() })]) {
      const driverZone = gps.currentDriverGpsCity(d, p.cities, p.quartiers);
      for (const [c, origin] of origins) {
        const active = p.cities.some(city => city.actif && city.nom === origin);
        const expected = mask === 0 || Boolean(origin && (!active || driverZone === origin));
        reset(); const api = backend(p, d);
        assert.equal(await getCourseDepartureCity(api, c), origin);
        assert.equal(names.canSeeOperationalCourse(c, driverZone, p.cities, p.quartiers), expected, `${c.id}/${driverZone}`);
        assert.equal((await verifyCityCompatibility(api, c, d)).compatible, expected);
        assert.equal((await filterCurrentCityCandidates(api, c, [d])).length, expected ? 1 : 0);
        const feed = await actualFeed({ p, d, rows: [c] });
        assert.equal(feed.result.eligibleCourses.length, expected ? 1 : 0, `actual hook: ${c.id}/${driverZone}`);
      }
    }
  });
}

test('GPS fallback rejects invalid/far/foreign references and never invents a city from a quartier name', async () => {
  const p = policy(3);
  for (const patch of [{ gps_depart_lat: '' }, { gps_depart_lat: 91 }, { gps_depart_lng: 181 },
    { gps_depart_lat: NaN }, { gps_depart_lat: 40, gps_depart_lng: 40 }, { country_code: 'CI' }]) {
    const c = course('invalid', patch); reset();
    assert.equal(names.canSeeOperationalCourse(c, 'ouagadougou', p.cities, p.quartiers), false);
    assert.equal(await getCourseDepartureCity(backend(p, driver()), c), null);
  }
  const q = [{ country_code: 'BF', actif: true, nom: 'Ouagadougou', latitude: 12.37, longitude: -1.52 }];
  assert.equal(names.canSeeOperationalCourse(course('name-only'), 'ouagadougou', p.cities, q), false);
  assert.equal(names.canSeeOperationalCourse(course('saaba-gps', { gps_depart_lat: 12.38, gps_depart_lng: -1.42 }), 'ouagadougou', p.cities, quartiers), true);
});

test('canonical names and explicit aliases remain required', () => {
  const p = policy(3);
  for (const name of ['OUAGADOUGOU ', 'Ouaga', 'Saaba']) assert.equal(names.resolveOperationalName(name, p.cities, quartiers), 'ouagadougou');
  for (const name of ['Bobo', 'Bobo Dioulasso', ' BOBO-DIOULASSO ']) assert.equal(names.resolveOperationalName(name, p.cities, quartiers), 'bobo-dioulasso');
  assert.equal(names.resolveOperationalName('Ouaga', [], []), 'ouaga', 'no invented alias');
});

test('actual feed preserves country/tenant, refusal and Admin-blocked visibility/acceptability separation', async () => {
  for (const mask of [0, 2, 3]) {
    const p = policy(mask), rows = [course('allowed'), course('local-refusal'), course('server-refusal'),
      course('foreign', { country_code: 'CI' }), course('enterprise', { enterprise_id: 'E' })];
    const f = await actualFeed({ p, rows, dismissed: ['local-refusal'], refused: ['server-refusal'],
      d: driver('ouagadougou', { actif: false, admin_hors_ligne: true }) });
    assert.deepEqual(Array.from(f.result.eligibleCourses, c => c.id), ['allowed']);
    assert.equal(f.result.livreurPeutVoirFil, true); assert.equal(f.result.livreurDisponible, false);
    const privateFeed = await actualFeed({ p, rows, d: driver('ouagadougou', { enterprise_id: 'E' }) });
    assert.deepEqual(Array.from(privateFeed.result.eligibleCourses, c => c.id), ['enterprise']);
    reset();
    assert.deepEqual(await filterCurrentCityCandidates(backend(p, driver()), course('allowed'),
      [driver('ouagadougou', { country_code: 'CI' }), driver('ouagadougou', { enterprise_id: 'E' })]), []);
  }
});

test('Standard, isolated Eco and every grouped parcel use the same resolved-origin rule', async () => {
  for (const mask of [0, 1, 2, 3]) {
    const p = policy(mask), members = ['a','b'].map(id => course(id, { delivery_mode: 'eco', eco_status: 'grouped',
      eco_mission_id: 'm', dispatch_status: 'en_attente' }));
    const isolated = course('isolated', { delivery_mode: 'eco', eco_status: 'isolated', dispatch_status: 'en_attente' });
    const mission = { id: 'm', status: 'available', country_code: 'BF', enterprise_id: null, course_ids: ['a','b'] };
    const f = await actualFeed({ p, rows: [course('standard'), isolated, ...members], missions: [mission] });
    assert.deepEqual(Array.from(f.result.eligibleCourses, c => c.id).sort(), ['isolated','standard']);
    assert.equal(f.result.ecoMissions.length, 1);
    const hidden = await actualFeed({ p, rows: [course('standard'), members[0], { ...members[1], gps_depart_lat: null, gps_depart_lng: null }], missions: [mission] });
    assert.equal(hidden.result.ecoMissions.length, mask ? 0 : 1, 'one unresolved parcel hides the entire mission ON');
    assert.deepEqual(Array.from(hidden.result.eligibleCourses, c => c.id), ['standard']);
    const refused = await actualFeed({ p, rows: members, missions: [mission], refused: ['b'] });
    assert.equal(refused.result.ecoMissions.length, 0);
    if (mask) {
      const read = f.reads.find(r => r.name === 'Quartier');
      assert.equal(read.sort, 'nom'); assert.equal(read.limit, 500, 'same ordered reference window as backend');
    }
  }
});

test('policy read failure cannot masquerade as all cities OFF', async () => {
  const f = await actualFeed({ p: policy(0), rows: [course('standard')], policyError: true });
  assert.equal(f.result.eligibleCourses.length, 0); assert.equal(f.result.isError, true);
});
