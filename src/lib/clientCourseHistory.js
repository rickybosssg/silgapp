export async function loadClientCourseHistory(api, { userId, userEmail, clientProfilId }) {
  if (!userId || !userEmail) return [];
  const filters = [{ created_by_id: userId }, { client_user_email: userEmail }];
  if (clientProfilId) {
    filters.push({ destinataire_client_id: clientProfilId }, { expediteur_client_id: clientProfilId });
  }
  const groups = await Promise.all(filters.map(filter =>
    api.entities.CourseExterne.filter(filter, '-updated_date', 50)
  ));
  const courses = new Map();
  for (const group of groups) {
    for (const course of group || []) courses.set(course.id, course);
  }
  return [...courses.values()].sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date));
}
