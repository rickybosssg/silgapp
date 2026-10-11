import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { bestTwoCourseOrder } from '../base44/shared/ecoRouteOrder.ts';
let calculations = 0;
const distance = (x, y, u, v) => { calculations++; return Math.hypot(x - u, y - v); };
const course = (id, start, end) => ({ id, gps_depart_lat: start, gps_depart_lng: 0, gps_arrivee_lat: end, gps_arrivee_lng: 0 });
function validate(courses, expectedKm) {
  calculations = 0;
  const plan = bestTwoCourseOrder(courses, distance);
  assert.equal(plan.length, 4);
  for (const item of courses) {
    assert.ok(plan.findIndex(s => s.course_id === item.id && s.type === 'pickup') < plan.findIndex(s => s.course_id === item.id && s.type === 'delivery'));
  }
  const km = plan.slice(1).reduce((sum, step, i) => sum + Math.hypot(step.lat - plan[i].lat, step.lng - plan[i].lng), 0);
  assert.equal(km, expectedKm);
  assert.equal(calculations, 18, 'six valid orders, three legs each; no API');
  return plan;
}
validate([course('a', 0, 10), course('b', 1, 11)], 11);
validate([course('a', 0, 10), course('b', 10, 20)], 20);
validate([course('a', 0, 10), course('b', 11, 1)], 21);
const reversed = validate([course('a', 10, 20), course('b', 0, 9)], 20);
assert.equal(reversed[0].course_id, 'b');
assert.equal(bestTwoCourseOrder([course('a', 0, 10)], distance), null);
assert.equal(bestTwoCourseOrder([{ id: 'a' }, { id: 'b' }], distance), null);
const started = performance.now();
for (let i = 0; i < 10000; i++) bestTwoCourseOrder([course('a', 0, 10), course('b', 1, 11)], distance);
console.log(JSON.stringify({ result: 'PASS', scenarios: 6, iterations: 10000, local_cpu_ms: Math.round(performance.now() - started), ors_calls: 0, backend_calls: 0, note: 'synthetic coordinates; not real road validation or grouping latency' }));
