// Disappearance from an active list is not proof of delivery.
export function clientCourseOutcome(course) {
  if (course?.statut === 'annulee' || course?.annulation_user_id) return 'cancelled';
  return course?.statut === 'livree' ? 'delivered' : null;
}
export async function readClientCourseOutcome(id, read) {
  const course = await read(id);
  return course?.id === id && clientCourseOutcome(course) ? course : null;
}
