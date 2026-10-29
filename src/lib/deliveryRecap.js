const amount = value => value === null || value === undefined || value === '' ||
  !['string', 'number'].includes(typeof value) || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value);

export function deliveryRecapValues(course) {
  return {
    price: amount(course?.prix_final),
    driver: amount(course?.montant_livreur),
    commission: amount(course?.commission_silga),
  };
}

export function recordedDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  // Base44 reads can omit the UTC suffix; acquisition time must not become local time.
  const iso = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(iso) ? iso + 'Z' : iso;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function pickupRecordedAt(course) {
  return recordedDate(course?.heure_recuperation) ? course.heure_recuperation :
    recordedDate(course?.pickup_confirmed_at) ? course.pickup_confirmed_at : null;
}

export function formatRecordedTime(value, timeZone = undefined) {
  const date = recordedDate(value);
  return date ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }) : '—';
}
