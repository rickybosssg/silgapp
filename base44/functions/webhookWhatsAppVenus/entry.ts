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

async function handleCourseFlow(base44, conversation, userMessage, countryCode, tarifs, telephone, profileName) {
  let pendingCourse: any = null;
  try {
    pendingCourse = conversation.venus_pending_course ? JSON.parse(conversation.venus_pending_course) : null;
  } catch { pendingCourse = null; }

  const courseContext = pendingCourse ? JSON.stringify(pendingCourse, null, 2) : 'Aucune course en cours';

  const prompt = `Tu es VENUS, l'assistante SILGAPP. Analyse le message du client pour determiner s'il veut creer une course.

PAYS: ${countryCode} (${tarifs.nom})
TARIFS: ${tarifs.prix_km} ${tarifs.devise}/km, minimum ${tarifs.minimum} ${tarifs.devise}
CLIENT: ${profileName || telephone} (${telephone})

COURSE EN COURS:
${courseContext}

MESSAGE DU CLIENT:
${userMessage}

Pour creer une course, il faut collecter:
- type_course: "expedier" (envoyer un colis), "recevoir" (recevoir un colis), ou "deplacement" (se deplacer)
- adresse_depart: lieu de prise en charge
- adresse_arrivee: lieu de livraison
- contact_nom: nom du destinataire (si expedier) ou expediteur (si recevoir)
- contact_telephone: telephone du contact

REGLES:
- Si le client annule ou refuse, mets is_cancellation a true.
- Si toutes les infos sont collectees, mets all_info_collected a true et presente un resume avec le prix estime (${tarifs.minimum} ${tarifs.devise}), puis demande de confirmer par "oui".
- Si le client confirme apres le resume, mets user_confirmed a true.
- Si ce n'est pas une demande de course, mets is_course_request a false et reponds normalement.
- Garde les champs deja collectes dans course_data (ne les perds pas).
- Ta response doit etre en texte plain, sans markdown, concise et chaleureuse.

Reponds UNIQUEMENT avec un JSON:`;

  const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: 'object',
      properties: {
        is_course_request: { type: 'boolean' },
        course_data: {
          type: 'object',
          properties: {
            type_course: { type: 'string' },
            adresse_depart: { type: 'string' },
            adresse_arrivee: { type: 'string' },
            contact_nom: { type: 'string' },
            contact_telephone: { type: 'string' },
            notes: { type: 'string' },
          },
        },
        all_info_collected: { type: 'boolean' },
        user_confirmed: { type: 'boolean' },
        is_cancellation: { type: 'boolean' },
        response: { type: 'string' },
      },
      required: ['is_course_request', 'response'],
    },
  });

  const result: any = typeof llmRes === 'string' ? JSON.parse(llmRes) : llmRes;

  if (result.is_cancellation) {
    return { response: result.response || 'Course annulee. Comment puis-je vous aider ?', pendingCourse: null, courseCreated: false };
  }

  if (!result.is_course_request) {
    return { response: result.response || 'Comment puis-je vous aider ?', pendingCourse: undefined, courseCreated: false };
  }

  // Mettre a jour les donnees de course
  const updatedCourse = {
    ...(pendingCourse || {}),
    ...(result.course_data || {}),
  };

  // Verifier si on peut creer la course
  if (result.all_info_collected && result.user_confirmed && updatedCourse.type_course && updatedCourse.adresse_depart && updatedCourse.adresse_arrivee) {
    const cd = updatedCourse;
    const typeLabels: any = { expedier: 'Envoi de colis', recevoir: 'Reception de colis', deplacement: 'Deplacement' };

    const courseData: any = {
      country_code: countryCode,
      source: 'client',
      client_nom: profileName || telephone,
      client_telephone: telephone,
      type_course: cd.type_course,
      adresse_depart: cd.adresse_depart,
      adresse_arrivee: cd.adresse_arrivee,
      prix_estimate: tarifs.minimum,
      devise: tarifs.devise,
      statut: 'nouvelle',
      notes: cd.notes || '',
    };

    if (cd.type_course === 'expedier') {
      courseData.destinataire_nom = cd.contact_nom || '';
      courseData.destinataire_telephone = cd.contact_telephone || '';
      courseData.destinataire_phone_normalized = cd.contact_telephone || '';
    } else if (cd.type_course === 'recevoir') {
      courseData.expediteur_nom = cd.contact_nom || '';
      courseData.expediteur_telephone = cd.contact_telephone || '';
      courseData.expediteur_phone_normalized = cd.contact_telephone || '';
    } else if (cd.type_course === 'deplacement') {
      courseData.passager_nom = profileName || telephone;
      courseData.passager_telephone = telephone;
    }

    try {
      const course = await base44.asServiceRole.entities.CourseExterne.create(courseData);
      console.log(`[WebhookVenus] Course creee: ${course.id} pour ${telephone}`);

      const typeLabel = typeLabels[cd.type_course] || cd.type_course;
      result.response = `Course creee avec succes !

Type: ${typeLabel}
De: ${cd.adresse_depart}
Vers: ${cd.adresse_arrivee}
Contact: ${cd.contact_nom || 'N/A'} (${cd.contact_telephone || 'N/A'})
Prix estime: ${tarifs.minimum} ${tarifs.devise}

Un livreur sera assigne prochainement. Vous recevrez une notification.`;

      return { response: result.response, pendingCourse: null, courseCreated: true };
    } catch (e: any) {
      console.error('[WebhookVenus] Erreur creation course:', e.message);
      return {
        response: 'Desole, une erreur est survenue lors de la creation de la course. Veuillez reessayer ou contacter le support au +226 66 92 51 90.',
        pendingCourse: updatedCourse,
        courseCreated: false,
      };
    }
  }

  return {
    response: result.response || 'Comment puis-je vous aider ?',
    pendingCourse: updatedCourse,
    courseCreated: false,
  };
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

    const hasPendingCourse = !!conversation.venus_pending_course;
    const courseKeywords = ['course', 'colis', 'envoyer', 'livrer', 'recevoir', 'deplacement', 'livraison', 'expedier', 'envoie', 'paquet'];
    const hasCourseKeyword = courseKeywords.some(kw => body.toLowerCase().includes(kw));
    const isCourseFlow = (hasPendingCourse || hasCourseKeyword) && numMedia === 0 && latitude === null;

    if (isCourseFlow) {
      const courseResult = await handleCourseFlow(base44, conversation, body, countryCode, tarifs, telephone, profileName);
      reponseVenus = courseResult.response;
      if (courseResult.pendingCourse !== undefined) {
        await base44.asServiceRole.entities.Conversation.update(conversation.id, {
          venus_pending_course: courseResult.pendingCourse ? JSON.stringify(courseResult.pendingCourse) : '',
        });
      }
    } else if (isGreeting && numMedia === 0 && latitude === null) {
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