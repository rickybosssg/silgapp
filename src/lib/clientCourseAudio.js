import { APPROVED_COURSE_EXCERPT } from './approvedCourseExcerpt.js';
const files = { search: 'SILGAPP_01_recherche_douce.mp3', acceptance: 'SILGAPP_02_acceptation_joyeuse.mp3', refusal: 'SILGAPP_03_refus_sobre.mp3' };
let active = null, activeOwner = null, lastRefusal = 0;
export function stopClientCourseAudio(owner = undefined) {
  if (owner !== undefined && activeOwner !== owner) return;
  if (active) { active.pause(); active.currentTime = 0; active = null; }
  activeOwner = null;
}
export async function playClientCourseAudio(kind, owner = undefined) {
  if (!files[kind] || typeof Audio === 'undefined' || typeof document === 'undefined' || document.visibilityState !== 'visible') return false;
  if (kind === 'refusal' && Date.now() - lastRefusal < 10000) return false;
  if (kind === 'refusal') lastRefusal = Date.now();
  stopClientCourseAudio();
  const source = kind === 'search' ? APPROVED_COURSE_EXCERPT.url : '/sounds/client/' + files[kind];
  if (!source) return false;
  const sound = new Audio(source); active = sound; activeOwner = owner; sound.loop = false;
  sound.addEventListener('ended', () => { if (active === sound) active = null; }, { once: true });
  try { await sound.play(); return true; }
  catch { if (active === sound) active = null; return false; }
}
