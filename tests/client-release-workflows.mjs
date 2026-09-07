import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => fs.readFileSync(path, 'utf8');
function compile(source) {
  return ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
}
const quiet = { log() {}, error() {}, warn() {} };
async function cancellation(origin) {
  let handler;
  const updates = [], invocations = [];
  const course = { id: 'qa-course', source: origin, statut: 'livreur_en_route', livreur_id: 'driver-cancelling',
    dispatch_refused_ids: '["previous-refusal"]', country_code: 'BF' };
  const generic = { get: async () => null, filter: async () => [], create: async data => data, update: async () => ({}) };
  const entities = new Proxy({}, { get: (_, name) => name === 'CourseExterne' ? {
    ...generic, get: async () => course, update: async (id, data) => { updates.push(data); return data; },
  } : generic });
  const client = { auth: { me: async () => ({ email: 'qa@example.test' }) }, asServiceRole: {
    entities, functions: { invoke: async (name, payload) => { invocations.push({ name, payload }); return {}; } },
  } };
  vm.runInNewContext(compile(read('base44/functions/annulerCourseExterne/entry.ts')), {
    Deno: { serve: fn => { handler = fn; } }, createClientFromRequest: () => client, Response, console: quiet,
  });
  const response = await handler(new Request('http://localhost/test', {
    method: 'POST', body: JSON.stringify({ course_id: course.id, source: 'livreur', motif: 'panne_vehicule' }),
  }));
  assert.equal(response.status, 200);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].dispatch_status, origin === 'client' ? 'en_attente' : 'redispatch');
  assert.deepEqual(JSON.parse(updates[0].dispatch_refused_ids), ['previous-refusal', 'driver-cancelling']);
  assert.equal(updates[0].livreur_id, null);
  const dispatch = invocations.filter(c => c.name === 'dispatchExterneAuto');
  assert.equal(dispatch.length, origin === 'client' ? 1 : 0);
  if (dispatch.length) assert.equal(dispatch[0].payload.action, 'lancer_recherche_auto');
}
await cancellation('client');
await cancellation('admin');
console.log('PASS: client auto redispatch, admin manual, course-scoped refusals preserved (mocked backend).');

// Execute the real submission-signature block without invoking production services.
const form = read('src/pages/CourseExterneFormSync.jsx');
const start = form.indexOf('    const _submissionSignature =');
const end = form.indexOf('    createMutation.mutate(', start);
assert.ok(start > 0 && end > start);
const signatureCode = form.slice(start, end);
let counter = 0;
const ctx = { formData: { type_course: 'expedier', adresse_depart: 'A', notes: '', prix_propose: 1250 },
  colis: [{ destinataire_telephone: '70000001', adresse_livraison: 'B' }, { destinataire_telephone: '70000002', adresse_livraison: 'C' }],
  adresseArriveeFinale: 'Tournee multi-colis', expediteurTel: '70000000', destinataireTelFinal: '70000001',
  destinataireNomFinal: '2 destinataires', isMulti: true, prixEstime: 1250, isDeplacement: false,
  courseCountryCode: 'BF', submitRequestIdRef: { current: null }, submitSignatureRef: { current: null },
  crypto: { randomUUID: () => `request-${++counter}` } };
const submit = () => { vm.runInNewContext(`(() => { ${signatureCode} })()`, ctx); return ctx.submitRequestIdRef.current; };
const first = submit();
assert.equal(submit(), first, 'same submission retries must keep request_id');
ctx.colis[1].adresse_livraison = 'Changed destination';
assert.notEqual(submit(), first, 'editing the second parcel must change request_id');
const second = submit();
ctx.formData.notes = 'New instructions';
assert.notEqual(submit(), second, 'editing instructions must change request_id');
const third = submit();
ctx.submitRequestIdRef.current = null;
ctx.submitSignatureRef.current = null;
assert.notEqual(submit(), third, 'a successful submission must permit a fresh ID immediately');
assert.ok(!/180000|3\s*\*\s*60\s*\*\s*1000/.test(form), 'no global three-minute block');
console.log('PASS: retry identity, edited parcel/instructions, new course immediately.');

const animation = read('src/components/client/LivreurRechercheAnimation.jsx');
assert.match(animation, /onAjouterAutre/);
assert.match(animation, /state:\s*\{\s*course_id:/);
assert.match(form, /onAjouterAutre=\{handleAjouterAutre\}/);
const resetStart = form.indexOf('  const handleAjouterAutre =');
const resetEnd = form.indexOf('\n  const ', resetStart + 10);
assert.ok(resetStart > 0 && resetEnd > resetStart);
const states = {};
vm.runInNewContext(`${form.slice(resetStart, resetEnd)}; handleAjouterAutre();`, {
  resetSubmission() {}, submitRequestIdRef: ctx.submitRequestIdRef, submitSignatureRef: ctx.submitSignatureRef,
  setCourseCreated: v => { states.created = v; }, setCreatedCourse: v => { states.course = v; },
  setInvitationModal: v => { states.modal = v; }, setCurrentStep: v => { states.step = v; },
  setFormData: v => { states.form = v; }, setColis: v => { states.colis = v; },
  freshData: { type_course: 'expedier', destinataire_telephone: '' }, createColisDefaults: n => Array(n).fill({}),
  localStorage: { removeItem() {} }, STORAGE_KEY: 'draft', STEP_KEY: 'step',
});
assert.equal(states.created, false);
assert.equal(states.course, null);
assert.equal(states.step, 0);
assert.equal(states.form.destinataire_telephone, '');
assert.equal(states.colis.length, 1);
assert.equal(ctx.submitRequestIdRef.current, null);
console.log('PASS: fresh React form state and explicit course tracking. No production calls.');
