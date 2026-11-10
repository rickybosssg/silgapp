import { isEventMusicAdmin } from './eventMusicContract.js';
import { validateEventMusicMedia, MAX_EVENT_MUSIC_UPLOAD_BYTES } from './eventMusicMediaValidation.js';
import { eventMusicFail as fail, eventMusicRevisionValid, eventMusicRequestValid, readEventMusicSingleton,
  eventMusicConfiguration, eventMusicCasFilter } from './eventMusicPersistence.js';

// Server-owned, stable public storage origin/path only. No signed URLs, redirects,
// remote fetches, user-supplied hosts or URI credentials are supported.
export function createEventMusicUrlValidator({ origin = '', pathPrefix = '' } = {}) {
  let base;
  try { base = new URL(origin); } catch { return (_url) => false; }
  if (base.protocol !== 'https:' || base.origin !== origin || base.username || base.password || base.port ||
      !/^\/[a-zA-Z0-9_/-]+\/$/.test(pathPrefix) || pathPrefix.includes('//') || pathPrefix.includes('/../') || pathPrefix.includes('/./')) return (_url) => false;
  return value => {
    if (typeof value !== 'string' || value.length > 2048 || /[%\\]/.test(value)) return false;
    try {
      const url = new URL(value);
      return url.href === value && url.origin === origin && !url.username && !url.password && !url.search && !url.hash &&
        url.pathname.startsWith(pathPrefix) && /^[-a-zA-Z0-9_/.]+\.(mp3|wav)$/.test(url.pathname.slice(pathPrefix.length)) &&
        !url.pathname.slice(pathPrefix.length).includes('..');
    } catch { return false; }
  };
}
export function decodeEventMusicBase64(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_EVENT_MUSIC_UPLOAD_BYTES / 3) * 4 || !value.length ||
      value.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail('MEDIA_BASE64', 400);
  let raw;
  try { raw = atob(value); } catch { fail('MEDIA_BASE64', 400); }
  if (raw.length > MAX_EVENT_MUSIC_UPLOAD_BYTES) fail('MEDIA_SIZE', 400);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}
export async function uploadEventMusicMedia({ entity, user, input, bytes, uploadEnabled = false, uploadFile, hashBytes, makeFile, validateReturnedUrl }) {
  if (!isEventMusicAdmin(user)) fail('FORBIDDEN', 403);
  if (uploadEnabled !== true) fail('UPLOAD_DISABLED', 409);
  if (input?.public_broadcast_consent !== true) fail('PUBLIC_BROADCAST_CONSENT_REQUIRED', 400);
  if (!eventMusicRevisionValid(input.expected_revision)) fail('REVISION_INVALID', 400);
  if (!eventMusicRequestValid(input.request_id)) fail('REQUEST_ID_INVALID', 400);
  if (typeof input.label !== 'string' || !input.label.trim() || input.label.length > 60 || /[\x00-\x1f\x7f]/.test(input.label)) fail('LABEL_INVALID', 400);
  if (typeof uploadFile !== 'function' || typeof hashBytes !== 'function' || typeof makeFile !== 'function' || typeof validateReturnedUrl !== 'function') fail('UPLOAD_DISABLED');
  let media;
  try { media = validateEventMusicMedia(bytes); } catch (error) { fail(['MEDIA_SIZE', 'MEDIA_DURATION'].includes(error.code) ? error.code : 'MEDIA_INVALID', 400); }
  if (input.mime_type !== media.mime) fail('MEDIA_MIME_MISMATCH', 400);
  const hash = await hashBytes(media.bytes);
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) fail('HASH_UNAVAILABLE', 503);
  const row = await readEventMusicSingleton(entity, validateReturnedUrl);
  if (!row) fail('NOT_PROVISIONED');
  const label = input.label.trim();
  const previous = row.parsedUploadState.entries.find(entry => entry.actor === user.id && entry.requestId === input.request_id);
  if (previous) {
    if (previous.hash !== hash || previous.expectedRevision !== input.expected_revision || previous.label !== label || previous.mime !== media.mime ||
        previous.sizeBytes !== media.bytes.length || previous.durationMs !== media.durationMs) fail('REQUEST_ID_CONFLICT');
    if (previous.status === 'abandoned') fail('UPLOAD_ABANDONED');
    if (previous.status !== 'complete') fail('UPLOAD_PENDING');
    return { success: true, configuration: eventMusicConfiguration(row), writable: !row.uploadPending, upload_enabled: !row.uploadPending,
      uploaded_track: row.parsedTracks.find(track => track.id === `asset_${hash}`), replayed: true };
  }
  if (row.parsedUploadState.entries.some(e => e.abandon?.actor === user.id && e.abandon.requestId === input.request_id)) fail('REQUEST_ID_CONFLICT');
  if (row.parsedUploadState.entries.some(e => e.hash === hash && e.status === 'abandoned')) fail('UPLOAD_HASH_UNCERTAIN');
  if (row.parsedReceipts.some(receipt => receipt.actor === user.id && receipt.request_id === input.request_id)) fail('REQUEST_ID_CONFLICT');
  if (row.uploadPending) fail('UPLOAD_PENDING');
  if (row.revision !== input.expected_revision) fail('REVISION_CONFLICT');
  if (row.parsedUploadState.entries.length >= 100 || row.parsedTracks.length >= 100) fail('TRACKS_CAPACITY');
  if (row.parsedTracks.some(track => track.id === `asset_${hash}`)) fail('TRACK_ALREADY_EXISTS');
  const entry = { action: 'upload', actor: user.id, requestId: input.request_id, hash, status: 'pending', expectedRevision: input.expected_revision,
    label, mime: media.mime, sizeBytes: media.bytes.length, durationMs: media.durationMs };
  // Construct locally before claiming, but never invoke external storage before CAS.
  const file = makeFile(media.bytes, `asset_${hash}.${media.extension}`, media.mime);
  const claim = { revision: row.revision + 1, upload_state: JSON.stringify({ entries: [...row.parsedUploadState.entries, entry] }) };
  let claimed;
  try {
    const result = await entity.updateMany(eventMusicCasFilter(row), { $set: claim });
    if (result?.updated !== 1) fail('UPLOAD_CLAIM_UNCONFIRMED');
    claimed = await readEventMusicSingleton(entity, validateReturnedUrl);
    if (!claimed || claimed.id !== row.id || claimed.revision !== claim.revision || claimed.upload_state !== claim.upload_state || claimed.selections !== row.selections) fail('UPLOAD_CLAIM_UNCONFIRMED');
  } catch { fail('UPLOAD_CLAIM_UNCONFIRMED'); }
  // Once claimed, any exception leaves pending forever until separately reviewed.
  // No retry, fallback, automatic unlock, remote URL fetch, or storage deletion.
  try {
    const uploaded = await uploadFile(file);
    if (!uploaded || validateReturnedUrl(uploaded.file_url) !== true) fail('UPLOAD_UNCONFIRMED');
    const track = { id: `asset_${hash}`, label, url: uploaded.file_url, durationMs: media.durationMs, mime: media.mime, sizeBytes: media.bytes.length, sha256: hash };
    const next = { revision: claimed.revision + 1, tracks: JSON.stringify([...claimed.parsedTracks, track]),
      upload_state: JSON.stringify({ entries: [...row.parsedUploadState.entries, { ...entry, status: 'complete' }] }) };
    const result = await entity.updateMany(eventMusicCasFilter(claimed), { $set: next });
    if (result?.updated !== 1) fail('UPLOAD_UNCONFIRMED');
    const confirmed = await readEventMusicSingleton(entity, validateReturnedUrl);
    if (!confirmed || confirmed.id !== row.id || confirmed.revision !== next.revision || confirmed.upload_state !== next.upload_state ||
        confirmed.tracks !== next.tracks || confirmed.selections !== row.selections) fail('UPLOAD_UNCONFIRMED');
    return { success: true, configuration: eventMusicConfiguration(confirmed), writable: true, upload_enabled: true, uploaded_track: track };
  } catch { fail('UPLOAD_UNCONFIRMED'); }
}
