// Deliberately narrow formats. No codec execution, browser decode or network access.
export const MAX_EVENT_MUSIC_UPLOAD_BYTES = 3 * 1024 * 1024;
const invalid = (code = 'MEDIA_INVALID') => { throw Object.assign(new Error(code), { code }); };
const text = (bytes, at, size) => String.fromCharCode(...bytes.subarray(at, at + size));
export function validateEventMusicMedia(input) {
  if (!(input instanceof Uint8Array) || input.length < 12 || input.length > MAX_EVENT_MUSIC_UPLOAD_BYTES) invalid('MEDIA_SIZE');
  const bytes = new Uint8Array(input); // immutable validation snapshot
  let durationMs, mime, extension, clean;
  if (text(bytes, 0, 4) === 'RIFF' && text(bytes, 8, 4) === 'WAVE') {
    const view = new DataView(bytes.buffer);
    if (view.getUint32(4, true) !== bytes.length - 8 || text(bytes, 12, 4) !== 'fmt ' || bytes.length < 44 || view.getUint32(16, true) !== 16) invalid();
    const channels = view.getUint16(22, true), rate = view.getUint32(24, true), bits = view.getUint16(34, true);
    const align = channels * bits / 8;
    if (view.getUint16(20, true) !== 1 || ![1, 2].includes(channels) || ![8, 16].includes(bits) || rate < 8000 || rate > 48000 ||
        view.getUint16(32, true) !== align || view.getUint32(28, true) !== rate * align || text(bytes, 36, 4) !== 'data') invalid();
    const size = view.getUint32(40, true);
    if (!size || size % align || 44 + size + (size % 2) !== bytes.length || (size % 2 && bytes[bytes.length - 1] !== 0)) invalid();
    durationMs = size / (rate * align) * 1000; mime = 'audio/wav'; extension = 'wav'; clean = bytes;
  } else {
    let start = 0, end = bytes.length;
    // Strip ID3v2 wholesale, never publish embedded pictures/text/URLs. Unsynchronised,
    // experimental, extended-header and footer variants are intentionally unsupported.
    if (text(bytes, 0, 3) === 'ID3') {
      if (![3, 4].includes(bytes[3]) || bytes[4] !== 0 || bytes[5] !== 0 || bytes.subarray(6, 10).some(value => value > 127)) invalid();
      start = 10 + bytes[6] * 2097152 + bytes[7] * 16384 + bytes[8] * 128 + bytes[9];
      if (start >= end) invalid();
    }
    if (end - start >= 128 && text(bytes, end - 128, 3) === 'TAG') end -= 128;
    let cursor = start, samplesMs = 0, frames = 0, fixed = '';
    while (cursor < end) {
      if (cursor + 4 > end || bytes[cursor] !== 255 || (bytes[cursor + 1] & 224) !== 224) invalid();
      const version = (bytes[cursor + 1] >> 3) & 3, layer = (bytes[cursor + 1] >> 1) & 3;
      const bitrateIndex = bytes[cursor + 2] >> 4, rateIndex = (bytes[cursor + 2] >> 2) & 3;
      if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3 || (bytes[cursor + 3] & 3) === 2) invalid();
      const rate = [44100, 48000, 32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
      const bitrate = (version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[bitrateIndex];
      const signature = `${version}:${rate}:${bytes[cursor + 3] >> 6 === 3 ? 1 : 2}`;
      if (fixed && fixed !== signature) invalid();
      fixed = signature;
      const length = Math.floor((version === 3 ? 144000 : 72000) * bitrate / rate) + ((bytes[cursor + 2] >> 1) & 1);
      if (length < 24 || cursor + length > end) invalid();
      samplesMs += (version === 3 ? 1152 : 576) / rate * 1000; frames++; cursor += length;
    }
    if (frames < 2) invalid();
    durationMs = samplesMs; mime = 'audio/mpeg'; extension = 'mp3'; clean = bytes.slice(start, end);
  }
  if (!Number.isFinite(durationMs) || durationMs < 200 || durationMs > 30000) invalid('MEDIA_DURATION');
  return { bytes: clean, mime, extension, durationMs: Math.round(durationMs) };
}
