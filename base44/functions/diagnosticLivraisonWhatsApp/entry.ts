import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Diagnostic ciblé : vérifie le statut de livraison des messages
 * envoyés DEPUIS +22655483838 vers de vrais numéros WhatsApp.
 *
 * Erreur 63016 = "Outside messaging window" — les réponses aux numéros
 * qui n'ont pas envoyé de vrai WhatsApp échouent. Mais les réponses
 * aux vrais utilisateurs (24h window) devraient réussir.
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
    const headers = { Authorization: `Basic ${auth}` };

    // ── 1. Lister TOUS les messages récents (50 derniers) sans filtre From ──
    const allMsgUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json?PageSize=50`;
    const allResp = await fetch(allMsgUrl, { headers });
    const allData = await allResp.json();

    // ── 2. Séparer messages reçus (inbound) et envoyés (outbound depuis +22655483838) ──
    const allMessages = allData?.messages || [];
    const outbound = allMessages.filter((m: any) =>
      m.from === 'whatsapp:+22655483838' || m.from === 'whatsapp:+22655738247'
    );
    const inbound = allMessages.filter((m: any) =>
      m.to === 'whatsapp:+22655483838' && m.direction === 'inbound'
    );

    // ── 3. Pour chaque message outbound, vérifier le statut détaillé ──
    const outboundDetails = await Promise.all(outbound.slice(0, 20).map(async (m: any) => {
      // Fetch full message details (includes error_code, error_message)
      const detailUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages/${m.sid}.json`;
      const detailResp = await fetch(detailUrl, { headers });
      const detail = await detailResp.json();
      return {
        sid: detail.sid,
        from: detail.from,
        to: detail.to,
        status: detail.status,
        error_code: detail.error_code,
        error_message: detail.error_message,
        direction: detail.direction,
        date_created: detail.date_created,
        date_sent: detail.date_sent,
        date_updated: detail.date_updated,
        body: (detail.body || '').substring(0, 80),
        price: detail.price,
        price_unit: detail.price_unit,
      };
    }));

    // ── 4. Vérifier si le WABA a des templates approuvés (pour contourner 63016) ──
    let templates: any[] = [];
    try {
      const tmplResp = await fetch(
        `https://content.twilio.com/v1/Content?PageSize=20`,
        { headers }
      );
      const tmplData = await tmplResp.json();
      templates = (tmplData?.contents || []).map((t: any) => ({
        sid: t.sid,
        name: t.name,
        language: t.language,
        types: Object.keys(t.types || {}),
      }));
    } catch (e) {
      templates = [{ error: e.message }];
    }

    // ── 5. Vérifier le statut WhatsApp du compte via WhatsAppSenders API ──
    let whatsappSendersInfo: any = null;
    try {
      // Essayer l'endpoint au niveau du compte (sans Messaging Service)
      const wsResp = await fetch(
        `https://messaging.twilio.com/v1/Services?PageSize=50`,
        { headers }
      );
      const wsData = await wsResp.json();
      const services = wsData?.data || [];

      // Pour chaque service, vérifier les WhatsApp Senders
      const servicesWithWA = await Promise.all(services.slice(0, 10).map(async (s: any) => {
        try {
          const sendersResp = await fetch(
            `https://messaging.twilio.com/v1/Services/${s.sid}/WhatsAppSenders`,
            { headers }
          );
          if (sendersResp.ok) {
            const sendersData = await sendersResp.json();
            return {
              sid: s.sid,
              nom: s.friendly_name,
              whatsapp_enabled: s.whatsapp_enabled,
              senders: (sendersData?.data || []).map((ws: any) => ({
                sid: ws.sid,
                numero: ws.phone_number,
                statut: ws.status,
                code_erreur: ws.error_code,
                message_erreur: ws.error_message,
              })),
            };
          }
          return {
            sid: s.sid,
            nom: s.friendly_name,
            whatsapp_enabled: s.whatsapp_enabled,
            senders_error: `HTTP ${sendersResp.status}`,
          };
        } catch (e) {
          return { sid: s.sid, nom: s.friendly_name, error: e.message };
        }
      }));

      whatsappSendersInfo = {
        total_services: services.length,
        services: servicesWithWA,
      };
    } catch (e) {
      whatsappSendersInfo = { error: e.message };
    }

    // ── 6. Résumé ──
    const reussis = outboundDetails.filter(m => m.status === 'delivered' || m.status === 'sent');
    const echoues = outboundDetails.filter(m => m.status === 'failed' || m.status === 'undelivered');
    const enAttente = outboundDetails.filter(m => m.status === 'queued' || m.status === 'sending');

    return Response.json({
      timestamp: new Date().toISOString(),
      resume: {
        total_outbound: outboundDetails.length,
        reussis: reussis.length,
        echoues: echoues.length,
        en_attente: enAttente.length,
        erreurs_uniques: [...new Set(echoues.map(m => m.error_code))],
      },
      messages_outbound: outboundDetails,
      messages_inbound_recents: inbound.slice(0, 5).map((m: any) => ({
        from: m.from,
        to: m.to,
        body: (m.body || '').substring(0, 60),
        date: m.date_created,
      })),
      whatsapp_senders_info: whatsappSendersInfo,
      content_templates: templates,
      diagnostic: echoues.length > 0 && reussis.length === 0
        ? 'TOUS_LES_MESSAGES_ECHOuent'
        : reussis.length > 0
          ? 'CERTAINS_MESSAGES_REUSSIS'
          : 'AUCUN_MESSAGE_A_ANALYSER',
      explication_erreur_63016: {
        code: 63016,
        titre: 'Outside messaging window',
        description: 'WhatsApp n\'autorise l\'envoi de messages freeform (texte libre) que dans les 24h suivant un message entrant du client. Au-delà, il faut utiliser un Message Template pré-approuvé.',
        consequence: 'Les réponses aux numéros de TEST (qui n\'ont jamais envoyé de vrai WhatsApp à +22655483838) échouent systématiquement avec 63016. Mais les réponses aux VRAIS clients (qui ont initié la conversation) devraient réussir.',
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});