import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Diagnostic complet du Sandbox WhatsApp Twilio.
 * - Liste les participants enregistrés dans le Sandbox
 * - Vérifie l'historique des messages d'un numéro spécifique
 * - Vérifie le statut du Sandbox (code join, etc.)
 * Lecture seule — aucune modification.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) {
      return Response.json({ error: 'Variables Twilio manquantes' }, { status: 500 });
    }

    const creds = btoa(`${accountSid}:${authToken}`);
    const headers = { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' };
    const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;

    const numeroVise = '+22655738247';

    // ── 1. Informations du Sandbox WhatsApp ───────────────────────────────────
    const sandboxResp = await fetch(
      'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json?From=whatsapp:+14155238886&PageSize=1',
      { headers }
    );
    const sandboxData = await sandboxResp.json();

    // ── 2. Récupérer TOUS les messages échangés avec +22655738247 (entrant + sortant) ──
    // Messages sortants vers ce numéro
    const msgsSortantsResp = await fetch(
      baseUrl + '/Messages.json?To=whatsapp:' + encodeURIComponent(numeroVise) + '&PageSize=50',
      { headers }
    );
    const msgsSortants = await msgsSortantsResp.json();

    // Messages entrants DE ce numéro (opt-in = le numéro nous a envoyé "join xxx")
    const msgsEntrantsResp = await fetch(
      baseUrl + '/Messages.json?From=whatsapp:' + encodeURIComponent(numeroVise) + '&PageSize=50',
      { headers }
    );
    const msgsEntrants = await msgsEntrantsResp.json();

    // ── 3. Récupérer TOUS les messages WhatsApp entrants (toutes sources) ─────
    // Pour trouver qui a envoyé "join xxx" — on cherche les opt-ins
    const tousEntrantsResp = await fetch(
      baseUrl + '/Messages.json?To=whatsapp:+14155238886&PageSize=100',
      { headers }
    );
    const tousEntrants = await tousEntrantsResp.json();

    // ── 4. Historique étendu : messages du 1er mai 2026 ───────────────────────
    const depuisMai = new Date('2026-05-01T00:00:00Z').toISOString();
    const msgsHistoriqueResp = await fetch(
      baseUrl + '/Messages.json?To=whatsapp:' + encodeURIComponent(numeroVise) +
      '&DateSentAfter=' + encodeURIComponent(depuisMai) + '&PageSize=50',
      { headers }
    );
    const msgsHistorique = await msgsHistoriqueResp.json();

    // ── 5. Vérifier le statut du compte Twilio ────────────────────────────────
    const accountResp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      { headers }
    );
    const accountData = await accountResp.json();

    // ── Parser les opt-ins ─────────────────────────────────────────────────────
    const tousEntrantsMessages = tousEntrants?.messages || [];

    // Numéros qui ont envoyé "join xxx" = participants Sandbox
    const optIns = tousEntrantsMessages.filter(m =>
      m.body && m.body.toLowerCase().startsWith('join')
    );

    // Tous les numéros uniques qui ont envoyé quelque chose
    const numerosActifs = [...new Set(tousEntrantsMessages.map(m => m.from))];

    // Historique complet du numéro visé
    const historiqueNumeroVise = [
      ...(msgsEntrants?.messages || []),
      ...(msgsHistorique?.messages || []),
    ].reduce((acc, m) => {
      if (!acc.find(x => x.sid === m.sid)) acc.push(m);
      return acc;
    }, []).sort((a, b) => new Date(b.date_sent) - new Date(a.date_sent));

    // Dernier opt-in du numéro visé
    const optInNumeroCible = tousEntrantsMessages.find(m =>
      m.from === 'whatsapp:' + numeroVise && m.body?.toLowerCase().startsWith('join')
    );

    // Premier message reçu DEPUIS ce numéro (preuve d'opt-in)
    const premierMessageEntrant = (msgsEntrants?.messages || [])
      .sort((a, b) => new Date(a.date_sent) - new Date(b.date_sent))[0];

    // Dernier message sortant vers ce numéro
    const dernierMessageSortant = (msgsSortants?.messages || [])
      .sort((a, b) => new Date(b.date_sent) - new Date(a.date_sent))[0];

    // Analyse erreur 63015
    const messagesFailed = (msgsSortants?.messages || []).filter(m => m.status === 'failed' && m.error_code === 63015);
    const messagesReussis = (msgsSortants?.messages || []).filter(m => ['delivered', 'read', 'sent'].includes(m.status));

    const premierSucces = messagesReussis.sort((a, b) => new Date(a.date_sent) - new Date(b.date_sent))[0];
    const premierEchec = messagesFailed.sort((a, b) => new Date(a.date_sent) - new Date(b.date_sent))[0];

    return Response.json({
      numero_vise: numeroVise,
      date_diagnostic: new Date().toISOString(),

      // ── État du compte ──────────────────────────────────────────────────────
      compte: {
        sid: accountData.sid,
        nom: accountData.friendly_name,
        statut: accountData.status,
        type: accountData.type,
        date_creation: accountData.date_created,
      },

      // ── Sandbox ─────────────────────────────────────────────────────────────
      sandbox: {
        numero: '+14155238886',
        whatsapp_from: 'whatsapp:+14155238886',
        note: 'Numéro Sandbox partagé Twilio — les opt-ins expirent après 72h d\'inactivité selon la politique Twilio',
        politique_expiration: 'Un numéro doit ré-envoyer "join [code]" s\'il n\'a pas interagi avec le Sandbox depuis 72h',
      },

      // ── Opt-ins détectés ────────────────────────────────────────────────────
      opt_ins_detectes: {
        total_opt_ins_trouves: optIns.length,
        opt_ins: optIns.map(m => ({
          from: m.from,
          body: m.body,
          date: m.date_sent,
          status: m.status,
        })),
        numero_cible_a_opt_in: !!optInNumeroCible || !!premierMessageEntrant,
        detail_opt_in_cible: optInNumeroCible ? {
          body: optInNumeroCible.body,
          date: optInNumeroCible.date_sent,
        } : null,
        premier_message_entrant_cible: premierMessageEntrant ? {
          body: premierMessageEntrant.body,
          date: premierMessageEntrant.date_sent,
          status: premierMessageEntrant.status,
        } : null,
      },

      // ── Participants actifs Sandbox ─────────────────────────────────────────
      participants_sandbox: {
        numeros_uniques_ayant_interagi: numerosActifs,
        total: numerosActifs.length,
        note: 'Numéros ayant envoyé au moins 1 message au Sandbox (historique API)',
      },

      // ── Historique numéro +22655738247 ──────────────────────────────────────
      historique_numero_cible: {
        messages_sortants_total: msgsSortants?.messages?.length || 0,
        messages_entrants_total: msgsEntrants?.messages?.length || 0,
        premier_succes: premierSucces ? {
          sid: premierSucces.sid,
          date: premierSucces.date_sent,
          status: premierSucces.status,
          body: premierSucces.body?.substring(0, 80),
        } : null,
        premier_echec_63015: premierEchec ? {
          sid: premierEchec.sid,
          date: premierEchec.date_sent,
          status: premierEchec.status,
          error_code: premierEchec.error_code,
        } : null,
        messages_reussis: messagesReussis.length,
        messages_echec_63015: messagesFailed.length,
        timeline_complete: historiqueNumeroVise.slice(0, 30).map(m => ({
          sid: m.sid,
          direction: m.direction,
          date: m.date_sent,
          status: m.status,
          error_code: m.error_code || null,
          body_extrait: m.body?.substring(0, 60),
        })),
      },

      // ── Diagnostic ──────────────────────────────────────────────────────────
      diagnostic: {
        conclusion: messagesFailed.length > 0 && messagesReussis.length > 0
          ? 'OPT-IN EXPIRÉ : Le numéro avait bien fait l\'opt-in (messages réussis) mais l\'opt-in a expiré (72h d\'inactivité Twilio Sandbox). Il faut ré-envoyer "join [code]".'
          : messagesFailed.length > 0 && messagesReussis.length === 0
          ? 'JAMAIS OPT-IN ou OPT-IN non détecté dans l\'historique API disponible.'
          : 'Aucun échec 63015 détecté — numéro opérationnel.',
        cause_63015: 'L\'erreur 63015 signifie que le numéro destinataire n\'est pas opt-in dans ce Sandbox Twilio. L\'opt-in Sandbox expire après 72h d\'inactivité.',
        action_requise: 'Le numéro +22655738247 doit envoyer "join [code_sandbox]" au +14155238886 sur WhatsApp pour ré-activer l\'opt-in.',
      },
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});