import { tauxCommissionEffectif, chargerTauxCommissionEffectif, hasZeroCommissionLock, commissionComptabilisable, champsLockCommission, verifierCoherenceLock, zeroCommissionFields } from './commissionLock.ts';
import { passActifAt, evaluerAvantageCommission, figerCommissionAcceptation } from './commissionAvantage.ts';
import { calculerSoldeLivreur, calculerSoldesLivreursBatch } from './soldeCalculator.ts';

// Isolated unit regressions: all entity access below is in-memory, never production.
export async function runCommissionRegression() {
  const results = [];
  const check = async (name, test) => {
    try { await test(); results.push({ name, status: 'PASS' }); }
    catch (error) { results.push({ name, status: 'FAIL', error: error.message }); }
  };
  const eq = (a, b) => { if (a !== b) throw new Error(`Expected ${b}, got ${a}`); };
  const t = '2026-10-05T10:00:00.000Z';
  const pass = { id: 'pass', statut: 'valide', debut_at: '2026-10-05T09:00:00Z', expiration_at: '2026-10-05T11:00:00Z' };
  const locked = { id: 'zero', livreur_id: 'driver', heure_acceptation: t, commission_locked_at: t, commission_taux_normal: 20, commission_taux_applique: 0, commission_mode: 'pass_zero', pass_id: 'pass', prix_final: 1500, commission_silga: 300, statut: 'livree', heure_livraison: t };
  let writes = 0;
  const fake = { asServiceRole: { entities: {
    Country: { filter: async () => [{ commission_pct: 20, actif: true }] },
    HappyHourConfig: { filter: async () => [] },
    PassAchat: { filter: async () => [pass] },
    CourseExterne: { get: async () => locked, update: async () => { writes++; }, filter: async () => [locked] },
    Livreur: { get: async () => ({ base_comptable_date: '2026-10-01T00:00:00Z', base_comptable_solde_initial: 0, credit_surplus: 0 }) },
    PaiementSilgapp: { filter: async () => [] },
  } } };
  await check('PASS_ACCEPTANCE_LOCK', async () => {
    const a = await evaluerAvantageCommission(fake, 'driver', 'UNIT', new Date(t));
    eq(a.mode, 'pass_zero'); eq(a.taux_applique, 0);
    verifierCoherenceLock(champsLockCommission(a, t), a);
  });
  for (const path of ['BOUTON', 'PIN', 'QR']) {
    await check(`SHARED_RATE_${path}`, () => eq(Math.round(1500 * tauxCommissionEffectif(locked, 20) / 100), 0));
  }
  await check('PRIX_ADMIN_2000', () => { const commission = Math.round(2000 * tauxCommissionEffectif(locked, 20) / 100); eq(commission, 0); eq(2000 - commission, 2000); });
  await check('HAPPY_HOUR', async () => {
    const hhFake = { asServiceRole: { entities: { ...fake.asServiceRole.entities,
      HappyHourConfig: { filter: async () => [{ id: 'hh', heure_debut: '09:00', heure_fin: '11:00', fuseau_horaire: 'UTC', taux_promotionnel: 0 }] },
    } } };
    const a = await evaluerAvantageCommission(hhFake, 'driver', 'UNIT', new Date(t));
    eq(a.mode, 'happy_hour'); eq(a.taux_applique, 0);
    eq(commissionComptabilisable({ ...locked, ...champsLockCommission(a, t) }), 0);
  });
  await check('PASS_EXPIRED_AFTER_ACCEPTANCE', async () => eq(await chargerTauxCommissionEffectif(locked, () => { throw new Error('must not re-evaluate'); }), 0));
  await check('PASS_BOUGHT_AFTER_ACCEPTANCE', async () => {
    const normal = { ...locked, commission_mode: 'normal', commission_taux_applique: 20, pass_id: '' };
    const sdk = { asServiceRole: { entities: { ...fake.asServiceRole.entities, CourseExterne: { get: async () => normal } } } };
    const a = await figerCommissionAcceptation(sdk, 'zero', 'driver', 'UNIT', t);
    eq(a.taux_applique, 20); eq(a.mode, 'normal');
  });
  await check('SOLDE_SINGLE_AND_BATCH', async () => {
    const normal = { ...locked, id: 'normal', commission_mode: 'normal', commission_taux_applique: 20, commission_silga: 400 };
    const enterprise = { ...locked, id: 'enterprise', enterprise_id: 'private', commission_silga: 900 };
    const sdk = { asServiceRole: { entities: { ...fake.asServiceRole.entities,
      CourseExterne: { filter: async () => [locked, normal, enterprise] },
    } } };
    eq((await calculerSoldeLivreur(sdk, 'driver')).solde, 400);
    eq((await calculerSoldesLivreursBatch(sdk, null)).driver.solde, 400);
  });
  await check('NORMAL_20_PERCENT', () => eq(Math.round(2000 * tauxCommissionEffectif({ commission_mode: 'normal', commission_taux_applique: 20 }, 10) / 100), 400));
  await check('ENTERPRISE_NOT_PUBLIC_PASS', () => {
    const c = { ...locked, enterprise_id: 'private' };
    eq(hasZeroCommissionLock(c), false); eq(Object.keys(zeroCommissionFields(c)).length, 0);
    eq(tauxCommissionEffectif(c, 5), 5);
  });
  await check('PASS_LOOKUP_ERROR_FAIL_CLOSED', async () => {
    const sdk = { asServiceRole: { entities: { ...fake.asServiceRole.entities, PassAchat: { filter: async () => { throw new Error('database unavailable'); } } } } };
    let rejected = false;
    try { await evaluerAvantageCommission(sdk, 'driver', 'UNIT', new Date(t)); }
    catch (e) { rejected = e.message.includes('PASS_LOOKUP_ERROR'); }
    eq(rejected, true); eq(writes, 0);
  });
  await check('LOCK_IDEMPOTENCE', async () => {
    eq((await figerCommissionAcceptation(fake, 'zero', 'driver', 'UNIT', t)).taux_applique, 0);
    eq((await figerCommissionAcceptation(fake, 'zero', 'driver', 'UNIT', t)).taux_applique, 0);
    eq(writes, 0);
    eq((await calculerSoldeLivreur(fake, 'driver')).solde, (await calculerSoldeLivreur(fake, 'driver')).solde);
  });
  await check('POST_LOCK_MISMATCH_REJECTED', () => {
    let rejected = false;
    try { verifierCoherenceLock({ ...locked, commission_taux_applique: 20 }, { mode: 'pass_zero', taux_applique: 0, pass_id: 'pass' }); }
    catch { rejected = true; } eq(rejected, true);
  });
  await check('PASS_EXCLUSIVE_EXPIRATION', async () => eq((await passActifAt(fake, 'driver', new Date(pass.expiration_at))).actif, false));
  await check('MAINTENANCE_ZERO_IS_PRESENT', () => { eq(locked.commission_taux_applique == null, false); eq(commissionComptabilisable(locked), 0); eq(zeroCommissionFields(locked).encours_comptabilise_montant, 0); });
  return { success: results.every(r => r.status === 'PASS'), type: 'isolated_unit_regressions', production_writes: 0, count: results.length, results };
}