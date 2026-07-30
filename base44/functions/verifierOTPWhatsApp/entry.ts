import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * VÉRIFIER OTP WHATSAPP — Twilio Verify (indépendant de VENUS)
 *
 * Vérifie le code OTP saisi par l'utilisateur via l'API Twilio Verify.
 * Utilise TWILIO_VERIFY_SERVICE_SID (préfixe VA) — JAMAIS le Messaging Service
 * SID (MG…) de VENUS.
 *
 * Body: { telephone (format international), code (4-10 chiffres) }
 *
 * Logs détaillés pour faciliter les tests.
 */
Deno.serve(async (req) => {
  const startedAt = Date.now();
  const log: any = { timestamp: new Date().toISOString(), step: 'verifierOTPWhatsApp' };

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { telephone, code } = body || {};

    log.input = { telephone, code: code ? '***' : null };

    if (!telephone || !code) {
      log.erreur = 'telephone et code requis';
      console.log('[OTP-VERIF]', JSON.stringify(log));
      return Response.json({ success: false, error: 'telephone et code requis' }, { status: 400 });
    }

    // ── Normalisation du numéro ──
    let num = String(telephone).replace(/\D/g, '');
    if (num.startsWith('00')) num = num.slice(2);
    if (num.length < 8) {
      log.erreur = 'Numéro invalide';
      console.log('[OTP-VERIF]', JSON.stringify(log));
      return Response.json({ success: false, error: 'Numéro invalide' }, { status: 400 });
    }

    // ── Validation du code ──
    const codeStr = String(code).replace(/\D/g, '');
    if (codeStr.length < 4 || codeStr.length > 10) {
      log.erreur = 'Code OTP invalide (longueur)';
      console.log('[OTP-VERIF]', JSON.stringify(log));
      return Response.json({ success: false, error: 'Code OTP invalide' }, { status: 400 });
    }

    log.numero_normalise = num;

    // ── Secrets ──
    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const VERIFY_SID = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    if (!TWILIO_SID || !TWILIO_TOKEN || !VERIFY_SID) {
      log.erreur = 'Secrets Twilio Verify manquants';
      console.log('[OTP-VERIF]', JSON.stringify(log));
      return Response.json({
        success: false,
        error: 'Configuration Twilio Verify manquante',
      }, { status: 500 });
    }

    // ── Appel Twilio Verify : vérifier le code ──
    const url = `https://verify.twilio.com/v2/Services/${VERIFY_SID}/VerificationCheck`;
    const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
    const formData = new URLSearchParams();
    formData.append('To', `+${num}`);
    formData.append('Code', codeStr);

    log.twilio_request = { url, to: `+${num}` };

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
      error_code: twilioData.code,
      error_message: twilioData.message,
    };

    if (twilioRes.ok && twilioData.status === 'approved') {
      log.resultat = 'succes';
      log.duree_ms = Date.now() - startedAt;
      console.log('[OTP-VERIF]', JSON.stringify(log));
      return Response.json({
        success: true,
        status: 'approved',
        verification_sid: twilioData.sid,
      });
    }

    // Vérification échouée (code erroné, expiré, etc.)
    log.resultat = 'code_invalide';
    log.duree_ms = Date.now() - startedAt;
    console.log('[OTP-VERIF]', JSON.stringify(log));

    const isPending = twilioData.status === 'pending';
    return Response.json({
      success: false,
      status: twilioData.status || 'unknown',
      error: isPending
        ? 'Code incorrect. Vérifiez le code reçu sur WhatsApp et réessayez.'
        : (twilioData.message || 'Code OTP invalide ou expiré'),
      error_code: twilioData.code,
      http_status: twilioRes.status,
    }, { status: 400 });

  } catch (error) {
    log.resultat = 'exception';
    log.erreur = error.message;
    log.duree_ms = Date.now() - startedAt;
    console.log('[OTP-VERIF]', JSON.stringify(log));
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});