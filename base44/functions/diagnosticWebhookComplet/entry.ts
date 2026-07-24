import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Diagnostic complet de la configuration Twilio pour identifier pourquoi
 * les messages WhatsApp entrants ne sont pas transmis au webhook.
 *
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

    if (!TWILIO_SID || !TWILIO_TOKEN) {
      return Response.json({ error: 'Secrets Twilio manquants' }, { status: 500 });
    }

    const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
    const headers = {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    const rapport: any = { timestamp: new Date().toISOString() };

    // ── 1. Lister TOUS les Messaging Services ──
    const msResp = await fetch('https://messaging.twilio.com/v1/Services?PageSize=100', { headers });
    const msData = await msResp.json();
    rapport.messaging_services = (msData?.data || []).map((s: any) => ({
      sid: s.sid,
      nom: s.friendly_name,
      whatsapp_enabled: s.whatsapp_enabled || false,
      inbound_request_url: s.inbound_request_url || 'NON CONFIGURÉ',
      inbound_method: s.inbound_method,
      use_inbound_webhook_on_number: s.use_inbound_webhook_on_number,
      usecase: s.usecase,
    }));

    // ── 2. Vérifier le service spécifique qui reçoit les messages ──
    const targetSid = 'MG0ed68159294735903b339e257a47e927';
    const targetResp = await fetch(`https://messaging.twilio.com/v1/Services/${targetSid}`, { headers });
    if (targetResp.ok) {
      const targetData = await targetResp.json();
      rapport.service_cible = {
        sid: targetData.sid,
        nom: targetData.friendly_name,
        whatsapp_enabled: targetData.whatsapp_enabled || false,
        inbound_request_url: targetData.inbound_request_url || 'NON CONFIGURÉ',
        inbound_method: targetData.inbound_method,
        use_inbound_webhook_on_number: targetData.use_inbound_webhook_on_number,
        status: targetData.status,
      };
    } else {
      rapport.service_cible_error = `HTTP ${targetResp.status}`;
    }

    // ── 3. Lister les numéros de téléphone Twilio ──
    const phoneResp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers.json?PageSize=50`, { headers });
    const phoneData = await phoneResp.json();
    rapport.incoming_phone_numbers = (phoneData?.incoming_phone_numbers || []).map((p: any) => ({
      sid: p.sid,
      phone_number: p.phone_number,
      friendly_name: p.friendly_name,
      sms_url: p.sms_url || 'NON CONFIGURÉ',
      voice_url: p.voice_url || 'NON CONFIGURÉ',
      status: p.status,
    }));

    // ── 4. Vérifier les WhatsApp Senders sur tous les services ──
    rapport.whatsapp_senders_par_service = [];
    for (const ms of rapport.messaging_services) {
      const wsResp = await fetch(`https://messaging.twilio.com/v1/Services/${ms.sid}/WhatsAppSenders`, { headers });
      if (wsResp.ok) {
        const wsData = await wsResp.json();
        const senders = (wsData?.data || []).map((s: any) => ({
          sid: s.sid,
          phone_number: s.phone_number,
          status: s.status,
          approved: s.approved,
        }));
        if (senders.length > 0) {
          rapport.whatsapp_senders_par_service.push({ service_sid: ms.sid, service_nom: ms.nom, senders });
        }
      }
    }

    // ── 5. Messages reçus récents ──
    const msgResp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json?PageSize=10`, { headers });
    const msgData = await msgResp.json();
    rapport.messages_recents = (msgData?.messages || []).slice(0, 10).map((m: any) => ({
      sid: m.sid,
      from: m.from,
      to: m.to,
      direction: m.direction,
      status: m.status,
      body: (m.body || '').substring(0, 80),
      date: m.date_created,
      error_code: m.error_code,
      error_message: m.error_message,
      messaging_service_sid: m.messaging_service_sid,
    }));

    // ── 6. Diagnostic ──
    rapport.diagnostic = {
      messages_recus_mais_non_traites: rapport.messages_recents?.filter((m: any) =>
        m.direction === 'inbound' && m.to === 'whatsapp:+22655483838'
      ).length || 0,
      webhook_url_configure: rapport.messaging_services?.some((s: any) =>
        s.inbound_request_url !== 'NON CONFIGURÉ' && s.inbound_request_url?.includes('webhookWhatsAppVenus')
      ) || false,
      whatsapp_active_sur_service: rapport.messaging_services?.some((s: any) => s.whatsapp_enabled) || false,
      numero_22655483838_enregistre: rapport.whatsapp_senders_par_service?.some((ss: any) =>
        ss.senders.some((s: any) => s.phone_number === '+22655483838')
      ) || false,
    };

    return Response.json(rapport);
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack?.substring(0, 500) }, { status: 500 });
  }
});