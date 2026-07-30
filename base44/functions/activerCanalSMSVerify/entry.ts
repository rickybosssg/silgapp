import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * Créer un service Twilio Verify dédié au login par SMS.
 *
 * Le service Verify existant ("SILGAPP WhatsApp OTP") a le canal SMS désactivé
 * (erreur 60223). L'API Twilio ne permet pas de réactiver le canal SMS sur un
 * service existant — il faut créer un NOUVEAU service. Par défaut, un nouveau
 * service Verify a SMS activé.
 *
 * Cette fonction:
 *   1. Crée un nouveau service "SILGAPP SMS Login"
 *   2. Teste un envoi SMS vers un numéro de test (numéro ValiDate Twilio)
 *   3. Retourne le SID du nouveau service
 *
 * L'admin doit ensuite mettre à jour le secret TWILIO_VERIFY_SMS_SERVICE_SID
 * avec le SID retourné, puis les fonctions loginOTPSMS / verifierOTPSMSLogin
 * l'utiliseront automatiquement.
 *
 * Admin only. Ne touche pas à VENUS ni au service WhatsApp OTP existant.
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

    // ── 1. Lister les services existants pour éviter les doublons ──
    const listResp = await fetch('https://verify.twilio.com/v2/Services?PageSize=50', { headers });
    const listData = await listResp.json();
    const existing = (listData.services || []).find(
      (s: any) => s.friendlyName === 'SILGAPP SMS Login'
    );

    let newSid: string;
    let created = false;

    if (existing) {
      newSid = existing.sid;
    } else {
      // ── 2. Créer le nouveau service SMS ──
      const createResp = await fetch('https://verify.twilio.com/v2/Services', {
        method: 'POST',
        headers,
        body: new URLSearchParams({
          FriendlyName: 'SILGAPP SMS Login',
          CodeLength: '6',
          LookupEnabled: 'true',
        }).toString(),
      });
      const createData = await createResp.json();

      if (!createResp.ok) {
        return Response.json(
          { error: 'Création service échouée', details: createData.message || createData },
          { status: 500 }
        );
      }
      newSid = createData.sid;
      created = true;
    }

    // ── 3. Tester l'envoi SMS vers un numéro test Twilio (sandbox) ──
    // Numéro de test Twilio +1 (501) 555-1234 ne déclenche pas de vrai SMS
    const testResp = await fetch(
      `https://verify.twilio.com/v2/Services/${newSid}/Verifications`,
      {
        method: 'POST',
        headers,
        body: new URLSearchParams({
          To: '+15015551234',
          Channel: 'sms',
        }).toString(),
      }
    );
    const testData = await testResp.json();

    const rapport: any = {
      success: true,
      new_service_sid: newSid,
      created,
      message: created
        ? 'Nouveau service SMS créé avec succès.'
        : 'Service SMS existant récupéré.',
      sms_test: {
        http_status: testResp.status,
        status: testData.status,
        sid: testData.sid,
        channel: testData.channel,
        error: testData.message || null,
        error_code: testData.code || null,
      },
      next_step: `Mettre à jour le secret TWILIO_VERIFY_SMS_SERVICE_SID avec: ${newSid}`,
    };

    return Response.json(rapport);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});