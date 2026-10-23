// Called only after authenticated catalogue reconstruction and durable receipt.
// Publication owns its CAS; never write a status here or retry an uncertain push.
export async function finishExpressCreation(base44, course, publish) {
  const current = await base44.asServiceRole.entities.CourseExterne.get(course.id);
  if (!current || current.client_user_email !== course.client_user_email ||
      current.country_code !== course.country_code) throw new Error('EXPRESS_COURSE_SCOPE_CHANGED');
  const eligible = current.commande_vocale_express === true &&
    ['nouvelle', 'recherche_livreur'].includes(current.statut) &&
    current.dispatch_status === 'en_attente' && !current.enterprise_id && !current.livreur_id &&
    !current.accepted_by_livreur_id && !current.annulation_user_id && !current.client_decision_attendue;
  let dispatch = { attempted: false };
  if (eligible) {
    try { dispatch = { attempted: true, result: await publish(base44, current) }; }
    catch { dispatch = { attempted: true, pending: true }; }
  }
  // A failed dispatch is not a failed creation. Keep the same course/request ID.
  const fresh = await base44.asServiceRole.entities.CourseExterne.get(course.id);
  if (!fresh || fresh.client_user_email !== course.client_user_email ||
      fresh.country_code !== course.country_code) throw new Error('EXPRESS_COURSE_READBACK_FAILED');
  return { success: true, course: fresh, dispatch };
}
