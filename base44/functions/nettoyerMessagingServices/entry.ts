import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Nettoie les Messaging Services Twilio en double.
 * Garde uniquement celui qui reçoit les messages WhatsApp (MG0ed68159294735903b339e257a47e927)
 * et supprime tous les autres "SILGAPP WhatsApp" en double.
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

    const KEEP_SID = 'MG0ed68159294735903b339e257a47e927';

    // ── 1. Lister tous les Messaging Services ──
    const msResp = await fetch('https://messaging.twilio.com/v1/Services?PageSize=100', { headers });
    const msData = await msResp.json();
    const allServices = msData?.data || [];

    const rapport: any = {
      timestamp: new Date().toISOString(),
      total_services: allServices.length,
      service_garde: KEEP_SID,
      services_supprimes: [],
      erreurs: [],
    };

    // ── 2. Supprimer tous les services sauf celui à garder ──
    for (const svc of allServices) {
      if (svc.sid === KEEP_SID) continue;

      // Vérifier s'il a des WhatsApp Senders avant suppression
      let hasSenders = false;
      try {
        const wsResp = await fetch(`https://messaging.twilio.com/v1/Services/${svc.sid}/WhatsAppSenders`, { headers });
        if (wsResp.ok) {
          const wsData = await wsResp.json();
          hasSenders = (wsData?.data || []).length > 0;
        }
      } catch {}

      if (hasSenders) {
        rapport.erreurs.push({
          sid: svc.sid,
          nom: svc.friendly_name,
          raison: 'A des WhatsApp Senders — suppression ignorée pour sécurité',
        });
        continue;
      }

      try {
        const delResp = await fetch(`https://messaging.twilio.com/v1/Services/${svc.sid}`, {
          method: 'DELETE',
          headers,
        });
        if (delResp.ok || delResp.status === 204) {
          rapport.services_supprimes.push({
            sid: svc.sid,
            nom: svc.friendly_name,
          });
        } else {
          const errText = await delResp.text().catch(() => '');
          rapport.erreurs.push({
            sid: svc.sid,
            nom: svc.friendly_name,
            raison: `HTTP ${delResp.status}: ${errText.substring(0, 200)}`,
          });
        }
      } catch (e) {
        rapport.erreurs.push({
          sid: svc.sid,
          nom: svc.friendly_name,
          raison: e.message,
        });
      }
    }

    // ── 3. Vérification finale ──
    const finalResp = await fetch('https://messaging.twilio.com/v1/Services?PageSize=100', { headers });
    const finalData = await finalResp.json();
    rapport.services_restant = (finalData?.data || []).map((s: any) => ({
      sid: s.sid,
      nom: s.friendly_name,
      whatsapp_enabled: s.whatsapp_enabled || false,
      inbound_request_url: s.inbound_request_url || 'NON CONFIGURÉ',
    }));

    return Response.json(rapport);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});