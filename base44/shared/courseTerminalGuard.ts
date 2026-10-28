export const isTerminalCourse = (course: any) => ['annulee', 'livree', 'terminee'].includes(course?.statut) || !!course?.annulation_user_id;

export async function canCancelCourse(base44: any, user: any, course: any, source: string) {
  if (!user?.id || !user?.email) return false;
  if (user.role === 'admin') return true; // Country/enterprise guards remain in the handler.
  if (source === 'livreur' && course.livreur_id) {
    const driver = await base44.entities.Livreur.get(course.livreur_id).catch(() => null);
    return driver?.user_email === user.email;
  }
  if (source !== 'client') return false;
  if (course.client_user_email === user.email || course.created_by_id === user.id || course.created_by === user.email) return true;
  for (const id of [course.expediteur_client_id, course.destinataire_client_id].filter(Boolean)) {
    const client = await base44.entities.ClientExterne.get(id).catch(() => null);
    if (client?.user_email === user.email) return true;
  }
  return false;
}

// Single-entity compare-and-set. A fresh read alone is not a concurrency guard.
export async function updateActiveCourse(base44: any, snapshot: any, patch: any) {
  if (!snapshot?.id || !snapshot.statut || isTerminalCourse(snapshot)) return false;
  const filter: any = { id: snapshot.id, statut: snapshot.statut, annulation_user_id: { $in: [null, ''] } };
  if (snapshot.dispatch_status !== undefined) filter.dispatch_status = snapshot.dispatch_status;
  if (snapshot.updated_date) filter.updated_date = snapshot.updated_date;
  const result = await base44.asServiceRole.entities.CourseExterne.updateMany(filter, { $set: patch });
  return Number(result?.updated) === 1;
}

export async function cancelCourseTerminal(base44: any, courseId: string, actorId: string, source: string, makePatch: (course: any) => any) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await base44.asServiceRole.entities.CourseExterne.get(courseId);
    if (!before) return { success: false, error: 'Course introuvable' };
    if (before.statut === 'annulee') return { success: true, already_cancelled: true, before, course: before };
    if (isTerminalCourse(before)) return { success: false, error: 'Course deja terminee' };
    const patch = { ...makePatch(before), statut: 'annulee', dispatch_status: 'expire',
      date_annulation: new Date().toISOString(), annulation_user_id: actorId,
      annulation_source: source, dispatch_next_wave_at: null, dispatch_locked_until: null,
      timeout_expires_at: null, client_decision_attendue: false };
    if (await updateActiveCourse(base44, before, patch)) {
      // Notify realtime consumers using a metadata-only single update. It must
      // never repeat a stale statut/dispatch payload after the terminal CAS.
      await base44.asServiceRole.entities.CourseExterne.update(courseId, { annulation_event_at: new Date().toISOString() }).catch(() => {});
      const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
      if (course?.statut !== 'annulee') return { success: false, error: 'Annulation non confirmee' };
      return { success: true, already_cancelled: false, before, course };
    }
  }
  return { success: false, error: "Course modifiee simultanement. Reessayez l annulation." };
}

// Best-effort cleanup after the terminal CAS. No multi-entity transaction is
// claimed; acceptance/publication must independently enforce the terminal guard.
export async function expireCancelledCourseOffers(base44: any, courseId: string) {
  const current = await base44.asServiceRole.entities.CourseExterne.get(courseId);
  if (current?.statut !== 'annulee') return false;
  await base44.asServiceRole.entities.DispatchNotification.updateMany(
    { course_id: courseId, statut: { $nin: ['accepte', 'refuse', 'expire'] } },
    { $set: { statut: 'expire', date_reponse: current.date_annulation || new Date().toISOString() } },
  );
  await base44.asServiceRole.entities.EcoProposal.updateMany(
    { course_id: courseId, status: 'pending' }, { $set: { status: 'invalidated' } },
  );
  return true;
}