export function openCreatedExpressCourse(course, actions) {
  if (!course?.id || course.annulation_user_id ||
      ['annulee', 'livree', 'terminee', 'expire'].includes(course.statut) ||
      actions.opened.current === course.id) return false;
  actions.opened.current = course.id;
  actions.invalidatePending();
  actions.setCourses(previous => [course, ...previous.filter(c => c.id !== course.id)]);
  actions.select(course.id);
  const searching = ['nouvelle', 'recherche_livreur'].includes(course.statut) && !course.livreur_id;
  actions.research(searching);
  actions.tracking(!searching && !['annulee', 'livree', 'terminee'].includes(course.statut));
  return true;
}

export function isExpressAwaitingDispatch(course) {
  return course?.commande_vocale_express === true &&
    ['nouvelle', 'recherche_livreur'].includes(course.statut) &&
    (!course.dispatch_status || course.dispatch_status === 'en_attente');
}

// A new row may be readable by ID before it appears in indexed list queries.
// On an uncertain read, leave the existing screen intact instead of interpreting
// a temporary list omission as a completed delivery.
export async function reconcileCreatedExpressCourse(rows, pending, readCourse, profile) {
  const created = pending.current;
  if (!created) return rows;
  const clearPending = () => { if (pending.current === created) pending.current = null; };
  if (rows.some(c => c.id === created.id)) { clearPending(); return rows; }
  if (created.client_user_email !== profile.user_email || created.country_code !== profile.country_code) {
    clearPending();
    return rows;
  }
  const fresh = await readCourse(created.id);
  if (pending.current !== created) return rows;
  if (!fresh || fresh.id !== created.id) throw new Error('EXPRESS_TRACKING_READ_UNCERTAIN');
  if (fresh.client_user_email !== profile.user_email || fresh.country_code !== profile.country_code ||
      (fresh.enterprise_id || null) !== (profile.enterprise_id || null)) {
    clearPending();
    return rows;
  }
  if (['annulee', 'livree', 'terminee'].includes(fresh.statut) || fresh.annulation_user_id) {
    clearPending();
    return rows;
  }
  return [fresh, ...rows];
}
