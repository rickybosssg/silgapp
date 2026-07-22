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

    // ── 2b. AUTO-FIX : Si aucun Messaging Service n'existe, en créer un ──
    rapport.auto_fix_messaging_service = null;
    if (messagingServices.length === 0) {
      try {
        const createMsResp = await fetch('https://messaging.twilio.com/v1/Services', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            FriendlyName: 'SILGAPP WhatsApp',
          }).toString(),
        });
        const createMsData = await createMsResp.json();
        if (createMsResp.ok && createMsData.sid) {
          messagingServices = [createMsData];
          rapport.messaging_services = [{
            sid: createMsData.sid,
            nom: createMsData.friendly_name,
            in_use: createMsData.in_use,
            whatsapp_enabled: false,
            url: createMsData.url,
          }];
          rapport.auto_fix_messaging_service = {
            succes: true,
            sid: createMsData.sid,
            message: 'Messaging Service créé automatiquement pour permettre le diagnostic du WhatsApp Sender.',
          };
        } else {
          rapport.auto_fix_messaging_service = {
            succes: false,
            http_status: createMsResp.status,
            erreur: createMsData,
          };
        }
      } catch (e) {
        rapport.auto_fix_messaging_service = { succes: false, erreur: e.message };
      }
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

    // ── 7b. SONDE : Tenter l'ajout d'un WhatsApp Sender via API pour capturer l'erreur exacte ──
    // L'API Twilio WhatsApp Senders nécessite un code OAuth (embedded signup).
    // En appelant sans code, on récupère l'erreur exacte qui révèle l'état du binding Meta→Twilio.
    rapport.sonde_whatsapp_sender = null;
    if (messagingServices.length > 0) {
      const msSid = messagingServices[0].sid;
      try {
        const probeResp = await fetch(`https://messaging.twilio.com/v1/Services/${msSid}/WhatsAppSenders`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            // Tenter avec le numéro directement — Twilio va rejeter et nous dire pourquoi
            VerifySid: 'pending',
          }).toString(),
        });
        const probeData = await probeResp.json();
        rapport.sonde_whatsapp_sender = {
          http_status: probeResp.status,
          code_erreur: probeData.code,
          message: probeData.message,
          message_detail: probeData.more_info || probeData.detail || null,
          champs_requis: probeData.fields || null,
          reponse_complete: probeData,
        };
      } catch (e) {
        rapport.sonde_whatsapp_sender = { erreur_reseau: e.message };
      }

      // ── 7c. SONDE 2 : Lister les Content Templates (révèle si un WABA est connecté) ──
      try {
        const contentResp = await fetch(
          `https://content.twilio.com/v1/Content?PageSize=5`,
          { headers }
        );
        const contentData = await contentResp.json();
        rapport.content_templates = {
          http_status: contentResp.status,
          count: contentData?.contents?.length || 0,
          waba_connecte: contentResp.ok && (contentData?.contents?.length || 0) > 0,
        };
      } catch (e) {
        rapport.content_templates = { erreur: e.message };
      }
    }

    // ── 8. Diagnostic global et recommandation ──
    let diagnostic = '';
    let codeErreur = null;
    let correction = '';

    if (allWhatsAppSenders.length === 0 && messagingServices.length === 0) {
      diagnostic = 'AUCUN_MESSAGING_SERVICE';
      correction = 'Aucun Messaging Service Twilio trouvé. (Auto-fix tenté — voir auto_fix_messaging_service.)';
    } else if (allWhatsAppSenders.length === 0) {
      // ── Cas spécifique : Meta indique "contactez Twilio" mais aucun Sender n'apparaît ──
      // Cela signifie que l'Embedded Signup Meta→Twilio est incomplet ou initié du mauvais côté.
      diagnostic = 'EMBEDDED_SIGNUP_INCOMPLET';
      codeErreur = rapport.sonde_whatsapp_sender?.code_erreur || null;
      const sondeMsg = rapport.sonde_whatsapp_sender?.message || '';
      const sondeDetail = rapport.sonde_whatsapp_sender?.message_detail || '';

      if (sondeMsg.includes('code') || sondeMsg.includes('Code')) {
        correction = `BLOCAGE PRÉCIS : L'API Twilio exige un "code" OAuth (Embedded Signup) pour ajouter un WhatsApp Sender.
Meta indique "contactez Twilio" car le flux d'association est INCOMPLET — le numéro a été créé côté Meta mais Twilio n'a pas reçu l'autorisation OAuth pour le réclamer.

ACTION MANUELLE REQUISE (impossible via API) :
1. Dans Twilio Console → Messaging → Services → "SILGAPP WhatsApp" (Messaging Service SID: ${messagingServices[0]?.sid})
2. Onglet "WhatsApp senders" → "Add WhatsApp sender"
3. Twilio ouvre une fenêtre OAuth Meta — connectez le compte Meta Business "Silgapp"
4. Autorisez Twilio à accéder au WABA et sélectionnez +226 55 48 38 38
5. Le statut passe à "approved" en quelques secondes

⚠️ NE PAS initier l'association depuis Meta Business Manager — elle doit partir de Twilio.
Si vous avez déjà tenté depuis Meta, supprimez l'association dans Meta → WhatsApp Manager → Numéros, puis recommencez depuis Twilio Console.`;
      } else {
        correction = `BLOCAGE : ${sondeMsg}. Détail: ${sondeDetail}. Messaging Service SID: ${messagingServices[0]?.sid}. Réponse complète de la sonde dans sonde_whatsapp_sender.reponse_complete.`;
      }
    } else if (!venusSender) {
      diagnostic = 'NUMERO_NON_AJOUTE';
      correction = `WhatsApp Senders existants: ${allWhatsAppSenders.map(s => s.phone_number).join(', ')}. Le +226 55 48 38 38 n'est pas parmi eux.`;
    } else if (venusSender.status !== 'approved' && venusSender.status !== 'connected') {
      diagnostic = 'PROVISIONING_ECHOUE';
      codeErreur = venusSender.error_code;
      correction = `Le numéro est ajouté mais son statut est "${venusSender.status}". Erreur: ${venusSender.error_message || 'N/A'} (code ${venusSender.error_code || 'N/A'}).`;
    } else {
      diagnostic = 'NUMERO_APPROUVE';
      correction = `Le numéro +226 55 48 38 38 est approuvé (statut: ${venusSender.status}). Configurer TWILIO_WHATSAPP_VENUS_FROM = whatsapp:${VENUS_NUMBER}.`;
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