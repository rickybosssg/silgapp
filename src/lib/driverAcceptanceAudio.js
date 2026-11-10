import { TRACKING_COURSE_RINGTONE } from '../../base44/shared/eventMusicContract.js';
// Preserve the existing maximum for administrator-selected catalogue tracks.
const MAX_DRIVER_ACCEPTANCE_AUDIO_MS = 25000;
import { getEventMusicTrack } from './eventMusicSettings.js';
import { canFallbackEventMusic } from './eventMusicPlayback.js';

// Presentation only: never infer acceptance from polling, clicks or an old assignment.
export function isFreshDriverAcceptance(receipt) {
  const data = receipt?.data ?? receipt;
  return data?.success === true && data.accepted !== false &&
    !data.already_accepted && !data.already_taken && !data.expired &&
    !data.pending_client_validation;
}

export function createDriverAcceptanceAudio({
  url = undefined,
  createAudio = source => new Audio(source),
  isVisible = () => typeof document !== 'undefined' && document.visibilityState === 'visible',
  schedule = setTimeout,
  unschedule = clearTimeout,
} = {}) {
  const seen = new Set();
  let active = null, timer = null, disposed = false, foreground = true, generation = 0;
  function stop() {
    generation++;
    if (timer !== null) unschedule(timer);
    timer = null;
    const sound = active;
    active = null;
    if (sound) { sound.pause(); sound.currentTime = 0; }
  }
  return {
    stop,
    setForeground(value) { foreground = value; if (!value) stop(); },
    dispose() { disposed = true; stop(); },
    async play(event) {
      if (disposed || !event?.key || !isFreshDriverAcceptance(event.receipt) || seen.has(event.key)) return false;
      // Mark even hidden/blocked events consumed: resuming or retrying must not replay them.
      seen.add(event.key);
      const track = url === undefined ? getEventMusicTrack('driver_acceptance') : { url, durationMs: MAX_DRIVER_ACCEPTANCE_AUDIO_MS };
      if (!track?.url || !foreground || !isVisible()) return false;
      stop();
      const token = generation, startedAt = Date.now();
      const current = () => !disposed && token === generation && foreground && isVisible();
      async function start(source, durationMs, allowFallback) {
        if (!current() || durationMs <= 0) return false;
        let sound, recovery;
        const recover = error => {
          if (recovery) return recovery;
          if (active !== sound || !current()) return Promise.resolve(false);
          if (timer !== null) unschedule(timer); timer = null;
          sound?.pause(); if (sound) sound.currentTime = 0;
          active = null;
          recovery = allowFallback && canFallbackEventMusic(error, sound)
            ? start(TRACKING_COURSE_RINGTONE.url, Math.max(0, Math.min(TRACKING_COURSE_RINGTONE.durationMs, MAX_DRIVER_ACCEPTANCE_AUDIO_MS - (Date.now() - startedAt))), false) : Promise.resolve(false);
          return recovery;
        };
        try {
          sound = createAudio(source); active = sound; sound.loop = false;
          const finish = () => { if (active === sound) stop(); };
          sound.addEventListener('ended', finish, { once: true });
          sound.addEventListener('error', () => { void recover({ name: 'MediaError' }); }, { once: true });
          timer = schedule(finish, Math.min(durationMs, MAX_DRIVER_ACCEPTANCE_AUDIO_MS));
          await sound.play();
          if (recovery) return recovery;
          if (active !== sound || !current()) { sound.pause(); sound.currentTime = 0; return false; }
          return true;
        } catch (error) { return recover(error); }
      }
      return start(track.url, track.durationMs, url === undefined && track.url !== TRACKING_COURSE_RINGTONE.url);
    },
  };
}
