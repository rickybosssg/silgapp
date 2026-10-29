import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileGuestCourse, preferredGuestCountry, retryDelayMs, withRequestDeadline } from '../src/lib/guestTrackingState.js';
import { optionalPickupPosition } from '../src/lib/pickupConfirmation.js';

test('BF initial only when enabled; explicit service country remains independent', () => {
  assert.equal(preferredGuestCountry(['BF','GH'],'') ,'BF');
  assert.equal(preferredGuestCountry(['BF','GH'],'GH'),'GH');
  assert.equal(preferredGuestCountry(['GH'],''),'');
  assert.equal(preferredGuestCountry(['BF'],'GH'),'');
});
for (const status of ['annulee','livree','terminee']) test(`late search never reopens ${status}`, () => {
  const current = { reference:'same',statut:status };
  assert.equal(reconcileGuestCourse(current,{reference:'same',statut:'recherche_livreur'}),current);
});
test('another course and legitimate withdrawal are not masked', () => {
  const old = {reference:'one',statut:'livree'};
  const next = {reference:'two',statut:'recherche_livreur'};
  assert.equal(reconcileGuestCourse(old,next),next);
  assert.equal(reconcileGuestCourse({reference:'two',statut:'livreur_en_route'},next),next);
});
test('older server revision ignored when supplied', () => {
  const current={reference:'one',statut:'colis_recupere',updated_at:'2026-10-28T18:00:00Z'};
  assert.equal(reconcileGuestCourse(current,{reference:'one',statut:'livreur_en_route',updated_at:'2026-10-28T17:00:00Z'}),current);
});
test('malformed response does not become success', () => {
  assert.throws(()=>reconcileGuestCourse(null,{}));
});
test('retry-after seconds/date preserve cooldown', () => {
  assert.equal(retryDelayMs('90'),90000);
  assert.equal(retryDelayMs('1'),30000);
  assert.equal(retryDelayMs(null),30000);
  assert.equal(retryDelayMs('Wed, 28 Oct 2026 18:02:00 GMT',Date.parse('2026-10-28T18:00:00Z')),120000);
});
test('deadline does not retry or turn a late completion into success', async () => {
  let resolve;
  const pending=new Promise(r=>{resolve=r;});
  await assert.rejects(withRequestDeadline(pending,5,'uncertain'),e=>e.status===408&&e.code==='REQUEST_UNCERTAIN');
  resolve({success:true});
  assert.equal(await withRequestDeadline(Promise.resolve('confirmed'),20,'uncertain'),'confirmed');
});
test('native GPS silence is bounded and a late callback has no second effect', async () => {
  let callback;
  const result=await optionalPickupPosition({getCurrentPosition(success){callback=success;}},5);
  assert.equal(result,null);
  callback({coords:{latitude:12,longitude:-1}});
});
test('GPS failure or absence remains optional', async () => {
  assert.equal(await optionalPickupPosition(null),null);
  assert.equal(await optionalPickupPosition({getCurrentPosition(){throw Error('denied');}}),null);
});
