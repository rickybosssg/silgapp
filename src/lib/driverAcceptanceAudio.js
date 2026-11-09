import { APPROVED_COURSE_EXCERPT } from './approvedCourseExcerpt.js';

// Presentation only: never infer acceptance from polling, clicks or an old assignment.
export function isFreshDriverAcceptance(receipt) {
  const data = receipt?.data ?? receipt;
  return data?.success === true && data.accepted !== false &&
    !data.already_accepted && !data.already_taken && !data.expired &&
    !data.pending_client_validation;
}

export function createDriverAcceptanceAudio({
  url = APPROVED_COURSE_EXCERPT.url,
  createAudio = source => new Audio(source),
  isVisible = () => typeof document !== 'undefined' && document.visibilityState === 'visible',
  schedule = setTimeout,
  unschedule = clearTimeout,
} = {}) {
  const seen = new Set();
  let active = null, timer = null, disposed = false, foreground = true;
  function stop() {
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
      if (!url || !foreground || !isVisible()) return false;
      stop();
      let sound;
      try {
        sound = createAudio(url);
        active = sound;
        sound.loop = false;
        const finish = () => { if (active === sound) stop(); };
        sound.addEventListener('ended', finish, { once: true });
        sound.addEventListener('error', finish, { once: true });
        timer = schedule(finish, APPROVED_COURSE_EXCERPT.durationMs);
        await sound.play();
        if (disposed || active !== sound || !foreground || !isVisible()) {
          sound.pause(); sound.currentTime = 0;
          return false;
        }
        return true;
      } catch {
        if (active === sound) stop();
        return false;
      }
    },
  };
}
