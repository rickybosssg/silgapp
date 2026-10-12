import { Capacitor, registerPlugin } from '@capacitor/core';

const Native = registerPlugin('SilgappNative');
const played = new Set();

export async function playVictorySoundOnce(courseId) {
  if (!courseId || played.has(courseId)) return;
  played.add(courseId);
  // Only the native bridge can reliably respect Android silent/DND settings.
  if (Capacitor.getPlatform() !== 'android') return;
  try { await Native.playVictorySound({ courseId }); } catch {
    // Audio is optional and must never interrupt confirmation or overlay dismissal.
  }
}
