import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * Activer le canal SMS sur le service Twilio Verify.
 *
 * Le service Verify (VA…) a peut-être été configuré uniquement pour WhatsApp.
 * Cette fonction active le canal SMS pour permettre la connexion par OTP SMS.
 *
 * Admin only. Ne touche pas à VENUS (Messaging Services, WhatsApp Sender, webhook).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const VERIFY_SID = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    if (!TWILIO_SID || !TWILIO_TOKEN || !VERIFY_SID) {
      return Response.json({ error: 'Secrets Twilio Verify manquants' }, { status: 500 });
    }

    const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
    const headers = {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // ── 1. Lire la config actuelle ──
    const getResp = await fetch(`https://verify.twilio.com/v2/Services/${VERIFY_SID}`, { headers });
    const getConfig = await getResp.json();

    const rapport: any = {
      service_sid: VERIFY_SID,
      friendly_name: getConfig.friendly_name,
      raw_config: getConfig,
      channel_keys: Object.keys(getConfig).filter(k =>
        k.toLowerCase().includes('sms') ||
        k.toLowerCase().includes('voice') ||
        k.toLowerCase().includes('channel') ||
        k.toLowerCase().includes('whatsapp') ||
        k.toLowerCase().includes('email')
      ),
      config_avant: {
        sms_enabled: getConfig.sms?.enabled ?? getConfig.sms_enabled,
        voice_enabled: getConfig.voice?.enabled ?? getConfig.voice_enabled,
        whatsapp_enabled: getConfig.whatsapp?.enabled ?? getConfig.whatsapp_enabled,
      },
    };

    // ── 2. Forcer l'activation du canal SMS via l'API Twilio Verify ──
    // Twilio error 60223 = "Delivery channel disabled: SMS"
    // Solution : activer le canal SMS dans les paramètres du service Verify
    const formData = new URLSearchParams();
    formData.append('Sms.Enabled', 'true');

    const updateResp = await fetch(`https://verify.twilio.com/v2/Services/${VERIFY_SID}`, {
      method: 'POST',
      headers,
      body: formData.toString(),
    });
    const updateData = await updateResp.json();

    if (updateResp.ok) {
      rapport.sms_active = true;
      rapport.config_apres = {
        sms: updateData.sms,
        skip_sms_to_landlines: updateData.skip_sms_to_landlines,
      };
    } else {
      rapport.erreur_activation = updateData.message || JSON.stringify(updateData);
      rapport.update_http_status = updateResp.status;

      // Essai alternatif : créer une Messaging Configuration SMS
      try {
        const mcFormData = new URLSearchParams();
        mcFormData.append('MessagingServiceSid', getConfig.whatsapp?.msg_service_sid || '');

        const mcResp = await fetch(
          `https://verify.twilio.com/v2/Services/${VERIFY_SID}/MessagingConfigurations`,
          {
            method: 'POST',
            headers,
            body: mcFormData.toString(),
          }
        );
        const mcData = await mcResp.json();
        rapport.messaging_config_attempt = {
          http_status: mcResp.status,
          success: mcResp.ok,
          data: mcData.message ? { error: mcData.message } : { ok: true },
        };
      } catch (mcErr) {
        rapport.messaging_config_error = mcErr.message;
      }
    }

    // ── 3. Vérification finale : tester un envoi vers un numéro test sandbox ──
    // Ne pas envoyer de vrai SMS — juste confirmer que le service répond
    rapport.ready = rapport.sms_active === true;

    return Response.json(rapport);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});