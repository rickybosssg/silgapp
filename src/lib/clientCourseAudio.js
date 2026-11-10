import { TRACKING_COURSE_RINGTONE } from '../../base44/shared/eventMusicContract.js';
import { getEventMusicTrack } from './eventMusicSettings.js';
import { canFallbackEventMusic } from './eventMusicPlayback.js';
const files = { search: 'SILGAPP_01_recherche_douce.mp3', acceptance: 'SILGAPP_02_acceptation_joyeuse.mp3', refusal: 'SILGAPP_03_refus_sobre.mp3' };
let active = null, activeOwner = null, lastRefusal = 0, generation = 0;
export function stopClientCourseAudio(owner = undefined) {
  if (owner !== undefined && activeOwner !== owner) return;
  generation++;
  if (active) { active.pause(); active.currentTime = 0; active = null; }
  activeOwner = null;
}
export async function playClientCourseAudio(kind, owner = undefined) {
  if (!Object.prototype.hasOwnProperty.call(files, kind) || typeof Audio === 'undefined' || typeof document === 'undefined' || document.visibilityState !== 'visible') return false;
  if (kind === 'refusal' && Date.now() - lastRefusal < 10000) return false;
  if (kind === 'refusal') lastRefusal = Date.now();
  stopClientCourseAudio();
  const token = generation;
  const fallback = TRACKING_COURSE_RINGTONE.url;
  const source = getEventMusicTrack('client_' + kind)?.url || fallback;
  const current = () => token === generation && document.visibilityState === 'visible';
  async function start(url, allowFallback) {
    if (!current()) return false;
    let sound, recovery;
    const recover = error => {
      if (recovery) return recovery;
      if (active !== sound || !current()) return Promise.resolve(false);
      sound?.pause(); if (sound) sound.currentTime = 0;
      active = null;
      recovery = allowFallback && canFallbackEventMusic(error, sound) ? start(fallback, false) : Promise.resolve(false);
      return recovery;
    };
    try {
      sound = new Audio(url); active = sound; activeOwner = owner; sound.loop = false;
      sound.addEventListener('ended', () => { if (active === sound) { active = null; activeOwner = null; } }, { once: true });
      sound.addEventListener('error', () => { void recover({ name: 'MediaError' }); }, { once: true });
      await sound.play();
      if (recovery) return recovery;
      if (active !== sound || !current()) { sound.pause(); sound.currentTime = 0; return false; }
      return true;
    } catch (error) { return recover(error); }
  }
  return start(source, source !== fallback);
}
