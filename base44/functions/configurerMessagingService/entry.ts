import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Configure le Messaging Service Twilio pour +22655483838 :
 * 1. Liste tous les Messaging Services existants
 * 2. Choisit le premier (ou en crée un si aucun)
 * 3. Configure le webhook URL pour les messages entrants
 * 4. Tente d'activer WhatsApp sur le service
 * 5. Tente d'associer +22655483838 comme WhatsApp Sender
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
    const VENUS_NUMBER = '+22655483838';

    const rapport: any = {
      timestamp: new Date().toISOString(),
      webhook_url_cible: WEBHOOK_URL,
      numero_cible: VENUS_NUMBER,
    };

    // ── 1. Lister tous les Messaging Services ──
    const msResp = await fetch('https://messaging.twilio.com/v1/Services?PageSize=50', { headers });
    const msData = await msResp.json();
    let services = msData?.data || [];

    rapport.messaging_services_avant = services.map((s: any) => ({
      sid: s.sid,
      nom: s.friendly_name,
      whatsapp_enabled: s.whatsapp_enabled || false,
      inbound_request_url: s.inbound_request_url,
      inbound_method: s.inbound_method,
    }));

    // ── 2. Choisir ou créer un Messaging Service ──
    // Préférer un service qui a déjà WhatsApp enabled, sinon le premier, sinon en créer un
    let msTarget = services.find((s: any) => s.whatsapp_enabled === true);
    if (!msTarget) msTarget = services.find((s: any) => s.friendly_name?.toLowerCase().includes('silgapp'));
    if (!msTarget && services.length > 0) msTarget = services[0];

    if (!msTarget) {
      const createResp = await fetch('https://messaging.twilio.com/v1/Services', {
        method: 'POST',
        headers,
        body: new URLSearchParams({ FriendlyName: 'SILGAPP WhatsApp' }).toString(),
      });
      const createData = await createResp.json();
      if (createResp.ok && createData.sid) {
        msTarget = createData;
        rapport.messaging_service_cree = true;
      } else {
        return Response.json({ error: 'Impossible de créer un Messaging Service', details: createData });
      }
    }

    const msSid = msTarget.sid;
    rapport.messaging_service_utilise = {
      sid: msSid,
      nom: msTarget.friendly_name,
      whatsapp_enabled_avant: msTarget.whatsapp_enabled || false,
      inbound_url_avant: msTarget.inbound_request_url || 'NON CONFIGURÉ',
    };

    // ── 3. Configurer le webhook URL sur le Messaging Service ──
    const updateParams = new URLSearchParams();
    updateParams.append('InboundRequestUrl', WEBHOOK_URL);
    updateParams.append('InboundMethod', 'POST');
    // Fallback URL si le webhook principal échoue
    updateParams.append('FallbackToLongCode', 'false');
    // Activer WhatsApp si possible (paramètre non standard mais on essaie)
    // Note: whatsapp_enabled est en lecture seule via API dans la plupart des cas

    const updateResp = await fetch(`https://messaging.twilio.com/v1/Services/${msSid}`, {
      method: 'POST',
      headers,
      body: updateParams.toString(),
    });
    const updateData = await updateResp.json();

    rapport.webhook_configure = {
      succes: updateResp.ok,
      http_status: updateResp.status,
      inbound_request_url: updateData.inbound_request_url,
      inbound_method: updateData.inbound_method,
      whatsapp_enabled: updateData.whatsapp_enabled,
      erreur: updateResp.ok ? null : updateData,
    };

    // ── 4. Lister les WhatsApp Senders existants sur ce service ──
    const wsResp = await fetch(`https://messaging.twilio.com/v1/Services/${msSid}/WhatsAppSenders`, { headers });
    const wsData = wsResp.ok ? await wsResp.json() : null;
    const existingSenders = wsData?.data || [];

    rapport.whatsapp_senders_existants = {
      http_status: wsResp.status,
      count: existingSenders.length,
      senders: existingSenders.map((s: any) => ({
        sid: s.sid,
        numero: s.phone_number,
        statut: s.status,
        code_erreur: s.error_code,
        message_erreur: s.error_message,
      })),
    };

    // ── 5. Si +22655483838 n'est pas déjà un WhatsApp Sender, tenter de l'ajouter ──
    const venusSender = existingSenders.find((s: any) => {
      const num = (s.phone_number || '').replace(/\D/g, '');
      return num.endsWith('22655483838');
    });

    if (!venusSender && wsResp.ok) {
      // Tenter d'ajouter +22655483838 comme WhatsApp Sender
      const addResp = await fetch(`https://messaging.twilio.com/v1/Services/${msSid}/WhatsAppSenders`, {
        method: 'POST',
        headers,
        body: new URLSearchParams({ PhoneNumber: VENUS_NUMBER }).toString(),
      });
      const addData = await addResp.json();

      rapport.tentative_ajout_sender = {
        succes: addResp.ok,
        http_status: addResp.status,
        code_erreur: addData.code,
        message: addData.message,
        more_info: addData.more_info,
        reponse: addResp.ok ? {
          sid: addData.sid,
          statut: addData.status,
          numero: addData.phone_number,
        } : addData,
      };
    } else if (venusSender) {
      rapport.venus_sender_existant = {
        sid: venusSender.sid,
        numero: venusSender.phone_number,
        statut: venusSender.status,
        code_erreur: venusSender.error_code,
        message_erreur: venusSender.error_message,
      };
    } else {
      rapport.tentative_ajout_sender = {
        skipped: true,
        raison: `L'endpoint WhatsAppSenders a retourné HTTP ${wsResp.status} — impossible d'ajouter le sender via API`,
      };
    }

    // ── 6. Vérifier le statut final ──
    const finalResp = await fetch(`https://messaging.twilio.com/v1/Services/${msSid}`, { headers });
    const finalData = await finalResp.json();

    rapport.statut_final = {
      sid: finalData.sid,
      nom: finalData.friendly_name,
      whatsapp_enabled: finalData.whatsapp_enabled,
      inbound_request_url: finalData.inbound_request_url,
      inbound_method: finalData.inbound_method,
    };

    // ── 7. Étapes manuelles si nécessaire ──
    rapport.action_manuelle_requise = !finalData.whatsapp_enabled || !venusSender;
    rapport.etapes_manuelles = `
═══ CONFIGURATION TERMINÉE — ÉTAPES MANUELLES RESTANTES ═══

✅ Webhook URL configuré: ${WEBHOOK_URL}
   sur le Messaging Service "${finalData.friendly_name}" (${msSid})

${!finalData.whatsapp_enabled ? `⚠️ WhatsApp n'est PAS activé sur ce Messaging Service.
   → Twilio Console → Messaging → Services → "${finalData.friendly_name}"
   → Onglet "Integration" ou "WhatsApp" → Activer WhatsApp

` : ''}${!venusSender ? `⚠️ Le numéro ${VENUS_NUMBER} n'est PAS associé comme WhatsApp Sender.
   → Twilio Console → Messaging → Services → "${finalData.friendly_name}"
   → Onglet "Senders" → "Add WhatsApp sender"
   → Suivre l'Embedded Signup Meta (autoriser Twilio → sélectionner ${VENUS_NUMBER})

` : ''}═══ VÉRIFICATION APRÈS CONFIGURATION ═══

1. Envoyer "Bonjour" au ${VENUS_NUMBER} via WhatsApp
2. VENUS doit répondre automatiquement
3. Si pas de réponse → vérifier que le webhook URL est bien:
   ${WEBHOOK_URL}
   dans Twilio Console → Messaging → Services → Integration
`;

    return Response.json(rapport);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});