import { normalizeGuestPhone } from '../../base44/shared/guestOrderPolicy.js';

export { normalizeGuestPhone };

export function guestCountryFlag(code) {
  return /^[A-Z]{2}$/.test(code || '') ? [...code].map(c => String.fromCodePoint(127397 + c.charCodeAt(0))).join('') : '';
}

export function guestCountryName(code) {
  try { return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code); }
  catch { return code; }
}

export function guestNationalInput(value, country) {
  if (!country) return value;
  const dial = String(country.indicatif || '').replace(/\D/g, '');
  const digits = value.replace(/\D/g, '');
  if (!dial) return value;
  if (value.trim().startsWith('+') && digits.startsWith(dial)) return digits.slice(dial.length);
  if (digits.startsWith('00' + dial)) return digits.slice(dial.length + 2);
  if (digits.startsWith(dial) && digits.length > Number(country.phone_max_length)) return digits.slice(dial.length);
  return value;
}
