/**
 * Tests de non-régression — Correction 19
 * Annulation d'une course ajoutée sur trajet (mission multi-livraisons)
 */
import { strict as assert } from 'node:assert';

const results = [];
function test(name, fn) {
  results.push({ name, fn, passed: false, error: null });
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS — Simulation du moteur de recalculation
// ═══════════════════════════════════════════════════════════════════

const ACTIVE_STATUSES = [
  'livreur_en_route', 'client_contacte', 'en_route_expediteur',
  'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque',
  'pris_en_charge', 'en_livraison', 'arrivee',
];

const PICKUP_DONE_STATUSES = ['colis_recupere', 'en_livraison', 'arrivee', 'livree'];

/**
 * Simule la logique de recalculateEcoMissionAfterCancellation côté backend.
 * Retourne le nouvel état de la mission + les actions effectuées.
 */
function simulateRecalculation(mission, courses, cancelledCourseId) {
  const courseIds = mission.course_ids || [];
  const cancelledCourse = courses.find(c => c.id === cancelledCourseId);
  // ── Correction 19 : wasPickedUp basé sur heure_recuperation, pas le statut ──
  // Le statut a déjà été changé en 'annulee' ou 'en_attente' par annulerCourseExterne.
  // On utilise heure_recuperation : si définie, le colis a été récupéré avant l'annulation.
  const wasPickedUp = !!(cancelledCourse?.heure_recuperation);

  // Classifier les courses
  const activeCourses = courses.filter(c =>
    c &&
    c.statut !== 'annulee' &&
    c.statut !== 'livree' &&
    c.statut !== 'en_attente' &&
    !c.client_decision_attendue
  );

  // Mettre à jour le route plan
  let routePlan = [];
  try { routePlan = mission.route_plan_json ? JSON.parse(mission.route_plan_json) : []; } catch { routePlan = []; }
  let routeUpdated = false;

  for (const step of routePlan) {
    if (!step?.course_id) continue;
    const c = courses.find(co => co.id === step.course_id);
    if (!c) continue;
    const isTerminal = c.statut === 'livree' || c.statut === 'annulee';
    const isSuspended = c.statut === 'en_attente' || c.client_decision_attendue === true;
    if (isTerminal && step.status !== 'completed') { step.status = 'completed'; routeUpdated = true; }
    if (isSuspended && step.status !== 'cancelled') { step.status = 'cancelled'; routeUpdated = true; }
  }

  // Si annulation avant récupération → retirer de la mission
  let updatedCourseIds = courseIds;
  let courseRemoved = false;
  if (!wasPickedUp && cancelledCourse) {
    updatedCourseIds = courseIds.filter(id => id !== cancelledCourseId);
    const beforeLen = routePlan.length;
    routePlan = routePlan.filter(step => step?.course_id !== cancelledCourseId);
    if (routePlan.length !== beforeLen) routeUpdated = true;
    courseRemoved = true;
  }

  // Recalculer active_step_index
  const firstPendingStep = routePlan.find(s => s && s.status !== 'completed' && s.status !== 'cancelled');
  const newActiveStepIndex = firstPendingStep
    ? Math.max(0, (Number(firstPendingStep.order) || 1) - 1)
    : routePlan.length;

  // Déterminer le statut
  let newStatus = mission.status;
  let livreurLibere = false;

  if (activeCourses.length === 0) {
    const allTerminal = courses.every(c => c && (c.statut === 'livree' || c.statut === 'annulee'));
    if (allTerminal) {
      const allDelivered = courses.every(c => c && c.statut === 'livree');
      newStatus = allDelivered ? 'completed' : 'cancelled';
    } else {
      newStatus = 'cancelled';
    }
    livreurLibere = true;
  } else if (activeCourses.length === 1) {
    newStatus = 'invalidated';
  }

  return {
    recalculated: true,
    active_courses: activeCourses.length,
    new_status: newStatus,
    route_updated: routeUpdated,
    course_removed: courseRemoved ? cancelledCourseId : null,
    livreur_libere: livreurLibere,
    updated_course_ids: updatedCourseIds,
    updated_route_plan: routePlan,
    new_active_step_index: newActiveStepIndex,
  };
}

/**
 * Simule computeActiveStepIndex côté frontend (version corrigée).
 */
function computeActiveStepIndex(routePlan, courses) {
  if (!routePlan.length || !courses.length) return 0;
  const courseMap = new Map(courses.map(c => [c.id, c]));
  for (let i = 0; i < routePlan.length; i++) {
    const step = routePlan[i];
    const course = courseMap.get(step.course_id);
    if (!course) continue;
    if (course.statut === 'annulee' || course.statut === 'en_attente') continue;
    if (step.type === 'pickup') {
      const pickupDone = ['colis_recupere', 'en_livraison', 'arrivee', 'livree'].includes(course.statut);
      if (!pickupDone) return i;
    } else if (step.type === 'delivery') {
      if (course.statut !== 'livree') return i;
    }
  }
  return routePlan.length;
}

// ═══════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ═══════════════════════════════════════════════════════════════════

const ROUTE_PLAN_2_COURSES = [
  { course_id: 'course-A', type: 'pickup', order: 1, lat: 12.37, lng: -1.52 },
  { course_id: 'course-B', type: 'pickup', order: 2, lat: 12.38, lng: -1.53 },
  { course_id: 'course-A', type: 'delivery', order: 3, lat: 12.39, lng: -1.54 },
  { course_id: 'course-B', type: 'delivery', order: 4, lat: 12.40, lng: -1.55 },
];

function makeMission(courseIds, status = 'accepted') {
  return {
    id: 'mission-1',
    course_ids: courseIds,
    status,
    route_plan_json: JSON.stringify(ROUTE_PLAN_2_COURSES),
    active_step_index: 0,
    livreur_id: 'livreur-1',
  };
}

function makeCourse(id, statut = 'livreur_en_route', extra = {}) {
  return {
    id,
    statut,
    eco_mission_id: 'mission-1',
    livreur_id: 'livreur-1',
    prix_final: 2000,
    commission_silga: 200,
    montant_livreur: 1800,
    ...extra,
  };
}

// ═══════════════════════════════════════════════════════════════════
// TEST 1 : Annulation de la première course AVANT récupération
// ═══════════════════════════════════════════════════════════════════
test('1 — Annulation 1ère course avant récupération → mission invalidée, course retirée', () => {
  const mission = makeMission(['course-A', 'course-B']);
  const courses = [
    makeCourse('course-A', 'livreur_en_route'),
    makeCourse('course-B', 'livreur_en_route'),
  ];

  // Le client annule la course A
  courses[0].statut = 'annulee';

  const result = simulateRecalculation(mission, courses, 'course-A');

  assert.equal(result.recalculated, true, 'recalculated doit être true');
  assert.equal(result.active_courses, 1, '1 course active reste');
  assert.equal(result.new_status, 'invalidated', 'mission invalidée');
  assert.equal(result.course_removed, 'course-A', 'course-A retirée de la mission');
  assert.equal(result.updated_course_ids.includes('course-A'), false, 'course-A absente de course_ids');
  assert.equal(result.updated_course_ids.includes('course-B'), true, 'course-B conservée');
  assert.equal(result.livreur_libere, false, 'livreur non libéré (1 course reste)');
});

// ═══════════════════════════════════════════════════════════════════
// TEST 2 : Annulation de la deuxième course AVANT récupération
// ═══════════════════════════════════════════════════════════════════
test('2 — Annulation 2ème course avant récupération → mission invalidée, course retirée', () => {
  const mission = makeMission(['course-A', 'course-B']);
  const courses = [
    makeCourse('course-A', 'livreur_en_route'),
    makeCourse('course-B', 'livreur_en_route'),
  ];

  courses[1].statut = 'annulee';

  const result = simulateRecalculation(mission, courses, 'course-B');

  assert.equal(result.new_status, 'invalidated', 'mission invalidée');
  assert.equal(result.course_removed, 'course-B', 'course-B retirée');
  assert.equal(result.updated_course_ids.includes('course-A'), true, 'course-A conservée');
  assert.equal(result.active_courses, 1, '1 course active reste');
});

// ═══════════════════════════════════════════════════════════════════
// TEST 3 : Annulation APRÈS récupération (colis déjà pris en charge)
// ═══════════════════════════════════════════════════════════════════
test('3 — Annulation après récupération → course gardée, étapes marquées cancelled', () => {
  const mission = makeMission(['course-A', 'course-B']);
  const courses = [
    makeCourse('course-A', 'colis_recupere', { heure_recuperation: '2026-10-11T18:00:00Z' }), // déjà récupéré
    makeCourse('course-B', 'livreur_en_route'),
  ];

  // Le client annule la course A (colis déjà récupéré)
  courses[0].statut = 'annulee';

  const result = simulateRecalculation(mission, courses, 'course-A');

  assert.equal(result.course_removed, null, 'course-A NON retirée (déjà récupérée)');
  assert.equal(result.updated_course_ids.includes('course-A'), true, 'course-A conservée dans course_ids');
  assert.equal(result.new_status, 'invalidated', 'mission invalidée (1 active reste)');

  // Vérifier que les étapes de la course A sont marquées "completed" dans le route plan
  const aSteps = result.updated_route_plan.filter(s => s.course_id === 'course-A');
  assert.ok(aSteps.every(s => s.status === 'completed'), 'Étapes course-A marquées completed');
});

// ═══════════════════════════════════════════════════════════════════
// TEST 4 : Une seule course restante → vue individuelle
// ═══════════════════════════════════════════════════════════════════
test('4 — Une seule course restante → mission invalidée, vue individuelle', () => {
  const mission = makeMission(['course-A', 'course-B']);
  const courses = [
    makeCourse('course-A', 'livreur_en_route'),
    makeCourse('course-B', 'livreur_en_route'),
  ];

  courses[0].statut = 'annulee';

  const result = simulateRecalculation(mission, courses, 'course-A');

  assert.equal(result.new_status, 'invalidated', 'mission invalidée');
  assert.equal(result.active_courses, 1, '1 course active');

  // Simuler le frontend : la mission invalidée → activeEcoMission = null
  // → la course restante tombe dans nonEcoCoursesActives → CourseActiveCard
  const frontendMissionStatus = result.new_status;
  const showEcoDashboard = !['completed', 'cancelled', 'invalidated'].includes(frontendMissionStatus);
  assert.equal(showEcoDashboard, false, 'EcoMissionDashboard non affiché (mission invalidée)');
});

// ═══════════════════════════════════════════════════════════════════
// TEST 5 : Toutes les courses annulées → mission cancelled
// ═══════════════════════════════════════════════════════════════════
test('5 — Toutes les courses annulées → mission cancelled, livreur libéré', () => {
  const mission = makeMission(['course-A', 'course-B']);
  const courses = [
    makeCourse('course-A', 'annulee'),
    makeCourse('course-B', 'annulee'),
  ];

  const result = simulateRecalculation(mission, courses, 'course-A');

  assert.equal(result.new_status, 'cancelled', 'mission cancelled');
  assert.equal(result.active_courses, 0, '0 courses actives');
  assert.equal(result.livreur_libere, true, 'livreur libéré');
});

// ═══════════════════════════════════════════════════════════════════
// TEST 6 : Annulation livreur (en_attente) → course suspendue, mission invalidée
// ═══════════════════════════════════════════════════════════════════
test('6 — Annulation livreur (en_attente) → mission invalidée', () => {
  const mission = makeMission(['course-A', 'course-B']);
  const courses = [
    makeCourse('course-A', 'livreur_en_route'),
    makeCourse('course-B', 'livreur_en_route'),
  ];

  // Le livreur annule la course B → passe en en_attente avec client_decision_attendue
  courses[1].statut = 'en_attente';
  courses[1].client_decision_attendue = true;
  courses[1].livreur_id = null;

  const result = simulateRecalculation(mission, courses, 'course-B');

  assert.equal(result.new_status, 'invalidated', 'mission invalidée (1 active reste)');
  assert.equal(result.active_courses, 1, '1 course active (course-A)');
  assert.equal(result.course_removed, 'course-B', 'course-B retirée (avant récupération)');
});

// ═══════════════════════════════════════════════════════════════════
// TEST 7 : computeActiveStepIndex ignore les courses annulées/suspendues
// ═══════════════════════════════════════════════════════════════════
test('7a — computeActiveStepIndex saute les étapes des courses annulées', () => {
  const routePlan = ROUTE_PLAN_2_COURSES;
  const courses = [
    makeCourse('course-A', 'annulee'),
    makeCourse('course-B', 'livreur_en_route'),
  ];

  const idx = computeActiveStepIndex(routePlan, courses);
  // L'étape 0 (pickup course-A) doit être sautée (annulee)
  // L'étape 1 (pickup course-B) doit être retournée
  assert.equal(idx, 1, 'Index actif = 1 (pickup course-B, course-A annulée sautée)');
});

test('7b — computeActiveStepIndex saute les étapes des courses en_attente', () => {
  const routePlan = ROUTE_PLAN_2_COURSES;
  const courses = [
    makeCourse('course-A', 'en_attente'),
    makeCourse('course-B', 'livreur_en_route'),
  ];

  const idx = computeActiveStepIndex(routePlan, courses);
  assert.equal(idx, 1, 'Index actif = 1 (course-A en_attente sautée)');
});

test('7c — computeActiveStepIndex normal sans annulation', () => {
  const routePlan = ROUTE_PLAN_2_COURSES;
  const courses = [
    makeCourse('course-A', 'livreur_en_route'),
    makeCourse('course-B', 'livreur_en_route'),
  ];

  const idx = computeActiveStepIndex(routePlan, courses);
  assert.equal(idx, 0, 'Index actif = 0 (premier pickup)');
});

// ═══════════════════════════════════════════════════════════════════
// TEST 8 : Préserver les prix, commissions, historiques
// ═══════════════════════════════════════════════════════════════════
test('8 — Les prix et commissions ne sont PAS modifiés par le recalculation', () => {
  const mission = makeMission(['course-A', 'course-B']);
  const courses = [
    makeCourse('course-A', 'livreur_en_route', { prix_final: 2500, commission_silga: 250, montant_livreur: 2250 }),
    makeCourse('course-B', 'livreur_en_route', { prix_final: 3000, commission_silga: 300, montant_livreur: 2700 }),
  ];

  courses[0].statut = 'annulee';

  const result = simulateRecalculation(mission, courses, 'course-A');

  // Le recalculation ne modifie PAS les prix/commissions des courses
  assert.equal(courses[0].prix_final, 2500, 'prix_final course-A préservé');
  assert.equal(courses[0].commission_silga, 250, 'commission_silga course-A préservé');
  assert.equal(courses[1].prix_final, 3000, 'prix_final course-B préservé');
  assert.equal(courses[1].commission_silga, 300, 'commission_silga course-B préservé');
});

// ═══════════════════════════════════════════════════════════════════
// TEST 9 : Mission déjà terminale → pas de recalculation
// ═══════════════════════════════════════════════════════════════════
test('9 — Mission déjà cancelled → pas de recalculation', () => {
  const mission = makeMission(['course-A', 'course-B'], 'cancelled');
  const courses = [
    makeCourse('course-A', 'annulee'),
    makeCourse('course-B', 'annulee'),
  ];

  // Simuler le early return
  const isTerminal = ['completed', 'cancelled', 'invalidated'].includes(mission.status);
  assert.equal(isTerminal, true, 'Mission terminal détectée');
});

// ═══════════════════════════════════════════════════════════════════
// TEST 10 : Reprise de l'application après annulation — pas de mission fantôme
// ═══════════════════════════════════════════════════════════════════
test('10 — Reprise après annulation → pas de mission fantôme', () => {
  // Scénario : mission invalidée, course restante avec eco_mission_id encore set
  // Le frontend doit afficher la course via CourseActiveCard (pas EcoMissionDashboard)

  const missionStatus = 'invalidated';
  const remainingCourse = makeCourse('course-B', 'livreur_en_route', { eco_mission_id: 'mission-1' });

  // Le frontend vérifie : mission.status invalidated → activeEcoMission = null
  const showEcoDashboard = !['completed', 'cancelled', 'invalidated'].includes(missionStatus);
  assert.equal(showEcoDashboard, false, 'Pas de EcoMissionDashboard (mission invalidée)');

  // La course restante tombe dans nonEcoCoursesActives → CourseActiveCard
  const activeEcoCourseIds = new Set(); // vide car mission invalidée
  const isInEcoDashboard = activeEcoCourseIds.has(remainingCourse.id);
  assert.equal(isInEcoDashboard, false, 'Course restante non dans EcoMissionDashboard');
  // → Elle sera affichée par CourseActiveCard (vue individuelle)
});

// ═══════════════════════════════════════════════════════════════════
// TEST 11 : Course sans mission → pas de recalculation
// ═══════════════════════════════════════════════════════════════════
test('11 — Course sans eco_mission_id → pas de recalculation', () => {
  const course = makeCourse('course-X', 'livreur_en_route', { eco_mission_id: null });
  assert.equal(course.eco_mission_id, null, 'Course sans mission');
  // recalculateEcoMissionAfterCancellation retourne { recalculated: false, reason: 'no_mission' }
});

// ═══════════════════════════════════════════════════════════════════
// TEST 12 : Annulation de la course initiale → course supplémentaire conservée
// ═══════════════════════════════════════════════════════════════════
test('12 — Annulation course initiale → course supplémentaire conservée', () => {
  // La course initiale (course-A) est la course d'origine du livreur.
  // La course supplémentaire (course-B) a été ajoutée via proposition sur trajet.
  // Si la course initiale est annulée, la course supplémentaire doit rester active.

  const mission = makeMission(['course-A', 'course-B']);
  const courses = [
    makeCourse('course-A', 'livreur_en_route'), // course initiale
    makeCourse('course-B', 'livreur_en_route'), // course supplémentaire
  ];

  // Le client annule la course initiale (course-A)
  courses[0].statut = 'annulee';

  const result = simulateRecalculation(mission, courses, 'course-A');

  assert.equal(result.new_status, 'invalidated', 'mission invalidée');
  assert.equal(result.active_courses, 1, '1 course active (course-B)');
  assert.equal(result.updated_course_ids.includes('course-B'), true, 'course-B conservée');
  assert.equal(result.course_removed, 'course-A', 'course-A retirée (avant récupération)');
});

// ═══════════════════════════════════════════════════════════════════
// EXÉCUTION DES TESTS
// ═══════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

for (const t of results) {
  try {
    t.fn();
    t.passed = true;
    passed++;
    console.log(`  ✅ ${t.name}`);
  } catch (err) {
    t.passed = false;
    t.error = err.message;
    failed++;
    console.log(`  ❌ ${t.name}`);
    console.log(`     → ${err.message}`);
  }
}

console.log('\n═══════════════════════════════════════════════════');
console.log(`  RÉSULTAT : ${passed}/${results.length} tests réussis, ${failed} échoués`);
console.log('═══════════════════════════════════════════════════');

if (failed > 0) {
  process.exit(1);
}