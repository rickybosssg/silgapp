import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reconcilePickupView, reconcilePickupRows, pickupDisplayStatus } from '../src/lib/confirmedPickupView.js';
import { getPrixAffichable, getDeviseAffichable } from '../src/utils/getPrixAffichable.js';
const before = { id: 'test-only', statut: 'en_route_expediteur' };
const saved = { ...before, statut: 'colis_recupere', heure_recuperation: '2026-10-28T20:40:00Z', updated_date: '2026-10-28T20:40:00Z' };
test('confirmed pickup overrides pending departure and survives late read', () => {
  assert.equal(pickupDisplayStatus(saved, 'en_route_expediteur'), 'colis_recupere');
  assert.deepEqual(reconcilePickupView(saved, before), saved);
  assert.deepEqual(reconcilePickupRows([saved], [before]), [saved]);
});
test('delivery progression, cancellation and terminal states retained', () => {
  const delivery = {...saved, statut:'en_livraison', updated_date:'2026-10-28T20:41:00Z'};
  assert.deepEqual(reconcilePickupView(saved, delivery), delivery);
  assert.deepEqual(reconcilePickupView(delivery, saved), delivery);
  for (const statut of ['annulee','livree','terminee']) {
    const terminal = {...saved, statut};
    assert.deepEqual(reconcilePickupView(saved, terminal), terminal);
    assert.deepEqual(reconcilePickupView(terminal, before), terminal);
    assert.equal(pickupDisplayStatus(terminal, 'en_route_expediteur'), statut);
  }
});
test('no fabricated pickup, cross-course replacement or restored removed row', () => {
  assert.equal(reconcilePickupView(before, before), before);
  const other = {...before, id:'other'};
  assert.equal(reconcilePickupView(saved, other), other);
  assert.deepEqual(reconcilePickupRows([saved], []), []);
  assert.equal(pickupDisplayStatus(before, null), before.statut);
});
test('real amounts and currency retained without minimum', () => {
  for (const amount of [500,1000,1500,2500]) assert.equal(getPrixAffichable({prix_propose_client:amount}), amount);
  assert.equal(getPrixAffichable({}), null);
  assert.equal(getDeviseAffichable({devise:'GHS'}), 'GHS');
});
test('card uses receipt, scoped caches and no approximate price copy', () => {
  const card=fs.readFileSync('src/components/livreur/CourseActiveCard.jsx','utf8');
  assert.match(card,/setConfirmedPickup\(saved\)/);
  assert.match(card,/setQueriesData/);
  assert.match(card,/Prix de la course :/);
  assert.doesNotMatch(card,/Prix proposé par le client|Prix final calculé à la livraison|`~\$\{prixBase/);
  assert.match(fs.readFileSync('src/pages/LivreurExterneApp.jsx','utf8'),/structuralSharing: reconcilePickupRows/);
});
