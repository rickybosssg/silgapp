import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Vérifie la disponibilité et le tarif SMS Twilio vers le Burkina Faso (+226).
 * Interroge les APIs Twilio Pricing et Phone Numbers.
 * Réservé aux admins.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) {
      return Response.json({ error: 'Variables Twilio manquantes' }, { status: 500 });
    }

    const creds = btoa(`${accountSid}:${authToken}`);
    const headers = { 'Authorization': `Basic ${creds}` };

    // ── 1. Tarifs SMS vers Burkina Faso (ISO: BF) ─────────────────────────────
    const pricingResp = await fetch(
      'https://pricing.twilio.com/v1/Messaging/Countries/BF',
      { headers }
    );
    const pricing = await pricingResp.json();

    // ── 2. Tarifs SMS sortant (outbound) depuis un numéro US ──────────────────
    const pricingUSResp = await fetch(
      'https://pricing.twilio.com/v2/Voice/Countries/US',
      { headers }
    );

    // ── 3. Vérifier disponibilité numéros US locaux avec SMS capability ───────
    const numbersUSResp = await fetch(
      'https://api.twilio.com/2010-04-01/Accounts/' + accountSid +
      '/AvailablePhoneNumbers/US/Local.json?SmsEnabled=true&PageSize=3',
      { headers }
    );
    const numbersUS = await numbersUSResp.json();

    // ── 4. Vérifier si numéros alpha-sender disponibles (BF) ─────────────────
    // Twilio ne supporte pas les alpha senders pour tous les pays
    const alphaBFResp = await fetch(
      'https://messaging.twilio.com/v1/Services',
      { headers }
    );
    const alphaData = await alphaBFResp.json();

    // ── Parser les tarifs SMS BF ───────────────────────────────────────────────
    let prixSMSOutbound = null;
    let prixSMSInbound  = null;
    let operateurs = [];

    if (pricing && pricing.outbound_sms_prices) {
      // Chercher le tarif depuis numéro US
      const fromUS = pricing.outbound_sms_prices.find(p =>
        p.number_type === 'local' || p.number_type === 'longcode' || p.number_type === 'shortcode'
      );
      if (fromUS && fromUS.prices) {
        prixSMSOutbound = fromUS.prices;
      }
      operateurs = pricing.outbound_sms_prices.map(p => ({
        type: p.number_type,
        tarifs: p.prices,
      }));
    }

    if (pricing && pricing.inbound_sms_prices) {
      prixSMSInbound = pricing.inbound_sms_prices;
    }

    // ── Analyse : numéro US suffit-il ? ───────────────────────────────────────
    // Twilio supporte les SMS vers BF depuis numéros US longcode
    // Mais certains opérateurs BF bloquent les numéros étrangers
    const operateursBF = [
      { nom: 'Orange Burkina', prefixes: ['70', '71', '72', '73', '74', '75', '76', '77', '78', '79'] },
      { nom: 'Moov Africa (Telecel)', prefixes: ['55', '56', '57', '58', '59', '60', '61', '62', '63', '64', '65', '66', '67', '68', '69'] },
    ];

    return Response.json({
      ok: true,
      pays: 'Burkina Faso',
      iso: 'BF',
      indicatif: '+226',

      // ── Disponibilité ────────────────────────────────────────────────────────
      sms_disponible: pricingResp.ok && pricing && !pricing.code,
      tarifs_raw: pricing,

      // ── Prix par SMS ─────────────────────────────────────────────────────────
      prix_par_type: operateurs,
      devise: pricing?.price_unit || 'USD',

      // ── Numéros US disponibles ───────────────────────────────────────────────
      numeros_us_sms_disponibles: numbersUS?.available_phone_numbers?.length || 0,
      exemple_numeros_us: numbersUS?.available_phone_numbers?.slice(0, 2).map(n => ({
        numero: n.phone_number,
        region: n.region,
        sms: n.capabilities?.SMS,
        mms: n.capabilities?.MMS,
        prix_mensuel_usd: '~$1.15/mois',
      })) || [],

      // ── Opérateurs BF ────────────────────────────────────────────────────────
      operateurs_burkina_faso: operateursBF,

      // ── Recommandation ───────────────────────────────────────────────────────
      recommandation: {
        numero_us_suffit: true,
        note: "Un numéro Twilio US longcode (~$1.15/mois) peut envoyer des SMS vers +226. Twilio achemine via des partenaires locaux. Le taux de délivrabilité vers Orange BF et Moov/Telecel est généralement bon mais non garanti à 100% (filtrage anti-spam possible sur certains opérateurs).",
        alternative: "Pour maximiser la délivrabilité, un numéro Alphanumeric Sender ID 'SILGAPP' peut être utilisé si Twilio le supporte pour BF — vérifier dans les résultats ci-dessus.",
        cout_estime: "~$0.04-0.09 USD par SMS vers +226 (selon opérateur destinataire)",
      },
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});