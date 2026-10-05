import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  chargerTauxCommissionEffectif,
  commissionComptabilisable,
  hasZeroCommissionLock,
  tauxCommissionEffectif,
  zeroCommissionFields,
} from '../base44/shared/commissionLock.ts';

const publicPass = {
  enterprise_id: null,
  commission_mode: 'pass_zero',
  commission_locked_at: '2026-10-05T10:00:00.000Z',
  commission_taux_applique: 0,
  commission_silga: 700,
};
const publicHappyHour = { ...publicPass, commission_mode: 'happy_hour', commission_silga: 300 };
const normal = {
  enterprise_id: null,
  commission_mode: 'normal',
  commission_locked_at: '2026-10-05T10:00:00.000Z',
  commission_taux_applique: 20,
  commission_silga: 400,
};
const enterprisePassLike = { ...publicPass, enterprise_id: 'enterprise-a' };

assert.equal(tauxCommissionEffectif(publicPass, 20), 0, 'Pass locked 0 must stay 0');
assert.equal(tauxCommissionEffectif(publicHappyHour, 20), 0, 'Happy Hour locked 0 must stay 0');
assert.equal(Math.round(1500 * (tauxCommissionEffectif(publicPass, 20) / 100)), 0);
assert.equal(Math.round(1500 * (tauxCommissionEffectif(publicHappyHour, 20) / 100)), 0);
assert.equal(Math.round(2000 * (tauxCommissionEffectif(normal, 10) / 100)), 400);
assert.equal(commissionComptabilisable(publicPass), 0, 'old inconsistent Pass debt must count as 0');
assert.equal(commissionComptabilisable(publicHappyHour), 0, 'old inconsistent Happy Hour debt must count as 0');
assert.equal(commissionComptabilisable(normal), 400);
assert.deepEqual(zeroCommissionFields(publicPass), { encours_comptabilise_montant: 0 });
assert.deepEqual(zeroCommissionFields(normal), {});
assert.equal(hasZeroCommissionLock(enterprisePassLike), false, 'Enterprise must not use public Pass/HH guard');
assert.equal(await chargerTauxCommissionEffectif(publicPass, async () => 20), 0);
assert.throws(() => tauxCommissionEffectif({ enterprise_id: null, commission_mode: 'pass_zero' }, 20), /COMMISSION_LOCK_REQUIRED/);

const files = {
  finaliser: fs.readFileSync('base44/functions/finaliserLivraisonLivreur/entry.ts', 'utf8'),
  confirmerPrix: fs.readFileSync('base44/functions/confirmerPrixCourseAdmin/entry.ts', 'utf8'),
  verifierEncours: fs.readFileSync('base44/functions/verifierEncoursLivreur/entry.ts', 'utf8'),
  solde: fs.readFileSync('base44/shared/soldeCalculator.ts', 'utf8'),
  validateQr: fs.readFileSync('base44/functions/validateQRCode/entry.ts', 'utf8'),
  calculPrix: fs.readFileSync('base44/functions/calculPrixCourseExterne/entry.ts', 'utf8'),
  autoTimeout: fs.readFileSync('base44/functions/cloturerCoursesAutoTimeout/entry.ts', 'utf8'),
  maintenance: fs.readFileSync('base44/functions/maintenanceNuit/entry.ts', 'utf8'),
  dispatch: fs.readFileSync('base44/shared/dispatchV2.ts', 'utf8'),
};

for (const [name, source] of Object.entries(files)) {
  assert.doesNotMatch(source, /commission_taux_applique\s*\|\|/, `${name} must not fallback with ||`);
}

assert.match(files.finaliser, /prix_source:\s*'prix_propose_client_explicit'/);
assert.match(files.finaliser, /tauxCommissionEffectif\(course,\s*commissionPct\)/);
assert.match(files.finaliser, /zeroCommissionFields\(course\)/);
assert.match(files.confirmerPrix, /tauxCommissionEffectif\(course,\s*commissionPct\)/);
assert.match(files.confirmerPrix, /zeroCommissionFields\(course\)/);
assert.match(files.verifierEncours, /hasZeroCommissionLock\(course\)/);
assert.match(files.solde, /commissionComptabilisable\(c\)/);
assert.match(files.validateQr, /tauxCommissionEffectif\(course,\s*commissionPct\)/);
assert.match(files.validateQr, /zeroCommissionFields\(course\)/);
assert.match(files.calculPrix, /tauxCommissionEffectif\(course,\s*commissionPct\)/);
assert.match(files.autoTimeout, /tauxCommissionEffectif\(course,\s*commissionPct\)/);
assert.match(files.maintenance, /chargerTauxCommissionEffectif/);
assert.match(files.dispatch, /PASS_LOOKUP_ERROR|PASS_LOOKUP_FAILED|lookup.*error/i);

console.log('PASS: Pass/Happy Hour locked 0 commission is centralized and fail-closed guards are present.');
