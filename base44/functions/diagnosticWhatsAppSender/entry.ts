import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Diagnostic complet du WhatsApp Sender +226 55 48 38 38 sur Twilio.
 * Interroge directement l'API Twilio pour identifier les erreurs de provisioning.
 * Admin only.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM');

    if (!TWILIO_SID || !TWILIO_TOKEN) {
      return Response.json({ error: 'Secrets Twilio manquants' }, { status: 500 });
    }

    const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
    const headers = { 'Authorization': `Basic ${auth}` };

    const VENUS_NUMBER = '+22655483838';
    const VENUS_NUMBER_FORMATTED = '22655483838';

    const rapport: any = {
      timestamp: new Date().toISOString(),
      account_sid: TWILIO_SID,
      twilio_from_env: TWILIO_FROM,
      venus_number_cible: VENUS_NUMBER,
    };

    // ── 1. Vérifier le compte Twilio ──
    try {
      const accountResp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}.json`, { headers });
      const accountData = await accountResp.json();
      rapport.compte = {
        statut: accountData.status,
        type: accountData.type,
        nom: accountData.friendly_name,
      };
    } catch (e) {
      rapport.compte = { erreur: e.message };
    }

    // ── 2. Lister les Messaging Services (où sont attachés les WhatsApp Senders) ──
    let messagingServices: any[] = [];
    try {
      const msResp = await fetch('https://messaging.twilio.com/v1/Services', { headers });
      const msData = await msResp.json();
      messagingServices = msData?.data || [];
      rapport.messaging_services = messagingServices.map((ms: any) => ({
        sid: ms.sid,
        nom: ms.friendly_name,
        in_use: ms.in_use,
        whatsapp_enabled: ms.whatsapp_enabled || false,
        url: ms.url,
      }));
    } catch (e) {
      rapport.messaging_services_erreur = e.message;
    }

    // ── 3. Pour chaque Messaging Service, lister les WhatsApp Senders ──
    const allWhatsAppSenders: any[] = [];
    for (const ms of messagingServices) {
      try {
        const wsResp = await fetch(`https://messaging.twilio.com/v1/Services/${ms.sid}/WhatsAppSenders`, { headers });
        const wsData = await wsResp.json();
        const senders = wsData?.data || [];
        for (const s of senders) {
          allWhatsAppSenders.push({ ...s, messaging_service_sid: ms.sid, messaging_service_nom: ms.friendly_name });
        }
      } catch (e) {
        // Erreur non bloquante — certains services n'ont pas de WhatsApp senders
      }
    }

    // ── 4. Vérifier aussi via l'API legacy IncomingPhoneNumbers ──
    try {
      const phoneResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers.json?PageSize=50`,
        { headers }
      );
      const phoneData = await phoneResp.json();
      rapport.incoming_phone_numbers = (phoneData?.incoming_phone_numbers || []).map((p: any) => ({
        sid: p.sid,
        numero: p.phone_number,
        friendly_name: p.friendly_name,
        capabilities: p.capabilities,
        status: p.status,
        voice_url: p.voice_url,
        sms_url: p.sms_url,
      }));
    } catch (e) {
      rapport.incoming_phone_numbers_erreur = e.message;
    }

    // ── 5. Analyser les WhatsApp Senders trouvés ──
    rapport.whatsapp_senders = allWhatsAppSenders.map((s: any) => ({
      sid: s.sid,
      numero: s.phone_number,
      friendly_name: s.friendly_name,
      statut: s.status,
      code_erreur: s.error_code,
      message_erreur: s.error_message,
      webhook_url: s.webhook_url,
      webhook_method: s.webhook_method,
      messaging_service: s.messaging_service_nom,
      date_creation: s.date_created,
      date_maj: s.date_updated,
    }));

    // ── 6. Chercher spécifiquement le numéro VENUS ──
    const venusSender = allWhatsAppSenders.find((s: any) => {
      const num = (s.phone_number || '').replace(/\D/g, '');
      return num.endsWith(VENUS_NUMBER_FORMATTED);
    });

    if (venusSender) {
      rapport.venus_sender_trouve = {
        sid: venusSender.sid,
        statut: venusSender.status,
        code_erreur: venusSender.error_code,
        message_erreur: venusSender.error_message,
        webhook_url: venusSender.webhook_url,
        webhook_method: venusSender.webhook_method,
        messaging_service: venusSender.messaging_service_nom,
      };
    } else {
      rapport.venus_sender_trouve = false;
      rapport.venus_sender_statut = 'NON_TROUVÉ — Le numéro +226 55 48 38 38 n\'est pas encore ajouté comme WhatsApp Sender dans Twilio.';
    }

    // ── 7. Logs récents — messages tentés depuis/vers le numéro VENUS ──
    try {
      const logsResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json?PageSize=20`,
        { headers }
      );
      const logsData = await logsResp.json();
      rapport.messages_recents = (logsData?.messages || []).map((m: any) => ({
        sid: m.sid,
        from: m.from,
        to: m.to,
        statut: m.status,
        code_erreur: m.error_code,
        message_erreur: m.error_message,
        date: m.date_sent || m.date_created,
        body: (m.body || '').substring(0, 80),
      }));

      // Filtrer spécifiquement les messages liés au numéro VENUS
      rapport.messages_venus = rapport.messages_recents.filter((m: any) => {
        const from = (m.from || '').replace(/\D/g, '');
        const to = (m.to || '').replace(/\D/g, '');
        return from.endsWith(VENUS_NUMBER_FORMATTED) || to.endsWith(VENUS_NUMBER_FORMATTED);
      });
    } catch (e) {
      rapport.messages_erreur = e.message;
    }

    // ── 8. Diagnostic global et recommandation ──
    let diagnostic = '';
    let codeErreur = null;
    let correction = '';

    if (allWhatsAppSenders.length === 0 && messagingServices.length === 0) {
      diagnostic = 'AUCUN_MESSAGING_SERVICE';
      correction = 'Aucun Messaging Service Twilio trouvé. Créez un Messaging Service dans Twilio Console → Messaging → Services → Create new Service, puis ajoutez le numéro WhatsApp via "WhatsApp senders".';
    } else if (allWhatsAppSenders.length === 0) {
      diagnostic = 'AUCUN_WHATSAPP_SENDER';
      correction = `${messagingServices.length} Messaging Service(s) trouvé(s) mais aucun WhatsApp Sender. Allez dans Twilio Console → Messaging → Services → sélectionnez le service → "WhatsApp senders" → "Add WhatsApp sender" et suivez l\'assistant Meta.`;
    } else if (!venusSender) {
      diagnostic = 'NUMERO_NON_AJOUTE';
      correction = `WhatsApp Senders existants: ${allWhatsAppSenders.map(s => s.phone_number).join(', ')}. Le +226 55 48 38 38 n'est pas parmi eux. Ajoutez-le via Twilio Console → WhatsApp senders → Add sender.`;
    } else if (venusSender.status !== 'approved' && venusSender.status !== 'connected') {
      diagnostic = 'PROVISIONING_ECHOUE';
      codeErreur = venusSender.error_code;
      correction = `Le numéro est ajouté mais son statut est "${venusSender.status}". Erreur: ${venusSender.error_message || 'N/A'} (code ${venusSender.error_code || 'N/A'}). Vérifiez dans Meta Business Manager que le numéro est vérifié et que le compte WhatsApp Business "Silgapp" est en statut "Verified" (Verte).`;
    } else {
      diagnostic = 'NUMERO_APPROUVE';
      correction = `Le numéro +226 55 48 38 38 est approuvé (statut: ${venusSender.status}). Vous pouvez maintenant configurer le secret TWILIO_WHATSAPP_VENUS_FROM = whatsapp:${VENUS_NUMBER}.`;
    }

    rapport.diagnostic_final = {
      code: diagnostic,
      code_erreur_twilio: codeErreur,
      correction: correction,
    };

    return Response.json(rapport);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});