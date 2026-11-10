import { isEventMusicAdmin } from './eventMusicContract.js';
import { eventMusicFail as fail, eventMusicRevisionValid as revisionValid, eventMusicRequestValid, eventMusicCanonical as canonical,
  readEventMusicSingleton, eventMusicConfiguration as configuration, eventMusicCasFilter } from './eventMusicPersistence.js';
export { EVENT_MUSIC_CONFIG_KEY } from './eventMusicPersistence.js';
/**
 * @typedef {{ id: string, role?: string, admin_type?: string, country_code?: string,
 * enterprise_id?: string, silgapp_role?: string, data?: { enterprise_id?: string } }} EventMusicUser
 */
export async function eventMusicSettings({ entity, user = /** @type {EventMusicUser | null} */ (null), input, uploadEnabled = false, validateReturnedUrl = (_url) => false }) {
  if (!input || !['public', 'status', 'save'].includes(input.action)) fail('ACTION_INVALID', 400);
  if (input.action !== 'public' && !isEventMusicAdmin(user)) fail('FORBIDDEN', 403);
  const row = await readEventMusicSingleton(entity, validateReturnedUrl);
  if (input.action === 'public') return { success: true, configuration: configuration(row) };
  if (input.action === 'status') return { success: true, configuration: configuration(row), writable: !!row && !row.uploadPending,
    upload_enabled: uploadEnabled === true && !!row && !row.uploadPending, ...(row?.uploadPending ? { upload_pending: true } : {}) };
  if (!row) fail('NOT_PROVISIONED');
  if (row.uploadPending) fail('UPLOAD_PENDING');
  let selections;
  try { selections = canonical(input.selections, row.parsedTracks); } catch { fail('SELECTIONS_INVALID', 400); }
  if (!revisionValid(input.expected_revision)) fail('REVISION_INVALID', 400);
  if (!eventMusicRequestValid(input.request_id)) fail('REQUEST_ID_INVALID', 400);
  if (row.parsedUploadState.entries.some(entry => entry.actor === user.id && entry.requestId === input.request_id)) fail('REQUEST_ID_CONFLICT');
  const previous = row.parsedReceipts.find(receipt => receipt.actor === user.id && receipt.request_id === input.request_id);
  if (previous) {
    if (previous.selections !== selections || previous.expected_revision !== input.expected_revision) fail('REQUEST_ID_CONFLICT');
    return { success: true, configuration: configuration(row), writable: true, upload_enabled: uploadEnabled === true, replayed: true };
  }
  if (row.revision !== input.expected_revision) fail('REVISION_CONFLICT');
  if (row.parsedReceipts.length >= 1000) fail('RECEIPTS_CAPACITY');
  const next = { revision: row.revision + 1, selections, receipts: JSON.stringify([...row.parsedReceipts,
    { actor: user.id, request_id: input.request_id, expected_revision: input.expected_revision, selections }]) };
  const result = await entity.updateMany(eventMusicCasFilter(row), { $set: next });
  if (result?.updated !== 1) fail('SAVE_UNCONFIRMED');
  const confirmed = await readEventMusicSingleton(entity, validateReturnedUrl);
  if (!confirmed || confirmed.id !== row.id || confirmed.revision !== next.revision || confirmed.uploadPending ||
      confirmed.selections !== next.selections || confirmed.receipts !== next.receipts) fail('SAVE_UNCONFIRMED');
  return { success: true, configuration: configuration(confirmed), writable: true, upload_enabled: uploadEnabled === true };
}