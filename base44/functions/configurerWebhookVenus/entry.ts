import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Configure le webhook URL sur un Messaging Service Twilio SPÉCIFIQUE.
 * Cible le service MG0ed68159294735903b339e257a47e927 qui reçoit les messages
 * WhatsApp envoyés à +22655483838.
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
    const headersJson = {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    };
    const headersForm = {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    const WEBHOOK_URL = 'https://www.base44.com/api/backend_functions/webhookWhatsAppVenus';
    const TARGET_MS_SID = 'MG0ed68159294735903b339e257a47e927';

    const rapport: any = {
      timestamp: new Date().toISOString(),
      target_ms_sid: TARGET_MS_SID,
      webhook_url: WEBHOOK_URL,
    };

    // ── 1. Vérifier si le Messaging Service existe ──
    const checkResp = await fetch(
      `https://messaging.twilio.com/v1/Services/${TARGET_MS_SID}`,
      { headers: headersForm }
    );

    if (checkResp.status === 404) {
      rapport.error = `Le Messaging Service ${TARGET_MS_SID} n'existe pas.`;
      // Lister tous les services pour trouver le bon
      const listResp = await fetch('https://messaging.twilio.com/v1/Services?PageSize=50', { headers: headersForm });
      const listData = await listResp.json();
      rapport.all_services = (listData?.data || []).map((s: any) => ({
        sid: s.sid,
        nom: s.friendly_name,
        whatsapp_enabled: s.whatsapp_enabled || false,
        inbound_request_url: s.inbound_request_url || 'NON CONFIGURÉ',
      }));

      // Si aucun service n'existe, en créer un avec le webhook
      if (!rapport.all_services || rapport.all_services.length === 0) {
        rapport.action = 'Création d un nouveau Messaging Service avec webhook';
        const createResp = await fetch('https://messaging.twilio.com/v1/Services', {
          method: 'POST',
          headers: headersForm,
          body: new URLSearchParams({
            friendly_name: 'SILGAPP WhatsApp VENUS',
            inbound_request_url: WEBHOOK_URL,
            inbound_method: 'POST',
          }).toString(),
        });
        const createData = await createResp.json();
        rapport.new_service = {
          sid: createData.sid,
          nom: createData.friendly_name,
          inbound_request_url: createData.inbound_request_url,
        };
        rapport.webhook_configured = createResp.ok;
      } else {
        // Configurer le webhook sur le premier service existant
        const firstService = rapport.all_services[0];
        rapport.action = `Configuration du webhook sur ${firstService.sid} (${firstService.nom})`;
        const updateResp = await fetch(
          `https://messaging.twilio.com/v1/Services/${firstService.sid}`,
          {
            method: 'POST',
            headers: headersForm,
            body: new URLSearchParams({
              inbound_request_url: WEBHOOK_URL,
              inbound_method: 'POST',
            }).toString(),
          }
        );
        const updateData = await updateResp.json();
        rapport.webhook_configured = updateResp.ok;
        rapport.updated_service = {
          sid: updateData.sid,
          inbound_request_url: updateData.inbound_request_url,
        };
      }
    } else if (checkResp.ok) {
      const msData = await checkResp.json();
      rapport.service_trouve = {
        sid: msData.sid,
        nom: msData.friendly_name,
        whatsapp_enabled: msData.whatsapp_enabled || false,
        inbound_request_url_avant: msData.inbound_request_url || 'NON CONFIGURÉ',
      };

      // ── 2. Configurer le webhook URL (form-urlencoded) ──
      const updateResp = await fetch(
        `https://messaging.twilio.com/v1/Services/${TARGET_MS_SID}`,
        {
          method: 'POST',
          headers: headersForm,
          body: new URLSearchParams({
            inbound_request_url: WEBHOOK_URL,
            inbound_method: 'POST',
          }).toString(),
        }
      );
      const updateData = await updateResp.json();
      rapport.webhook_configured = updateResp.ok;
      rapport.service_apres = {
        sid: updateData.sid,
        inbound_request_url: updateData.inbound_request_url,
        inbound_method: updateData.inbound_method,
      };
    } else {
      const errText = await checkResp.text();
      rapport.error = `Erreur ${checkResp.status}: ${errText.substring(0, 500)}`;
    }

    // ── 3. Lister TOUS les Messaging Services avec leur webhook ──
    const allResp = await fetch('https://messaging.twilio.com/v1/Services?PageSize=50', { headers: headersForm });
    const allData = await allResp.json();
    rapport.all_services_final = (allData?.data || []).map((s: any) => ({
      sid: s.sid,
      nom: s.friendly_name,
      whatsapp_enabled: s.whatsapp_enabled || false,
      inbound_request_url: s.inbound_request_url || 'NON CONFIGURÉ',
    }));

    rapport.conclusion = rapport.webhook_configured
      ? '✅ Webhook URL configuré avec succès. Les messages WhatsApp entrants devraient maintenant être transmis au webhook VENUS.'
      : '❌ Échec de la configuration du webhook. Vérifiez les erreurs ci-dessus.';

    return Response.json(rapport);
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack?.substring(0, 500) }, { status: 500 });
  }
});