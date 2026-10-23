const confirmedWithdrawals = new Map();

export function isConfirmedDriverWithdrawal(course, driverId) {
  const key = `${driverId}:${course?.id}`;
  const saved = confirmedWithdrawals.get(key);
  if (!saved || course?.livreur_id !== driverId) return false;
  const acceptance = Date.parse(course.heure_acceptation || course.accepted_at || '');
  if (Number.isFinite(saved.at) && Number.isFinite(acceptance) && acceptance > saved.at) { confirmedWithdrawals.delete(key); return false; }
  return true;
}

export function createDriverWithdrawalRequest(api, makeId = () => crypto.randomUUID()) {
  const requestId = makeId();
  let pending = false;
  return async ({courseId, motif, detail, driverId = undefined, acceptedAt = undefined}) => {
    if (pending) return null;
    pending = true;
    try {
      const response = await api.functions.invoke('annulerCourseExterne',{course_id:courseId,source:'livreur',motif,motif_detail:detail,request_id:requestId,expected_livreur_id:driverId,expected_acceptance_at:acceptedAt});
      const body = response?.data ?? response;
      if (body?.error || body?.erreur || body?.success !== true || body?.withdrawn !== true || body?.course_id !== courseId || body?.client_decision_attendue !== true || body?.course_redispatch === true || body?.withdrawal_contract !== 'per-course-v1') throw new Error(body?.error || 'Retrait non confirmé. Actualisez ou réessayez : le même identifiant est conservé.');
      if (driverId && Number.isFinite(Date.parse(body.withdrawn_at || ''))) confirmedWithdrawals.set(`${driverId}:${courseId}`,{at:Date.parse(body.withdrawn_at)});
      return body;
    } finally { pending = false; }
  };
}
