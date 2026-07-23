import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Analyse le dernier message Twilio et son statut final.
 * Si le message échoue, affiche le code d'erreur exact et tente une correction automatique.
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
    const headers = { Authorization: `Basic ${auth}` };

    // ── 1. Récupérer les 10 derniers messages ──
    const listResp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json?PageSize=10`,
      { headers }
    );
    const listData = await listResp.json();
    const messages = listData?.messages || [];

    if (messages.length === 0) {
      return Response.json({
        statut: 'AUCUN_MESSAGE',
        message: 'Aucun message trouvé dans les logs Twilio.',
      });
    }

    // ── 2. Récupérer le détail complet du dernier message ──
    const lastMsg = messages[0];
    const detailResp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages/${lastMsg.sid}.json`,
      { headers }
    );
    const detail = await detailResp.json();

    const analyse: any = {
      timestamp: new Date().toISOString(),
      dernier_message: {
        sid: detail.sid,
        from: detail.from,
        to: detail.to,
        direction: detail.direction,
        statut: detail.status,
        code_erreur: detail.error_code,
        message_erreur: detail.error_message,
        body: (detail.body || '').substring(0, 120),
        date_created: detail.date_created,
        date_sent: detail.date_sent,
        date_updated: detail.date_updated,
        price: detail.price,
        price_unit: detail.price_unit,
        messaging_service_sid: detail.messaging_service_sid,
        num_segments: detail.num_segments,
        num_media: detail.num_media,
      },
    };

    // ── 3. Si le message a échoué, analyser et corriger ──
    const STATUTS_ECHEC = ['failed', 'undelivered'];
    if (STATUTS_ECHEC.includes(detail.status)) {
      analyse.diagnostic = {
        code_erreur: detail.error_code,
        message_erreur: detail.error_message || getMessageErreur(detail.error_code),
      };

      analyse.correction = await corrigerErreur(base44, detail, headers, TWILIO_SID, TWILIO_TOKEN);
    }

    // ── 4. Lister aussi les 5 messages précédents pour contexte ──
    analyse.messages_precedents = messages.slice(1, 6).map((m: any) => ({
      sid: m.sid,
      from: m.from,
      to: m.to,
      direction: m.direction,
      statut: m.status,
      code_erreur: m.error_code,
      body: (m.body || '').substring(0, 60),
      date: m.date_created,
    }));

    // ── 5. Statut global de livraison ──
    const tousMessages = messages.slice(0, 10);
    const livrerCount = tousMessages.filter((m: any) => m.status === 'delivered').length;
    const envoyerCount = tousMessages.filter((m: any) => m.status === 'sent').length;
    const echecCount = tousMessages.filter((m: any) => STATUTS_ECHEC.includes(m.status)).length;
    const queueCount = tousMessages.filter((m: any) => m.status === 'queued').length;

    analyse.resume_global = {
      total: tousMessages.length,
      delivered: livrerCount,
      sent: envoyerCount,
      queued: queueCount,
      failed_undelivered: echecCount,
      taux_livraison: tousMessages.length > 0
        ? `${Math.round(((livrerCount + envoyerCount) / tousMessages.length) * 100)}%`
        : 'N/A',
    };

    return Response.json(analyse);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function getMessageErreur(code: number): string {
  const errors: Record<number, string> = {
    63016: 'Outside messaging window — utilisez un Message Template pré-approuvé',
    63015: 'Failed to send freeform message — message en dehors de la fenêtre de 24h',
    63024: 'WhatsApp template mismatch — le contenu ne correspond pas au template approuvé',
    63041: 'WhatsApp message failed to send — numéro destinataire invalide',
    63040: 'WhatsApp recipient not allowed — le destinataire a bloqué le Business',
    63014: 'WhatsApp message failed — WhatsApp Sender non approuvé pour l\'envoi',
    21211: 'Invalid phone number — le numéro destinataire est invalide',
    21608: 'Number not authorized — le numéro n\'est pas vérifié pour le sandbox',
    30001: 'Queue overflow — file d\'attente Twilio pleine',
    30002: 'Account suspended — compte Twilio suspendu',
    30006: 'Unreachable destination — destinataire injoignable',
    30007: 'Carrier violation — le transporteur a rejeté le message',
    30008: 'Unknown error — erreur inconnue du transporteur',
  };
  return errors[code] || `Erreur Twilio ${code}`;
}

async function corrigerErreur(base44: any, detail: any, headers: any, twilioSid: string, twilioToken: string): Promise<any> {
  const errorCode = detail.error_code;
  const toNumber = (detail.to || '').replace('whatsapp:', '');
  const fromNumber = (detail.from || '').replace('whatsapp:', '');
  const correction: any = { code_erreur: errorCode, actions: [] };

  // ── Erreur 63016: Outside messaging window ──
  // Solution: Renvoyer le message en utilisant un Content Template approuvé
  if (errorCode === 63016) {
    correction.diagnostic = 'Le message freeform a échoué car la fenêtre de 24h WhatsApp est fermée (ou le destinataire n\'a jamais initié de conversation).';

    // Vérifier si on a des Content Templates disponibles
    try {
      const tmplResp = await fetch(
        `https://content.twilio.com/v1/Content?PageSize=20`,
        { headers }
      );
      const tmplData = await tmplResp.json();
      const templates = tmplData?.contents || [];

      if (templates.length > 0) {
        // Utiliser le premier template pour renvoyer le message
        const template = templates[0];
        correction.actions.push({
          action: 'renvoi_avec_template',
          template_sid: template.sid,
          template_name: template.name,
          template_types: Object.keys(template.types || {}),
        });

        // Tenter le renvoi via le template
        const resendParams = new URLSearchParams();
        resendParams.append('From', detail.from);
        resendParams.append('To', detail.to);
        resendParams.append('ContentSid', template.sid);
        if (template.language) {
          resendParams.append('ContentVariables', JSON.stringify({}));
        }

        const resendResp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
          {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: resendParams.toString(),
          }
        );
        const resendData = await resendResp.json();

        correction.actions.push({
          action: 'resultat_renvoi',
          succes: resendResp.ok,
          http_status: resendResp.status,
          nouveau_sid: resendData.sid,
          nouveau_statut: resendData.status,
          erreur: resendResp.ok ? null : resendData,
        });

        if (resendResp.ok && resendData.sid) {
          correction.resultat = `✅ Message renvoyé avec succès via Content Template ${template.name} (nouveau SID: ${resendData.sid})`;
        } else {
          correction.resultat = `❌ Échec du renvoi via template: ${resendData.message || JSON.stringify(resendData)}`;
        }
      } else {
        correction.actions.push({
          action: 'aucun_template_disponible',
          message: 'Aucun Content Template WhatsApp approuvé trouvé sur le compte',
        });
        correction.resultat = '⚠️ Aucun Content Template disponible. Créez un template dans Twilio Console → Content → Twilio Content Editor pour envoyer des messages hors fenêtre 24h.';
      }
    } catch (e) {
      correction.actions.push({ action: 'erreur_verification_template', erreur: e.message });
      correction.resultat = `⚠️ Erreur lors de la vérification des templates: ${e.message}`;
    }
  }

  // ── Erreur 63014: WhatsApp Sender non approuvé ──
  else if (errorCode === 63014) {
    correction.diagnostic = 'Le WhatsApp Sender n\'est pas approuvé pour l\'envoi.';
    correction.resultat = '⚠️ Le numéro WhatsApp Sender doit être approuvé. Vérifiez le statut dans Twilio Console → Messaging → Senders → WhatsApp Senders.';
  }

  // ── Erreur 21211: Numéro invalide ──
  else if (errorCode === 21211) {
    correction.diagnostic = `Le numéro destinataire ${toNumber} est invalide.`;
    correction.resultat = `⚠️ Le numéro ${toNumber} n'est pas un numéro WhatsApp valide.`;
  }

  // ── Erreur 21608: Numéro non autorisé (sandbox) ──
  else if (errorCode === 21608) {
    correction.diagnostic = 'Le numéro destinataire n\'est pas dans la liste des numéros autorisés pour le sandbox WhatsApp.';
    correction.resultat = '⚠️ Si vous utilisez le sandbox WhatsApp, ajoutez le destinataire dans Twilio Console → Messaging → Try it out → Sandbox.';
  }

  // ── Autres erreurs ──
  else {
    correction.diagnostic = getMessageErreur(errorCode);
    correction.resultat = `⚠️ Erreur ${errorCode}: ${correction.diagnostic}. Vérifiez les logs Twilio pour plus de détails.`;
  }

  return correction;
}