import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import { isGuestCourse } from '../base44/shared/guestOrderPolicy.js';
const source = fs.readFileSync(process.env.DRIVER_SOURCE || new URL('../base44/functions/getAllCoursesForLivreur/entry.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
const driver = { id: 'driver-test', user_email: 'driver@example.test', country_code: 'BF' };
const owner = { id: 'user-test', email: driver.user_email, country_code: 'BF' };
const guest = { id: 'isolated-guest', request_id: 'guest-v1:isolated', country_code: 'BF', livreur_id: driver.id, statut: 'en_livraison' };
async function run({ user = owner, course = guest, profile = driver, country = 'BF' } = {}) {
  let handler, authReads = 0;
  const api = { auth: { me: async () => { authReads++; return user; } }, asServiceRole: { entities: {
    Livreur: { get: async () => profile }, CourseExterne: { filter: async () => [course] },
  } } };
  vm.runInNewContext(source, { isGuestCourse, createClientFromRequest: () => api, Deno: { serve: fn => { handler = fn; } }, Response, console: { error() {} } });
  const response = await handler({ json: async () => ({ livreur_id: driver.id, country_code: country }) });
  return { status: response.status, data: await response.json(), authReads };
}
test('assigned guest is visible to its authenticated driver', async () => {
  assert.equal((await run()).data.courses.length, 1);
});
for (const [name, user] of [['anonymous', null], ['other account', { id: 'other', email: 'other@example.test' }], ['missing identity', { email: driver.user_email }], ['other country', { ...owner, country_code: 'CI' }], ['enterprise user', { ...owner, enterprise_id: 'tenant' }]]) {
  test(name + ' cannot retrieve guest using driver ID', async () => { assert.equal((await run({ user })).data.courses.length, 0); });
}
test('ordinary polling contract is unchanged, no extra auth read', async () => {
  const r = await run({ user: null, course: { ...guest, request_id: 'ordinary' } });
  assert.equal(r.data.courses.length, 1); assert.equal(r.authReads, 0);
});
test('guest offer does not reveal contact record before assignment', async () => {
  assert.equal((await run({ course: { ...guest, livreur_id: null, proposed_by_livreur_id: driver.id, dispatch_status: 'propose', dispatch_notified_ids: [driver.id] } })).data.courses.length, 0);
});
test('stale acceptance does not replace current assignment', async () => {
  assert.equal((await run({ course: { ...guest, livreur_id: 'other-driver', accepted_by_livreur_id: driver.id } })).data.courses.length, 0);
});
test('financial driver can read delivered history only', async () => {
  const course = { ...guest, livreur_id: null, livreur_financier_id: driver.id };
  assert.equal((await run({ course })).data.courses.length, 0);
  assert.equal((await run({ course: { ...course, statut: 'livree' } })).data.courses.length, 1);
});
test('guest enterprise record excluded', async () => {
  assert.equal((await run({ course: { ...guest, enterprise_id: 'tenant' } })).data.courses.length, 0);
});
test('country mismatch still refused', async () => { assert.equal((await run({ country: 'CI' })).status, 403); });
