// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE NON-RÉGRESSION — ZONES OPÉRATIONNELLES
// ═══════════════════════════════════════════════════════════════════════════
// Vérifie que le système de zones opérationnelles fonctionne correctement :
// - Saaba rattachée à Ouagadougou (pas isolée comme ville indépendante)
// - Activation individuelle des villes
// - Coexistence zones activées / non activées
// - Détection GPS automatique
// - Compatibilité anciens APK
// ═══════════════════════════════════════════════════════════════════════════

import assert from 'assert';
import fs from 'fs';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── Mock SDK avec OperationalCity et Quartier.ville_operationnelle ──
function createMockBase44(opts = {}) {
  const {
    opCities = [],
    quartiers = [],
    courses = new Map(),
    livreurs = new Map(),
  } = opts;

  const opCityMap = new Map();
  for (const c of opCities) opCityMap.set(c.nom, c);

  const quartierMap = new Map();
  for (const q of quartiers) quartierMap.set(q.id, q);

  return {
    asServiceRole: {
      entities: {
        OperationalCity: {
          filter: async (query) => {
            let results = [...opCities];
            if (query?.country_code) results = results.filter(c => c.country_code === query.country_code);
            if (query?.actif !== undefined) results = results.filter(c => c.actif === query.actif);
            if (query?.nom) results = results.filter(c => c.nom === query.nom);
            return results;
          },
        },
        Quartier: {
          filter: async (query) => {
            let results = [...quartiers];
            if (query?.country_code) results = results.filter(q => q.country_code === query.country_code);
            if (query?.actif !== undefined) results = results.filter(q => q.actif === query.actif);
            return results;
          },
        },
        CourseExterne: {
          get: async (id) => courses.get(id) || null,
          filter: async (query) => {
            let results = [...courses.values()];
            if (query?.country_code) results = results.filter(c => c.country_code === query.country_code);
            return results;
          },
        },
        Livreur: {
          get: async (id) => livreurs.get(id) || null,
          filter: async (query) => {
            let results = [...livreurs.values()];
            if (query?.country_code) results = results.filter(l => l.country_code === query.country_code);
            return results;
          },
        },
        AppConfig: {
          filter: async () => [],
        },
      },
    },
  };
}

// ── Quartiers de test ──
// Saaba est rattachée à ouagadougou (ville_operationnelle)
const TEST_QUARTIERS = [
  { id: 'q1', country_code: 'BF', ville: 'Ouagadougou', ville_operationnelle: 'ouagadougou', nom: 'Gounghin', latitude: 12.37, longitude: -1.52, actif: true },
  { id: 'q2', country_code: 'BF', ville: 'Ouagadougou', ville_operationnelle: 'ouagadougou', nom: 'Patte d\'Oie', latitude: 12.35, longitude: -1.50, actif: true },
  { id: 'q3', country_code: 'BF', ville: 'Saaba', ville_operationnelle: 'ouagadougou', nom: 'Saaba Centre', latitude: 12.45, longitude: -1.40, actif: true },
  { id: 'q4', country_code: 'BF', ville: 'Bobo-Dioulasso', ville_operationnelle: 'bobo-dioulasso', nom: 'Secteur 1', latitude: 11.17, longitude: -4.30, actif: true },
  { id: 'q5', country_code: 'BF', ville: 'Bobo-Dioulasso', ville_operationnelle: 'bobo-dioulasso', nom: 'Secteur 2', latitude: 11.18, longitude: -4.28, actif: true },
  { id: 'q6', country_code: 'BF', ville: 'Koudougou', ville_operationnelle: 'koudougou', nom: 'Centre', latitude: 12.25, longitude: -2.36, actif: true },
];

// ── Cache cleanup avant chaque test ──
async function clearCaches() {
  try {
    const { invalidateCityFlagCache, invalidateQuartierCache } = await import('../base44/shared/cityResolution.ts');
    invalidateCityFlagCache();
    invalidateQuartierCache();
  } catch {}
  try {
    const { invalidateOperationalCityCache } = await import('../base44/shared/operationalZones.ts');
    invalidateOperationalCityCache();
  } catch {}
}

// ════════════════════════════════════════════════════════════════════════
// SECTION 1 : SAABA RATTACHÉE À OUAGADOUGOU
// ════════════════════════════════════════════════════════════════════════

test('1. Saaba et Ouagadougou appartiennent à la même zone opérationnelle', async () => {
  await clearCaches();
  const { resolveOperationalCity } = await import('../base44/shared/operationalZones.ts');
  const mockSdk = createMockBase44({ quartiers: TEST_QUARTIERS });

  const ouagaCity = await resolveOperationalCity(mockSdk, 12.37, -1.52, 'BF');
  const saabaCity = await resolveOperationalCity(mockSdk, 12.45, -1.40, 'BF');

  assert.strictEqual(ouagaCity, 'ouagadougou', 'Ouaga → ouagadougou');
  assert.strictEqual(saabaCity, 'ouagadougou', 'Saaba → ouagadougou (pas isolée)');
  assert.strictEqual(ouagaCity, saabaCity, 'Même zone opérationnelle');
});

test('2. Bobo-Dioulasso est une zone opérationnelle distincte', async () => {
  await clearCaches();
  const { resolveOperationalCity } = await import('../base44/shared/operationalZones.ts');
  const mockSdk = createMockBase44({ quartiers: TEST_QUARTIERS });

  const boboCity = await resolveOperationalCity(mockSdk, 11.17, -4.30, 'BF');
  assert.strictEqual(boboCity, 'bobo-dioulasso', 'Bobo → bobo-dioulasso');
});

test('3. Un livreur à Saaba peut recevoir une course de Ouagadougou (zone activée)', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: true },
    ],
    quartiers: TEST_QUARTIERS,
    courses: new Map([['c1', {
      id: 'c1', country_code: 'BF', ville_depart: 'Ouagadougou',
      gps_depart_lat: 12.37, gps_depart_lng: -1.52, enterprise_id: null,
    }]]),
    livreurs: new Map([['l1', {
      id: 'l1', country_code: 'BF', ville: 'Saaba',
      latitude: 12.45, longitude: -1.40, derniere_position_date: new Date().toISOString(),
    }]]),
  });

  const { verifyCityCompatibility } = await import('../base44/shared/cityDispatchFilter.ts');
  const course = mockSdk.asServiceRole.entities.CourseExterne.get('c1');
  const livreur = mockSdk.asServiceRole.entities.Livreur.get('l1');
  const result = await verifyCityCompatibility(mockSdk, await course, await livreur);

  assert.strictEqual(result.compatible, true, 'Livreur Saaba peut accepter course Ouaga (même zone)');
});

test('4. Un livreur à Ouaga peut recevoir une course de Saaba (zone activée)', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: true },
    ],
    quartiers: TEST_QUARTIERS,
    courses: new Map([['c1', {
      id: 'c1', country_code: 'BF', ville_depart: 'Saaba',
      gps_depart_lat: 12.45, gps_depart_lng: -1.40, enterprise_id: null,
    }]]),
    livreurs: new Map([['l1', {
      id: 'l1', country_code: 'BF', ville: 'Ouagadougou',
      latitude: 12.37, longitude: -1.52, derniere_position_date: new Date().toISOString(),
    }]]),
  });

  const { verifyCityCompatibility } = await import('../base44/shared/cityDispatchFilter.ts');
  const course = mockSdk.asServiceRole.entities.CourseExterne.get('c1');
  const livreur = mockSdk.asServiceRole.entities.Livreur.get('l1');
  const result = await verifyCityCompatibility(mockSdk, await course, await livreur);

  assert.strictEqual(result.compatible, true, 'Livreur Ouaga peut accepter course Saaba (même zone)');
});

test('5. Un livreur à Bobo ne peut pas accepter une course de zone Ouaga activée', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: true },
    ],
    quartiers: TEST_QUARTIERS,
    courses: new Map([['c1', {
      id: 'c1', country_code: 'BF', ville_depart: 'Ouagadougou',
      gps_depart_lat: 12.37, gps_depart_lng: -1.52, enterprise_id: null,
    }]]),
    livreurs: new Map([['l1', {
      id: 'l1', country_code: 'BF', ville: 'Bobo-Dioulasso',
      latitude: 11.17, longitude: -4.30, derniere_position_date: new Date().toISOString(),
    }]]),
  });

  const { verifyCityCompatibility } = await import('../base44/shared/cityDispatchFilter.ts');
  const course = mockSdk.asServiceRole.entities.CourseExterne.get('c1');
  const livreur = mockSdk.asServiceRole.entities.Livreur.get('l1');
  const result = await verifyCityCompatibility(mockSdk, await course, await livreur);

  assert.strictEqual(result.compatible, false, 'Livreur Bobo ne peut pas accepter course Ouaga');
  assert.strictEqual(result.reason, 'city_mismatch', 'Raison = city_mismatch');
});

// ════════════════════════════════════════════════════════════════════════
// SECTION 2 : ACTIVATION INDIVIDUELLE
// ════════════════════════════════════════════════════════════════════════

test('6. Activation uniquement de Ouagadougou → Bobo reste désactivée', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: true },
      { id: 'oc2', country_code: 'BF', nom: 'bobo-dioulasso', nom_affichage: 'Bobo-Dioulasso', actif: false },
    ],
    quartiers: TEST_QUARTIERS,
  });

  const { isOperationalCityActive } = await import('../base44/shared/operationalZones.ts');
  const ouagaActive = await isOperationalCityActive(mockSdk, 'BF', 'ouagadougou');
  const boboActive = await isOperationalCityActive(mockSdk, 'BF', 'bobo-dioulasso');

  assert.strictEqual(ouagaActive, true, 'Ouaga activée');
  assert.strictEqual(boboActive, false, 'Bobo non activée');
});

test('7. Activation et désactivation de Bobo indépendamment', async () => {
  await clearCaches();
  // État initial: Bobo désactivée
  const mockSdk1 = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: true },
      { id: 'oc2', country_code: 'BF', nom: 'bobo-dioulasso', nom_affichage: 'Bobo-Dioulasso', actif: false },
    ],
    quartiers: TEST_QUARTIERS,
  });
  const { isOperationalCityActive } = await import('../base44/shared/operationalZones.ts');
  const boboBefore = await isOperationalCityActive(mockSdk1, 'BF', 'bobo-dioulasso');
  assert.strictEqual(boboBefore, false, 'Bobo OFF initialement');

  // Activer Bobo
  const mockSdk2 = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: true },
      { id: 'oc2', country_code: 'BF', nom: 'bobo-dioulasso', nom_affichage: 'Bobo-Dioulasso', actif: true },
    ],
    quartiers: TEST_QUARTIERS,
  });
  await clearCaches();
  const boboAfter = await isOperationalCityActive(mockSdk2, 'BF', 'bobo-dioulasso');
  assert.strictEqual(boboAfter, true, 'Bobo ON après activation');
});

test('8. Aucune ville activée → comportement historique (pas de filtre)', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({
    opCities: [],
    quartiers: TEST_QUARTIERS,
    courses: new Map([['c1', {
      id: 'c1', country_code: 'BF', ville_depart: 'Ouagadougou',
      gps_depart_lat: 12.37, gps_depart_lng: -1.52, enterprise_id: null,
    }]]),
    livreurs: new Map([['l1', {
      id: 'l1', country_code: 'BF', ville: 'Bobo-Dioulasso',
      latitude: 11.17, longitude: -4.30, derniere_position_date: new Date().toISOString(),
    }]]),
  });

  const { verifyCityCompatibility } = await import('../base44/shared/cityDispatchFilter.ts');
  const course = await mockSdk.asServiceRole.entities.CourseExterne.get('c1');
  const livreur = await mockSdk.asServiceRole.entities.Livreur.get('l1');
  const result = await verifyCityCompatibility(mockSdk, course, livreur);

  assert.strictEqual(result.compatible, true, 'Aucune ville activée → historique (compatible)');
});

// ════════════════════════════════════════════════════════════════════════
// SECTION 3 : COEXISTENCE ZONES ACTIVÉES / NON ACTIVÉES
// ════════════════════════════════════════════════════════════════════════

test('9. Course en zone activée → livreur autre zone bloqué', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: true },
    ],
    quartiers: TEST_QUARTIERS,
    courses: new Map([['c1', {
      id: 'c1', country_code: 'BF', ville_depart: 'Ouagadougou',
      gps_depart_lat: 12.37, gps_depart_lng: -1.52, enterprise_id: null,
    }]]),
    livreurs: new Map([['l1', {
      id: 'l1', country_code: 'BF', ville: 'Koudougou',
      latitude: 12.25, longitude: -2.36, derniere_position_date: new Date().toISOString(),
    }]]),
  });

  const { verifyCityCompatibility } = await import('../base44/shared/cityDispatchFilter.ts');
  const course = await mockSdk.asServiceRole.entities.CourseExterne.get('c1');
  const livreur = await mockSdk.asServiceRole.entities.Livreur.get('l1');
  const result = await verifyCityCompatibility(mockSdk, course, livreur);

  assert.strictEqual(result.compatible, false, 'Livreur Koudougou bloqué pour course Ouaga activée');
});

test('10. Course en zone non activée → tous les livreurs peuvent accepter', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: true },
    ],
    quartiers: TEST_QUARTIERS,
    courses: new Map([['c1', {
      id: 'c1', country_code: 'BF', ville_depart: 'Bobo-Dioulasso',
      gps_depart_lat: 11.17, gps_depart_lng: -4.30, enterprise_id: null,
    }]]),
    livreurs: new Map([['l1', {
      id: 'l1', country_code: 'BF', ville: 'Ouagadougou',
      latitude: 12.37, longitude: -1.52, derniere_position_date: new Date().toISOString(),
    }]]),
  });

  const { verifyCityCompatibility } = await import('../base44/shared/cityDispatchFilter.ts');
  const course = await mockSdk.asServiceRole.entities.CourseExterne.get('c1');
  const livreur = await mockSdk.asServiceRole.entities.Livreur.get('l1');
  const result = await verifyCityCompatibility(mockSdk, course, livreur);

  assert.strictEqual(result.compatible, true, 'Course Bobo (non activée) → livreur Ouaga peut accepter');
  assert.strictEqual(result.reason, 'zone_not_activated', 'Raison = zone_not_activated');
});

test('11. Course en zone non activée → livreur autre zone non activée peut accepter', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: true },
    ],
    quartiers: TEST_QUARTIERS,
    courses: new Map([['c1', {
      id: 'c1', country_code: 'BF', ville_depart: 'Koudougou',
      gps_depart_lat: 12.25, gps_depart_lng: -2.36, enterprise_id: null,
    }]]),
    livreurs: new Map([['l1', {
      id: 'l1', country_code: 'BF', ville: 'Bobo-Dioulasso',
      latitude: 11.17, longitude: -4.30, derniere_position_date: new Date().toISOString(),
    }]]),
  });

  const { verifyCityCompatibility } = await import('../base44/shared/cityDispatchFilter.ts');
  const course = await mockSdk.asServiceRole.entities.CourseExterne.get('c1');
  const livreur = await mockSdk.asServiceRole.entities.Livreur.get('l1');
  const result = await verifyCityCompatibility(mockSdk, course, livreur);

  assert.strictEqual(result.compatible, true, 'Course Koudougou (non activée) → livreur Bobo peut accepter');
});

// ════════════════════════════════════════════════════════════════════════
// SECTION 4 : FILTRES MONGODB
// ════════════════════════════════════════════════════════════════════════

test('12. buildLivreurCityFilter : zone activée → filtre $in avec communes rattachées', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: true },
    ],
    quartiers: TEST_QUARTIERS,
    courses: new Map([['c1', {
      id: 'c1', country_code: 'BF', ville_depart: 'Ouagadougou',
      gps_depart_lat: 12.37, gps_depart_lng: -1.52, enterprise_id: null,
    }]]),
  });

  const { buildLivreurCityFilter } = await import('../base44/shared/cityDispatchFilter.ts');
  const course = await mockSdk.asServiceRole.entities.CourseExterne.get('c1');
  const filter = await buildLivreurCityFilter(mockSdk, course);

  assert.ok(filter.ville, 'Filtre ville présent');
  assert.ok(filter.ville.$in, 'Filtre $in');
  assert.ok(filter.ville.$in.includes('Ouagadougou'), 'Inclut Ouagadougou');
  assert.ok(filter.ville.$in.includes('Saaba'), 'Inclut Saaba (rattachée)');
  assert.ok(filter.ville.$in.includes('ouagadougou'), 'Inclut ouagadougou (normalisé)');
});

test('13. buildLivreurCityFilter : zone non activée → pas de filtre', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({
    opCities: [],
    quartiers: TEST_QUARTIERS,
    courses: new Map([['c1', {
      id: 'c1', country_code: 'BF', ville_depart: 'Ouagadougou',
      gps_depart_lat: 12.37, gps_depart_lng: -1.52, enterprise_id: null,
    }]]),
  });

  const { buildLivreurCityFilter } = await import('../base44/shared/cityDispatchFilter.ts');
  const course = await mockSdk.asServiceRole.entities.CourseExterne.get('c1');
  const filter = await buildLivreurCityFilter(mockSdk, course);

  assert.deepStrictEqual(filter, {}, 'Zone non activée → pas de filtre');
});

test('14. buildCourseCityFilterForLivreur : exclut courses d\'autres zones activées', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: true },
      { id: 'oc2', country_code: 'BF', nom: 'bobo-dioulasso', nom_affichage: 'Bobo-Dioulasso', actif: true },
    ],
    quartiers: TEST_QUARTIERS,
    livreurs: new Map([['l1', {
      id: 'l1', country_code: 'BF', ville: 'Ouagadougou',
      latitude: 12.37, longitude: -1.52, derniere_position_date: new Date().toISOString(),
    }]]),
  });

  const { buildCourseCityFilterForLivreur } = await import('../base44/shared/cityDispatchFilter.ts');
  const livreur = await mockSdk.asServiceRole.entities.Livreur.get('l1');
  const filter = await buildCourseCityFilterForLivreur(mockSdk, livreur);

  assert.ok(filter.ville_depart, 'Filtre ville_depart présent');
  assert.ok(filter.ville_depart.$nin, 'Filtre $nin');
  // Le $nin doit exclure les communes de Bobo (zone activée, pas la zone du livreur)
  assert.ok(filter.ville_depart.$nin.includes('Bobo-Dioulasso'), 'Exclut Bobo-Dioulasso');
  // Ne doit PAS exclure Ouagadougou ou Saaba (zone du livreur)
  assert.ok(!filter.ville_depart.$nin.includes('Ouagadougou'), 'N\'exclut pas Ouagadougou');
  assert.ok(!filter.ville_depart.$nin.includes('Saaba'), 'N\'exclut pas Saaba');
});

// ════════════════════════════════════════════════════════════════════════
// SECTION 5 : GPS ET DÉTECTION AUTOMATIQUE
// ════════════════════════════════════════════════════════════════════════

test('15. GPS à Saaba → zone ouagadougou (pas saaba comme ville indépendante)', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({ quartiers: TEST_QUARTIERS });
  const { resolveOperationalCity } = await import('../base44/shared/operationalZones.ts');
  const city = await resolveOperationalCity(mockSdk, 12.45, -1.40, 'BF');
  assert.strictEqual(city, 'ouagadougou', 'GPS Saaba → ouagadougou');
});

test('16. GPS inconnu → null (graceful degradation)', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({ quartiers: TEST_QUARTIERS });
  const { resolveOperationalCity } = await import('../base44/shared/operationalZones.ts');
  const city = await resolveOperationalCity(mockSdk, 99.0, 99.0, 'BF');
  assert.strictEqual(city, null, 'GPS inconnu → null');
});

test('17. Livreur en mission → pas de changement de ville', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({ quartiers: TEST_QUARTIERS });
  const { shouldUpdateDriverOperationalCity } = await import('../base44/shared/operationalZones.ts');
  const livreur = { id: 'l1', country_code: 'BF', ville: 'Ouagadougou', statut: 'en_course' };
  const result = await shouldUpdateDriverOperationalCity(mockSdk, livreur, 11.17, -4.30, 20);
  assert.strictEqual(result.shouldUpdate, false, 'En mission → pas de changement');
  assert.strictEqual(result.reason, 'driver_in_mission', 'Raison = driver_in_mission');
});

test('18. GPS imprécis (accuracy > 100m) → pas de mise à jour', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({ quartiers: TEST_QUARTIERS });
  const { shouldUpdateDriverOperationalCity } = await import('../base44/shared/operationalZones.ts');
  const livreur = { id: 'l1', country_code: 'BF', ville: '', statut: 'disponible' };
  const result = await shouldUpdateDriverOperationalCity(mockSdk, livreur, 12.45, -1.40, 150);
  assert.strictEqual(result.shouldUpdate, false, 'GPS imprécis → pas de mise à jour');
  assert.strictEqual(result.reason, 'gps_accuracy_too_low', 'Raison = gps_accuracy_too_low');
});

test('19. getDriverOperationalCity : "Saaba" → "ouagadougou"', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({ quartiers: TEST_QUARTIERS });
  const { getDriverOperationalCity } = await import('../base44/shared/operationalZones.ts');
  const livreur = { id: 'l1', country_code: 'BF', ville: 'Saaba', latitude: 0, longitude: 0 };
  const city = await getDriverOperationalCity(mockSdk, livreur);
  assert.strictEqual(city, 'ouagadougou', 'Saaba → ouagadougou');
});

test('20. getDriverOperationalCity : "Ouagadougou" → "ouagadougou"', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({ quartiers: TEST_QUARTIERS });
  const { getDriverOperationalCity } = await import('../base44/shared/operationalZones.ts');
  const livreur = { id: 'l1', country_code: 'BF', ville: 'Ouagadougou', latitude: 0, longitude: 0 };
  const city = await getDriverOperationalCity(mockSdk, livreur);
  assert.strictEqual(city, 'ouagadougou', 'Ouagadougou → ouagadougou');
});

// ════════════════════════════════════════════════════════════════════════
// SECTION 6 : COMPATIBILITÉ ANCIENS APK
// ════════════════════════════════════════════════════════════════════════

test('21. Ancien APK livreur → backend reste l\'autorité (zone activée bloquée)', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: true },
    ],
    quartiers: TEST_QUARTIERS,
    courses: new Map([['c1', {
      id: 'c1', country_code: 'BF', ville_depart: 'Ouagadougou',
      gps_depart_lat: 12.37, gps_depart_lng: -1.52, enterprise_id: null,
    }]]),
    livreurs: new Map([['l1', {
      id: 'l1', country_code: 'BF', ville: 'Bobo-Dioulasso',
      latitude: 11.17, longitude: -4.30, derniere_position_date: new Date().toISOString(),
    }]]),
  });

  const { verifyCityCompatibility } = await import('../base44/shared/cityDispatchFilter.ts');
  const course = await mockSdk.asServiceRole.entities.CourseExterne.get('c1');
  const livreur = await mockSdk.asServiceRole.entities.Livreur.get('l1');
  const result = await verifyCityCompatibility(mockSdk, course, livreur);

  assert.strictEqual(result.compatible, false, 'Backend bloque même avec ancien APK');
});

test('22. Ancien APK livreur → ville "Saaba" résolue en "ouagadougou"', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({ quartiers: TEST_QUARTIERS });
  const { getDriverOperationalCity } = await import('../base44/shared/operationalZones.ts');
  const livreur = { id: 'l1', country_code: 'BF', ville: 'Saaba', latitude: 0, longitude: 0 };
  const city = await getDriverOperationalCity(mockSdk, livreur);
  assert.strictEqual(city, 'ouagadougou', 'Saaba résolu en ouagadougou');
});

// ════════════════════════════════════════════════════════════════════════
// SECTION 7 : ISOLATION MULTI-PAYS
// ════════════════════════════════════════════════════════════════════════

test('23. Activation BF n\'impacte pas CI', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: true },
    ],
    quartiers: TEST_QUARTIERS,
  });
  const { isOperationalCityActive } = await import('../base44/shared/operationalZones.ts');
  const bfActive = await isOperationalCityActive(mockSdk, 'BF', 'ouagadougou');
  const ciActive = await isOperationalCityActive(mockSdk, 'CI', 'abidjan');
  assert.strictEqual(bfActive, true, 'BF activé');
  assert.strictEqual(ciActive, false, 'CI non activé');
});

// ════════════════════════════════════════════════════════════════════════
// SECTION 8 : DÉSACTIVATION D'URGENCE
// ════════════════════════════════════════════════════════════════════════

test('24. Désactivation d\'urgence d\'une ville → restrictions cessent', async () => {
  await clearCaches();
  // État initial: Ouaga activée
  const mockSdk1 = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: true },
    ],
    quartiers: TEST_QUARTIERS,
    courses: new Map([['c1', {
      id: 'c1', country_code: 'BF', ville_depart: 'Ouagadougou',
      gps_depart_lat: 12.37, gps_depart_lng: -1.52, enterprise_id: null,
    }]]),
    livreurs: new Map([['l1', {
      id: 'l1', country_code: 'BF', ville: 'Bobo-Dioulasso',
      latitude: 11.17, longitude: -4.30, derniere_position_date: new Date().toISOString(),
    }]]),
  });
  const { verifyCityCompatibility } = await import('../base44/shared/cityDispatchFilter.ts');
  const course1 = await mockSdk1.asServiceRole.entities.CourseExterne.get('c1');
  const livreur1 = await mockSdk1.asServiceRole.entities.Livreur.get('l1');
  const result1 = await verifyCityCompatibility(mockSdk1, course1, livreur1);
  assert.strictEqual(result1.compatible, false, 'Ouaga activée → Bobo bloqué');

  // Désactiver Ouaga
  const mockSdk2 = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: false },
    ],
    quartiers: TEST_QUARTIERS,
    courses: new Map([['c1', {
      id: 'c1', country_code: 'BF', ville_depart: 'Ouagadougou',
      gps_depart_lat: 12.37, gps_depart_lng: -1.52, enterprise_id: null,
    }]]),
    livreurs: new Map([['l1', {
      id: 'l1', country_code: 'BF', ville: 'Bobo-Dioulasso',
      latitude: 11.17, longitude: -4.30, derniere_position_date: new Date().toISOString(),
    }]]),
  });
  await clearCaches();
  const course2 = await mockSdk2.asServiceRole.entities.CourseExterne.get('c1');
  const livreur2 = await mockSdk2.asServiceRole.entities.Livreur.get('l1');
  const result2 = await verifyCityCompatibility(mockSdk2, course2, livreur2);
  assert.strictEqual(result2.compatible, true, 'Ouaga désactivée → Bobo peut accepter');
});

test('25. Toutes les villes OFF → comportement historique', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: false },
      { id: 'oc2', country_code: 'BF', nom: 'bobo-dioulasso', nom_affichage: 'Bobo-Dioulasso', actif: false },
    ],
    quartiers: TEST_QUARTIERS,
    courses: new Map([['c1', {
      id: 'c1', country_code: 'BF', ville_depart: 'Ouagadougou',
      gps_depart_lat: 12.37, gps_depart_lng: -1.52, enterprise_id: null,
    }]]),
    livreurs: new Map([['l1', {
      id: 'l1', country_code: 'BF', ville: 'Bobo-Dioulasso',
      latitude: 11.17, longitude: -4.30, derniere_position_date: new Date().toISOString(),
    }]]),
  });

  const { verifyCityCompatibility } = await import('../base44/shared/cityDispatchFilter.ts');
  const course = await mockSdk.asServiceRole.entities.CourseExterne.get('c1');
  const livreur = await mockSdk.asServiceRole.entities.Livreur.get('l1');
  const result = await verifyCityCompatibility(mockSdk, course, livreur);
  assert.strictEqual(result.compatible, true, 'Toutes OFF → historique');
});

// ════════════════════════════════════════════════════════════════════════
// SECTION 9 : VILLE/quartier ABSENT DU RÉFÉRENTIEL
// ════════════════════════════════════════════════════════════════════════

test('26. Ville absente du référentiel → pas de filtre (graceful)', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({
    opCities: [
      { id: 'oc1', country_code: 'BF', nom: 'ouagadougou', nom_affichage: 'Ouagadougou', actif: true },
    ],
    quartiers: TEST_QUARTIERS,
    courses: new Map([['c1', {
      id: 'c1', country_code: 'BF', ville_depart: 'VilleInconnue',
      gps_depart_lat: null, gps_depart_lng: null, enterprise_id: null,
    }]]),
    livreurs: new Map([['l1', {
      id: 'l1', country_code: 'BF', ville: 'Bobo-Dioulasso',
      latitude: 11.17, longitude: -4.30, derniere_position_date: new Date().toISOString(),
    }]]),
  });

  const { verifyCityCompatibility } = await import('../base44/shared/cityDispatchFilter.ts');
  const course = await mockSdk.asServiceRole.entities.CourseExterne.get('c1');
  const livreur = await mockSdk.asServiceRole.entities.Livreur.get('l1');
  const result = await verifyCityCompatibility(mockSdk, course, livreur);

  // "VilleInconnue" ne correspond à aucun quartier → operational city = "villeinconnue"
  // "villeinconnue" n'est pas activée → compatible (historique)
  assert.strictEqual(result.compatible, true, 'Ville inconnue → pas de filtre');
});

test('27. Quartier sans ville_operationnelle → fallback sur ville', async () => {
  await clearCaches();
  const mockSdk = createMockBase44({
    quartiers: [
      { id: 'q1', country_code: 'BF', ville: 'VilleX', ville_operationnelle: null, nom: 'Centre', latitude: 12.0, longitude: -1.0, actif: true },
    ],
  });
  const { resolveOperationalCity } = await import('../base44/shared/operationalZones.ts');
  const city = await resolveOperationalCity(mockSdk, 12.0, -1.0, 'BF');
  assert.strictEqual(city, 'villex', 'Fallback sur ville normalisée');
});

// ════════════════════════════════════════════════════════════════════════
// SECTION 10 : STRUCTURE DU CODE
// ════════════════════════════════════════════════════════════════════════

test('28. Entité OperationalCity existe avec champ actif', () => {
  const content = fs.readFileSync('base44/entities/OperationalCity.jsonc', 'utf-8');
  assert.ok(content.includes('"name": "OperationalCity"'), 'Entité OperationalCity');
  assert.ok(content.includes('"actif"'), 'Champ actif');
  assert.ok(content.includes('"default": false'), 'actif = false par défaut');
});

test('29. Quartier a le champ ville_operationnelle', () => {
  const content = fs.readFileSync('base44/entities/Quartier.jsonc', 'utf-8');
  assert.ok(content.includes('ville_operationnelle'), 'Champ ville_operationnelle');
});

test('30. operationalZones.ts exporte les fonctions requises', () => {
  const content = fs.readFileSync('base44/shared/operationalZones.ts', 'utf-8');
  assert.ok(content.includes('isOperationalCityActive'), 'isOperationalCityActive');
  assert.ok(content.includes('resolveOperationalCity'), 'resolveOperationalCity');
  assert.ok(content.includes('getDriverOperationalCity'), 'getDriverOperationalCity');
  assert.ok(content.includes('getCourseOperationalCity'), 'getCourseOperationalCity');
  assert.ok(content.includes('getOperationalZoneCityNames'), 'getOperationalZoneCityNames');
  assert.ok(content.includes('getActivatedZoneCityNames'), 'getActivatedZoneCityNames');
  assert.ok(content.includes('shouldUpdateDriverOperationalCity'), 'shouldUpdateDriverOperationalCity');
});

test('31. cityDispatchFilter.ts utilise isOperationalCityActive (pas seulement isCityDispatchEnabled)', () => {
  const content = fs.readFileSync('base44/shared/cityDispatchFilter.ts', 'utf-8');
  assert.ok(content.includes('isOperationalCityActive'), 'Import isOperationalCityActive');
  assert.ok(content.includes('getOperationalZoneCityNames'), 'Import getOperationalZoneCityNames');
  assert.ok(content.includes('getActivatedZoneCityNames'), 'Import getActivatedZoneCityNames');
});

test('32. heartbeatAuto utilise shouldUpdateDriverOperationalCity', () => {
  const content = fs.readFileSync('base44/functions/heartbeatAuto/entry.ts', 'utf-8');
  assert.ok(content.includes('shouldUpdateDriverOperationalCity'), 'Utilise shouldUpdateDriverOperationalCity');
  assert.ok(content.includes('operationalZones.ts'), 'Import depuis operationalZones.ts');
});

// ── Runner ──
async function runTests() {
  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const { name, fn } of tests) {
    await clearCaches();
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${name}`);
      console.log(`     ${e.message}`);
      failures.push({ name, error: e.message });
      failed++;
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  RÉSULTAT : ${passed}/${tests.length} tests réussis, ${failed} échoués`);
  console.log('═══════════════════════════════════════════════════════');
  if (failures.length > 0) {
    console.log('\nÉCHECS :');
    for (const f of failures) {
      console.log(`  - ${f.name}: ${f.error}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

runTests();