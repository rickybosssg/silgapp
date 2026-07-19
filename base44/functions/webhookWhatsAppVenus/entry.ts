import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  VENUS_SYSTEM_PROMPT,
  VENUS_GREETING_WHATSAPP,
  TARIFS_PAYS,
  detecterPaysDepuisTelephone,
} from '../../shared/venusPrompt.ts';

/**
 * Webhook WhatsApp <-> Venus (via Twilio).
 *
 * Reçoit les messages WhatsApp entrants, les stocke dans Conversation/Message,
 * invoque Venus si active, et renvoie la réponse via Twilio.
 *
 * FLOW:
 * 1. Twilio reçoit un message WhatsApp d'un client
 * 2. Ce webhook trouve/crée la Conversation + Message
 * 3. Si venus_active = true → Venus répond via LLM + Twilio
 * 4. Si venus_active = false → l'admin a pris la main, pas de réponse auto
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

async function downloadAndUploadMedia(mediaUrl, accountSid, authToken, base44) {
  try {
    const credentials = btoa(`${accountSid}:${authToken}`);
    const resp = await fetch(mediaUrl, {
      headers: { Authorization: `Basic ${credentials}` },
    });
    if (!resp.ok) {
      console.error('[WebhookVenus] Erreur telechargement media:', resp.status);
      return null;
    }
    const blob = await resp.blob();
    const result = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });
    return result?.file_url || null;
  } catch (e) {
    console.error('[WebhookVenus] Erreur upload media:', e.message);
    return null;
  }
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

    let params: any = {};
    let rawBody = '';
    let isJsonMode = false;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      rawBody = await req.text();
      params = Object.fromEntries(new URLSearchParams(rawBody));
    } else {
      isJsonMode = true;
      const jsonBody = await req.json();
      params = jsonBody;
      rawBody = JSON.stringify(jsonBody);
    }

    const skipSignature = skipSignatureByUrl || isJsonMode || params.skip_signature === 'true';

    const from = params.From || '';
    const body = params.Body || '';
    const messageSid = params.MessageSid || '';
    const profileName = params.ProfileName || '';
    const numMedia = parseInt(params.NumMedia || '0', 10);
    const latitude = params.Latitude ? parseFloat(params.Latitude) : null;
    const longitude = params.Longitude ? parseFloat(params.Longitude) : null;

    if (!from) {
      return Response.json({ error: 'From requis' }, { status: 400 });
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

    console.log(`[WebhookVenus] ${telephone} (${profileName || 'N/A'}) | Pays: ${countryCode} | Media: ${numMedia} | GPS: ${latitude},${longitude}`);

    // ── 1. Trouver ou créer la Conversation ──
    let conversation: any = null;
    const existingConvs = await base44.asServiceRole.entities.Conversation.filter({
      whatsapp_phone: telephone,
    });

    if (existingConvs && existingConvs.length > 0) {
      conversation = existingConvs[0];
    } else {
      const participants = JSON.stringify([
        { type: 'client', id: telephone, name: profileName || telephone },
        { type: 'admin', id: 'all', name: 'Admin SILGAPP' },
      ]);
      conversation = await base44.asServiceRole.entities.Conversation.create({
        participants,
        title: profileName || telephone,
        whatsapp_phone: telephone,
        source: 'whatsapp',
        venus_active: true,
        country_code: countryCode,
        group_type: 'direct',
        last_message: body || (numMedia > 0 ? 'Media' : 'Localisation'),
        last_message_date: new Date().toISOString(),
        last_sender_name: profileName || telephone,
        last_sender_type: 'client',
      });
    }

    // ── 2. Créer le Message entrant ──
    let messageType = 'text';
    let photoUrl: string | null = null;
    let audioUrl: string | null = null;
    let videoUrl: string | null = null;
    let documentUrl: string | null = null;
    let messageContent = body || '';

    if (latitude !== null && longitude !== null) {
      messageType = 'location';
      messageContent = `Localisation: ${latitude}, ${longitude}`;
    } else if (numMedia > 0) {
      const mediaUrl0 = params.MediaUrl0;
      const contentType0 = params.MediaContentType0 || '';
      const uploadedUrl = await downloadAndUploadMedia(mediaUrl0, accountSid, authToken, base44);

      if (contentType0.startsWith('image/')) {
        messageType = 'photo';
        photoUrl = uploadedUrl;
      } else if (contentType0.startsWith('video/')) {
        messageType = 'video';
        videoUrl = uploadedUrl;
      } else if (contentType0.startsWith('audio/')) {
        messageType = 'audio';
        audioUrl = uploadedUrl;
      } else {
        messageType = 'document';
        documentUrl = uploadedUrl;
      }
      if (!messageContent) messageContent = `[${messageType}]`;
    }

    await base44.asServiceRole.entities.Message.create({
      conversation_id: conversation.id,
      sender_type: 'client',
      sender_id: telephone,
      sender_name: profileName || telephone,
      message_type: messageType,
      content: messageContent,
      photo_url: photoUrl,
      audio_url: audioUrl,
      video_url: videoUrl,
      document_url: documentUrl,
      location_lat: latitude,
      location_lng: longitude,
      source: 'whatsapp',
      whatsapp_message_sid: messageSid,
    });

    // ── Mettre à jour la conversation ──
    const lastMsgPreview =
      messageType === 'text' ? (messageContent || '').slice(0, 80) :
      messageType === 'audio' ? '🎤 Message vocal' :
      messageType === 'photo' ? '📷 Photo' :
      messageType === 'video' ? '🎥 Vidéo' :
      messageType === 'document' ? '📎 Document' :
      messageType === 'location' ? '📍 Localisation' : 'Nouveau message';

    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      last_message: lastMsgPreview,
      last_message_date: new Date().toISOString(),
      last_sender_name: profileName || telephone,
      last_sender_type: 'client',
    });

    // ── 3. Vérifier si Venus est active ──
    if (conversation.venus_active === false) {
      console.log(`[WebhookVenus] Venus desactivee pour ${telephone} — pas de reponse auto`);
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // ── 4. Venus répond ──
    let reponseVenus = '';

    const isGreeting =
      body.toLowerCase().trim() === 'start' ||
      body.toLowerCase().trim() === 'bonjour' ||
      body.toLowerCase().trim() === 'salut';

    if (isGreeting && numMedia === 0 && latitude === null) {
      reponseVenus = VENUS_GREETING_WHATSAPP;
    } else if (latitude !== null && longitude !== null) {
      reponseVenus = "J'ai bien recu votre localisation. Cette localisation correspond-elle au lieu de recuperation ou au lieu de livraison ?";
    } else if (numMedia > 0) {
      reponseVenus = "J'ai bien recu votre media. Comment puis-je vous aider avec cela ?";
    } else {
      const promptComplet = `${VENUS_SYSTEM_PROMPT}

═══ CONTEXTE DE LA CONVERSATION ═══
PAYS ACTIF : ${countryCode} — ${tarifs.nom} (${tarifs.ville})
INDICATIF : ${tarifs.indicatif}
TARIFS : ${tarifs.prix_km} ${tarifs.devise}/km | Minimum ${tarifs.minimum} ${tarifs.devise} | Rayon ${tarifs.rayon} km
DEVISE : ${tarifs.devise}
SUPPORT WHATSAPP : +226 66 92 51 90

═══ MESSAGE DU CLIENT ═══
${body}

Reponds en tant que VENUS. Sois concise (max 3-4 paragraphes), chaleureuse et utile. N'utilise pas de markdown — uniquement du texte plain pour WhatsApp.`;

      const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: promptComplet,
      });
      reponseVenus = typeof llmRes === 'string' ? llmRes : (llmRes?.response || String(llmRes));
    }

    // Nettoyer le markdown
    reponseVenus = reponseVenus
      .replace(/\*\*/g, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/`/g, '');

    // ── 5. Créer le Message de réponse Venus ──
    await base44.asServiceRole.entities.Message.create({
      conversation_id: conversation.id,
      sender_type: 'admin',
      sender_id: 'venus',
      sender_name: 'VENUS',
      message_type: 'text',
      content: reponseVenus,
      source: 'whatsapp',
    });

    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      last_message: reponseVenus.slice(0, 80),
      last_message_date: new Date().toISOString(),
      last_sender_name: 'VENUS',
      last_sender_type: 'admin',
    });

    // ── 6. Envoyer via Twilio ──
    const twilioResult = await envoyerWhatsAppReply(telephone, reponseVenus, accountSid, authToken, fromNumber);
    if (!twilioResult.ok) {
      console.error('[WebhookVenus] Erreur envoi Twilio:', twilioResult.data?.message || twilioResult.data);
    }

    // ── 7. Log VenusInteraction ──
    const conversationIdLog = `wa_${telephone.replace(/[^0-9]/g, '')}`;
    try {
      await base44.asServiceRole.entities.VenusInteraction.create({
        conversation_id: conversationIdLog,
        question: body || `[${messageType}]`,
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

    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('[WebhookVenus] Erreur globale:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});