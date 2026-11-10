import { failGuest } from './guestOrderPolicy.js';

// Must run inside the reservation CAS, not against the earlier UI/read snapshot.
// Independent confirmed orders may coexist. Unresolved/revoked attempts and
// identical active drafts do not authorize another creation.
export function assertGuestReservation(entries, entry) {
  const active = entries.filter(e => e.device_hash === entry.device_hash && !e.closed_at);
  if (active.some(e => !e.course_id || e.state !== 'created' || e.revoked_at)) {
    failGuest('DEVICE_LIMIT', 'Une tentative précédente doit être vérifiée. Retrouvez son suivi ou contactez le support.', 409);
  }
  if (active.some(e => e.fingerprint === entry.fingerprint)) {
    failGuest('DUPLICATE_ACTIVE', 'Une course identique est déjà en cours. Retrouvez son suivi avant de confirmer une nouvelle commande.', 409);
  }
}
