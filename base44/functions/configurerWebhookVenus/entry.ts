import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Configure le webhook URL sur le Messaging Service Twilio qui reçoit
 * ACTUELLEMENT les messages WhatsApp pour +22655483838.
 *
 * Détecte dynamiquement quel Messaging Service reçoit les messages en
 * consultant les derniers messages inbound, puis configure le webhook dessus.
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

    const WEBHOOK_URL = 'https://silga-dispatch-go.base44.app/functions/webhookWhatsAppVenus';
    const VENUS_NUMBER = 'whatsapp:+22655483838';

    const rapport: any = {
      timestamp: new Date().toISOString(),
      webhook_url: WEBHOOK_URL,
    };

    // ── 1. Trouver quel Messaging Service reçoit les messages ──
    const msgResp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json?PageSize=20`,
      { headers }
    );
    const msgData = await msgResp.json();
    const inboundMessages = (msgData?.messages || []).filter(
      (m: any) => m.direction === 'inbound' && m.to === VENUS_NUMBER
    );

    rapport.messages_inbound_recents = inboundMessages.slice(0, 5).map((m: any) => ({
      sid: m.sid,
      from: m.from,
      body: (m.body || '').substring(0, 50),
      date: m.date_created,
      messaging_service_sid: m.messaging_service_sid,
    }));

    // Le Messaging Service qui reçoit les messages maintenant
    const activeMsSid = inboundMessages[0]?.messaging_service_sid;
    if (!activeMsSid) {
      rapport.error = 'Aucun message inbound trouvé pour +22655483838 — impossible de déterminer le Messaging Service actif';
      return Response.json(rapport);
    }

    rapport.active_ms_sid = activeMsSid;

    // ── 2. Vérifier l'état actuel du service ──
    const beforeResp = await fetch(`https://messaging.twilio.com/v1/Services/${activeMsSid}`, { headers });
    const beforeData = await beforeResp.json();
    rapport.avant = {
      sid: beforeData.sid,
      nom: beforeData.friendly_name,
      inbound_request_url: beforeData.inbound_request_url || 'NON CONFIGURÉ',
      whatsapp_enabled: beforeData.whatsapp_enabled || false,
    };

    // ── 3. Configurer le webhook URL ──
    const updateResp = await fetch(`https://messaging.twilio.com/v1/Services/${activeMsSid}`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        InboundRequestUrl: WEBHOOK_URL,
        InboundMethod: 'POST',
      }).toString(),
    });
    const updateData = await updateResp.json();

    // ── 4. Vérifier après ──
    const afterResp = await fetch(`https://messaging.twilio.com/v1/Services/${activeMsSid}`, { headers });
    const afterData = await afterResp.json();
    rapport.apres = {
      sid: afterData.sid,
      nom: afterData.friendly_name,
      inbound_request_url: afterData.inbound_request_url || 'NON CONFIGURÉ',
      inbound_method: afterData.inbound_method,
      whatsapp_enabled: afterData.whatsapp_enabled || false,
    };

    rapport.webhook_configure = afterData.inbound_request_url === WEBHOOK_URL;
    rapport.update_http_status = updateResp.status;

    rapport.conclusion = rapport.webhook_configure
      ? '✅ Webhook URL configuré avec succès sur le service actif. VENUS devrait maintenant recevoir les messages.'
      : `⚠️ L'API Twilio a retourné HTTP ${updateResp.status} mais l'URL n'est pas sauvegardée. Configuration manuelle requise dans Twilio Console.`;

    return Response.json(rapport);
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack?.substring(0, 500) }, { status: 500 });
  }
});