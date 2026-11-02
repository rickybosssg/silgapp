const terminal = new Set(['annulee', 'livree', 'terminee']);

// A refusal is not itself a suspension. Only the persisted decision flag is authoritative.
export function clientDecisionView(course) {
  const waiting = !!course && !terminal.has(course.statut) && !course.annulation_user_id &&
    !course.livreur_id && !course.assigned &&
    (course.client_decision_attendue === true || course.decision_required === true || ['pending', 'publishing'].includes(course.client_relaunch_state));
  if (!waiting) return { waiting: false, reason: null, kind: null, message: null };
  const raw = course.livreur_annulation_motif ?? course.decision_reason;
  const reason = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  const kind = course.livreur_retrait_at || course.decision_kind === 'withdrawal' ? 'withdrawal' :
    course.decision_kind === 'refusal' ? 'refusal' : null;
  const prefix = kind === 'withdrawal' ? 'Le livreur s’est retiré de votre course' :
    kind === 'refusal' ? 'Le livreur a refusé votre course' : 'Votre course est en attente de votre décision';
  return { waiting: true, reason, kind,
    message: `${prefix}${reason ? ` pour le motif : ${reason}.` : '. Aucun motif communiqué.'} Votre course est en attente.` };
}
