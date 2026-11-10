import { EVENT_MUSIC_DEFAULT_SELECTIONS, normalizeEventMusicSelections, normalizeEventMusicTracks, resolveEventMusicTrack } from '../../base44/shared/eventMusicContract.js';

// Only catalog IDs are accepted. No URL, private media or account data is cached.
export function createEventMusicStore() {
  /** @type {{revision: number|null, selections: Record<string, string|null>, tracks?: ReturnType<typeof normalizeEventMusicTracks>}} */
  let current = { revision: null, selections: { ...EVENT_MUSIC_DEFAULT_SELECTIONS } };
  return {
    snapshot: () => ({ ...current, selections: { ...current.selections }, ...(current.tracks ? { tracks: current.tracks.map(track => ({ ...track })) } : {}) }),
    track: event => resolveEventMusicTrack(event, current.selections, current.tracks || []),
    apply(configuration) {
      if (!configuration || (configuration.revision !== null && (!Number.isSafeInteger(configuration.revision) || configuration.revision < 0))) return false;
      let selections, tracks;
      try { tracks = normalizeEventMusicTracks(configuration.tracks || []); selections = normalizeEventMusicSelections(configuration.selections, tracks); } catch { return false; }
      if (current.revision !== null && (configuration.revision === null || configuration.revision < current.revision)) return false;
      if (current.revision !== null && configuration.revision === current.revision && (JSON.stringify(selections) !== JSON.stringify(current.selections) || JSON.stringify(tracks) !== JSON.stringify(current.tracks || []))) return false;
      current = { revision: configuration.revision, selections, ...(tracks.length ? { tracks } : {}) };
      return true;
    },
  };
}
export const eventMusicStore = createEventMusicStore();
export const getEventMusicTrack = event => eventMusicStore.track(event);

export function parseEventMusicResponse(response, admin = false) {
  const value = response?.data ?? response;
  const config = value?.configuration;
  if (value?.success !== true || value?.error || value?.erreur || !config || (config.revision !== null && (!Number.isSafeInteger(config.revision) || config.revision < 0)) || (admin && typeof value.writable !== 'boolean')) {
    throw Object.assign(new Error('Réponse des réglages non confirmée.'), { code: value?.code || (typeof value?.error === 'string' ? value.error : null) || 'INVALID_RESPONSE' });
  }
  const tracks = normalizeEventMusicTracks(config.tracks || []);
  return { ...value, configuration: { revision: config.revision, selections: normalizeEventMusicSelections(config.selections, tracks), ...(tracks.length ? { tracks } : {}) } };
}

export async function callEventMusicSettings(api, input) {
  let timer;
  try {
    const response = await Promise.race([
      api.functions.invoke('eventMusicSettings', input),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Réponse non confirmée.'), { code: 'REQUEST_UNCERTAIN' })), 15000); }),
    ]);
    return parseEventMusicResponse(response, input.action === 'status');
  } catch (error) {
    throw Object.assign(new Error('Réglages indisponibles ou réponse non confirmée.'), { code: error?.response?.data?.code || (typeof error?.response?.data?.error === 'string' ? error.response.data.error : null) || error?.code || 'REQUEST_UNCERTAIN' });
  } finally { clearTimeout(timer); }
}

// Shared deduplication and cooldown, including a missing/not-yet-deployed endpoint.
export function createEventMusicRefresh({ store = eventMusicStore, now = Date.now, intervalMs = 300000 } = {}) {
  let pending = null, lastAttempt = -Infinity;
  return api => {
    if (pending) return pending;
    if (now() - lastAttempt < intervalMs) return Promise.resolve(false);
    lastAttempt = now();
    pending = callEventMusicSettings(api, { action: 'public' })
      .then(value => store.apply(value.configuration))
      .catch(() => false)
      .finally(() => { pending = null; });
    return pending;
  };
}
export const refreshEventMusicConfiguration = createEventMusicRefresh();
