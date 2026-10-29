export function reconcileGuestCourse(current, next) {
  if (!next || typeof next.statut !== 'string') throw new Error('Suivi non confirmé.');
  if (!current || !current.reference || current.reference !== next.reference) return next;
  // A late read cannot reopen an irreversible final state.
  if (['annulee', 'livree', 'terminee'].includes(current.statut) && current.statut !== next.statut) return current;
  const before = Date.parse(current.updated_at), after = Date.parse(next.updated_at);
  if (Number.isFinite(before) && Number.isFinite(after) && after < before) return current;
  return next;
}

export function preferredGuestCountry(countries, saved) {
  if (!Array.isArray(countries)) return '';
  if (saved) return countries.includes(saved) ? saved : '';
  return countries.includes('BF') ? 'BF' : '';
}

export function retryDelayMs(value, now = Date.now()) {
  const seconds = Number(value);
  if (value != null && String(value).trim() && Number.isFinite(seconds) && seconds >= 0) return Math.max(30000, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(30000, date - now) : 30000;
}

export async function withRequestDeadline(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(message), { code: 'REQUEST_UNCERTAIN', status: 408 })), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
