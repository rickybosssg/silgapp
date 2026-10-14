// ═══════════════════════════════════════════════════════════════════════════
// TESTS DE NON-RÉGRESSION — OPTIMISEUR DE TRAJETS SILGAPP ÉCO
// ═══════════════════════════════════════════════════════════════════════════
// Vérifie que l'optimisation hybride des trajets Éco fonctionne correctement
// en prenant en compte la position GPS réelle du livreur.
// ═══════════════════════════════════════════════════════════════════════════

import assert from 'assert';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── Coordonnées réelles de Ouagadougou (approximatives) ──
const ZONE_BOIS = { lat: 12.3518, lng: -1.5330 };
const LOGEMENTS_1200 = { lat: 12.3550, lng: -1.5100 };
const ZONE_1 = { lat: 12.3700, lng: -1.5250 };
const OUAGA_2000 = { lat: 12.4000, lng: -1.4900 };

// ── Cours de test ──
function createTestCourses() {
  return [
    {
      id: 'course-A',
      gps_depart_lat: LOGEMENTS_1200.lat,
      gps_depart_lng: LOGEMENTS_1200.lng,
      gps_arrivee_lat: OUAGA_2000.lat,
      gps_arrivee_lng: OUAGA_2000.lng,
    },
    {
      id: 'course-B',
      gps_depart_lat: ZONE_1.lat,
      gps_depart_lng: ZONE_1.lng,
      gps_arrivee_lat: OUAGA_2000.lat,
      gps_arrivee_lng: OUAGA_2000.lng,
    },
  ];
}

// ── Livreur de test ──
function createTestLivreur(lat = ZONE_BOIS.lat, lng = ZONE_BOIS.lng, ageMin = 0) {
  const now = new Date();
  now.setMinutes(now.getMinutes() - ageMin);
  return {
    id: 'livreur-1',
    latitude: lat,
    longitude: lng,
    derniere_position_date: now.toISOString(),
    gps_accuracy: 20,
    statut: 'disponible',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS — EXTRACTDRIVERGPS
// ═══════════════════════════════════════════════════════════════════════════

test('1. extractDriverGPS — GPS valide et récent → fiable', async () => {
  const { extractDriverGPS } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const livreur = createTestLivreur();
  const gps = extractDriverGPS(livreur);
  assert.ok(gps, 'GPS ne doit pas être null');
  assert.strictEqual(gps.isReliable, true);
  assert.strictEqual(gps.lat, ZONE_BOIS.lat);
});

test('2. extractDriverGPS — GPS ancien (> 10 min) → non fiable', async () => {
  const { extractDriverGPS } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const livreur = createTestLivreur(ZONE_BOIS.lat, ZONE_BOIS.lng, 15);
  const gps = extractDriverGPS(livreur);
  assert.ok(gps);
  assert.strictEqual(gps.isReliable, false);
  assert.strictEqual(gps.reason, 'gps_too_old');
});

test('3. extractDriverGPS — coordonnées invalides → non fiable', async () => {
  const { extractDriverGPS } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const livreur = { latitude: 0, longitude: 0, derniere_position_date: new Date().toISOString() };
  const gps = extractDriverGPS(livreur);
  assert.ok(gps);
  assert.strictEqual(gps.isReliable, false);
  assert.strictEqual(gps.reason, 'invalid_coordinates');
});

test('4. extractDriverGPS — précision trop faible → non fiable', async () => {
  const { extractDriverGPS } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const livreur = createTestLivreur();
  livreur.gps_accuracy = 150;
  const gps = extractDriverGPS(livreur);
  assert.ok(gps);
  assert.strictEqual(gps.isReliable, false);
  assert.strictEqual(gps.reason, 'gps_accuracy_too_low');
});

test('5. extractDriverGPS — pas de timestamp → non fiable', async () => {
  const { extractDriverGPS } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const livreur = { latitude: 12.35, longitude: -1.53, derniere_position_date: null };
  const gps = extractDriverGPS(livreur);
  assert.ok(gps);
  assert.strictEqual(gps.isReliable, false);
  assert.strictEqual(gps.reason, 'no_timestamp');
});

test('6. extractDriverGPS — livreur null → null', async () => {
  const { extractDriverGPS } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const gps = extractDriverGPS(null);
  assert.strictEqual(gps, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS — GENERATEVALIDPERMUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

test('7. generateValidPermutations — 2 courses → 6 permutations', async () => {
  const { generateValidPermutations } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  const perms = generateValidPermutations(courses);
  assert.strictEqual(perms.length, 6, 'Doit générer exactement 6 permutations pour 2 courses');
});

test('8. generateValidPermutations — chaque permutation a 4 étapes', async () => {
  const { generateValidPermutations } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  const perms = generateValidPermutations(courses);
  for (const perm of perms) {
    assert.strictEqual(perm.length, 4, 'Chaque permutation doit avoir 4 étapes');
  }
});

test('9. generateValidPermutations — récupération avant livraison', async () => {
  const { generateValidPermutations } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  const perms = generateValidPermutations(courses);
  for (const perm of perms) {
    // Pour chaque course, vérifier que le pickup précède la delivery
    for (const course of courses) {
      const pickupOrder = perm.findIndex(s => s.course_id === course.id && s.type === 'pickup');
      const deliveryOrder = perm.findIndex(s => s.course_id === course.id && s.type === 'delivery');
      assert.ok(pickupOrder >= 0, 'Pickup doit exister');
      assert.ok(deliveryOrder >= 0, 'Delivery doit exister');
      assert.ok(pickupOrder < deliveryOrder, 'Pickup doit précéder delivery');
    }
  }
});

test('10. generateValidPermutations — 2 pickups et 2 deliveries par permutation', async () => {
  const { generateValidPermutations } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  const perms = generateValidPermutations(courses);
  for (const perm of perms) {
    // Chaque permutation doit avoir exactement 2 pickups et 2 deliveries
    const pickups = perm.filter(s => s.type === 'pickup');
    const deliveries = perm.filter(s => s.type === 'delivery');
    assert.strictEqual(pickups.length, 2);
    assert.strictEqual(deliveries.length, 2);
  }
});

test('11. generateValidPermutations — 0 course → tableau vide', async () => {
  const { generateValidPermutations } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const perms = generateValidPermutations([]);
  assert.strictEqual(perms.length, 0);
});

test('12. generateValidPermutations — 1 course → 1 permutation', async () => {
  const { generateValidPermutations } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = [{ id: 'A', gps_depart_lat: 12.35, gps_depart_lng: -1.53, gps_arrivee_lat: 12.40, gps_arrivee_lng: -1.49 }];
  const perms = generateValidPermutations(courses);
  assert.strictEqual(perms.length, 1);
  assert.strictEqual(perms[0].length, 2);
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS — COMPUTEROUTEDISTANCE
// ═══════════════════════════════════════════════════════════════════════════

test('13. computeRouteDistance — distance positive', async () => {
  const { computeRouteDistance } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const steps = [
    { type: 'pickup', course_id: 'A', order: 1, status: 'pending', lat: LOGEMENTS_1200.lat, lng: LOGEMENTS_1200.lng },
    { type: 'pickup', course_id: 'B', order: 2, status: 'pending', lat: ZONE_1.lat, lng: ZONE_1.lng },
    { type: 'delivery', course_id: 'A', order: 3, status: 'pending', lat: OUAGA_2000.lat, lng: OUAGA_2000.lng },
    { type: 'delivery', course_id: 'B', order: 4, status: 'pending', lat: OUAGA_2000.lat, lng: OUAGA_2000.lng },
  ];
  const dist = computeRouteDistance(steps, ZONE_BOIS.lat, ZONE_BOIS.lng);
  assert.ok(dist);
  assert.ok(dist.totalKm > 0, 'Distance doit être positive');
  assert.ok(dist.driverToFirstKm > 0, 'Distance livreur→premier doit être positive');
});

test('14. computeRouteDistance — coordonnées invalides → null', async () => {
  const { computeRouteDistance } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const steps = [
    { type: 'pickup', course_id: 'A', order: 1, status: 'pending', lat: null, lng: null },
  ];
  const dist = computeRouteDistance(steps, ZONE_BOIS.lat, ZONE_BOIS.lng);
  assert.strictEqual(dist, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS — SELECTBESTROUTE
// ═══════════════════════════════════════════════════════════════════════════

test('15. selectBestRoute — GPS fiable → meilleur itinéraire', async () => {
  const { selectBestRoute } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  const driverGPS = { lat: ZONE_BOIS.lat, lng: ZONE_BOIS.lng, timestamp: new Date().toISOString(), isReliable: true };
  const best = selectBestRoute(courses, driverGPS);
  assert.ok(best, 'Doit retourner un meilleur itinéraire');
  assert.ok(best.totalDistanceKm > 0);
  assert.strictEqual(best.steps.length, 4);
});

test('16. selectBestRoute — GPS non fiable → null', async () => {
  const { selectBestRoute } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  const driverGPS = { lat: 0, lng: 0, timestamp: '', isReliable: false, reason: 'invalid_coordinates' };
  const best = selectBestRoute(courses, driverGPS);
  assert.strictEqual(best, null);
});

test('17. selectBestRoute — même destination → pas de déplacement inutile', async () => {
  const { selectBestRoute } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses(); // Les deux arrivent à OUAGA_2000
  const driverGPS = { lat: ZONE_BOIS.lat, lng: ZONE_BOIS.lng, timestamp: new Date().toISOString(), isReliable: true };
  const best = selectBestRoute(courses, driverGPS);
  assert.ok(best);
  // Les deux dernières étapes (deliveries) doivent être à la même position
  const deliveries = best.steps.filter(s => s.type === 'delivery');
  assert.strictEqual(deliveries.length, 2);
  assert.strictEqual(deliveries[0].lat, deliveries[1].lat);
  assert.strictEqual(deliveries[0].lng, deliveries[1].lng);
});

test('18. selectBestRoute — livreur plus proche du premier colis', async () => {
  const { selectBestRoute } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  // Livreur très proche de 1200 Logements
  const driverGPS = { lat: LOGEMENTS_1200.lat + 0.001, lng: LOGEMENTS_1200.lng, timestamp: new Date().toISOString(), isReliable: true };
  const best = selectBestRoute(courses, driverGPS);
  assert.ok(best);
  // La première étape doit être un pickup proche du livreur
  const firstStep = best.steps[0];
  assert.strictEqual(firstStep.type, 'pickup');
  const distToFirst = Math.abs(firstStep.lat - LOGEMENTS_1200.lat);
  assert.ok(distToFirst < 0.01, 'Premier pickup doit être proche du livreur');
});

test('19. selectBestRoute — livreur plus proche du deuxième colis', async () => {
  const { selectBestRoute } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  // Livreur très proche de Zone 1
  const driverGPS = { lat: ZONE_1.lat + 0.001, lng: ZONE_1.lng, timestamp: new Date().toISOString(), isReliable: true };
  const best = selectBestRoute(courses, driverGPS);
  assert.ok(best);
  // La première étape doit être un pickup proche du livreur (Zone 1)
  const firstStep = best.steps[0];
  assert.strictEqual(firstStep.type, 'pickup');
  const distToFirst = Math.abs(firstStep.lat - ZONE_1.lat);
  assert.ok(distToFirst < 0.01, 'Premier pickup doit être proche du livreur (Zone 1)');
});

test('20. selectBestRoute — meilleur itinéraire peut commencer par le colis éloigné', async () => {
  const { selectBestRoute } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  // Livreur à Zone du Bois — le meilleur itinéraire dépend de la géographie réelle
  const driverGPS = { lat: ZONE_BOIS.lat, lng: ZONE_BOIS.lng, timestamp: new Date().toISOString(), isReliable: true };
  const best = selectBestRoute(courses, driverGPS);
  assert.ok(best);
  // Le système doit choisir le trajet le plus court, pas nécessairement le plus proche
  assert.ok(best.totalDistanceKm > 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS — BUILDEROUTEPLANJSON
// ═══════════════════════════════════════════════════════════════════════════

test('21. buildRoutePlanJSON — format compatible APK', async () => {
  const { buildRoutePlanJSON, selectBestRoute } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  const driverGPS = { lat: ZONE_BOIS.lat, lng: ZONE_BOIS.lng, timestamp: new Date().toISOString(), isReliable: true };
  const best = selectBestRoute(courses, driverGPS);
  const json = buildRoutePlanJSON(best);
  const parsed = JSON.parse(json);
  assert.ok(Array.isArray(parsed));
  assert.strictEqual(parsed.length, 4);
  for (const step of parsed) {
    assert.ok(step.type === 'pickup' || step.type === 'delivery');
    assert.ok(step.course_id);
    assert.ok(typeof step.order === 'number');
    assert.ok(step.status === 'pending');
    assert.ok(typeof step.lat === 'number');
    assert.ok(typeof step.lng === 'number');
  }
});

test('22. buildRoutePlanJSON — ordres séquentiels 1,2,3,4', async () => {
  const { buildRoutePlanJSON, selectBestRoute } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  const driverGPS = { lat: ZONE_BOIS.lat, lng: ZONE_BOIS.lng, timestamp: new Date().toISOString(), isReliable: true };
  const best = selectBestRoute(courses, driverGPS);
  const json = buildRoutePlanJSON(best);
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed[0].order, 1);
  assert.strictEqual(parsed[1].order, 2);
  assert.strictEqual(parsed[2].order, 3);
  assert.strictEqual(parsed[3].order, 4);
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS — OPTIMIZEECOROUTEWITHDRIVERGPS
// ═══════════════════════════════════════════════════════════════════════════

test('23. optimizeEcoRouteWithDriverGPS — GPS fiable → optimisé', async () => {
  const { optimizeEcoRouteWithDriverGPS } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  const livreur = createTestLivreur();
  const result = await optimizeEcoRouteWithDriverGPS(null, courses, livreur, null);
  assert.strictEqual(result.optimized, true);
  assert.ok(result.routePlanJSON);
  assert.strictEqual(result.reason, 'optimized_with_driver_gps');
});

test('24. optimizeEcoRouteWithDriverGPS — GPS ancien → fallback', async () => {
  const { optimizeEcoRouteWithDriverGPS } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  const livreur = createTestLivreur(ZONE_BOIS.lat, ZONE_BOIS.lng, 15);
  const result = await optimizeEcoRouteWithDriverGPS(null, courses, livreur, null);
  assert.strictEqual(result.optimized, false);
  assert.strictEqual(result.reason, 'gps_too_old');
});

test('25. optimizeEcoRouteWithDriverGPS — GPS absent → fallback', async () => {
  const { optimizeEcoRouteWithDriverGPS } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  const livreur = { latitude: null, longitude: null, derniere_position_date: null };
  const result = await optimizeEcoRouteWithDriverGPS(null, courses, livreur, null);
  assert.strictEqual(result.optimized, false);
  assert.strictEqual(result.reason, 'invalid_coordinates');
});

test('26. optimizeEcoRouteWithDriverGPS — conservation de l\'itinéraire existant', async () => {
  const { optimizeEcoRouteWithDriverGPS } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  const livreur = createTestLivreur(ZONE_BOIS.lat, ZONE_BOIS.lng, 15);
  const existingPlan = JSON.stringify([{ type: 'pickup', course_id: 'A', order: 1, status: 'pending', lat: 12.35, lng: -1.51 }]);
  const result = await optimizeEcoRouteWithDriverGPS(null, courses, livreur, existingPlan);
  assert.strictEqual(result.optimized, false);
  assert.strictEqual(result.routePlanJSON, existingPlan);
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS — OPTIMIZEECOROUTEPRESERVINGCOMPLETED
// ═══════════════════════════════════════════════════════════════════════════

test('27. optimizeEcoRoutePreservingCompleted — étapes terminées préservées', async () => {
  const { optimizeEcoRoutePreservingCompleted } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  const livreur = createTestLivreur();
  const existingPlan = JSON.stringify([
    { type: 'pickup', course_id: 'course-A', order: 1, status: 'completed', lat: LOGEMENTS_1200.lat, lng: LOGEMENTS_1200.lng },
    { type: 'delivery', course_id: 'course-A', order: 2, status: 'completed', lat: OUAGA_2000.lat, lng: OUAGA_2000.lng },
    { type: 'pickup', course_id: 'course-B', order: 3, status: 'pending', lat: ZONE_1.lat, lng: ZONE_1.lng },
    { type: 'delivery', course_id: 'course-B', order: 4, status: 'pending', lat: OUAGA_2000.lat, lng: OUAGA_2000.lng },
  ]);
  const result = await optimizeEcoRoutePreservingCompleted(null, courses, livreur, existingPlan);
  assert.strictEqual(result.optimized, false);
  assert.strictEqual(result.reason, 'less_than_two_remaining_courses');
});

test('28. optimizeEcoRoutePreservingCompleted — pas d\'étape terminée → optimisation normale', async () => {
  const { optimizeEcoRoutePreservingCompleted } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  const livreur = createTestLivreur();
  const existingPlan = JSON.stringify([
    { type: 'pickup', course_id: 'course-A', order: 1, status: 'pending', lat: LOGEMENTS_1200.lat, lng: LOGEMENTS_1200.lng },
    { type: 'pickup', course_id: 'course-B', order: 2, status: 'pending', lat: ZONE_1.lat, lng: ZONE_1.lng },
    { type: 'delivery', course_id: 'course-A', order: 3, status: 'pending', lat: OUAGA_2000.lat, lng: OUAGA_2000.lng },
    { type: 'delivery', course_id: 'course-B', order: 4, status: 'pending', lat: OUAGA_2000.lat, lng: OUAGA_2000.lng },
  ]);
  const result = await optimizeEcoRoutePreservingCompleted(null, courses, livreur, existingPlan);
  assert.strictEqual(result.optimized, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS — SCÉNARIOS SPÉCIFIQUES
// ═══════════════════════════════════════════════════════════════════════════

test('29. Scénario réel — Zone du Bois → 1200 Logements → Zone 1 → Ouaga 2000', async () => {
  const { selectBestRoute } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  const driverGPS = { lat: ZONE_BOIS.lat, lng: ZONE_BOIS.lng, timestamp: new Date().toISOString(), isReliable: true };
  const best = selectBestRoute(courses, driverGPS);
  assert.ok(best);
  // Le système doit choisir un ordre valide (pas nécessairement celui que l'utilisateur suggère)
  assert.ok(best.totalDistanceKm > 0);
  // Vérifier que l'ordre respecte la contrainte pickup avant delivery
  for (const course of courses) {
    const pickupIdx = best.steps.findIndex(s => s.course_id === course.id && s.type === 'pickup');
    const deliveryIdx = best.steps.findIndex(s => s.course_id === course.id && s.type === 'delivery');
    assert.ok(pickupIdx < deliveryIdx);
  }
});

test('30. Deux courses, destinations différentes → optimisation', async () => {
  const { selectBestRoute } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = [
    { id: 'A', gps_depart_lat: 12.35, gps_depart_lng: -1.51, gps_arrivee_lat: 12.40, gps_arrivee_lng: -1.49 },
    { id: 'B', gps_depart_lat: 12.37, gps_depart_lng: -1.52, gps_arrivee_lat: 12.45, gps_arrivee_lng: -1.48 },
  ];
  const driverGPS = { lat: 12.35, lng: -1.53, timestamp: new Date().toISOString(), isReliable: true };
  const best = selectBestRoute(courses, driverGPS);
  assert.ok(best);
  assert.ok(best.totalDistanceKm > 0);
});

test('31. Isolation — ne modifie pas les prix', async () => {
  const { optimizeEcoRouteWithDriverGPS } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = [
    { id: 'A', gps_depart_lat: 12.35, gps_depart_lng: -1.51, gps_arrivee_lat: 12.40, gps_arrivee_lng: -1.49, prix_final: 5000, commission_silga: 250 },
    { id: 'B', gps_depart_lat: 12.37, gps_depart_lng: -1.52, gps_arrivee_lat: 12.45, gps_arrivee_lng: -1.48, prix_final: 3000, commission_silga: 150 },
  ];
  const livreur = createTestLivreur();
  const result = await optimizeEcoRouteWithDriverGPS(null, courses, livreur, null);
  assert.strictEqual(result.optimized, true);
  // Les prix ne doivent pas être modifiés (l'optimiseur ne touche pas aux prix)
  const parsed = JSON.parse(result.routePlanJSON);
  for (const step of parsed) {
    assert.ok(!step.prix, 'Les prix ne doivent pas être dans le route_plan');
    assert.ok(!step.commission, 'Les commissions ne doivent pas être dans le route_plan');
  }
});

test('32. Compatibilité APK — format route_plan_json identique', async () => {
  const { buildRoutePlanJSON, selectBestRoute } = await import('../base44/shared/ecoRouteOptimizer.ts');
  const courses = createTestCourses();
  const driverGPS = { lat: ZONE_BOIS.lat, lng: ZONE_BOIS.lng, timestamp: new Date().toISOString(), isReliable: true };
  const best = selectBestRoute(courses, driverGPS);
  const json = buildRoutePlanJSON(best);
  const parsed = JSON.parse(json);
  // Le format doit être exactement : [{type, course_id, order, status, lat, lng}]
  for (const step of parsed) {
    assert.ok('type' in step);
    assert.ok('course_id' in step);
    assert.ok('order' in step);
    assert.ok('status' in step);
    assert.ok('lat' in step);
    assert.ok('lng' in step);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  TESTS OPTIMISEUR DE TRAJETS SILGAPP ÉCO');
  console.log('═══════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
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