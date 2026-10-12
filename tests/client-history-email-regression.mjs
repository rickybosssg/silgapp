import assert from 'node:assert/strict';
import { loadClientCourseHistory } from '../src/lib/clientCourseHistory.js';

const calls = [];
const api = { entities: { CourseExterne: { filter: async (filter, sort, limit) => {
  calls.push({ filter, sort, limit });
  if (filter.client_user_email) return [{ id: 'service-role-created', updated_date: '2026-10-12' }];
  if (filter.expediteur_client_id) return [{ id: 'legacy', updated_date: '2026-10-11' }, { id: 'service-role-created', updated_date: '2026-10-12' }];
  return [];
} } } };
assert.deepEqual(await loadClientCourseHistory(api, { userId: 'u', userEmail: 'test@example.invalid', clientProfilId: 'p' }), [
  { id: 'service-role-created', updated_date: '2026-10-12' },
  { id: 'legacy', updated_date: '2026-10-11' },
]);
assert.equal(calls.length, 4);
assert.ok(calls.every(c => c.sort === '-updated_date' && c.limit === 50));
calls.length = 0;
await loadClientCourseHistory(api, { userId: 'u', userEmail: 'test@example.invalid' });
assert.equal(calls.length, 2);
assert.deepEqual(await loadClientCourseHistory(api, { userId: 'u' }), []);
const denied = { entities: { CourseExterne: { filter: async () => { throw new Error('403'); } } } };
await assert.rejects(loadClientCourseHistory(denied, { userId: 'u', userEmail: 'test@example.invalid' }), /403/);
console.log('PASS authenticated email history, legacy links, deduplication and read errors (simulated SDK; no production writes)');
