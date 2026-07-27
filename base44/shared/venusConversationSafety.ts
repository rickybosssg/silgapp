export type VenusCourseDraft = Record<string, any>;

const COURSE_FIELDS = [
  'type_course',
  'adresse_depart',
  'adresse_arrivee',
  'gps_depart_lat',
  'gps_depart_lng',
  'gps_arrivee_lat',
  'gps_arrivee_lng',
  'contact_nom',
  'contact_telephone',
  'contact_is_client',
  'contact_createur_course',
  'date_programmee',
  'heure_programmee',
];

function defaultDraftId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function ensureCourseDraft(
  draft: VenusCourseDraft | null | undefined,
  idFactory: () => string = defaultDraftId,
): VenusCourseDraft {
  const next = { ...(draft || {}) };
  if (!next.draft_id) next.draft_id = idFactory();
  if (!Number.isInteger(next.draft_revision) || next.draft_revision < 1) next.draft_revision = 1;
  return next;
}

export function mergeCourseDraft(
  current: VenusCourseDraft | null | undefined,
  updates: VenusCourseDraft | null | undefined,
  idFactory: () => string = defaultDraftId,
): VenusCourseDraft {
  const base = ensureCourseDraft(current, idFactory);
  const safeUpdates = { ...(updates || {}) };
  const changed = COURSE_FIELDS.some(
    (field) => Object.prototype.hasOwnProperty.call(safeUpdates, field) && safeUpdates[field] !== base[field],
  );
  const next = { ...base, ...safeUpdates };

  if (changed) {
    next.draft_revision = base.draft_revision + 1;
    next.recap_presented = false;
    next.awaiting_confirmation = false;
    delete next.confirmation_draft_id;
    delete next.confirmation_revision;
    delete next.confirmed_at;
  }

  return next;
}

export function resetCourseDraft(idFactory: () => string = defaultDraftId): VenusCourseDraft {
  return ensureCourseDraft({}, idFactory);
}

export function markDraftRecapPresented(draft: VenusCourseDraft): VenusCourseDraft {
  const next = ensureCourseDraft(draft);
  return {
    ...next,
    recap_presented: true,
    awaiting_confirmation: true,
    recap_revision: next.draft_revision,
  };
}

export function isExplicitConfirmation(message: string): boolean {
  return /^(oui|yes|ok|d[' ]?accord|je confirme|confirme|c[' ]?est bon|vas[- ]?y|allez)$/i.test(
    String(message || '').trim(),
  );
}

export function confirmCurrentDraft(draft: VenusCourseDraft, message: string): VenusCourseDraft {
  const next = ensureCourseDraft(draft);
  if (
    !isExplicitConfirmation(message) ||
    next.awaiting_confirmation !== true ||
    next.recap_presented !== true ||
    next.recap_revision !== next.draft_revision
  ) {
    return next;
  }

  return {
    ...next,
    confirmation_draft_id: next.draft_id,
    confirmation_revision: next.draft_revision,
    confirmed_at: new Date().toISOString(),
    awaiting_confirmation: false,
  };
}

export function validateCourseDraft(draft: VenusCourseDraft | null | undefined): {
  complete: boolean;
  confirmed: boolean;
  missingField: string;
  draft: VenusCourseDraft;
} {
  const next = ensureCourseDraft(draft);
  const typeCourse = String(next.type_course || '').toLowerCase().trim();
  const hasType = ['expedier', 'recevoir', 'deplacement'].includes(typeCourse);
  const hasDepart = Boolean(String(next.adresse_depart || '').trim()) || next.gps_depart_lat != null;
  const hasArrivee = Boolean(String(next.adresse_arrivee || '').trim()) || next.gps_arrivee_lat != null;
  const hasContact = Boolean(String(next.contact_telephone || '').trim()) || next.contact_is_client === true;
  const creatorContactDigits = String(next.contact_createur_course || '').replace(/\D/g, '');
  const hasCreatorContact = creatorContactDigits.length >= 8 && creatorContactDigits.length <= 15;
  const hasSchedule = Boolean(next.date_programmee || next.heure_programmee);
  const validDate = !hasSchedule || /^\d{4}-\d{2}-\d{2}$/.test(String(next.date_programmee || ''));
  const validTime = !hasSchedule || /^([01]\d|2[0-3]):[0-5]\d$/.test(String(next.heure_programmee || ''));

  let missingField = '';
  if (!hasType) missingField = 'type_course';
  else if (!hasDepart) missingField = 'adresse_depart';
  else if (!hasArrivee) missingField = 'adresse_arrivee';
  else if (!hasCreatorContact) missingField = 'contact_createur_course';
  else if (!hasContact) missingField = 'contact';
  else if (!validDate) missingField = 'date_programmee_invalide';
  else if (!validTime) missingField = 'heure_programmee_invalide';

  const confirmed =
    !missingField &&
    next.recap_presented === true &&
    next.confirmation_draft_id === next.draft_id &&
    next.confirmation_revision === next.draft_revision;

  return {
    complete: !missingField,
    confirmed,
    missingField,
    draft: next,
  };
}
