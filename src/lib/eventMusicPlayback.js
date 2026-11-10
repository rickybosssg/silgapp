// A blocked user gesture or an interrupted play must never trigger a retry.
export function canFallbackEventMusic(error, sound) {
  if (['NotAllowedError', 'AbortError'].includes(error?.name) || sound?.error?.code === 1) return false;
  return ['NotSupportedError', 'MediaError'].includes(error?.name) || [2, 3, 4].includes(sound?.error?.code);
}
