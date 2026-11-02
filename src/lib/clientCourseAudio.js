const files = { search: 'SILGAPP_01_recherche_douce.mp3', acceptance: 'SILGAPP_02_acceptation_joyeuse.mp3', refusal: 'SILGAPP_03_refus_sobre.mp3' };
let active = null, lastRefusal = 0;
export function stopClientCourseAudio() { if (active) { active.pause(); active.currentTime = 0; active = null; } }
export async function playClientCourseAudio(kind) {
  if (!files[kind] || typeof Audio === 'undefined' || document.visibilityState !== 'visible') return false;
  if (kind === 'refusal' && Date.now() - lastRefusal < 10000) return false;
  if (kind === 'refusal') lastRefusal = Date.now();
  stopClientCourseAudio();
  const sound = new Audio('/sounds/client/' + files[kind]); active = sound; sound.loop = false;
  sound.addEventListener('ended', () => { if (active === sound) active = null; }, { once: true });
  try { await sound.play(); return true; }
  catch { if (active === sound) active = null; return false; }
}
