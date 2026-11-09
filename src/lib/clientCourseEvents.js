export function clientEventSnapshot(course) {
  if (!course) return null;
  const waiting = !course.livreur_id && !course.assigned && !course.annulation_user_id && (course.client_decision_attendue === true || course.decision_required === true || ['pending', 'publishing'].includes(course.client_relaunch_state || course.relaunch?.state));
  const relaunching = !course.livreur_id && !course.assigned && ['pending', 'publishing'].includes(course.client_relaunch_state || course.relaunch?.state);
  const terminal = ['livree', 'annulee', 'terminee'].includes(course.statut);
  return { key: course.reference || course.reference_course || course.id,
    state: terminal ? course.statut : relaunching ? 'relaunching' : waiting ? 'waiting' : (course.livreur_id || course.assigned) ? 'accepted' : 'search',
    decision: course.decision_event || course.livreur_retrait_operation_id || course.livreur_retrait_at || course.livreur_annulation_date || null,
    acceptance: course.accepted_at || course.heure_acceptation || null,
    search: course.client_relaunch_operation_id || course.relaunch?.operation_id || course.heure_sollicitation || course.search_at || null,
    updated: course.updated_date || course.updated_at || null };
}
export function nextClientEvent(previous, next) {
  if (!previous || !next || previous.key !== next.key) return null;
  const a = Date.parse(previous.updated), b = Date.parse(next.updated);
  if (Number.isFinite(a) && Number.isFinite(b) && b < a) return null;
  if (next.state === 'waiting' && (previous.state !== 'waiting' || next.decision !== previous.decision)) return 'refusal';
  if (next.state === 'annulee' && previous.state !== 'annulee') return 'refusal';
  if (next.state === 'accepted' && (previous.state !== 'accepted' || next.acceptance !== previous.acceptance)) return 'acceptance';
  if (next.state === 'search' && (previous.state !== 'search' || next.search !== previous.search)) return 'search';
  return null;
}
