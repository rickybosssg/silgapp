import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { normalizePhone, phoneVariants, withPlusPrefix } from '../../shared/phoneUtils.ts';

/**
 * LOGIN OTP SMS — Connexion par numéro de téléphone (Twilio Verify, canal SMS)
 *
 * Étape 1 : Valide que le numéro est associé à EXACTEMENT un compte SILGAPP,
 *           puis envoie un code OTP par SMS via Twilio Verify (channel=sms).
 *
 * Totalement indépendant de VENUS. Utilise TWILIO_VERIFY_SERVICE_SID (VA…).
 * N'utilise JAMAIS le canal WhatsApp ni les Messaging Services de VENUS.
 *
 * Body: { telephone, country_code? }
 *
 * Réponses:
 *   200 — OTP envoyé
 *   404 — Aucun compte associé (code: 'no_account')
 *   409 — Plusieurs comptes associés (code: 'duplicate_accounts')
 *   400 — Numéro invalide ou échec Twilio
 */
Deno.serve(async (req) => {
  const startedAt = Date.now();
  const log: any = { timestamp: new Date().toISOString(), step: 'loginOTPSMS' };

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { telephone, country_code } = body || {};

    log.input = { telephone, country_code };

    if (!telephone) {
      return Response.json({ success: false, error: 'Numéro de téléphone requis.' }, { status: 400 });
    }

    // ── Normalisation E.164 ──
    const normalized = normalizePhone(telephone, country_code);
    if (!normalized || normalized.length < 8) {
      log.erreur = 'Numéro invalide';
      console.log('[LOGIN-OTP-SMS]', JSON.stringify(log));
      return Response.json({ success: false, error: 'Numéro de téléphone invalide.' }, { status: 400 });
    }

    log.numero_normalise = normalized;
    const variants = phoneVariants(normalized);
    log.variants = variants;

    // ── Recherche du compte associé au numéro ──
    // Cherche dans toutes les entités métier qui ont telephone + user_email
    const userEmails = new Set<string>();

    const searchEntity = async (entityName: string) => {
      for (const v of variants) {
        try {
          const results = await base44.asServiceRole.entities[entityName].filter({ telephone: v });
          for (const r of (results || [])) {
            if (r.user_email) userEmails.add(r.user_email);
          }
        } catch (_) {}
      }
    };

    await searchEntity('ClientExterne');
    await searchEntity('Livreur');
    await searchEntity('Boutique');
    await searchEntity('Restaurant');
    await searchEntity('Pharmacie');

    log.user_emails_trouves = [...userEmails];

    // ── Règle 1 : Aucun compte ──
    if (userEmails.size === 0) {
      log.resultat = 'aucun_compte';
      log.duree_ms = Date.now() - startedAt;
      console.log('[LOGIN-OTP-SMS]', JSON.stringify(log));
      return Response.json({
        success: false,
        error: "Aucun compte SILGAPP n'est associé à ce numéro.",
        code: 'no_account',
      }, { status: 404 });
    }

    // ── Règle 2 : Doublons — ne pas connecter automatiquement ──
    if (userEmails.size > 1) {
      log.resultat = 'doublons';
      log.duree_ms = Date.now() - startedAt;
      console.log('[LOGIN-OTP-SMS]', JSON.stringify(log));
      return Response.json({
        success: false,
        error: "Plusieurs comptes sont associés à ce numéro. Contactez le support SILGAPP pour identifier et corriger les doublons avant de pouvoir vous connecter.",
        code: 'duplicate_accounts',
        duplicates_count: userEmails.size,
      }, { status: 409 });
    }

    // ── Exactement 1 compte → vérifier que le User existe ──
    const userEmail = [...userEmails][0];
    log.user_email = userEmail;

    let users: any[] = [];
    try {
      users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
    } catch (e) {
      log.erreur = 'Erreur recherche User: ' + e.message;
      console.log('[LOGIN-OTP-SMS]', JSON.stringify(log));
      return Response.json({ success: false, error: 'Erreur lors de la recherche du compte.' }, { status: 500 });
    }

    if (!users || users.length === 0) {
      log.resultat = 'user_introuvable';
      log.duree_ms = Date.now() - startedAt;
      console.log('[LOGIN-OTP-SMS]', JSON.stringify(log));
      return Response.json({
        success: false,
        error: "Aucun compte SILGAPP n'est associé à ce numéro.",
        code: 'no_account',
      }, { status: 404 });
    }

    // ── Envoyer OTP via Twilio Verify (canal SMS exclusivement) ──
    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    // Service Verify dédié SMS (canal SMS activé) — fallback sur le service WhatsApp si non configuré
    const VERIFY_SID = Deno.env.get('TWILIO_VERIFY_SMS_SERVICE_SID') || Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    if (!TWILIO_SID || !TWILIO_TOKEN || !VERIFY_SID) {
      log.erreur = 'Secrets Twilio Verify manquants';
      log.using_sms_service = !!Deno.env.get('TWILIO_VERIFY_SMS_SERVICE_SID');
      console.log('[LOGIN-OTP-SMS]', JSON.stringify(log));
      return Response.json({ success: false, error: 'Configuration Twilio Verify manquante.' }, { status: 500 });
    }
    log.verify_sid_used = VERIFY_SID;

    const url = `https://verify.twilio.com/v2/Services/${VERIFY_SID}/Verifications`;
    const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
    const formData = new URLSearchParams();
    formData.append('To', withPlusPrefix(normalized));
    formData.append('Channel', 'sms');

    log.twilio_request = { to: withPlusPrefix(normalized), channel: 'sms' };

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
      error_code: twilioData.code,
      error_message: twilioData.message,
    };

    if (twilioRes.ok) {
      log.resultat = 'otp_envoye';
      log.duree_ms = Date.now() - startedAt;
      console.log('[LOGIN-OTP-SMS]', JSON.stringify(log));
      return Response.json({
        success: true,
        verification_sid: twilioData.sid,
        telephone: normalized,
      });
    }

    log.resultat = 'echec_twilio';
    log.duree_ms = Date.now() - startedAt;
    console.log('[LOGIN-OTP-SMS]', JSON.stringify(log));
    return Response.json({
      success: false,
      error: twilioData.message || "Échec de l'envoi du code SMS. Réessayez.",
      error_code: twilioData.code,
    }, { status: 400 });

  } catch (error) {
    log.resultat = 'exception';
    log.erreur = error.message;
    log.duree_ms = Date.now() - startedAt;
    console.log('[LOGIN-OTP-SMS]', JSON.stringify(log));
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});