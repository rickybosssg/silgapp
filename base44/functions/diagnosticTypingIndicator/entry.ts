import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Teste l'API Typing Indicator de Twilio avec un vrai SID de message entrant.
 * Récupère le dernier message entrant, puis appelle l'API Indicators/Typing.
 * Retourne la réponse complète pour diagnostic.
 *
 * Admin only.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!accountSid || !authToken) {
      return Response.json({ error: 'Secrets Twilio manquants' }, { status: 500 });
    }

    const credentials = btoa(`${accountSid}:${authToken}`);
    const headers = {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // ── 1. Récupérer le dernier message ENTRANT (From contient whatsapp:+226) ──
    const msgResp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json?PageSize=50&Direction=inbound`,
      { headers }
    );
    const msgData = await msgResp.json();
    const inboundMessages = (msgData?.messages || []).filter(
      (m: any) => m.direction === 'inbound' && m.from?.startsWith('whatsapp:+226')
    );

    if (inboundMessages.length === 0) {
      return Response.json({
        error: 'Aucun message entrant trouvé',
        statut_api: msgResp.status,
      });
    }

    const lastInbound = inboundMessages[0];
    const inboundSid = lastInbound.sid;

    // ── 2. Appeler l'API Typing Indicator avec le vrai SID ──
    const typingResp = await fetch('https://messaging.twilio.com/v3/Indicators/Typing.json', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'WHATSAPP',
        messageId: inboundSid,
      }),
    });

    const typingText = await typingResp.text();

    // ── 3. Lister les Messaging Services et leur statut WhatsApp ──
    const msResp = await fetch('https://messaging.twilio.com/v1/Services?PageSize=50', { headers });
    const msData = await msResp.json();
    const services = (msData?.data || []).map((s: any) => ({
      sid: s.sid,
      nom: s.friendly_name,
      whatsapp_enabled: s.whatsapp_enabled || false,
      inbound_request_url: s.inbound_request_url,
    }));

    return Response.json({
      timestamp: new Date().toISOString(),
      message_entrant_teste: {
        sid: inboundSid,
        from: lastInbound.from,
        to: lastInbound.to,
        body: lastInbound.body?.substring(0, 80),
        date: lastInbound.date_created,
      },
      typing_indicator_api: {
        url: 'https://messaging.twilio.com/v3/Indicators/Typing.json',
        http_status: typingResp.status,
        http_status_text: typingResp.statusText,
        response_body: typingText.substring(0, 1000),
        success: typingResp.ok,
      },
      messaging_services: services,
      conclusion: typingResp.ok
        ? "✅ L'API Typing Indicator fonctionne — les indicateurs de saisie et de lecture devraient s'afficher."
        : "❌ L'API Typing Indicator échoue — le WhatsApp Sender n'est probablement pas approuvé pour cette fonctionnalité (Public Beta). Vérifiez que +22655483838 est enregistré comme WhatsApp Sender dans un Messaging Service avec WhatsApp activé.",
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack?.substring(0, 500) }, { status: 500 });
  }
});