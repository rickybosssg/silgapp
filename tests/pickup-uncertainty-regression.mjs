import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverUncertainParcelPickup } from '../src/lib/pickupConfirmation.js';

const saved = { id: 'test', statut: 'colis_recupere', heure_recuperation: '2026-10-28T10:53:00Z' };
for (const status of [undefined, 408, 500, 503]) {
  test(`one read, no write after uncertain ${status}`, async () => {
    let reads = 0;
    const api = { entities: { CourseExterne: { get: async () => { reads++; return saved; } } } };
    assert.equal(await recoverUncertainParcelPickup(api, 'test', { status }), saved);
    assert.equal(reads, 1);
  });
}
for (const status of [400, 401, 403, 409, 429]) {
  test(`preserve refusal ${status} without additional read`, async () => {
    const error = { response: { status } };
    await assert.rejects(recoverUncertainParcelPickup({}, 'test', error), e => e === error);
  });
}
for (const row of [{ ...saved, statut: 'annulee' }, { ...saved, id: 'other' }, { ...saved, heure_recuperation: null }, { ...saved, annulation_user_id: 'admin' }]) {
  test(`never invent pickup: ${JSON.stringify(row)}`, async () => {
    const error = new Error('uncertain');
    const api = { entities: { CourseExterne: { get: async () => row } } };
    await assert.rejects(recoverUncertainParcelPickup(api, 'test', error), e => e === error);
  });
}
