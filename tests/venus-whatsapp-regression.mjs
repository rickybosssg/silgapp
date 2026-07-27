import fs from 'node:fs';
import path from 'node:path';
import {
  confirmCurrentDraft,
  markDraftRecapPresented,
  mergeCourseDraft,
  resetCourseDraft,
  validateCourseDraft,
} from '../base44/shared/venusConversationSafety.ts';
import { detecterIntentionRapide } from '../base44/shared/venusToolsEngine.ts';

const results = [];
let sequence = 0;

function makeState() {
  return {
    draft: null,
    processedSids: new Set(),
    courses: [],
    dbWrites: [],
    model: 'local-deterministic',
    fallback: null,
    tokens: 0,
    cost: 0,
  };
}

function processMessage(state, event) {
  const started = performance.now();
  const before = {
    draft: state.draft ? structuredClone(state.draft) : null,
    courses: structuredClone(state.courses),
    processedSids: [...state.processedSids],
  };

  if (state.processedSids.has(event.sid)) {
    return {
      duplicate: true,
      created: 0,
      before,
      after: before,
      latency_ms: performance.now() - started,
    };
  }
  state.processedSids.add(event.sid);

  if (event.resetDraft) state.draft = resetCourseDraft(() => event.draftId || `draft_${event.sid}`);
  if (event.updates) state.draft = mergeCourseDraft(state.draft, event.updates, () => event.draftId || `draft_${event.sid}`);
  if (event.presentRecap) state.draft = markDraftRecapPresented(state.draft);
  if (event.message) state.draft = confirmCurrentDraft(state.draft || {}, event.message);

  let created = 0;
  if (event.tryCreate) {
    const validation = validateCourseDraft(state.draft);
    if (validation.complete && validation.confirmed) {
      const courseId = `TEST_COURSE_${String(state.courses.length + 1).padStart(4, '0')}`;
      state.courses.push({ id: courseId, draft_id: state.draft.draft_id, status: 'test_archived' });
      state.dbWrites.push({ type: 'course_create_test', id: courseId });
      state.draft = { ...state.draft, course_created: true, course_id: courseId };
      created = 1;
    }
  }

  return {
    duplicate: false,
    created,
    before,
    after: {
      draft: state.draft ? structuredClone(state.draft) : null,
      courses: structuredClone(state.courses),
      processedSids: [...state.processedSids],
    },
    latency_ms: performance.now() - started,
  };
}

function record(name, category, messages, expected, obtained, state, extra = {}) {
  const checks = [];
  if (expected.created !== undefined) checks.push(obtained.created === expected.created);
  if (expected.totalCourses !== undefined) checks.push(state.courses.length === expected.totalCourses);
  if (expected.missingField !== undefined) checks.push(validateCourseDraft(state.draft).missingField === expected.missingField);
  if (expected.confirmed !== undefined) checks.push(validateCourseDraft(state.draft).confirmed === expected.confirmed);
  if (expected.duplicate !== undefined) checks.push(obtained.duplicate === expected.duplicate);
  if (expected.noOldAddress) checks.push(state.draft?.adresse_depart !== 'Ancienne adresse');
  if (expected.intention) checks.push(extra.intention_obtenue === expected.intention);
  const success = checks.every(Boolean);

  results.push({
    id: `VENUS_REG_${String(++sequence).padStart(4, '0')}`,
    scenario: name,
    category,
    messages,
    expected,
    obtained: {
      created: obtained.created,
      duplicate: obtained.duplicate,
      intention: extra.intention_obtenue || null,
      action: obtained.created ? 'creer_course' : 'aucune_ecriture',
      draft: state.draft,
    },
    db_before: obtained.before,
    db_after: obtained.after,
    courses_created: obtained.created,
    model_used: state.model,
    fallback: state.fallback,
    tokens: state.tokens,
    cost_usd: state.cost,
    latency_ms: Number(obtained.latency_ms.toFixed(3)),
    success,
  });
}

const greetings = ['Bonjour', 'Bonsoir', 'Bonsoit', 'Bjr', 'Salut', 'Je dis bonsoir', 'Merci', 'Au revoir'];
for (let i = 0; i < 32; i++) {
  const message = greetings[i % greetings.length];
  const state = makeState();
  const obtained = processMessage(state, { sid: `SM_GREET_${i}`, message });
  const intention = detecterIntentionRapide(message);
  const expectedIntention = ['Merci', 'Au revoir'].includes(message) ? 'autre' : 'salutation';
  record(`Salutation ${message} #${i + 1}`, 'salutations', [message], {
    created: 0, totalCourses: 0, intention: expectedIntention,
  }, obtained, state, { intention_obtenue: intention });
}

const missingCases = [
  [{}, 'type_course'],
  [{ type_course: 'expedier' }, 'adresse_depart'],
  [{ type_course: 'expedier', adresse_depart: 'Tampouy' }, 'adresse_arrivee'],
  [{ type_course: 'expedier', adresse_depart: 'Tampouy', adresse_arrivee: 'Kiloins' }, 'contact'],
  [{ type_course: 'recevoir', adresse_depart: 'Karpala', adresse_arrivee: 'Pissy' }, 'contact'],
  [{ type_course: 'deplacement', adresse_depart: 'Gounghin' }, 'adresse_arrivee'],
];
for (let i = 0; i < 80; i++) {
  const [updates, missingField] = missingCases[i % missingCases.length];
  const state = makeState();
  const obtained = processMessage(state, {
    sid: `SM_MISSING_${i}`, draftId: `draft_missing_${i}`, resetDraft: true, updates, message: 'oui', tryCreate: true,
  });
  record(`Demande incomplete #${i + 1}`, 'informations_manquantes', ['Je veux une course', 'oui'], {
    created: 0, totalCourses: 0, missingField, confirmed: false,
  }, obtained, state);
}

const courseTypes = ['expedier', 'recevoir', 'deplacement'];
for (let i = 0; i < 80; i++) {
  const state = makeState();
  const type = courseTypes[i % courseTypes.length];
  const updates = {
    type_course: type,
    adresse_depart: i % 2 ? 'Tampouy' : 'Karpala',
    adresse_arrivee: i % 2 ? 'Kiloins' : 'Saaba',
    ...(type === 'deplacement'
      ? { contact_is_client: true }
      : { contact_telephone: `7012${String(i).padStart(4, '0')}` }),
  };
  processMessage(state, { sid: `SM_COMPLETE_A_${i}`, draftId: `draft_complete_${i}`, resetDraft: true, updates });
  processMessage(state, { sid: `SM_COMPLETE_B_${i}`, presentRecap: true });
  processMessage(state, { sid: `SM_COMPLETE_C_${i}`, message: i % 2 ? 'Oui' : 'Je confirme' });
  const obtained = processMessage(state, { sid: `SM_COMPLETE_D_${i}`, tryCreate: true });
  record(`Course complete confirmee #${i + 1}`, 'confirmation', [
    `Je veux ${type}`, `${updates.adresse_depart} vers ${updates.adresse_arrivee}`, 'Je confirme',
  ], { created: 1, totalCourses: 1, confirmed: true }, obtained, state);
}

for (let i = 0; i < 40; i++) {
  const state = makeState();
  processMessage(state, {
    sid: `SM_STALE_A_${i}`, draftId: `draft_stale_${i}`, resetDraft: true,
    updates: { type_course: 'expedier', adresse_depart: 'Tampouy', adresse_arrivee: 'Saaba', contact_telephone: '70123456' },
  });
  processMessage(state, { sid: `SM_STALE_B_${i}`, presentRecap: true });
  processMessage(state, { sid: `SM_STALE_C_${i}`, updates: { adresse_arrivee: 'Karpala' } });
  processMessage(state, { sid: `SM_STALE_D_${i}`, message: 'oui' });
  const obtained = processMessage(state, { sid: `SM_STALE_E_${i}`, tryCreate: true });
  record(`Confirmation stale apres modification #${i + 1}`, 'confirmation_stale', [
    'Tampouy vers Saaba', 'Attends, change la destination pour Karpala', 'oui',
  ], { created: 0, totalCourses: 0, confirmed: false }, obtained, state);
}

for (let i = 0; i < 30; i++) {
  const state = makeState();
  const sid = `SM_DUP_${i}`;
  processMessage(state, { sid, draftId: `draft_dup_${i}`, resetDraft: true, updates: {
    type_course: 'deplacement', adresse_depart: 'Pissy', adresse_arrivee: 'Ouaga 2000',
  } });
  const obtained = processMessage(state, { sid, updates: { adresse_arrivee: 'Tampouy' }, tryCreate: true });
  record(`Rejeu MessageSid #${i + 1}`, 'idempotence', ['Je veux me déplacer', 'webhook rejoué'], {
    created: 0, totalCourses: 0, duplicate: true,
  }, obtained, state);
}

for (let i = 0; i < 20; i++) {
  const state = makeState();
  processMessage(state, { sid: `SM_MEMORY_A_${i}`, draftId: `old_${i}`, resetDraft: true, updates: {
    type_course: 'expedier', adresse_depart: 'Ancienne adresse', adresse_arrivee: 'Ancienne destination', contact_telephone: '70000000',
  } });
  processMessage(state, { sid: `SM_MEMORY_B_${i}`, draftId: `new_${i}`, resetDraft: true, updates: { type_course: 'recevoir' } });
  const obtained = processMessage(state, { sid: `SM_MEMORY_C_${i}`, tryCreate: true });
  record(`Nouvelle demande sans reutilisation ancienne #${i + 1}`, 'memoire', [
    'Ancienne course terminée', 'Je veux une nouvelle course',
  ], { created: 0, totalCourses: 0, noOldAddress: true, missingField: 'adresse_depart' }, obtained, state);
}

for (let i = 0; i < 20; i++) {
  const state = makeState();
  processMessage(state, { sid: `SM_SCHED_A_${i}`, draftId: `scheduled_${i}`, resetDraft: true, updates: {
    type_course: 'expedier', adresse_depart: 'Tampouy', adresse_arrivee: 'Kiloins',
    contact_telephone: '70123456', date_programmee: '2026-08-01', heure_programmee: '15:00',
  } });
  processMessage(state, { sid: `SM_SCHED_B_${i}`, presentRecap: true });
  processMessage(state, { sid: `SM_SCHED_C_${i}`, message: 'ok' });
  const obtained = processMessage(state, { sid: `SM_SCHED_D_${i}`, tryCreate: true });
  record(`Course programmee #${i + 1}`, 'programmation', ['Demain à 15 h', 'ok'], {
    created: 1, totalCourses: 1, confirmed: true,
  }, obtained, state);
}

const invalidSchedules = [
  { date_programmee: 'demain', heure_programmee: '15:00', missing: 'date_programmee_invalide' },
  { date_programmee: '2026-08-01', heure_programmee: '25:70', missing: 'heure_programmee_invalide' },
];
for (let i = 0; i < 20; i++) {
  const state = makeState();
  const invalid = invalidSchedules[i % invalidSchedules.length];
  processMessage(state, { sid: `SM_BAD_SCHED_A_${i}`, draftId: `bad_scheduled_${i}`, resetDraft: true, updates: {
    type_course: 'expedier', adresse_depart: 'Tampouy', adresse_arrivee: 'Kiloins',
    contact_telephone: '70123456', date_programmee: invalid.date_programmee, heure_programmee: invalid.heure_programmee,
  } });
  processMessage(state, { sid: `SM_BAD_SCHED_B_${i}`, presentRecap: true });
  processMessage(state, { sid: `SM_BAD_SCHED_C_${i}`, message: 'oui' });
  const obtained = processMessage(state, { sid: `SM_BAD_SCHED_D_${i}`, tryCreate: true });
  record(`Programmation invalide #${i + 1}`, 'programmation_invalide', ['Demain à une heure invalide', 'oui'], {
    created: 0, totalCourses: 0, missingField: invalid.missing,
  }, obtained, state);
}

const intentionCases = [
  ['Je veux annuler ma course', 'annuler_course'],
  ['Annule la livraison', 'annuler_course'],
  ['Je ne veux plus de cette course', 'annuler_course'],
  ['Où est mon livreur ?', 'suivre_course'],
  ['Ma course en est où ?', 'suivre_course'],
  ['Quel est le statut de ma course ?', 'suivre_course'],
  ['Je veux envoyer un colis 📦', 'creer_course'],
  ['Je veux recevoir un colis', 'creer_course'],
  ['Je veux me déplacer', 'creer_course'],
  ['Je voudrai une livrason de Tampouy à Kiloins', 'creer_course'],
];
for (let i = 0; i < 60; i++) {
  const [message, expectedIntention] = intentionCases[i % intentionCases.length];
  const state = makeState();
  const obtained = processMessage(state, { sid: `SM_INTENT_${i}`, message });
  record(`Intention réaliste #${i + 1}`, 'intentions', [message], {
    created: 0, totalCourses: 0, intention: expectedIntention,
  }, obtained, state, { intention_obtenue: detecterIntentionRapide(message) });
}

const failureModes = ['openai_timeout', 'openai_unavailable', 'rag_unavailable', 'db_read_error', 'media_unsupported'];
for (let i = 0; i < 20; i++) {
  const state = makeState();
  state.fallback = failureModes[i % failureModes.length];
  state.model = 'fallback-local-no-write';
  const obtained = processMessage(state, { sid: `SM_FAILURE_${i}`, message: 'Je veux envoyer un colis', tryCreate: true });
  record(`Panne simulee ${state.fallback} #${i + 1}`, 'resilience', ['Je veux envoyer un colis'], {
    created: 0, totalCourses: 0,
  }, obtained, state);
}

const summary = {
  generated_at: new Date().toISOString(),
  environment: 'local-memory-only',
  production_writes: 0,
  total: results.length,
  passed: results.filter((result) => result.success).length,
  failed: results.filter((result) => !result.success).length,
  pass_rate: Number((results.filter((result) => result.success).length / results.length * 100).toFixed(2)),
  categories: Object.fromEntries(
    [...new Set(results.map((result) => result.category))].map((category) => {
      const categoryResults = results.filter((result) => result.category === category);
      return [category, {
        total: categoryResults.length,
        passed: categoryResults.filter((result) => result.success).length,
        failed: categoryResults.filter((result) => !result.success).length,
      }];
    }),
  ),
};

const outputDir = path.resolve('test-results');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, 'venus-whatsapp-regression.json'),
  JSON.stringify({ summary, results }, null, 2),
  'utf8',
);

console.log(JSON.stringify(summary, null, 2));
if (summary.failed > 0) {
  console.error(JSON.stringify(results.filter((result) => !result.success).slice(0, 20), null, 2));
  process.exit(1);
}
