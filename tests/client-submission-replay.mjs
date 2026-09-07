import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/pages/CourseExterneFormSync.jsx', 'utf8');
const ast = ts.createSourceFile('form.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let mutation;
function visit(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'mutationFn') mutation = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(mutation);
const parcels = [], calls = [], courses = new Map();
let uuid = 0;
const context = {
  crypto: { randomUUID: () => `uuid-${++uuid}` }, formData: {}, console,
  normalizePhone: p => p, phoneVariants: p => [p], queryClient: { setQueryData() {} },
  base44: { entities: { ColisExterne: { create: async data => { parcels.push(data); return data; } } },
    functions: { invoke: async (name, payload) => {
      calls.push(name);
      if (name !== 'creerCourseClient') return {};
      const existing = courses.get(payload.request_id);
      if (existing) return { data: { course: existing, idempotent: true } };
      const course = { id: 'one-canonical-course', ...payload.course_data };
      courses.set(payload.request_id, course);
      return { data: { course } };
    } },
  },
};
const fn = vm.runInNewContext(`(${mutation})`, context);
const payload = { request_id: 'same-request', is_multi_colis: true,
  _colisData: [{ colis_uid: 'A', numero_ordre: 1 }, { colis_uid: 'B', numero_ordre: 2 }] };
await Promise.all([fn(payload), fn(payload)]);
console.log(JSON.stringify({ courses: courses.size, parcels: parcels.length,
  dispatchCalls: calls.filter(n => n === 'dispatchExterneAuto').length,
  notificationCalls: calls.filter(n => n === 'notifyClientSync').length }));
assert.equal(courses.size, 1);
assert.equal(parcels.length, 2, 'replayed canonical course must not create duplicate parcels');
assert.equal(calls.filter(n => n === 'dispatchExterneAuto').length, 1);
assert.equal(calls.filter(n => n === 'notifyClientSync').length, 1);
console.log('PASS: canonical response does not replay side effects (mocked backend).');
