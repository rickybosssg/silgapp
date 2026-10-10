export async function claimCourseForLivreur(
  base44: any,
  courseId: string,
  livreurId: string,
  allowedDispatchStatuses: string[],
  updateData: any,
) {
  const statuses = Array.from(new Set(allowedDispatchStatuses.filter(Boolean)));
  if (!courseId || !livreurId || statuses.length === 0) {
    return { claimed: false, reason: 'invalid_claim_input', course: null };
  }

  await base44.asServiceRole.entities.CourseExterne.updateMany(
    {
      id: courseId,
      dispatch_status: { $in: statuses },
    },
    { $set: updateData },
  );

  const fresh = await base44.asServiceRole.entities.CourseExterne.get(courseId);
  const claimed =
    String(fresh?.livreur_id || '') === String(livreurId) ||
    String(fresh?.accepted_by_livreur_id || '') === String(livreurId);

  return {
    claimed,
    reason: claimed ? 'claimed' : 'race_condition_lost',
    course: fresh,
  };
}

