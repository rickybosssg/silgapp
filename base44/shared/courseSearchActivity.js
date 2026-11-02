export const searchAttempt = course => `${course.client_relaunch_operation_id || 'initial'}:${Number(course.client_price_revision || 0)}`;
export async function recordSearchActivity(entities, course, driverId, kind) {
  if (!['view', 'refusal'].includes(kind) || !driverId) throw Error('Invalid search event');
  const filter = { course_id: course.id, attempt: searchAttempt(course), driver_id: driverId, kind };
  const previous = await entities.CourseSearchActivity.filter(filter, undefined, 1);
  if (!previous.length) await entities.CourseSearchActivity.create(filter);
}
export async function readSearchActivity(entities, course) {
  const attempt = searchAttempt(course);
  const rows = await entities.CourseSearchActivity.filter({ course_id: course.id, attempt }, undefined, 1001);
  if (!Array.isArray(rows) || rows.length > 1000) throw Error('Search activity incomplete');
  const count = kind => new Set(rows.filter(r => r.course_id === course.id && r.attempt === attempt && r.kind === kind && r.driver_id).map(r => r.driver_id)).size;
  // Older apps do not report visible cards. Counts are observations, never an exhaustive audience.
  return { attempt, views: count('view'), refusals: count('refusal'), coverage: 'partial', as_of: new Date().toISOString() };
}
