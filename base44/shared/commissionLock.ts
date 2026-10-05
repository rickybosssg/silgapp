// Financial invariant: public locked 0% is never a missing commission.
// Pure helpers: no benefit lookup at delivery; Enterprise stays on its own ledger.
export function isPublicCommission(course) {
  return !String(course?.enterprise_id ?? '').trim();
}
export function hasZeroCommissionLock(course) {
  return isPublicCommission(course) && course?.commission_taux_applique != null &&
    course.commission_taux_applique !== '' && Number(course.commission_taux_applique) === 0 &&
    ['pass_zero', 'happy_hour'].includes(course.commission_mode);
}
export function tauxCommissionEffectif(course, fallback) {
  const locked = isPublicCommission(course) && course?.commission_taux_applique != null;
  if (!locked && isPublicCommission(course) && ['pass_zero', 'happy_hour'].includes(course?.commission_mode)) {
    throw new Error('COMMISSION_LOCK_REQUIRED');
  }
  const raw = locked ? course.commission_taux_applique : fallback;
  const rate = raw == null || raw === '' ? NaN : Number(raw);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('COMMISSION_RATE_INVALID');
  return rate;
}
export async function chargerTauxCommissionEffectif(course, loadFallback) {
  if (isPublicCommission(course) && course?.commission_taux_applique != null) {
    return tauxCommissionEffectif(course, null);
  }
  return tauxCommissionEffectif(course, await loadFallback());
}
export function commissionComptabilisable(course) {
  return hasZeroCommissionLock(course) ? 0 : Number(course?.commission_silga) || 0;
}
export function zeroCommissionFields(course) {
  return hasZeroCommissionLock(course) ? { encours_comptabilise_montant: 0 } : {};
}
export function champsLockCommission(avantage, timestamp) {
  if (!avantage || !Number.isFinite(avantage.taux_applique)) throw new Error('COMMISSION_LOCK_REQUIRED');
  return {
    commission_taux_normal: avantage.taux_normal,
    commission_taux_applique: avantage.taux_applique,
    commission_mode: avantage.mode,
    pass_id: avantage.pass_id ?? '', happy_hour_id: avantage.happy_hour_id ?? '',
    commission_locked_at: timestamp,
  };
}
export function verifierCoherenceLock(course, avantage) {
  if (!course?.commission_locked_at || course.commission_taux_applique == null) throw new Error('COMMISSION_LOCK_REQUIRED');
  if (avantage && (course.commission_mode !== avantage.mode ||
    Number(course.commission_taux_applique) !== avantage.taux_applique ||
    (avantage.mode === 'pass_zero' && course.pass_id !== avantage.pass_id) ||
    (avantage.mode === 'happy_hour' && course.happy_hour_id !== avantage.happy_hour_id))) {
    throw new Error('COMMISSION_LOCK_MISMATCH');
  }
}