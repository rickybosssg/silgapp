const scope = (value: any) => value == null || String(value).trim() === '' ? null : String(value).trim();
const country = (value: any) => String(value || '').trim().toUpperCase();
export const transitionTerminal = (row: any) => !row || ['livree', 'annulee', 'terminee', 'completed', 'cancelled', 'canceled'].includes(row.statut) || !!row.annulation_user_id;
export function transitionScopeMatches(user: any, course: any, driver: any) {
  const origin = country(course?.country_code);
  return !!origin && origin === country(driver?.country_code) &&
    (!user?.country_code || country(user.country_code) === origin) &&
    scope(course?.enterprise_id) === scope(driver?.enterprise_id) &&
    (!scope(user?.enterprise_id) || scope(user.enterprise_id) === scope(course.enterprise_id));
}
export function sameActiveTransition(saved: any, snapshot: any, target: string) {
  return !transitionTerminal(saved) && saved.client_decision_attendue !== true && saved.statut === target &&
    saved.livreur_id === snapshot.livreur_id && country(saved.country_code) === country(snapshot.country_code) &&
    scope(saved.enterprise_id) === scope(snapshot.enterprise_id);
}
export async function writeOwnedTransition(api: any, snapshot: any, patch: any) {
  if (transitionTerminal(snapshot) || snapshot.client_decision_attendue === true) return null;
  const filter: any = { id: snapshot.id, statut: snapshot.statut, livreur_id: snapshot.livreur_id,
    country_code: snapshot.country_code,
    enterprise_id: scope(snapshot.enterprise_id) ?? { $in: [null, ''] },
    annulation_user_id: { $in: [null, ''] }, client_decision_attendue: { $ne: true } };
  if (snapshot.updated_date) filter.updated_date = snapshot.updated_date;
  if (snapshot.dispatch_status !== undefined) filter.dispatch_status = snapshot.dispatch_status;
  let count: number | null = null;
  try {
    const result = await api.asServiceRole.entities.CourseExterne.updateMany(filter, { $set: patch });
    count = Number(result?.updated);
    if (count !== 0 && count !== 1) return null;
  } catch { /* Read back once after an uncertain write; never replay the mutation. */ }
  const saved = await api.asServiceRole.entities.CourseExterne.get(snapshot.id);
  if (!sameActiveTransition(saved, snapshot, patch.statut)) return null;
  return { course: saved, skipped: count === 0, confirmedByRead: count === null };
}
