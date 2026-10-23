// In-memory terminal fence. No identity, token, financial or persistent storage.
const cancelled = new Set();
export const isKnownCancelledCourse = id => cancelled.has(id);
export function preserveConfirmedCancellation(course) {
  if (!course?.id) return course;
  if (course.statut === 'annulee' || course.annulation_user_id) cancelled.add(course.id);
  return cancelled.has(course.id) ? { ...course, statut: 'annulee', dispatch_status: 'expire' } : course;
}
export async function cancelCourseWithConfirmation(api, payload) {
  const response = await api.functions.invoke('annulerCourseExterne', payload);
  const result = response?.data ?? response;
  if (result?.success !== true) throw Error(result?.error || 'Annulation non confirmée par le serveur.');
  const fresh = await api.entities.CourseExterne.get(payload.course_id);
  if (fresh?.id !== payload.course_id || fresh.statut !== 'annulee') throw Error('Annulation non confirmée. Actualisez la course avant de réessayer.');
  preserveConfirmedCancellation(fresh);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('silgapp-course-cancelled', { detail: { courseId: fresh.id } }));
  return fresh;
}
