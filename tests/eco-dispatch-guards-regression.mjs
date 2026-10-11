import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const courseSchema = read('base44/entities/CourseExterne.jsonc');
for (const field of [
  'delivery_mode',
  'eco_status',
  'eco_mission_id',
  'eco_created_at',
  'eco_convert_after_at',
  'eco_converted_at',
  'eco_conversion_reason',
  'eco_candidate_score',
]) {
  assert.match(courseSchema, new RegExp(`"${field}"`), `CourseExterne must keep ${field}`);
}

assert.ok(existsSync(new URL('../base44/entities/EcoMission.jsonc', import.meta.url)));
assert.ok(existsSync(new URL('../base44/entities/EcoProposal.jsonc', import.meta.url)));

const missionSchema = read('base44/entities/EcoMission.jsonc');
assert.match(missionSchema, /"accepting"/);

const engine = read('base44/shared/ecoOptimizationEngine.ts');
assert.match(engine, /export async function loadEcoConfig/);
assert.match(engine, /enabled:\s*!emergencyStop && parseBool/);
assert.match(engine, /DEFAULT_CONVERT_DELAY_MIN\s*=\s*45/);
assert.match(engine, /processEcoCourseCreated/);
assert.match(engine, /convertDueEcoCourses/);
assert.match(engine, /createOnRouteProposal/);
assert.match(engine, /respondToOnRouteProposal/);
assert.match(engine, /status:\s*'pending'/);

const clientCreate = read('base44/functions/creerCourseClient/entry.ts');
assert.match(clientCreate, /prepareEcoCreationFields/);
assert.match(clientCreate, /'delivery_mode', 'eco_status', 'eco_mission_id/);

const clientForm = read('src/pages/CourseExterneFormSync.jsx');
assert.match(clientForm, /const isEcoIsolated =[\s\S]*course\.delivery_mode === "eco"[\s\S]*course\.eco_status === "isolated"/);
assert.match(clientForm, /!formData\.date_souhaitee && !isEcoIsolated/);
assert.match(clientForm, /CourseConfirmationModal/);

const rechercheAnimation = read('src/components/client/LivreurRechercheAnimation.jsx');
assert.match(rechercheAnimation, /openCourseTracking/);
assert.match(rechercheAnimation, /state:\s*\{\s*course_id:/);
assert.doesNotMatch(rechercheAnimation, /Calculé à la livraison selon le tarif local/);
assert.match(rechercheAnimation, /Prix proposé par le client, conservé à la livraison/);

const adminCreate = read('base44/functions/creerCourseAdmin/entry.ts');
assert.match(adminCreate, /prepareEcoCreationFields/);
assert.match(adminCreate, /delete courseData\.eco_mission_id/);

const orchestrator = read('base44/functions/courseEventOrchestrator/entry.ts');
assert.match(orchestrator, /shouldHoldEcoCourseOnCreate/);
assert.match(orchestrator, /processEcoCourseCreated/);
assert.match(orchestrator, /eco_hold:\s*true/);

const dispatchAuto = read('base44/functions/dispatchExterneAuto/entry.ts');
assert.match(dispatchAuto, /course\.delivery_mode === 'eco' && course\.eco_status === 'isolated'/);
assert.match(dispatchAuto, /eco_isolated_pending_grouping/);
assert.match(dispatchAuto, /ecoOptimizationOrchestrator/);

const dispatchV2 = read('base44/shared/dispatchV2.ts');
assert.match(dispatchV2, /course\.eco_status === 'isolated' && course\.delivery_mode === 'eco'/);
assert.match(dispatchV2, /eco_isolated_pending_grouping/);

const watchdog = read('base44/shared/dispatchWatchdog.ts');
assert.match(watchdog, /course\.delivery_mode === 'eco' && course\.eco_status === 'isolated'/);

const dispatchConfig = read('src/components/admin/DispatchConfigPanel.jsx');
for (const key of [
  'ENABLED',
  'GROUPING_ENABLED',
  'ON_ROUTE_ENABLED',
  'EMERGENCY_STOP',
  'CONVERT_DELAY_MIN',
  'MAX_COURSES_PER_MISSION',
  'PROPOSAL_EXPIRATION_SEC',
  'MAX_DETOUR_KM',
  'MIN_DRIVER_GAIN',
]) {
  assert.match(dispatchConfig, new RegExp(key), `Dispatch config must expose/persist ${key}`);
}
assert.match(dispatchConfig, /useAdminContext/);
assert.match(dispatchConfig, /OFF par défaut/);

const useCourses = read('src/hooks/useCoursesDisponibles.js');
assert.match(useCourses, /eco_status:\s*"isolated"/);
assert.match(useCourses, /isEcoIsolated/);

const coursesDisponibles = read('src/components/livreur/CoursesDisponibles.jsx');
assert.match(coursesDisponibles, /Course Eco/);
assert.match(coursesDisponibles, /En attente de regroupement/);
assert.match(coursesDisponibles, /Course Eco en attente de regroupement/);

console.log('ECO_DISPATCH_GUARDS_REGRESSION=PASS');
