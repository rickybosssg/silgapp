const scope = value => value == null || value === '' ? null : String(value);
function reject(message, status = 403) {
  throw Object.assign(new Error(message), { status, course_write_public: true });
}

export async function authorizeCourseOwnerWrite(entities, user, course) {
  if (!user?.id || !user.email) reject('Authentification requise.', 401);
  if (!course?.id || !course.country_code) reject('Course indisponible.', 404);
  const tenant = scope(user.enterprise_id ?? user.data?.enterprise_id);
  const country = user.country_code ?? user.data?.country_code;
  if (tenant !== scope(course.enterprise_id) || (country && country !== course.country_code)) {
    reject('Perimetre non autorise.');
  }
  if (user.role === 'admin') return;
  // A declared telephone and a guest record are never proof of account ownership.
  if (String(course.request_id || '').startsWith('guest-v1:')) reject('Acces invite prive requis.');
  if (course.client_user_email === user.email || course.created_by_id === user.id || course.created_by === user.email) return;
  for (const id of [course.expediteur_client_id, course.destinataire_client_id].filter(Boolean)) {
    const client = await entities.ClientExterne.get(id);
    if (client?.user_email === user.email && client.country_code === course.country_code
      && scope(client.enterprise_id) === scope(course.enterprise_id)) return;
  }
  reject('Cette course ne vous appartient pas.');
}

export async function updateOwnedCourse(entities, user, course, patch, extraFilter = {}) {
  await authorizeCourseOwnerWrite(entities, user, course);
  if (!course.updated_date) reject('Revision indisponible. Actualisez.', 409);
  const result = await entities.CourseExterne.updateMany({ ...extraFilter, id: course.id,
    updated_date: course.updated_date, country_code: course.country_code,
    enterprise_id: scope(course.enterprise_id) === null ? { $in: [null, ''] } : course.enterprise_id,
    client_user_email: course.client_user_email ?? null,
    created_by_id: course.created_by_id ?? null,
    expediteur_client_id: course.expediteur_client_id ?? null,
    destinataire_client_id: course.destinataire_client_id ?? null,
  }, { $set: patch });
  if (Number(result?.updated) !== 1) reject('La course a change. Actualisez avant de reessayer.', 409);
}
