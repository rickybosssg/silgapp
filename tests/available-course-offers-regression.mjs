import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { isEcoDeliveryCourse, selectAvailableCourseOffers as select } from '../src/lib/availableCourseOffers.js';
import { acquireQuerySubscription, createRealtimeRefresh } from '../src/lib/sharedQuerySubscription.js';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const eco = (id, extra = {}) => ({ id, country_code: 'BF', enterprise_id: null, delivery_mode: 'eco',
  eco_status: 'grouped', eco_mission_id: 'm', dispatch_status: 'en_attente',
  statut: 'recherche_livreur', prix_final: id === 'a' ? 1000 : 1500, ...extra });
const standard = (id, extra = {}) => eco(id, { delivery_mode: 'standard', eco_status: 'none',
  eco_mission_id: null, dispatch_status: 'disponible_push', ...extra });
const mission = (members = [eco('a'), eco('b')], extra = {}) => ({ id: 'm', status: 'available',
  country_code: 'BF', enterprise_id: null, course_ids: members.map(c => c.id),
  total_price: 2500, __available_courses: members, ...extra });
const pick = (courses, missions, extra = {}) => select({ courses, missions, countryCode: 'BF', ...extra });
function unique(result) {
  const ids = result.offers.flatMap(offer => offer.courses.map(c => c.id));
  assert.equal(new Set(ids).size, ids.length, 'no course id appears in two rendered offers');
  assert.equal(result.count, result.individualCourses.length + result.missions.length);
}
test('a valid two-parcel mission replaces its individual rows and counts once', () => {
  const r = pick([eco('a'), eco('b')], [mission()]); unique(r);
  assert.equal(r.count, 1); assert.equal(r.individualCourses.length, 0); assert.equal(r.missions[0].total_price, 2500);
});
test('independent Standard ids with the same route/prices are preserved', () => {
  const courses = [standard('independent-a', { prix_final: 1000 }), standard('independent-b', { prix_final: 1500 })];
  const r = pick(courses, [mission()]); unique(r);
  assert.equal(r.count, 3); assert.deepEqual(r.individualCourses.map(c => c.id), courses.map(c => c.id));
});
test('a legacy mission referencing real Standard courses cannot turn them into Eco', () => {
  const members = [standard('a'), standard('b')], r = pick(members, [mission(members)]); unique(r);
  assert.equal(r.missions.length, 0); assert.equal(r.individualCourses.length, 2);
  assert.ok(r.individualCourses.every(c => !isEcoDeliveryCourse(c)));
});
test('duplicated API records and duplicate mission rows render one representation', () => {
  const r = pick([eco('a'), eco('a'), eco('b')], [mission(), mission()]); unique(r); assert.equal(r.count, 1);
});
for (const extra of [{ status: 'accepted' }, { livreur_id: 'another-driver' }, { country_code: 'CI' },
  { enterprise_id: 'private' }, { course_ids: ['a', 'a'] }, { course_ids: ['a', 'missing'] }]) {
  test('inconsistent mission is not offered: ' + JSON.stringify(extra), () => {
    const r = pick([standard('a'), standard('b')], [mission(undefined, extra)]); unique(r);
    assert.equal(r.missions.length, 0); assert.equal(r.individualCourses.length, 2);
  });
}
test('converted Standard with a newer version survives an older mission snapshot', () => {
  const old = [eco('a', { updated_date: '2026-10-14T10:00:00Z' }), eco('b')];
  const r = pick([standard('a', { updated_date: '2026-10-14T11:00:00Z' })], [mission(old)]); unique(r);
  assert.equal(r.missions.length, 0); assert.equal(r.individualCourses[0].delivery_mode, 'standard');
});
test('fresh grouped records supersede older individual cache snapshots without double cards', () => {
  const members = [eco('a', { updated_date: '2026-10-14T11:00:00Z' }), eco('b', { updated_date: '2026-10-14T11:00:00Z' })];
  const old = [standard('a', { updated_date: '2026-10-14T10:00:00Z' }), standard('b', { updated_date: '2026-10-14T10:00:00Z' })];
  const r = pick(old, [mission(members)]); unique(r); assert.equal(r.count, 1); assert.equal(r.individualCourses.length, 0);
});
test('unknown conflicting versions preserve Standard rather than guessing a conversion', () => {
  const r = pick([standard('a'), standard('b')], [mission()]); unique(r);
  assert.equal(r.missions.length, 0); assert.equal(r.individualCourses.length, 2);
});
test('country, tenant, refusals and assigned members stay isolated', () => {
  assert.equal(pick([standard('foreign', { country_code: 'CI' })], []).count, 0);
  assert.equal(pick([standard('private', { enterprise_id: 'private' })], []).count, 0);
  assert.equal(pick([standard('private', { enterprise_id: 'private' })], [mission()], { enterpriseId: 'private' }).count, 1);
  assert.equal(pick([], [mission()], { refusedIds: ['a'] }).count, 0);
  assert.equal(pick([], [mission([eco('a', { livreur_id: 'assigned' }), eco('b')])]).count, 0);
});
test('selection does not mutate modes, prices, commissions, accepted work or input records', () => {
  const courses = [standard('s', { commission_locked: true, commission_amount: 0, prix_final: 1000 })], missions = [mission()];
  const before = JSON.stringify({ courses, missions }); pick(courses, missions);
  assert.equal(JSON.stringify({ courses, missions }), before);
});
test('mode classification matches the actual backend normalizer', () => {
  const file = read('base44/shared/ecoOptimizationEngine.ts'), tree = ts.createSourceFile('engine.ts', file, ts.ScriptTarget.Latest, true);
  const fn = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'normalizeDeliveryMode');
  const js = ts.transpileModule(fn.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const normalize = vm.runInNewContext(js + '; normalizeDeliveryMode;');
  for (const value of ['eco', 'ECO', 'standard', 'eco ', '', null, undefined]) {
    assert.equal(isEcoDeliveryCourse({ delivery_mode: value }), normalize(value) === 'eco');
  }
});
function actualHook(courses, missions, options = {}) {
  const queries = [], effects = [], events = new Map(), invalidations = [], reads = [];
  const records = missions.flatMap(m => m.__available_courses || []);
  const entities = options.entities || new Proxy({}, { get: (_, name) => ({
    subscribe: cb => { events.set(name, cb); return () => {}; },
    filter: async filter => { reads.push({ entity: name, filter }); return name === 'EcoMission' ? missions : name === 'CourseExterne' ? records : []; },
  }) });
  const queryClient = options.queryClient || { invalidateQueries: value => invalidations.push(value) };
  const require = name => {
    if (name === 'react') return { useMemo: fn => fn(), useEffect: fn => effects.push(fn),
      useState: value => [typeof value === 'function' ? value() : value, () => {}] };
    if (name === '@tanstack/react-query') return { useQueryClient: () => queryClient,
      useQuery: config => { queries.push(config); const key = config.queryKey[0];
        return { data: key === 'dispatch-v2-enabled' ? true : key === 'operational-zone-policy' ? { cities: options.activeCity ? [{ nom: 'ouagadougou', actif: true }] : [], quartiers: [] }
          : key === 'courses-externes-disponibles' ? courses : key === 'eco-missions-disponibles' ? missions : [], isLoading: false, isError: false }; } };
    if (name === '@/api/base44Client') return { base44: { entities } };
    if (name === '@/lib/availableCourseOffers') return { selectAvailableCourseOffers: select };
    if (name === '@/lib/sharedQuerySubscription') return { acquireQuerySubscription, createRealtimeRefresh };
    if (name.endsWith('cityNames.js')) return { canSeeOperationalCourse: () => true, operationalCityAliases: () => [] };
    if (name.endsWith('currentGpsCity.js')) return { currentDriverGpsCity: () => null, gpsFixTime: Date.parse, CITY_GPS_MAX_AGE_MS: 120000 };
    throw Error('Unexpected actual-hook import: ' + name);
  };
  const module = { exports: {} };
  const context = { module, exports: module.exports, require, Date, Set, Map, console,
    localStorage: { getItem: () => null }, window: { addEventListener: () => {}, removeEventListener: () => {} } };
  const js = ts.transpileModule(read('src/hooks/useCoursesDisponibles.js'),
    { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, context);
  const result = module.exports.useCoursesDisponibles({ id: 'driver-fixture', country_code: options.countryCode || 'BF', enterprise_id: null,
    type_livreur: 'externe', validation: 'valide', actif: true, statut: 'disponible' });
  return { result, queries, effects, events, invalidations, reads };
}
test('actual shared hook gives feed and badges the same nonduplicated offers', () => {
  const f = actualHook([eco('a', { dispatch_status: 'disponible_push' }), eco('b', { dispatch_status: 'disponible_push' }), standard('s')], [mission()]);
  assert.equal(f.result.eligibleCourses.length, 1); assert.equal(f.result.ecoMissions.length, 1);
  assert.equal(f.result.availableOffersCount, 2); unique({ ...f.result, offers: f.result.availableOffers,
    individualCourses: f.result.eligibleCourses, missions: f.result.ecoMissions, count: f.result.availableOffersCount });
});
test('all cities OFF still rereads mission members; this is membership validation, not geographic activation', async () => {
  const f = actualHook([], [mission()]); const query = f.queries.find(q => q.queryKey[0] === 'eco-missions-disponibles');
  const result = await query.queryFn();
  assert.equal(result[0].__available_courses.length, 2);
  assert.equal(f.reads.filter(row => row.entity === 'CourseExterne').length, 1);
  assert.equal(query.queryKey.at(-1), 'members-v2');
});
test('actual shared hook invalidates both course and mission snapshots on either entity event', async () => {
  const f = actualHook([], []);
  for (const effect of f.effects) effect();
  for (const entity of ['CourseExterne', 'EcoMission']) {
    f.invalidations.length = 0; f.events.get(entity)({ type: 'update' });
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.ok(f.invalidations.some(x => x.queryKey[0] === 'courses-externes-disponibles'));
    assert.ok(f.invalidations.some(x => x.queryKey[0] === 'eco-missions-disponibles'));
  }
});
test('UI uses shared count/current members and never labels or accepts a standalone Eco as Standard', () => {
  const feed = read('src/components/livreur/CoursesDisponibles.jsx');
  assert.ok(feed.includes('{availableOffersCount}'));
  assert.ok(feed.includes('isEco ? "Course Eco" : "Course Standard"'));
  assert.ok(feed.includes('availableCourses={mission.__available_courses}'));
  assert.ok(feed.includes('{isEco ? ('));
  assert.ok(read('src/pages/LivreurExterneApp.jsx').includes('availableOffersCount: availableCoursesCount'));
  assert.ok(read('src/components/livreur/ActiviteTempsReel.jsx').includes('return availableOffers'));
});

test('fresh Standard conversion replaces an older Eco row even when its old mission is now invalid', () => {
  const old = eco('a', { updated_date: '2026-10-14T10:00:00Z' });
  const fresh = standard('a', { updated_date: '2026-10-14T11:00:00Z' });
  const r = pick([old], [mission([fresh, eco('b')])]); unique(r);
  assert.equal(r.missions.length, 0); assert.equal(r.individualCourses[0].delivery_mode, 'standard');
});
test('an assignment newer than an individual cache entry removes that obsolete offer', () => {
  const old = standard('a', { updated_date: '2026-10-14T10:00:00Z' });
  const fresh = eco('a', { livreur_id: 'assigned', updated_date: '2026-10-14T11:00:00Z' });
  assert.equal(pick([old], [mission([fresh, eco('b')])]).count, 0);
});

function renderActualFeed(courses, missions) {
  const shared = actualHook(courses, missions).result;
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: value => [value, () => {}], useEffect: () => {}, useMemo: fn => fn(), useRef: value => ({ current: value }) };
  const require = name => {
    if (name === 'react') return react;
    if (name === '@tanstack/react-query') return { useQueryClient: () => ({ invalidateQueries: () => {} }) };
    if (name === '@/api/base44Client') return { base44: { functions: { invoke: () => { throw Error('No production call in render'); } } } };
    if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
    if (name === 'sonner') return { toast: {} };
    if (name === '@/lib/livreurUrgentAlert') return { startUrgentCourseAlert: () => { throw Error('No real alert'); }, stopUrgentCourseAlert: () => {} };
    if (name === '@/utils/getPrixAffichable') return { getPrixAffichable: course => Number(course.prix_final || 0) };
    if (name === '@/hooks/useCoursesDisponibles') return { useCoursesDisponibles: () => shared };
    if (name === '@/components/livreur/EcoMissionCard') return { __esModule: true, default: 'EcoMissionCard' };
    if (name === '@/lib/availableCourseOffers') return { isEcoDeliveryCourse };
    throw Error('Unexpected feed import ' + name);
  };
  const module = { exports: {} };
  const js = ts.transpileModule(read('src/components/livreur/CoursesDisponibles.jsx'), { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require, React: react, Date, Set, Map, Math, Number });
  const node = module.exports.default({ livreurProfil: { id: 'driver-fixture', country_code: 'BF' } });
  const all = [], words = [];
  const visit = value => { if (Array.isArray(value)) value.forEach(visit); else if (typeof value === 'string' || typeof value === 'number') words.push(String(value));
    else if (value && typeof value === 'object') { all.push(value); visit(value.props?.children); } };
  visit(node); return { all, text: words.join(' '), shared };
}
test('actual feed renders one mission for its two course ids, one real Standard and the shared badge', () => {
  const f = renderActualFeed([eco('a'), eco('b'), standard('independent')], [mission()]);
  const cards = f.all.filter(node => node.type === 'EcoMissionCard');
  assert.equal(cards.length, 1); assert.deepEqual(cards[0].props.availableCourses.map(course => course.id), ['a', 'b']);
  assert.equal(f.all.filter(node => node.type === 'div' && ['a', 'b'].includes(node.props.key)).length, 0);
  assert.equal(f.all.filter(node => node.type === 'div' && node.props.key === 'independent').length, 1);
  const badge = f.all.find(node => node.type === 'span' && String(node.props.className).includes('min-w-8'));
  assert.deepEqual(Array.from(badge.props.children), [2]); assert.equal(f.shared.availableOffersCount, 2);
});
test('actual feed keeps independent Standards with identical price/route as two cards', () => {
  const f = renderActualFeed([standard('one', { prix_final: 1000, quartier_depart: 'same', quartier_arrivee: 'same' }),
    standard('two', { prix_final: 1000, quartier_depart: 'same', quartier_arrivee: 'same' })], []);
  assert.equal(f.all.filter(node => node.type === 'EcoMissionCard').length, 0);
  assert.equal(f.all.filter(node => node.type === 'div' && ['one', 'two'].includes(node.props.key)).length, 2);
  assert.equal(f.text.match(/Course Standard/g)?.length, 2);
});
test('actual feed never renders a Standard acceptance button for standalone Eco', () => {
  const f = renderActualFeed([eco('isolated', { eco_status: 'isolated', eco_mission_id: null })], []);
  assert.ok(f.text.includes('Course Eco')); assert.ok(f.text.includes('regroupement'));
  assert.equal(f.text.includes('Course Standard'), false); assert.equal(f.text.includes('Accepter la course'), false);
  assert.equal(f.all.filter(node => node.type === 'button').length, 1, 'only refusal remains, no solo Eco claim');
});

test('three-member mission remains visible as in 139; frontend does not invent a product limit', () => {
  const members = [eco('a'), eco('b'), eco('c')];
  const r = pick([standard('independent')], [mission(members)]);
  unique(r); assert.equal(r.missions.length, 1); assert.equal(r.count, 2);
  assert.equal(r.missions[0].__available_courses.length, 3);
  assert.equal(r.individualCourses[0].id, 'independent');
  const backend = read('base44/shared/ecoOptimizationEngine.ts');
  assert.ok(backend.includes("courseIds.length !== 2 || new Set(courseIds).size !== 2"));
  // This existing server conflict is reported, not relaxed in a presentation fix.
  const unsafe = pick([], [mission([eco('a'), eco('b'), eco('c', { country_code: 'CI' })])]);
  assert.equal(unsafe.count, 0, 'all members still undergo isolation checks');
});

test('simultaneous actual hook observers share feed/policy subscriptions and preserve final-owner cleanup', async () => {
  const active = new Map(), opened = new Map(), invalidations = [];
  const entities = new Proxy({}, { get: (_, name) => ({ subscribe: callback => {
    opened.set(name, (opened.get(name) || 0) + 1);
    if (!active.has(name)) active.set(name, new Set());
    active.get(name).add(callback); return () => active.get(name).delete(callback);
  } }) });
  const queryClient = { invalidateQueries: value => invalidations.push(value) };
  const mount = (countryCode = 'BF') => actualHook([], [], { queryClient, entities, countryCode, activeCity: true }).effects.map(effect => effect()).filter(Boolean);
  const first = mount(), second = mount();
  for (const name of ['CourseExterne', 'EcoMission', 'OperationalCity', 'Quartier', 'Livreur']) assert.equal(opened.get(name), 1, name);
  active.get('CourseExterne').forEach(callback => callback({ type: 'update' }));
  await new Promise(resolve => setTimeout(resolve, 130));
  assert.equal(invalidations.length, 2, 'one invalidation for each feed snapshot');
  first.forEach(cleanup => cleanup()); assert.equal(active.get('CourseExterne').size, 1);
  const otherCountry = mount('CI'); assert.equal(active.get('CourseExterne').size, 2);
  second.forEach(cleanup => cleanup()); assert.equal(active.get('CourseExterne').size, 1);
  invalidations.length = 0; active.get('CourseExterne').forEach(callback => callback({ type: 'update' }));
  await new Promise(resolve => setTimeout(resolve, 130));
  assert.equal(invalidations.length, 2);
  assert.ok(invalidations.every(value => value.queryKey[2] === 'CI'), 'old country releases its callbacks');
  otherCountry.forEach(cleanup => cleanup());
  for (const callbacks of active.values()) assert.equal(callbacks.size, 0);
});

function renderActualActivity(shared, profile) {
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useMemo: fn => fn() };
  const priceTree = ts.createSourceFile('priceEstimate.js', read('src/lib/priceEstimate.js'), ts.ScriptTarget.Latest, true);
  const distanceFn = priceTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'haversineKm');
  const haversineKm = vm.runInNewContext(distanceFn.getText(priceTree).replace('export ', '') + ';haversineKm;');
  const require = name => {
    if (name === 'react') return react;
    if (name === '@tanstack/react-query') return { useQuery: () => ({}) };
    if (name === '@/api/base44Client') return { base44: {} };
    if (name === '@/hooks/useCoursesDisponibles') return { useCoursesDisponibles: () => shared };
    if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
    if (name === '@/lib/priceEstimate') return { haversineKm };
    if (name === '@/lib/dispatchRules') return { hasValidGPS: () => false };
    throw Error('Unexpected activity import ' + name);
  };
  const module = { exports: {} };
  const js = ts.transpileModule(read('src/components/livreur/ActiviteTempsReel.jsx'), { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require });
  const node = module.exports.default({ livreurProfil: profile, isExterne: true });
  const all = [], words = [];
  const visit = value => { if (Array.isArray(value)) value.forEach(visit); else if (typeof value === 'string' || typeof value === 'number') words.push(String(value));
    else if (value && typeof value === 'object') { all.push(value); visit(value.props?.children); } };
  visit(node); return { all, text: words.join(' ') };
}

test('actual hook releases a partially opened subscription group and allows retry after setup failure', () => {
  let fail = true; const active = new Map(), queryClient = { invalidateQueries: () => {} };
  const entities = new Proxy({}, { get: (_, name) => ({ subscribe: callback => {
    if (name === 'EcoMission' && fail) { fail = false; throw Error('synthetic subscription failure'); }
    if (!active.has(name)) active.set(name, new Set());
    active.get(name).add(callback); return () => active.get(name).delete(callback);
  } }) });
  const cleanup = [];
  assert.throws(() => {
    for (const effect of actualHook([], [], { queryClient, entities }).effects) {
      const release = effect(); if (release) cleanup.push(release);
    }
  }, /synthetic/);
  assert.equal(active.get('CourseExterne').size, 0, 'first listener was released when the second failed');
  cleanup.forEach(release => release());
  const retry = actualHook([], [], { queryClient, entities }).effects.map(effect => effect()).filter(Boolean);
  assert.equal(active.get('CourseExterne').size, 1); assert.equal(active.get('EcoMission').size, 1);
  retry.forEach(release => release()); for (const callbacks of active.values()) assert.equal(callbacks.size, 0);
});

test('actual activity count matches shared offers with missing driver or pickup GPS; closest display stays distance-only', () => {
  const shared = actualHook([standard('s')], [mission()]).result;
  for (const profile of [{ country_code: 'BF' }, { country_code: 'BF', latitude: 12.3, longitude: -1.5 }]) {
    const f = renderActualActivity(shared, profile);
    assert.ok(f.text.includes('2 courses disponibles.'));
    const count = f.all.find(node => node.type === 'p' && String(node.props.className).includes('text-xl font-black leading-none'));
    assert.deepEqual(Array.from(count.props.children), [shared.availableOffersCount]);
    assert.equal(f.text.includes('Plus proche:'), false);
  }
  const withCoordinates = actualHook([standard('s', { gps_depart_lat: 12.31, gps_depart_lng: -1.51 })], []).result;
  const nearest = renderActualActivity(withCoordinates, { country_code: 'BF', latitude: 12.3, longitude: -1.5 });
  assert.ok(nearest.text.includes('1 course disponible.')); assert.ok(nearest.text.includes('Plus proche:'));
});
