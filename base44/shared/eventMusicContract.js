// Shared allowlist only: no uploaded, remote or administrator-provided URLs.
export const EVENT_MUSIC_EVENTS = Object.freeze([
  { key: 'client_search', label: 'Recherche client' },
  { key: 'client_acceptance', label: 'Acceptation client' },
  { key: 'client_refusal', label: 'Refus client' },
  { key: 'driver_acceptance', label: 'Acceptation livreur' },
].map(value => Object.freeze(value)));
// User-selected local tracking audio; rightsholder permission is not established here.
export const TRACKING_COURSE_RINGTONE = Object.freeze({
  id: 'tracking-ringtone', label: 'Sonnerie de suivi (11 s)',
  url: '/sounds/shared/SILGAPP_sonnerie_suivi_11s.mp3', durationMs: 11000,
  sha256: 'b2e49df2490b7dfd6d69b2c8cce76aa98a708ef3daba6b6aedf8635d4e0b3e2c',
});
export const EVENT_MUSIC_TRACKS = Object.freeze([
  TRACKING_COURSE_RINGTONE,
  { id: 'shared-excerpt', label: 'Extrait approuvé (25 s)', url: '/sounds/shared/SILGAPP_extrait_approuve_25s.mp3', durationMs: 25000 },
  { id: 'client-search', label: 'Recherche douce (10 s)', url: '/sounds/client/SILGAPP_01_recherche_douce.mp3', durationMs: 10056 },
  { id: 'client-acceptance', label: 'Acceptation joyeuse (10 s)', url: '/sounds/client/SILGAPP_02_acceptation_joyeuse.mp3', durationMs: 10056 },
  { id: 'client-refusal', label: 'Refus sobre (10 s)', url: '/sounds/client/SILGAPP_03_refus_sobre.mp3', durationMs: 10056 },
].map(value => Object.freeze(value)));
export const EVENT_MUSIC_DEFAULT_SELECTIONS = Object.freeze({
  client_search: 'tracking-ringtone', client_acceptance: 'tracking-ringtone',
  client_refusal: 'tracking-ringtone', driver_acceptance: 'tracking-ringtone',
});
export const isEventMusicAdmin = user => !!user?.id && user.role === 'admin' &&
  (user.admin_type === 'global' || (!user.admin_type && !user.country_code)) &&
  !user.enterprise_id && !user.data?.enterprise_id &&
  (!user.silgapp_role || ['super_admin', 'superadmin'].includes(user.silgapp_role));
export function normalizeEventMusicTracks(tracks = []) {
  if (!Array.isArray(tracks) || tracks.length > 100) throw new Error('TRACKS_INVALID');
  const seen = new Set();
  return tracks.map(track => {
    if (!track || typeof track !== 'object' || !/^[a-f0-9]{64}$/.test(track.sha256) || track.id !== `asset_${track.sha256}` || seen.has(track.id) ||
        typeof track.label !== 'string' || !track.label.trim() || track.label !== track.label.trim() || track.label.length > 60 || /[\x00-\x1f\x7f]/.test(track.label) ||
        !Number.isInteger(track.durationMs) || track.durationMs < 200 || track.durationMs > 30000 ||
        !['audio/mpeg', 'audio/wav'].includes(track.mime) || !Number.isInteger(track.sizeBytes) || track.sizeBytes < 12 || track.sizeBytes > 3 * 1024 * 1024 ||
        typeof track.url !== 'string' || track.url.length > 2048) throw new Error('TRACKS_INVALID');
    let url;
    try { url = new URL(track.url); } catch { throw new Error('TRACKS_INVALID'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.href !== track.url) throw new Error('TRACKS_INVALID');
    seen.add(track.id);
    return { id: track.id, label: track.label, url: track.url, durationMs: track.durationMs, mime: track.mime, sizeBytes: track.sizeBytes, sha256: track.sha256 };
  });
}
export function validateEventMusicSelections(value, tracks = []) {
  let custom;
  try { custom = normalizeEventMusicTracks(tracks); } catch { return false; }
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === EVENT_MUSIC_EVENTS.length && EVENT_MUSIC_EVENTS.every(({ key }) =>
      Object.prototype.hasOwnProperty.call(value, key) &&
      (value[key] === null || [...EVENT_MUSIC_TRACKS, ...custom].some(track => track.id === value[key])));
}
export function normalizeEventMusicSelections(value, tracks = []) {
  if (!validateEventMusicSelections(value, tracks)) throw new Error('SELECTIONS_INVALID');
  return Object.fromEntries(EVENT_MUSIC_EVENTS.map(({ key }) => [key, value[key]]));
}
/** @param {Record<string, string|null>} [selections] */
export function resolveEventMusicTrack(event, selections = EVENT_MUSIC_DEFAULT_SELECTIONS, tracks = []) {
  if (!Object.prototype.hasOwnProperty.call(EVENT_MUSIC_DEFAULT_SELECTIONS, event)) return null;
  let custom;
  try { custom = normalizeEventMusicTracks(tracks); } catch { custom = []; }
  const id = validateEventMusicSelections(selections, custom) ? selections[event] ?? EVENT_MUSIC_DEFAULT_SELECTIONS[event] : EVENT_MUSIC_DEFAULT_SELECTIONS[event];
  return [...EVENT_MUSIC_TRACKS, ...custom].find(track => track.id === id) || null;
}