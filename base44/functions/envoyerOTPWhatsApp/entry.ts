import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * ENVOYER OTP WHATSAPP — Twilio Verify (indépendant de VENUS)
 *
 * Démarre une vérification Twilio Verify sur le canal WhatsApp.
 * Utilise TWILIO_VERIFY_SERVICE_SID (préfixe VA) — JAMAIS le Messaging Service
 * SID (MG…) de VENUS. Aucune interaction avec le backend VENUS.
 *
 * Body: { telephone (format international, ex: "22655483838" ou "+22655483838"), country_code? }
 *
 * Logs détaillés pour faciliter les tests.
 */
Deno.serve(async (req) => {
  const startedAt = Date.now();
  const log: any = { timestamp: new Date().toISOString(), step: 'envoyerOTPWhatsApp' };

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { telephone, country_code } = body || {};

    log.input = { telephone, country_code };

    if (!telephone) {
      log.erreur = 'telephone requis';
      console.log('[OTP-ENVOI]', JSON.stringify(log));
      return Response.json({ success: false, error: 'telephone requis' }, { status: 400 });
    }

    // ── Normalisation du numéro (format international, digits uniquement) ──
    let num = String(telephone).replace(/\D/g, '');
    if (num.startsWith('00')) num = num.slice(2);
    // Si le numéro ne commence pas par l'indicatif pays fourni, on le préfixe
    if (country_code) {
      const INDICATIFS: Record<string, string> = {
        BF: '226', CI: '225', TG: '228', BJ: '229', SN: '221',
        ML: '223', GN: '224', NE: '227', GH: '233',
      };
      const dial = INDICATIFS[country_code] || '';
      if (dial && !num.startsWith(dial)) {
        num = dial + num;
      }
    }
    if (num.length < 8) {
      log.erreur = 'Numéro invalide après normalisation';
      console.log('[OTP-ENVOI]', JSON.stringify(log));
      return Response.json({ success: false, error: 'Numéro de téléphone invalide' }, { status: 400 });
    }

    log.numero_normalise = num;

    // ── Secrets Twilio Verify ──
    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const VERIFY_SID = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    log.secrets = {
      TWILIO_ACCOUNT_SID: TWILIO_SID ? 'OK' : 'MANQUANT',
      TWILIO_AUTH_TOKEN: TWILIO_TOKEN ? 'OK' : 'MANQUANT',
      TWILIO_VERIFY_SERVICE_SID: VERIFY_SID ? 'OK' : 'MANQUANT',
    };

    if (!TWILIO_SID || !TWILIO_TOKEN || !VERIFY_SID) {
      log.erreur = 'Secrets Twilio Verify manquants';
      console.log('[OTP-ENVOI]', JSON.stringify(log));
      return Response.json({
        success: false,
        error: 'Configuration Twilio Verify manquante (TWILIO_VERIFY_SERVICE_SID requis)',
      }, { status: 500 });
    }

    // ── Appel Twilio Verify : démarrer la vérification WhatsApp ──
    const url = `https://verify.twilio.com/v2/Services/${VERIFY_SID}/Verifications`;
    const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
    const formData = new URLSearchParams();
    formData.append('To', `+${num}`);
    formData.append('Channel', 'whatsapp');

    log.twilio_request = { url, to: `+${num}`, channel: 'whatsapp' };

    const twilioRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const twilioData = await twilioRes.json();
    log.twilio_response = {
      http_status: twilioRes.status,
      sid: twilioData.sid,
      status: twilioData.status,
      valid: twilioData.valid,
      lookup: twilioData.lookup,
      error_code: twilioData.code,
      error_message: twilioData.message,
    };

    if (twilioRes.ok) {
      log.resultat = 'succes';
      log.duree_ms = Date.now() - startedAt;
      console.log('[OTP-ENVOI]', JSON.stringify(log));
      return Response.json({
        success: true,
        verification_sid: twilioData.sid,
        status: twilioData.status,
        to: `+${num}`,
      });
    }

    log.resultat = 'echec_twilio';
    log.duree_ms = Date.now() - startedAt;
    console.log('[OTP-ENVOI]', JSON.stringify(log));
    return Response.json({
      success: false,
      error: twilioData.message || 'Erreur Twilio Verify',
      error_code: twilioData.code,
      http_status: twilioRes.status,
    }, { status: 502 });

  } catch (error) {
    log.resultat = 'exception';
    log.erreur = error.message;
    log.duree_ms = Date.now() - startedAt;
    console.log('[OTP-ENVOI]', JSON.stringify(log));
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});