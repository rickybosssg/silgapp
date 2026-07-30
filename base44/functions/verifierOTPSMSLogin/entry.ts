import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { normalizePhone, phoneVariants, withPlusPrefix } from '../../shared/phoneUtils.ts';

/**
 * VERIFIER OTP SMS LOGIN — Étape 2 de la connexion par téléphone
 *
 * Vérifie le code OTP auprès de Twilio Verify, puis :
 *   1. Retrouve le compte SILGAPP associé au numéro (exactement 1)
 *   2. Génère un token de session via base44.asServiceRole.sso.getAccessToken(userId)
 *   3. Retourne le access_token pour que le frontend sauvegarde la session
 *
 * Totalement indépendant de VENUS. Canal SMS uniquement.
 *
 * Body: { telephone, code, country_code? }
 *
 * Réponses:
 *   200 — { success: true, access_token, user_email }
 *   400 — Code invalide/expiré OU compte non unique
 *   404 — Compte utilisateur introuvable
 *   500 — Échec génération token
 */
Deno.serve(async (req) => {
  const startedAt = Date.now();
  const log: any = { timestamp: new Date().toISOString(), step: 'verifierOTPSMSLogin' };

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { telephone, code, country_code } = body || {};

    log.input = { telephone, code: code ? '***' : null, country_code };

    if (!telephone || !code) {
      return Response.json({ success: false, error: 'Numéro et code requis.' }, { status: 400 });
    }

    // ── Normalisation ──
    const normalized = normalizePhone(telephone, country_code);
    if (!normalized || normalized.length < 8) {
      return Response.json({ success: false, error: 'Numéro invalide.' }, { status: 400 });
    }

    // ── Validation du code ──
    const codeStr = String(code).replace(/\D/g, '');
    if (codeStr.length < 4 || codeStr.length > 10) {
      return Response.json({ success: false, error: 'Code OTP invalide.' }, { status: 400 });
    }

    log.numero_normalise = normalized;

    // ── Secrets ──
    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    // Service Verify dédié SMS (canal SMS activé) — fallback sur le service WhatsApp si non configuré
    const VERIFY_SID = Deno.env.get('TWILIO_VERIFY_SMS_SERVICE_SID') || Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    if (!TWILIO_SID || !TWILIO_TOKEN || !VERIFY_SID) {
      return Response.json({ success: false, error: 'Configuration Twilio Verify manquante.' }, { status: 500 });
    }

    // ── Vérifier le code OTP auprès de Twilio Verify ──
    const url = `https://verify.twilio.com/v2/Services/${VERIFY_SID}/VerificationCheck`;
    const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
    const formData = new URLSearchParams();
    formData.append('To', withPlusPrefix(normalized));
    formData.append('Code', codeStr);

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
      status: twilioData.status,
      valid: twilioData.valid,
      error_code: twilioData.code,
      error_message: twilioData.message,
    };

    if (!twilioRes.ok || twilioData.status !== 'approved') {
      log.resultat = 'code_invalide';
      const isPending = twilioData.status === 'pending';
      console.log('[LOGIN-OTP-SMS]', JSON.stringify(log));
      return Response.json({
        success: false,
        status: twilioData.status || 'unknown',
        error: isPending
          ? 'Code incorrect. Vérifiez le code reçu par SMS et réessayez.'
          : (twilioData.message || 'Code OTP invalide ou expiré.'),
      }, { status: 400 });
    }

    // ── Code valide → retrouver le user par le numéro ──
    const variants = phoneVariants(normalized);
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

    if (userEmails.size !== 1) {
      log.resultat = 'compte_non_unique';
      console.log('[LOGIN-OTP-SMS]', JSON.stringify(log));
      return Response.json({
        success: false,
        error: userEmails.size === 0
          ? "Aucun compte SILGAPP n'est associé à ce numéro."
          : "Plusieurs comptes sont associés à ce numéro. Contactez le support SILGAPP.",
        code: userEmails.size === 0 ? 'no_account' : 'duplicate_accounts',
      }, { status: 400 });
    }

    const userEmail = [...userEmails][0];
    log.user_email = userEmail;

    // ── Retrouver le User par email ──
    const users: any[] = await base44.asServiceRole.entities.User.filter({ email: userEmail });
    if (!users || users.length === 0) {
      log.resultat = 'user_introuvable';
      console.log('[LOGIN-OTP-SMS]', JSON.stringify(log));
      return Response.json({
        success: false,
        error: 'Compte utilisateur introuvable. Contactez le support SILGAPP.',
      }, { status: 404 });
    }

    const user = users[0];
    log.user_id = user.id;

    // ── Générer un token de session via SSO ──
    let accessToken: string | null = null;
    try {
      const ssoResult: any = await base44.asServiceRole.sso.getAccessToken(user.id);
      accessToken = ssoResult?.access_token || null;
    } catch (e) {
      log.erreur = 'SSO token generation failed: ' + e.message;
      console.log('[LOGIN-OTP-SMS]', JSON.stringify(log));
      return Response.json({
        success: false,
        error: 'Impossible de générer la session. Réessayez ou connectez-vous par email.',
      }, { status: 500 });
    }

    if (!accessToken) {
      log.erreur = 'SSO token vide';
      console.log('[LOGIN-OTP-SMS]', JSON.stringify(log));
      return Response.json({
        success: false,
        error: 'Session non générée. Réessayez.',
      }, { status: 500 });
    }

    log.resultat = 'connexion_reussie';
    log.duree_ms = Date.now() - startedAt;
    console.log('[LOGIN-OTP-SMS]', JSON.stringify(log));

    return Response.json({
      success: true,
      access_token: accessToken,
      user_email: userEmail,
    });

  } catch (error) {
    log.resultat = 'exception';
    log.erreur = error.message;
    log.duree_ms = Date.now() - startedAt;
    console.log('[LOGIN-OTP-SMS]', JSON.stringify(log));
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});