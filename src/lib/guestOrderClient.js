import { Preferences } from '@capacitor/preferences';
import { base44 } from '@/api/base44Client';
import { retryDelayMs, withRequestDeadline } from './guestTrackingState';

export const GUEST_STORAGE_KEY = 'silgapp_guest_order_v1';
const GUEST_COUNTRY_KEY = 'silgapp_guest_country_v1';
const secret = () => [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join('');
const correctableDraftCodes = new Set(['PHONE_INVALID', 'PRICE_INVALID', 'QUARTIER_INVALID', 'COUNTRY_INVALID', 'CONFIRMATION_REQUIRED', 'CONSENT_INVALID', 'DISABLED']);

export function guestDraftCanBeCorrected(error) {
  return correctableDraftCodes.has(error?.code);
}

export function newGuestAccess(deviceToken = secret()) {
  return { request_id: crypto.randomUUID(), read_token: secret(), action_token: secret(), device_token: deviceToken };
}

// Separate from account/session storage. Never put these capabilities in URLs, cookies or logs.
export function guestStorage(adapter = Preferences) {
  return {
    async readCountry() { return (await adapter.get({ key: GUEST_COUNTRY_KEY })).value || ''; },
    async saveCountry(code) { await adapter.set({ key: GUEST_COUNTRY_KEY, value: code }); },
    async read() {
      const stored = await adapter.get({ key: GUEST_STORAGE_KEY });
      if (!stored.value) return null;
      try {
        const data = JSON.parse(stored.value);
        if (!/^[a-f0-9-]{36}$/.test(data?.request_id) || !['read_token', 'action_token', 'device_token'].every(k => /^[a-f0-9]{64}$/.test(data[k]))) throw Error();
        if (data.previous && (!Array.isArray(data.previous) || data.previous.length > 200 || data.previous.some(e => !/^[a-f0-9-]{36}$/.test(e?.request_id) || !['read_token', 'action_token', 'device_token'].every(k => /^[a-f0-9]{64}$/.test(e[k]))))) throw Error();
        return data;
      } catch { throw new Error('Accès local illisible. Ne recréez pas la commande ; contactez le support.'); }
    },
    async save(data) {
      const value = JSON.stringify(data);
      await adapter.set({ key: GUEST_STORAGE_KEY, value });
      if ((await adapter.get({ key: GUEST_STORAGE_KEY })).value !== value) throw new Error('Impossible de conserver le suivi privé. Aucune nouvelle commande envoyée.');
    },
  };
}

/** @param {any} api */
export function guestApi(api = base44) {
  let retryAt = 0;
  return async (action, data = {}) => {
    if (Date.now() < retryAt) {
      const seconds = Math.ceil((retryAt - Date.now()) / 1000);
      throw Object.assign(new Error(`Service temporairement limité. Réessayez dans ${seconds} secondes. Votre tentative est conservée.`), {
        code: 'RATE_LIMITED', status: 429, retryAfterMs: retryAt - Date.now(),
      });
    }
    try {
      const response = await withRequestDeadline(api.functions.invoke('guestOrders', { ...data, action }), action === 'create' ? 45000 : 15000,
        'Réponse non confirmée. Votre tentative est conservée ; actualisez le suivi avant de recommencer.');
      const value = response?.data ?? response;
      if (!value || typeof value !== 'object' || value.error || (value.success === false && !value.pending)) throw Object.assign(new Error(value?.error || 'Réponse non confirmée.'), { code: value?.code });
      const valid = action === 'config' ? typeof value.enabled === 'boolean' && Array.isArray(value.countries)
        : action === 'catalog' ? typeof value.country?.code === 'string' && Array.isArray(value.quartiers)
          : ['admin_list', 'set_enabled', 'revoke'].includes(action) ? value.success === true && Array.isArray(value.rows) && Array.isArray(value.contacts) && value.counts && typeof value.counts === 'object'
            : value.pending === true || (value.success === true && typeof value.course?.statut === 'string');
      if (!valid) throw new Error('Réponse du service non confirmée. Conservez votre tentative.');
      return value;
    } catch (error) {
      const data = error?.response?.data;
      const status = error?.response?.status || error?.status;
      const headers = error?.response?.headers;
      const retryAfterMs = retryDelayMs(headers?.get?.('retry-after') ?? headers?.['retry-after'] ?? data?.retry_after_seconds);
      if (Number(status) === 429) retryAt = Date.now() + retryAfterMs;
      const message = data?.error || error?.message || 'Connexion indisponible. Conservez votre tentative.';
      throw Object.assign(new Error(Number(status) === 429 ? `${message} Réessayez dans ${Math.ceil(retryAfterMs / 1000)} secondes. Votre tentative est conservée.` : message), {
        code: data?.code || error?.code, status,
        retryAfterMs,
      });
    }
  };
}

export function createGuestSubmission(call, storage, makeAccess = newGuestAccess) {
  let busy = false;
  let attempt = null;
  const submit = async draft => {
    if (busy) return null;
    busy = true;
    try {
      if (!attempt) attempt = await storage.read();
      if (!attempt) attempt = { ...makeAccess(), draft: { ...draft, confirmed: true } };
      else if (attempt.draft_rejected === true) attempt = { ...attempt, draft: { ...draft, confirmed: true } };
      attempt.draft_rejected = false;
      await storage.save(attempt); // Verify persistence again after a failed storage attempt.
      try {
        const { request_id, read_token, action_token, device_token, draft: confirmedDraft } = attempt;
        return await call('create', { request_id, read_token, action_token, device_token, draft: confirmedDraft });
      } catch (error) {
        if (guestDraftCanBeCorrected(error)) {
          // Keep the same capabilities and request ID, including across reopening.
          // A concurrent successful request will be recovered, never recreated.
          attempt.draft_rejected = true;
          await storage.save(attempt);
          throw Object.assign(new Error(error.message), { code: error.code, draftRejected: true });
        }
        throw error;
      }
    } finally { busy = false; }
  };
  return Object.assign(submit, { reset() { if (busy) throw Error('Vérification en cours.'); attempt = null; } });
}
