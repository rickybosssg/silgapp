import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Test SMS Twilio — envoie un SMS réel et retourne le statut exact.
 * Réservé aux admins.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin uniquement' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const destinataire = body.telephone || '+22655738247';
    const messageTexte = body.message || 'SILGAPP Test SMS - Burkina Faso. Si vous recevez ce message, les SMS fonctionnent correctement.';

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromRaw    = Deno.env.get('TWILIO_WHATSAPP_FROM') || '';

    // Pour SMS, on retire le préfixe whatsapp: et on utilise le numéro brut
    const fromNumero = fromRaw.replace(/^whatsapp:/i, '').trim();

    if (!accountSid || !authToken || !fromNumero) {
      return Response.json({ error: 'Variables Twilio manquantes' }, { status: 500 });
    }

    const credentials = btoa(`${accountSid}:${authToken}`);
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const formData = new URLSearchParams();
    formData.append('From', fromNumero);
    formData.append('To', destinataire);
    formData.append('Body', messageTexte);

    console.log(`[TEST SMS] Envoi vers ${destinataire} depuis ${fromNumero}`);

    const resp = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data = await resp.json();

    console.log(`[TEST SMS] HTTP ${resp.status} — SID: ${data.sid || 'N/A'} — Statut: ${data.status || 'N/A'}`);
    if (data.error_code) {
      console.error(`[TEST SMS] Erreur Twilio: code=${data.error_code} message=${data.message}`);
    }

    // Attendre 3 secondes puis re-vérifier le statut réel du message
    await new Promise(r => setTimeout(r, 3000));

    let statutFinal = data.status;
    let statutFinalData = null;
    if (data.sid) {
      const checkResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${data.sid}.json`,
        { headers: { 'Authorization': `Basic ${credentials}` } }
      );
      statutFinalData = await checkResp.json();
      statutFinal = statutFinalData.status;
      console.log(`[TEST SMS] Statut après 3s: ${statutFinal}`);
    }

    return Response.json({
      ok: resp.ok,
      destinataire,
      from: fromNumero,
      message_envoye: messageTexte,
      sid: data.sid || null,
      statut_initial: data.status || null,
      statut_apres_3s: statutFinal || null,
      error_code: data.error_code || statutFinalData?.error_code || null,
      error_message: data.message || statutFinalData?.error_message || null,
      prix: statutFinalData?.price ? `${statutFinalData.price} ${statutFinalData.price_unit}` : null,
      date_envoi: data.date_created || null,
      http_status: resp.status,
    });

  } catch (error) {
    console.error('[TEST SMS] Erreur fatale:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});