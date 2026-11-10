import { EVENT_MUSIC_DEFAULT_SELECTIONS, normalizeEventMusicSelections, normalizeEventMusicTracks } from './eventMusicContract.js';
export const EVENT_MUSIC_CONFIG_KEY = 'EVENT_MUSIC_V1';
export const eventMusicFail = (code, status = 409) => { throw Object.assign(new Error(code), { code, status, eventMusicSafe: true }); };
export const eventMusicRevisionValid = value => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER - 2;
export const eventMusicRequestValid = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,100}$/.test(value);
export const eventMusicCanonical = (value, tracks = []) => JSON.stringify(normalizeEventMusicSelections(value, tracks));
export async function readEventMusicSingleton(entity, validateReturnedUrl = (_url) => false) {
  const rows = await entity.filter({ cle: EVENT_MUSIC_CONFIG_KEY }, 'created_date', 2);
  if (!Array.isArray(rows)) eventMusicFail('CONFIG_UNAVAILABLE', 503);
  if (rows.length > 1) eventMusicFail('CONFIG_DUPLICATE');
  const row = rows[0];
  if (!row) return null;
  try {
    if (!row.id || row.cle !== EVENT_MUSIC_CONFIG_KEY || !eventMusicRevisionValid(row.revision)) throw Error();
    const tracks = normalizeEventMusicTracks(JSON.parse(row.tracks ?? '[]'));
    if (tracks.some(track => validateReturnedUrl(track.url) !== true)) throw Error();
    eventMusicCanonical(JSON.parse(row.selections), tracks);
    const receipts = JSON.parse(row.receipts);
    if (!Array.isArray(receipts) || receipts.length > 1000) throw Error();
    const seen = new Set();
    for (const receipt of receipts) {
      if (!receipt || typeof receipt.actor !== 'string' || !receipt.actor || !eventMusicRequestValid(receipt.request_id) ||
        !eventMusicRevisionValid(receipt.expected_revision) || typeof receipt.selections !== 'string' || eventMusicCanonical(JSON.parse(receipt.selections), tracks) !== receipt.selections) throw Error();
      const key = JSON.stringify([receipt.actor, receipt.request_id]);
      if (seen.has(key)) throw Error();
      seen.add(key);
    }
    const state = JSON.parse(row.upload_state ?? '{"entries":[]}');
    if (!state || !Array.isArray(state.entries) || state.entries.length > 100) throw Error();
    let pending = false;
    for (const entry of state.entries) {
      const key = JSON.stringify([entry.actor, entry.requestId]);
      if (seen.has(key) || entry.action !== 'upload' || typeof entry.actor !== 'string' || !entry.actor || !eventMusicRequestValid(entry.requestId) ||
          !/^[a-f0-9]{64}$/.test(entry.hash) || !eventMusicRevisionValid(entry.expectedRevision) || !['pending', 'complete'].includes(entry.status) ||
          typeof entry.label !== 'string' || !entry.label.trim() || entry.label !== entry.label.trim() || entry.label.length > 60 || /[\x00-\x1f\x7f]/.test(entry.label) ||
          !['audio/mpeg', 'audio/wav'].includes(entry.mime) || !Number.isInteger(entry.sizeBytes) || entry.sizeBytes < 12 || entry.sizeBytes > 3 * 1024 * 1024 ||
          !Number.isInteger(entry.durationMs) || entry.durationMs < 200 || entry.durationMs > 30000) throw Error();
      seen.add(key);
      if (entry.status === 'pending') { if (pending) throw Error(); pending = true; }
      else {
        const track = tracks.find(item => item.id === `asset_${entry.hash}`);
        if (!track || track.label !== entry.label || track.mime !== entry.mime || track.sizeBytes !== entry.sizeBytes || track.durationMs !== entry.durationMs) throw Error();
      }
    }
    return { ...row, parsedReceipts: receipts, parsedTracks: tracks, parsedUploadState: state, uploadPending: pending };
  } catch { eventMusicFail('CONFIG_INVALID', 503); }
}
export const eventMusicConfiguration = row => row ? {
  revision: row.revision, selections: normalizeEventMusicSelections(JSON.parse(row.selections), row.parsedTracks),
  ...(row.parsedTracks.length ? { tracks: row.parsedTracks } : {}),
} : { revision: null, selections: { ...EVENT_MUSIC_DEFAULT_SELECTIONS } };
export const eventMusicCasFilter = row => ({ id: row.id, cle: EVENT_MUSIC_CONFIG_KEY, revision: row.revision, selections: row.selections, receipts: row.receipts,
  ...(row.tracks !== undefined ? { tracks: row.tracks } : {}), ...(row.upload_state !== undefined ? { upload_state: row.upload_state } : {}),
});