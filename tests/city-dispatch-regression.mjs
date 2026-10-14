// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE NON-RÉGRESSION — DISPATCH PAR VILLE
// ═══════════════════════════════════════════════════════════════════════════
// Vérifie que le filtrage par ville fonctionne correctement sans régression.
// ═══════════════════════════════════════════════════════════════════════════

import assert from 'assert';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── Mock SDK ──
function createMockBase44(courseCity = 'ouagadougou', livreurCity = 'ouagadougou', flagEnabled = false) {
  const courses = new Map();
  const livreurs = new Map();
  const configs = new Map();
  const quartiers = new Map();

  // Quartiers de test
  const qData = [
    { id: 'q1', country_code: 'BF', ville: 'Ouagadougou', nom: 'Gounghin', latitude: 12.37, longitude: -1.52, actif: true },
    { id: 'q2', country_code: 'BF', ville: 'Ouagadougou', nom: 'Patte d\'Oie', latitude: 12.35, longitude: -1.50, actif: true },
    { id: 'q3', country_code: 'BF', ville: 'Bobo-Dioulasso', nom: 'Secteur 1', latitude: 11.17, longitude: -4.30, actif: true },
    { id: 'q4', country_code: 'BF', ville: 'Bobo-Dioulasso', nom: 'Secteur 2', latitude: 11.18, longitude: -4.28, actif: true },
  ];
  for (const q of qData) quartiers.set(q.id, q);

  // Configs
  if (flagEnabled) {
    configs.set('CITY_DISPATCH_ENABLED:BF', { cle: 'CITY_DISPATCH_ENABLED:BF', valeur: 'true' });
  }

  // OperationalCity (nouveau système de zones opérationnelles)
  const opCities = new Map();
  if (flagEnabled) {
    const opCityName = courseCity === 'ouagadougou' ? 'ouagadougou' : courseCity === 'bobo' ? 'bobo-dioulasso' : courseCity;
    opCities.set(opCityName, { id: 'oc1', country_code: 'BF', nom: opCityName, nom_affichage: opCityName, actif: true });
  }

  // Course de test
  courses.set('course-1', {
    id: 'course-1',
    country_code: 'BF',
    ville_depart: courseCity === 'ouagadougou' ? 'Ouagadougou' : courseCity === 'bobo' ? 'Bobo-Dioulasso' : null,
    gps_depart_lat: courseCity === 'ouagadougou' ? 12.37 : 11.17,
    gps_depart_lng: courseCity === 'ouagadougou' ? -1.52 : -4.30,
    enterprise_id: null,
    statut: 'recherche_livreur',
    dispatch_status: 'disponible_push',
  });

  // Livreur de test
  livreurs.set('livreur-1', {
    id: 'livreur-1',
    country_code: 'BF',
    ville: livreurCity === 'ouagadougou' ? 'Ouagadougou' : livreurCity === 'bobo' ? 'Bobo-Dioulasso' : null,
    latitude: livreurCity === 'ouagadougou' ? 12.36 : 11.17,
    longitude: livreurCity === 'ouagadougou' ? -1.51 : -4.30,
    derniere_position_date: new Date().toISOString(),
    enterprise_id: null,
    type_livreur: 'externe',
    validation: 'valide',
    actif: true,
    statut: 'disponible',
    bloque_encours: false,
    manual_hors_ligne: false,
    admin_hors_ligne: false,
  });

  return {
    asServiceRole: {
      entities: {
        CourseExterne: {
          get: async (id) => courses.get(id) || null,
          filter: async (query) => {
            let results = [...courses.values()];
            if (query?.country_code) results = results.filter(c => c.country_code === query.country_code);
            if (query?.ville_depart?.$regex) {
              const pattern = new RegExp(query.ville_depart.$regex, query.ville_depart.$options || '');
              results = results.filter(c => c.ville_depart && pattern.test(c.ville_depart));
            }
            return results;
          },
        },
        Livreur: {
          get: async (id) => livreurs.get(id) || null,
          filter: async (query) => {
            let results = [...livreurs.values()];
            if (query?.country_code) results = results.filter(l => l.country_code === query.country_code);
            if (query?.ville?.$regex) {
              const pattern = new RegExp(query.ville.$regex, query.ville.$options || '');
              results = results.filter(l => l.ville && pattern.test(l.ville));
            }
            return results;
          },
        },
        AppConfig: {
          filter: async (query) => {
            let results = [...configs.values()];
            if (query?.cle) {
              if (query.cle.$in) {
                results = results.filter(c => query.cle.$in.includes(c.cle));
              } else {
                results = results.filter(c => c.cle === query.cle);
              }
            }
            return results;
          },
        },
        OperationalCity: {
          filter: async (query) => {
            let results = [...opCities.values()];
            if (query?.country_code) results = results.filter(c => c.country_code === query.country_code);
            if (query?.actif !== undefined) results = results.filter(c => c.actif === query.actif);
            return results;
          },
        },
        Quartier: {
          filter: async (query) => {
            let results = [...quartiers.values()];
            if (query?.country_code) results = results.filter(q => q.country_code === query.country_code);
            if (query?.actif !== undefined) results = results.filter(q => q.actif === query.actif);
            return results;
          },
        },
      },
    },
  };
}

// ── Tests ──

test('1 — normalizeCityName normalise correctement', async () => {
  const { normalizeCityName } = await import('../base44/shared/cityResolution.ts');
  assert.strictEqual(normalizeCityName('Ouagadougou'), 'ouagadougou');
  assert.strictEqual(normalizeCityName(' OUAGADOUGOU '), 'ouagadougou');
  assert.strictEqual(normalizeCityName('Bobo-Dioulasso'), 'bobo-dioulasso');
  assert.strictEqual(normalizeCityName(null), null);
  assert.strictEqual(normalizeCityName(''), null);
});

test('2 — Feature flag OFF par défaut', async () => {
  const { isCityDispatchEnabled } = await import('../base44/shared/cityResolution.ts');
  const base44 = createMockBase44();
  const enabled = await isCityDispatchEnabled(base44, 'BF');
  assert.strictEqual(enabled, false, 'Le feature flag doit être OFF par défaut');
});

test('3 — Feature flag ON quand configuré', async () => {
  const { isCityDispatchEnabled, invalidateCityFlagCache } = await import('../base44/shared/cityResolution.ts');
  invalidateCityFlagCache('BF');
  const base44 = createMockBase44('ouagadougou', 'ouagadougou', true);
  const enabled = await isCityDispatchEnabled(base44, 'BF');
  assert.strictEqual(enabled, true, 'Le feature flag doit être ON quand configuré');
  invalidateCityFlagCache('BF');
});

test('4 — resolveCityFromGPS trouve Ouagadougou', async () => {
  const { resolveCityFromGPS, invalidateQuartierCache } = await import('../base44/shared/cityResolution.ts');
  invalidateQuartierCache('BF');
  const base44 = createMockBase44();
  const city = await resolveCityFromGPS(base44, 12.37, -1.52, 'BF');
  assert.strictEqual(city, 'ouagadougou', 'Doit résoudre Ouagadougou');
  invalidateQuartierCache('BF');
});

test('5 — resolveCityFromGPS trouve Bobo-Dioulasso', async () => {
  const { resolveCityFromGPS, invalidateQuartierCache } = await import('../base44/shared/cityResolution.ts');
  invalidateQuartierCache('BF');
  const base44 = createMockBase44();
  const city = await resolveCityFromGPS(base44, 11.17, -4.30, 'BF');
  assert.strictEqual(city, 'bobo-dioulasso', 'Doit résoudre Bobo-Dioulasso');
  invalidateQuartierCache('BF');
});

test('6 — resolveCityFromGPS retourne null si trop loin', async () => {
  const { resolveCityFromGPS, invalidateQuartierCache } = await import('../base44/shared/cityResolution.ts');
  invalidateQuartierCache('BF');
  const base44 = createMockBase44();
  const city = await resolveCityFromGPS(base44, 0, 0, 'BF');
  assert.strictEqual(city, null, 'Doit retourner null si trop loin');
  invalidateQuartierCache('BF');
});

test('7 — getDriverOperationalCity utilise ville du profil', async () => {
  const { getDriverOperationalCity } = await import('../base44/shared/cityResolution.ts');
  const base44 = createMockBase44();
  const livreur = { country_code: 'BF', ville: 'Ouagadougou', latitude: 0, longitude: 0, derniere_position_date: new Date().toISOString() };
  const city = await getDriverOperationalCity(base44, livreur);
  assert.strictEqual(city, 'ouagadougou');
});

test('8 — getDriverOperationalCity résout depuis GPS si ville vide', async () => {
  const { getDriverOperationalCity, invalidateQuartierCache } = await import('../base44/shared/cityResolution.ts');
  invalidateQuartierCache('BF');
  const base44 = createMockBase44();
  const livreur = { country_code: 'BF', ville: null, latitude: 12.37, longitude: -1.52, derniere_position_date: new Date().toISOString() };
  const city = await getDriverOperationalCity(base44, livreur);
  assert.strictEqual(city, 'ouagadougou');
  invalidateQuartierCache('BF');
});

test('9 — getDriverOperationalCity retourne null si GPS ancien', async () => {
  const { getDriverOperationalCity } = await import('../base44/shared/cityResolution.ts');
  const base44 = createMockBase44();
  const oldDate = new Date(Date.now() - 20 * 60000).toISOString();
  const livreur = { country_code: 'BF', ville: null, latitude: 12.37, longitude: -1.52, derniere_position_date: oldDate };
  const city = await getDriverOperationalCity(base44, livreur);
  assert.strictEqual(city, null, 'GPS ancien ne doit pas résoudre la ville');
});

test('10 — areCitiesCompatible : mêmes villes → true', async () => {
  const { areCitiesCompatible } = await import('../base44/shared/cityResolution.ts');
  assert.strictEqual(areCitiesCompatible('ouagadougou', 'ouagadougou'), true);
});

test('11 — areCitiesCompatible : villes différentes → false', async () => {
  const { areCitiesCompatible } = await import('../base44/shared/cityResolution.ts');
  assert.strictEqual(areCitiesCompatible('ouagadougou', 'bobo-dioulasso'), false);
});

test('12 — areCitiesCompatible : ville nulle → true (graceful degradation)', async () => {
  const { areCitiesCompatible } = await import('../base44/shared/cityResolution.ts');
  assert.strictEqual(areCitiesCompatible(null, 'ouagadougou'), true);
  assert.strictEqual(areCitiesCompatible('ouagadougou', null), true);
  assert.strictEqual(areCitiesCompatible(null, null), true);
});

test('13 — buildLivreurCityFilter : flag OFF → filtre vide', async () => {
  const { buildLivreurCityFilter } = await import('../base44/shared/cityDispatchFilter.ts');
  const { invalidateCityFlagCache } = await import('../base44/shared/cityResolution.ts');
  invalidateCityFlagCache('BF');
  const base44 = createMockBase44();
  const course = { country_code: 'BF', ville_depart: 'Ouagadougou', gps_depart_lat: 12.37, gps_depart_lng: -1.52 };
  const filter = await buildLivreurCityFilter(base44, course);
  assert.deepStrictEqual(filter, {}, 'Flag OFF → pas de filtre ville');
  invalidateCityFlagCache('BF');
});

test('14 — buildLivreurCityFilter : flag ON → filtre ville', async () => {
  const { buildLivreurCityFilter } = await import('../base44/shared/cityDispatchFilter.ts');
  const { invalidateCityFlagCache } = await import('../base44/shared/cityResolution.ts');
  invalidateCityFlagCache('BF');
  const base44 = createMockBase44('ouagadougou', 'ouagadougou', true);
  const course = { country_code: 'BF', ville_depart: 'Ouagadougou', gps_depart_lat: 12.37, gps_depart_lng: -1.52 };
  const filter = await buildLivreurCityFilter(base44, course);
  assert.ok(filter.ville, 'Doit avoir un filtre ville');
  assert.ok(filter.ville.$in || filter.ville.$regex, 'Filtre ville présent ($in ou $regex)');
  invalidateCityFlagCache('BF');
});

test('15 — buildLivreurCityFilter : zone ON et origine inconnue → aucune diffusion', async () => {
  const { buildLivreurCityFilter } = await import('../base44/shared/cityDispatchFilter.ts');
  const { invalidateCityFlagCache } = await import('../base44/shared/cityResolution.ts');
  invalidateCityFlagCache('BF');
  const base44 = createMockBase44('ouagadougou', 'ouagadougou', true);
  const course = { country_code: 'BF', ville_depart: null, gps_depart_lat: null, gps_depart_lng: null };
  const filter = await buildLivreurCityFilter(base44, course);
  assert.deepStrictEqual(filter, { id: { $in: [] } }, 'Ne pas diffuser sans origine fiable vers une zone protégée');
  invalidateCityFlagCache('BF');
});

test('16 — verifyCityCompatibility : même ville → compatible', async () => {
  const { verifyCityCompatibility } = await import('../base44/shared/cityDispatchFilter.ts');
  const { invalidateCityFlagCache } = await import('../base44/shared/cityResolution.ts');
  invalidateCityFlagCache('BF');
  const base44 = createMockBase44('ouagadougou', 'ouagadougou', true);
  const course = { country_code: 'BF', ville_depart: 'Ouagadougou', gps_depart_lat: 12.37, gps_depart_lng: -1.52 };
  const livreur = { country_code: 'BF', ville: 'Ouagadougou', latitude: 12.36, longitude: -1.51, derniere_position_date: new Date().toISOString() };
  const result = await verifyCityCompatibility(base44, course, livreur);
  assert.strictEqual(result.compatible, true);
  invalidateCityFlagCache('BF');
});

test('17 — verifyCityCompatibility : villes différentes → incompatible', async () => {
  const { verifyCityCompatibility } = await import('../base44/shared/cityDispatchFilter.ts');
  const { invalidateCityFlagCache } = await import('../base44/shared/cityResolution.ts');
  invalidateCityFlagCache('BF');
  const base44 = createMockBase44('ouagadougou', 'bobo', true);
  const course = { country_code: 'BF', ville_depart: 'Ouagadougou', gps_depart_lat: 12.37, gps_depart_lng: -1.52 };
  const livreur = { country_code: 'BF', ville: 'Bobo-Dioulasso', latitude: 11.17, longitude: -4.30, derniere_position_date: new Date().toISOString() };
  const result = await verifyCityCompatibility(base44, course, livreur);
  assert.strictEqual(result.compatible, false);
  assert.strictEqual(result.reason, 'city_mismatch');
  invalidateCityFlagCache('BF');
});

test('18 — verifyCityCompatibility : flag OFF → toujours compatible', async () => {
  const { verifyCityCompatibility } = await import('../base44/shared/cityDispatchFilter.ts');
  const { invalidateCityFlagCache } = await import('../base44/shared/cityResolution.ts');
  invalidateCityFlagCache('BF');
  const base44 = createMockBase44('ouagadougou', 'bobo', false);
  const course = { country_code: 'BF', ville_depart: 'Ouagadougou', gps_depart_lat: 12.37, gps_depart_lng: -1.52 };
  const livreur = { country_code: 'BF', ville: 'Bobo-Dioulasso', latitude: 11.17, longitude: -4.30, derniere_position_date: new Date().toISOString() };
  const result = await verifyCityCompatibility(base44, course, livreur);
  assert.strictEqual(result.compatible, true, 'Flag OFF → toujours compatible');
  invalidateCityFlagCache('BF');
});

// ════════════════════════════════════════════════════════════════════════
// TESTS AMÉLIORATION 2 : FILTRAGE FRONTEND ON/OFF
// ════════════════════════════════════════════════════════════════════════

tests.push({
  name: '19. Frontend OFF → pas de filtre ville (comportement historique)',
  fn: async () => {
    const cityDispatchEnabled = false;
    const livreurVille = 'Ouagadougou';
    const filter = { dispatch_status: { $in: ['disponible_push', 'propose'] }, country_code: 'BF' };
    if (cityDispatchEnabled && livreurVille) {
      filter.ville_depart = { $regex: livreurVille, $options: 'i' };
    }
    assert.strictEqual(filter.ville_depart, undefined, 'Flag OFF → pas de filtre ville_depart');
  },
});

tests.push({
  name: '20. Frontend ON → filtre ville appliqué',
  fn: async () => {
    const cityDispatchEnabled = true;
    const livreurVille = 'Ouagadougou';
    const filter = { dispatch_status: { $in: ['disponible_push', 'propose'] }, country_code: 'BF' };
    if (cityDispatchEnabled && livreurVille) {
      filter.ville_depart = { $regex: livreurVille, $options: 'i' };
    }
    assert.ok(filter.ville_depart, 'Flag ON → filtre ville_depart présent');
    assert.strictEqual(filter.ville_depart.$regex, 'Ouagadougou', 'Regex correcte');
  },
});

tests.push({
  name: '21. Frontend ON mais ville vide → pas de filtre (graceful)',
  fn: async () => {
    const cityDispatchEnabled = true;
    const livreurVille = '';
    const filter = { dispatch_status: { $in: ['disponible_push', 'propose'] }, country_code: 'BF' };
    if (cityDispatchEnabled && livreurVille) {
      filter.ville_depart = { $regex: livreurVille, $options: 'i' };
    }
    assert.strictEqual(filter.ville_depart, undefined, 'Ville vide → pas de filtre');
  },
});

tests.push({
  name: '22. Frontend ON → missions Éco préservées (pas filtrées par ville)',
  fn: async () => {
    const ecoFilter = { country_code: 'BF', enterprise_id: null, status: 'available' };
    assert.ok(!ecoFilter.ville_depart, 'Missions Éco non filtrées par ville');
  },
});

// ════════════════════════════════════════════════════════════════════════
// TESTS AMÉLIORATION 3 : DÉTECTION AUTOMATIQUE SÉCURISÉE
// ════════════════════════════════════════════════════════════════════════

const OUAGA_LAT = 12.37, OUAGA_LNG = -1.52;
const BOBO_LAT = 11.17, BOBO_LNG = -4.30;

tests.push({
  name: '23. GPS imprécis (accuracy > 100m) → pas de mise à jour ville',
  fn: async () => {
    const mockSdk = createMockBase44('ouagadougou', 'ouagadougou', true);
    const { shouldUpdateDriverCity } = await import('../base44/shared/cityResolution.ts');
    const livreur = {
      id: 'livreur-1', country_code: 'BF', ville: 'Ouagadougou', statut: 'disponible',
      latitude: OUAGA_LAT, longitude: OUAGA_LNG,
    };
    const result = await shouldUpdateDriverCity(mockSdk, livreur, OUAGA_LAT, OUAGA_LNG, 150);
    assert.strictEqual(result.shouldUpdate, false, 'Accuracy 150m → pas de mise à jour');
    assert.strictEqual(result.reason, 'gps_accuracy_too_low', 'Raison correcte');
  },
});

tests.push({
  name: '24. GPS précis (accuracy < 100m) → mise à jour autorisée',
  fn: async () => {
    const mockSdk = createMockBase44('ouagadougou', '', true);
    const { shouldUpdateDriverCity } = await import('../base44/shared/cityResolution.ts');
    const livreur = {
      id: 'livreur-1', country_code: 'BF', ville: '', statut: 'disponible',
      latitude: OUAGA_LAT, longitude: OUAGA_LNG,
    };
    const result = await shouldUpdateDriverCity(mockSdk, livreur, OUAGA_LAT, OUAGA_LNG, 50);
    assert.strictEqual(result.shouldUpdate, true, 'Accuracy 50m → mise à jour autorisée');
  },
});

tests.push({
  name: '25. Livreur en mission → pas de changement de ville',
  fn: async () => {
    const mockSdk = createMockBase44('ouagadougou', 'ouagadougou', true);
    const { shouldUpdateDriverCity } = await import('../base44/shared/cityResolution.ts');
    const livreur = {
      id: 'livreur-1', country_code: 'BF', ville: 'Ouagadougou', statut: 'en_course',
      latitude: OUAGA_LAT, longitude: OUAGA_LNG,
    };
    const result = await shouldUpdateDriverCity(mockSdk, livreur, BOBO_LAT, BOBO_LNG, 30);
    assert.strictEqual(result.shouldUpdate, false, 'En mission → pas de changement');
    assert.strictEqual(result.reason, 'driver_in_mission', 'Raison correcte');
  },
});

tests.push({
  name: '26. Hystérésis : livreur proche de sa ville actuelle → pas de changement',
  fn: async () => {
    const mockSdk = createMockBase44('ouagadougou', 'ouagadougou', true);
    const { shouldUpdateDriverCity } = await import('../base44/shared/cityResolution.ts');
    const livreur = {
      id: 'livreur-1', country_code: 'BF', ville: 'Ouagadougou', statut: 'disponible',
      latitude: OUAGA_LAT, longitude: OUAGA_LNG,
    };
    // Position très proche du quartier Ouaga (à quelques mètres)
    const result = await shouldUpdateDriverCity(mockSdk, livreur, OUAGA_LAT + 0.001, OUAGA_LNG + 0.001, 20);
    // Le livreur est à moins de 5km d'un quartier Ouaga → pas de changement
    assert.strictEqual(result.shouldUpdate, false, 'Hystérésis → pas de flicker');
  },
});

tests.push({
  name: '27. Déplacement interurbain confirmé → ville mise à jour',
  fn: async () => {
    const mockSdk = createMockBase44('ouagadougou', 'ouagadougou', true);
    const { shouldUpdateDriverCity } = await import('../base44/shared/cityResolution.ts');
    const livreur = {
      id: 'livreur-1', country_code: 'BF', ville: 'Ouagadougou', statut: 'disponible',
      latitude: OUAGA_LAT, longitude: OUAGA_LNG,
    };
    const result = await shouldUpdateDriverCity(mockSdk, livreur, BOBO_LAT, BOBO_LNG, 30);
    assert.strictEqual(result.shouldUpdate, true, 'Déplacement confirmé → mise à jour');
    assert.strictEqual(result.newCity, 'bobo-dioulasso', 'Nouvelle ville correcte');
  },
});

tests.push({
  name: '28. Ville inconnue (aucun quartier proche) → pas de mise à jour',
  fn: async () => {
    const mockSdk = createMockBase44('ouagadougou', 'ouagadougou', true);
    const { shouldUpdateDriverCity } = await import('../base44/shared/cityResolution.ts');
    const livreur = {
      id: 'livreur-1', country_code: 'BF', ville: 'Ouagadougou', statut: 'disponible',
      latitude: OUAGA_LAT, longitude: OUAGA_LNG,
    };
    const result = await shouldUpdateDriverCity(mockSdk, livreur, 99.0, 99.0, 20);
    assert.strictEqual(result.shouldUpdate, false, 'Ville inconnue → pas de mise à jour');
    assert.strictEqual(result.reason, 'too_far_from_any_quartier', 'Raison correcte');
  },
});

tests.push({
  name: '29. Même ville résolue → pas de mise à jour (idempotent)',
  fn: async () => {
    const mockSdk = createMockBase44('ouagadougou', 'ouagadougou', true);
    const { shouldUpdateDriverCity } = await import('../base44/shared/cityResolution.ts');
    const livreur = {
      id: 'livreur-1', country_code: 'BF', ville: 'Ouagadougou', statut: 'disponible',
      latitude: OUAGA_LAT, longitude: OUAGA_LNG,
    };
    const result = await shouldUpdateDriverCity(mockSdk, livreur, OUAGA_LAT, OUAGA_LNG, 20);
    assert.strictEqual(result.shouldUpdate, false, 'Même ville → pas de mise à jour');
    assert.strictEqual(result.reason, 'same_city', 'Raison correcte');
  },
});

tests.push({
  name: '30. Activation d\'un pays n\'impacte pas les autres pays',
  fn: async () => {
    const mockSdk = createMockBase44('ouagadougou', 'ouagadougou', true);
    const { isCityDispatchEnabled } = await import('../base44/shared/cityResolution.ts');
    const bfEnabled = await isCityDispatchEnabled(mockSdk, 'BF');
    const ciEnabled = await isCityDispatchEnabled(mockSdk, 'CI');
    assert.strictEqual(bfEnabled, true, 'BF activé');
    assert.strictEqual(ciEnabled, false, 'CI reste OFF');
  },
});

// ── Runner ──
async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  TESTS DISPATCH PAR VILLE');
  console.log('═══════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    // ── Nettoyer tous les caches avant chaque test ──
    try {
      const { invalidateCityFlagCache, invalidateQuartierCache } = await import('../base44/shared/cityResolution.ts');
      invalidateCityFlagCache();
      invalidateQuartierCache();
    } catch {}
    try {
      const { invalidateOperationalCityCache } = await import('../base44/shared/operationalZones.ts');
      invalidateOperationalCityCache();
    } catch {}
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${name}`);
      console.log(`     ${err.message}`);
      failed++;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  RÉSULTAT : ${passed}/${tests.length} tests réussis, ${failed} échoués`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
