import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Diagnostic Twilio — affiche le SID, le numéro WhatsApp FROM et détecte Sandbox vs Production.
 * Réservé aux admins.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin uniquement' }, { status: 403 });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
    const fromRaw = Deno.env.get('TWILIO_WHATSAPP_FROM') || '';

    if (!accountSid || !authToken || !fromRaw) {
      return Response.json({
        ok: false,
        erreur: 'Variables TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN ou TWILIO_WHATSAPP_FROM manquantes',
        accountSid: accountSid ? accountSid.substring(0, 6) + '…' : ' MANQUANT',
        from_raw: fromRaw || ' MANQUANT',
      });
    }

    // ── Numéro FROM normalisé ─────────────────────────────────────────────────
    // Supprime le préfixe "whatsapp:" pour obtenir le numéro brut
    const fromNumero = fromRaw.replace(/^whatsapp:/i, '').trim();

    // ── Détecter Sandbox vs Production ───────────────────────────────────────
    // Le numéro Sandbox Twilio WhatsApp est toujours +14155238886
    const SANDBOX_NUMBER = '+14155238886';
    const isSandbox = fromNumero === SANDBOX_NUMBER;
    const environnement = isSandbox ? ' SANDBOX (numéro partagé Twilio)' : ' PRODUCTION (numéro dédié)';

    // ── Récupérer les infos du compte Twilio via l'API ───────────────────────
    const credentials = btoa(`${accountSid}:${authToken}`);
    const accountResp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      { headers: { 'Authorization': `Basic ${credentials}` } }
    );
    const accountData = await accountResp.json();

    // ── Vérifier le statut du numéro dans Twilio ─────────────────────────────
    let phoneInfo = null;
    let phoneError = null;
    try {
      // Encode le numéro pour l'URL
      const encodedNumber = encodeURIComponent(fromNumero);
      const phoneResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodedNumber}`,
        { headers: { 'Authorization': `Basic ${credentials}` } }
      );
      const phoneData = await phoneResp.json();
      if (phoneData.incoming_phone_numbers && phoneData.incoming_phone_numbers.length > 0) {
        const p = phoneData.incoming_phone_numbers[0];
        phoneInfo = {
          sid: p.sid,
          friendly_name: p.friendly_name,
          phone_number: p.phone_number,
          capabilities: p.capabilities,
          status: p.status,
        };
      } else if (isSandbox) {
        phoneInfo = { note: 'Numéro Sandbox partagé — pas de SID propre au compte' };
      } else {
        phoneError = 'Numéro non trouvé dans les IncomingPhoneNumbers du compte';
      }
    } catch (e) {
      phoneError = e.message;
    }

    // ── Récupérer les 3 derniers messages envoyés (pour vérif SID réels) ─────
    let dernierMessages = [];
    try {
      const msgResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json?PageSize=3&From=whatsapp:${encodeURIComponent(fromNumero)}`,
        { headers: { 'Authorization': `Basic ${credentials}` } }
      );
      const msgData = await msgResp.json();
      if (msgData.messages) {
        dernierMessages = msgData.messages.map(m => ({
          sid: m.sid,
          to: m.to,
          status: m.status,
          date_sent: m.date_sent,
          error_code: m.error_code || null,
          error_message: m.error_message || null,
        }));
      }
    } catch (e) {
      // non bloquant
    }

    return Response.json({
      ok: true,

      // ── Informations clés ──────────────────────────────────────────────────
      twilio_account_sid: accountSid,
      twilio_account_nom: accountData.friendly_name || '?',
      twilio_account_statut: accountData.status || '?',
      twilio_account_type: accountData.type || '?',

      // ── Numéro WhatsApp FROM ───────────────────────────────────────────────
      whatsapp_from_raw: fromRaw,
      whatsapp_from_numero: fromNumero,
      whatsapp_from_format_twilio: `whatsapp:${fromNumero}`,

      // ── Sandbox vs Production ──────────────────────────────────────────────
      environnement,
      is_sandbox: isSandbox,
      sandbox_numero_reference: SANDBOX_NUMBER,

      // ── Détail du numéro (si Production) ──────────────────────────────────
      phone_info: phoneInfo,
      phone_error: phoneError,

      // ── Derniers messages envoyés ──────────────────────────────────────────
      derniers_messages: dernierMessages,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});