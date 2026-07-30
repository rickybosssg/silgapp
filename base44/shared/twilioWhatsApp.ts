// ── Utilitaire d'envoi WhatsApp via Twilio (partagé) ─────────────────────────
// Factorise l'appel API Twilio utilisé par dispatchExterneAuto et webhookWhatsAppVenus.

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';

/**
 * Envoie un message WhatsApp via Twilio.
 * @param to - Numéro de téléphone (format international avec ou sans +)
 * @param body - Corps du message
 * @returns { success, sid?, error?, code? }
 */
export async function envoyerWhatsAppRaw(
  to: string,
  body: string,
): Promise<{ success: boolean; sid?: string; error?: string; code?: number }> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromRaw = Deno.env.get('TWILIO_WHATSAPP_FROM') || '';
  if (!accountSid || !authToken || !fromRaw) {
    return { success: false, error: 'TWILIO credentials missing' };
  }
  const fromNumber = fromRaw.startsWith('whatsapp:') ? fromRaw : `whatsapp:${fromRaw}`;
  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const formData = new URLSearchParams();
  formData.append('From', fromNumber);
  formData.append('To', toNumber);
  formData.append('Body', body);
  const creds = btoa(`${accountSid}:${authToken}`);
  const resp = await fetch(`${TWILIO_API_BASE}/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });
  const data = await resp.json();
  if (resp.ok && data.sid) {
    return { success: true, sid: data.sid };
  }
  return { success: false, error: data.message || 'Twilio error', code: data.code };
}