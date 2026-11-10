import { MAX_EVENT_MUSIC_UPLOAD_BYTES, validateEventMusicMedia } from '../../base44/shared/eventMusicMediaValidation.js';

export async function prepareEventMusicFile(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_EVENT_MUSIC_UPLOAD_BYTES) throw new Error('Choisissez un fichier MP3 ou WAV de 3 Mo maximum.');
  if (!/\.(mp3|wav)$/i.test(file.name || '')) throw new Error('Seuls les fichiers MP3 et WAV sont acceptés.');
  let media;
  try { media = validateEventMusicMedia(new Uint8Array(await file.arrayBuffer())); }
  catch { throw new Error('Fichier audio invalide. Utilisez un MP3 ou WAV PCM de 0,2 à 30 secondes.'); }
  if ((/\.mp3$/i.test(file.name) && media.mime !== 'audio/mpeg') || (/\.wav$/i.test(file.name) && media.mime !== 'audio/wav')) throw new Error('Le contenu du fichier ne correspond pas à son extension.');
  return media;
}

export function encodeEventMusicBytes(bytes) {
  // Bounded chunks avoid exceeding argument/stack limits for multi-megabyte clips.
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
export const validEventMusicLabel = value => typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 60 && !/[\u0000-\u001f\u007f]/.test(value);
