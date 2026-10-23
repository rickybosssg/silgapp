export const AUDIO_EXTENSIONS = {
  'audio/webm': 'webm', 'video/webm': 'webm', 'audio/mp4': 'm4a',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg',
};
export const audioMime = value => String(value || '').split(';')[0].trim().toLowerCase();
export const unwrapAudioResponse = response => response?.data ?? response;
export const isAudioSettingsAdmin = user => user?.role === 'admin' &&
  (user.admin_type === 'global' || (!user.admin_type && !user.country_code)) &&
  !user.enterprise_id && user.silgapp_role !== 'admin_entreprise';

const codes = new Set([
  'METHOD', 'AUTH_REQUIRED', 'FORBIDDEN', 'ACTION_INVALID', 'REQUEST_FAILED',
  'AUDIO_SIZE', 'AUDIO_FORMAT', 'CONSENT_REQUIRED', 'REQUEST_ID_REQUIRED',
  'NOT_PROVISIONED', 'DISABLED', 'PROVIDER_NOT_CONFIGURED', 'PROVIDER_RESPONSE',
  'PRIVATE_UPLOAD_RESPONSE', 'SIGNED_URL_RESPONSE', 'NO_SPEECH',
  'TIMEOUT_OUTCOME_UNKNOWN', 'TRANSCRIPTION_FAILED_OUTCOME_UNKNOWN',
  'ALREADY_ATTEMPTED', 'BUSY_OR_ALREADY_ATTEMPTED', 'RECEIPTS_CAPACITY', 'RECEIPTS_INVALID',
  'CONFIG_DUPLICATE', 'CONFIG_INVALID', 'CONFIG_SAVE_UNCONFIRMED', 'NETWORK_ERROR',
  'OPENAI_KEY_MISSING', 'OPENAI_APPROVAL_REQUIRED', 'OPENAI_MODEL_UNSUPPORTED',
  'UPLOAD_FAILED', 'SIGNED_URL_FAILED', 'PROVIDER_ERROR', 'PROVIDER_QUOTA',
  'CLIENT_PROFILE_REQUIRED', 'CLIENT_PROFILE_MISMATCH', 'CLIENT_COUNTRY_REQUIRED',
  'CLIENT_COUNTRY_CHANGED', 'PUBLIC_CLIENT_REQUIRED', 'CLIENT_DISABLED', 'CLIENT_FEES_BLOCKED',
]);
export const safeAudioCode = (code, fallback = 'REQUEST_FAILED') => codes.has(code) ? code : fallback;
export const safeDiagnosticId = value => /^[a-zA-Z0-9_-]{16,100}$/.test(value || '') ? value : '';
export const safeHttpStatus = value => Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined;
