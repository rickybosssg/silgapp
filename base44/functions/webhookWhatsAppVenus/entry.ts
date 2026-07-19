import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  VENUS_SYSTEM_PROMPT,
  VENUS_GREETING_WHATSAPP,
  TARIFS_PAYS,
  detecterPaysDepuisTelephone,
} from '../../shared/venusPrompt.ts';

/**
 * Webhook WhatsApp ↔ Venus (via Twilio).
 *
 * Reçoit les messages WhatsApp entrants de Twilio, les transmet à Venus (LLM),
 * et renvoie la réponse de Venus au client via Twilio.
 *
 * CONFIGURATION:
 * - URL webhook : à configurer dans Twilio Console → Messaging → WhatsApp Sandbox Settings
 * - Le numéro From est le Sandbox Twilio (+14155238886) en mode test
 *
 * SÉCURITÉ:
 * - Validation de la signature Twilio (X-Twilio-Signature) en production
 * - Mode test : skip_signature=true dans le query string ou payload JSON
 *
 * FLOW:
 * 1. Twilio reçoit un message WhatsApp d'un client
 * 2. Twilio appelle ce webhook (POST form-encoded)
 * 3. On extrait le téléphone, le message, on détecte le pays
 * 4. On invoque Venus (InvokeLLM) avec le contexte du pays
 * 5. On renvoie la réponse via Twilio WhatsApp API
 * 6. On logge l'interaction dans VenusInteraction
 */

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';

async function validerSignatureTwilio(url, rawBody, authToken, signatureHeader) {
  if (!signatureHeader) return false;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(authToken),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(url + rawBody));
    const computed = btoa(String.fromCharCode(...new Uint8Array(mac)));
    return computed === signatureHeader;
  } catch (e) {
    console.error('[WebhookVenus] Erreur validation signature:', e.message);
    return false;
  }
}

async function envoyerWhatsAppReply(telephone, message, accountSid, authToken, fromNumber) {
  const to = telephone.startsWith('whatsapp:') ? telephone : `whatsapp:${telephone}`;
  const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;

  const twilioUrl = `${TWILIO_API_BASE}/${accountSid}/Messages.json`;
  const credentials = btoa(`${accountSid}:${authToken}`);

  const formData = new URLSearchParams();
  formData.append('From', from);
  formData.append('To', to);
  formData.append('Body', message);

  const resp = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  const data = await resp.json();
  return { ok: resp.ok, data };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886';

    if (!accountSid || !authToken) {
      console.error('[WebhookVenus] Secrets Twilio manquants');
      return Response.json({ error: 'Configuration Twilio manquante' }, { status: 500 });
    }

    const contentType = req.headers.get('content-type') || '';
    const url = new URL(req.url);
    const skipSignatureByUrl = url.searchParams.get('skip_signature') === 'true';

    let params = {};
    let rawBody = '';
    let isJsonMode = false;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      rawBody = await req.text();
      params = Object.fromEntries(new URLSearchParams(rawBody));
    } else {
      // Mode test JSON
      isJsonMode = true;
      const jsonBody = await req.json();
      params = jsonBody;
      rawBody = JSON.stringify(jsonBody);
    }

    // Skip signature en mode test JSON ou si skip_signature=true dans l'URL ou le payload
    const skipSignature = skipSignatureByUrl || isJsonMode || params.skip_signature === 'true';

    const from = params.From || '';
    const body = params.Body || '';
    const messageSid = params.MessageSid || '';
    const profileName = params.ProfileName || '';

    if (!from || !body) {
      return Response.json(
        { error: 'From et Body requis', received: Object.keys(params) },
        { status: 400 }
      );
    }

    // ── Validation signature Twilio (sauf mode test) ──
    if (!skipSignature) {
      const signatureHeader = req.headers.get('X-Twilio-Signature') || '';
      const isValid = await validerSignatureTwilio(url.toString(), rawBody, authToken, signatureHeader);
      if (!isValid) {
        console.error('[WebhookVenus] Signature Twilio invalide');
        return Response.json({ error: 'Signature invalide' }, { status: 403 });
      }
    }

    // ── Extraction du téléphone et détection du pays ──
    const telephone = from.replace('whatsapp:', '');
    const countryCode = detecterPaysDepuisTelephone(telephone);
    const tarifs = TARIFS_PAYS[countryCode] || TARIFS_PAYS.BF;

    console.log(`[WebhookVenus] Message de ${telephone} (${profileName || 'N/A'}) | Pays: ${countryCode} | SID: ${messageSid}`);
    console.log(`[WebhookVenus] Question: "${body}"`);

    // ── Gestion du greeting (premier message) ──
    const isGreeting = body.toLowerCase().trim() === 'start' || body.toLowerCase().trim() === 'bonjour' || body.toLowerCase().trim() === 'salut';

    let reponseVenus;

    if (isGreeting) {
      reponseVenus = VENUS_GREETING_WHATSAPP;
    } else {
      // ── Invocation de Venus via LLM ──
      const promptComplet = `${VENUS_SYSTEM_PROMPT}

═══ CONTEXTE DE LA CONVERSATION ═══
PAYS ACTIF : ${countryCode} — ${tarifs.nom} (${tarifs.ville})
INDICATIF : ${tarifs.indicatif}
TARIFS : ${tarifs.prix_km} ${tarifs.devise}/km | Minimum ${tarifs.minimum} ${tarifs.devise} | Rayon ${tarifs.rayon} km
DEVISE : ${tarifs.devise}
SUPPORT WHATSAPP : +226 66 92 51 90

═══ MESSAGE DU CLIENT ═══
${body}

Réponds en tant que VENUS. Sois concise (max 3-4 paragraphes), chaleureuse et utile. N'utilise pas de markdown (*, _, #) — uniquement du texte plain pour WhatsApp.`;

      const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: promptComplet,
      });

      reponseVenus = typeof llmRes === 'string' ? llmRes : (llmRes?.response || String(llmRes));
    }

    // Nettoyer le markdown pour WhatsApp
    reponseVenus = reponseVenus.replace(/\*\*/g, '').replace(/^#{1,6}\s+/gm, '').replace(/`/g, '');

    console.log(`[WebhookVenus] Réponse Venus (${reponseVenus.length} chars): "${reponseVenus.substring(0, 100)}..."`);

    // ── Envoi de la réponse via Twilio ──
    const twilioResult = await envoyerWhatsAppReply(telephone, reponseVenus, accountSid, authToken, fromNumber);

    if (!twilioResult.ok) {
      console.error('[WebhookVenus] Erreur envoi Twilio:', twilioResult.data?.message || twilioResult.data);
    }

    // ── Log de l'interaction dans VenusInteraction ──
    const conversationId = `wa_${telephone.replace(/[^0-9]/g, '')}`;
    try {
      await base44.asServiceRole.entities.VenusInteraction.create({
        conversation_id: conversationId,
        question: body,
        reponse: reponseVenus,
        country_code: countryCode,
        user_type: 'client',
        date_conversation: new Date().toISOString().split('T')[0],
        statut: 'resolu',
        satisfaction: 'neutre',
      });
    } catch (logErr) {
      console.error('[WebhookVenus] Erreur logging VenusInteraction:', logErr.message);
    }

    // ── Retourner TwiML vide (Twilio attend une réponse XML) ──
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('[WebhookVenus] Erreur globale:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});