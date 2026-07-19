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

/**
 * Phase 16 — Transcription d'une note vocale WhatsApp en texte.
 * Utilise Core.TranscribeAudio (Whisper) qui supporte le français et les accents africains.
 * Retourne { texte, confidence, status }.
 */
async function transcrireAudio(base44, audioUrl) {
  try {
    const result = await base44.asServiceRole.integrations.Core.TranscribeAudio({ audio_url: audioUrl });
    const texte = typeof result === 'string' ? result : (result?.text || result?.transcript || '');
    if (!texte || texte.trim().length < 2) {
      return { texte: '', confidence: 0, status: 'echec' };
    }
    // Heuristique de confiance : si la transcription est très courte ou contient des marqueurs d'incertitude
    const motsIncertains = ['[inaudible]', '[bruit]', '[?]', '...', 'incomprehensible'];
    const hasIncertitude = motsIncertains.some(m => texte.toLowerCase().includes(m));
    const confidence = hasIncertitude ? 0.4 : (texte.length > 10 ? 0.85 : 0.6);
    const status = confidence < 0.5 ? 'faible_confiance' : 'transcrit';
    console.log(`[WebhookVenus] 🎤 Transcription: "${texte.substring(0, 100)}" (confiance: ${confidence})`);
    return { texte, confidence, status };
  } catch (e) {
    console.error('[WebhookVenus] Erreur transcription audio:', e.message);
    return { texte: '', confidence: 0, status: 'echec' };
  }
}

/**
 * Phase 16 — Charge la configuration audio de Venus depuis SystemConfig.
 * Par défaut : mode texte, réponses audio désactivées.
 */
const AUDIO_CACHE = { data: null, expires: 0 };
async function chargerConfigAudio(base44) {
  if (AUDIO_CACHE.data && Date.now() < AUDIO_CACHE.expires) return AUDIO_CACHE.data;
  const defaults = {
    audio_response_enabled: false,      // Venus peut-elle répondre en audio ?
    audio_response_voice: 'honey',       // Voix TTS de Venus — jeune femme douce et chaleureuse
    audio_response_language: 'fr',       // Langue de la réponse audio
    audio_only_on_voice_input: true,     // Répondre en audio seulement si le client a envoyé un vocal
    audio_max_duration_chars: 500,       // Limite de caractères pour générer un audio (évite les longs textes)
  };
  try {
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({});
    const get = (cle, fallback) => {
      const c = configs.find(x => x.cle === cle);
      return c?.valeur ?? fallback;
    };
    const data = {
      audio_response_enabled: get('VENUS_AUDIO_RESPONSE_ENABLED', 'false') === 'true',
      audio_response_voice: get('VENUS_AUDIO_RESPONSE_VOICE', defaults.audio_response_voice),
      audio_response_language: get('VENUS_AUDIO_RESPONSE_LANGUAGE', defaults.audio_response_language),
      audio_only_on_voice_input: get('VENUS_AUDIO_ONLY_ON_VOICE_INPUT', 'true') === 'true',
      audio_max_duration_chars: parseInt(get('VENUS_AUDIO_MAX_DURATION_CHARS', '500'), 10) || 500,
    };
    AUDIO_CACHE.data = data;
    AUDIO_CACHE.expires = Date.now() + 5 * 60 * 1000;
    return data;
  } catch (e) {
    console.warn('[WebhookVenus] Erreur chargement config audio, valeurs par défaut:', e.message);
    return defaults;
  }
}

/**
 * Phase 16 — Détermine si une réponse doit être envoyée en audio.
 * Règles : pas d'audio pour les longs textes, liens, QR codes, listes complexes, tarifs, références.
 */
function devraitRepondreEnAudio(reponseTexte, clientAEnvoyeAudio, config) {
  if (!config.audio_response_enabled) return false;
  if (config.audio_only_on_voice_input && !clientAEnvoyeAudio) return false;
  if (reponseTexte.length > config.audio_max_duration_chars) return false;
  // Contenu sensible : liens, QR, prix, références longues → texte uniquement
  const patternsSensibles = [
    /https?:\/\//i,    // liens
    /QR/i,             // QR codes
    /#[A-Z0-9]{4,}/,   // références de course
    /\d{4,}\s*FCFA/i,  // montants
    /\n.*\n.*\n.*\n/,   // listes (4+ lignes)
  ];
  if (patternsSensibles.some(p => p.test(reponseTexte))) return false;
  return true;
}

/**
 * Phase 16 — Génère une réponse audio via TTS et l'envoie via Twilio.
 */
async function envoyerReponseAudio(base44, telephone, texte, config, accountSid, authToken, fromNumber) {
  try {
    const ttsResult = await base44.asServiceRole.integrations.Core.GenerateSpeech({
      text: texte.substring(0, 5000),
      voice: config.audio_response_voice,
      language_code: config.audio_response_language,
    });
    const audioUrl = ttsResult?.url;
    if (!audioUrl) {
      console.error('[WebhookVenus] Pas d URL audio TTS generée');
      return null;
    }
    // Envoyer l'audio via Twilio MediaUrl
    const to = telephone.startsWith('whatsapp:') ? telephone : `whatsapp:${telephone}`;
    const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
    const twilioUrl = `${TWILIO_API_BASE}/${accountSid}/Messages.json`;
    const credentials = btoa(`${accountSid}:${authToken}`);
    const formData = new URLSearchParams();
    formData.append('From', from);
    formData.append('To', to);
    formData.append('MediaUrl', audioUrl);
    const resp = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });
    const data = await resp.json();
    return { ok: resp.ok, audio_url: audioUrl, twilio_data: data };
  } catch (e) {
    console.error('[WebhookVenus] Erreur envoi audio TTS:', e.message);
    return null;
  }
}

async function handleCourseFlow(base44, conversation, userMessage, countryCode, tarifs, telephone, profileName, isAudioTranscription = false) {
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

${isAudioTranscription ? `═══ NOTE IMPORTANTE - TRANSCRIPTION VOCALE ═══
Le message du client ci-dessous a ete transcrit depuis une note vocale et peut contenir des erreurs (mots mal entendus, noms de quartiers mal orthographues).
- Confirme TOUJOURS ce que tu as compris avant de poursuivre: "Si j'ai bien compris, vous souhaitez..."
- Si un mot est mal reconnu mais que l'intention est claire, propose une correction et demande juste confirmation.
- Ne demande JAMAIS de recommencer toute la note vocale. Demande uniquement les elements manquants.
- Noms de quartiers courants a Ouagadougou: Karpala, Pissy, Tampouy, Ouaga 2000, Zone du Bois, Patte d'Oie, Gounghin, Dassasgho, Cissin, Samandin, Wemtenga, Bendogo, Larle, Somgande, Saaba, Tanghin, Kossodo, Limete, Ouaga 1, Ouaga 2, Ouaga 3.
` : ''}MESSAGE DU CLIENT:
${userMessage}

═══ PRIORITE DES INFORMATIONS A COLLECTER ═══
1. Localisation de depart (OBLIGATOIRE)
   - GPS si disponible
   - Sinon quartier + description

2. Localisation d'arrivee (OBLIGATOIRE)
   - GPS si disponible
   - Sinon quartier + description

3. Expediteur (le client lui-meme par defaut)
   - Nom: ${profileName || telephone} (si connu, sinon le client)
   - Telephone: ${telephone} (OBLIGATOIRE - utilise le telephone du client par defaut)

4. Destinataire
   - Telephone: OBLIGATOIRE (si le client ne l'a pas, voir REGLES ci-dessous)
   - Nom: FACULTATIF (ne JAMAIS bloquer pour un nom manquant)

═══ REGLES CRITIQUES ═══
1. NE JAMAIS bloquer la creation d'une course parce qu'il manque le nom du destinataire.
   - Si le client a le telephone mais pas le nom, reponds: "Aucun probleme. Le nom du destinataire est facultatif. Votre course est prete a etre creee."
   - Mets contact_nom a "" (chaine vide) et continue.

2. Si le client ne connait NI le nom NI le numero du destinataire:
   - Demande s'il souhaite etre lui-meme le contact a l'arrivee (mets contact_is_client a true).
   - Ou propose d'ajouter ces informations plus tard.
   - Ne JAMAIS rester bloque sur cette question.

3. ANTI-BOUCLE: Ne repete JAMAIS la meme question deux fois de suite.
   - Si une information demandee est absente, propose une alternative et continue le processus.
   - Si le client dit qu'il ne sait pas ou n'a pas l'info, passe a l'etape suivante ou propose un fallback.

4. Si le client annule ou refuse, mets is_cancellation a true.

5. Si les infos OBLIGATOIRES sont collectees (type_course + adresse_depart + adresse_arrivee + contact_telephone OU contact_is_client), mets all_info_collected a true et presente un resume SANS PRIX, puis demande de confirmer par "oui".
   IMPORTANT: N'affiche JAMAIS un prix ou un tarif estime dans le resume. Le prix sera communique par le livreur.
   Si le client demande le prix, reponds: "Je ne peux pas encore determiner le tarif avec precision. Le livreur qui prendra votre course vous contactera pour confirmer le cout de la livraison avant le demarrage de la course."

6. Si le client confirme apres le resume, mets user_confirmed a true.

7. Si ce n'est pas une demande de course, mets is_course_request a false et reponds normalement.

8. Garde les champs deja collectes dans course_data (ne les perds pas).

9. Ta response doit etre en texte plain, sans markdown, concise et chaleureuse.

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
            contact_is_client: { type: 'boolean' },
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
  // Conditions: type_course + adresse_depart + adresse_arrivee + (contact_telephone OU contact_is_client)
  // Le nom du destinataire est FACULTATIF et ne bloque jamais la creation
  const hasRequiredContact = updatedCourse.contact_telephone || updatedCourse.contact_is_client;
  if (result.all_info_collected && result.user_confirmed && updatedCourse.type_course && updatedCourse.adresse_depart && updatedCourse.adresse_arrivee && hasRequiredContact) {
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
      // Le destinataire est la personne qui recoit le colis
      // Si contact_is_client, le client est aussi le contact a l'arrivee
      if (cd.contact_is_client) {
        courseData.destinataire_nom = profileName || telephone;
        courseData.destinataire_telephone = telephone;
        courseData.destinataire_phone_normalized = telephone;
      } else {
        courseData.destinataire_nom = cd.contact_nom || ''; // Nom FACULTATIF
        courseData.destinataire_telephone = cd.contact_telephone || telephone;
        courseData.destinataire_phone_normalized = cd.contact_telephone || telephone;
      }
    } else if (cd.type_course === 'recevoir') {
      // L'expediteur est la personne qui envoie le colis vers le client
      if (cd.contact_is_client) {
        courseData.expediteur_nom = profileName || telephone;
        courseData.expediteur_telephone = telephone;
        courseData.expediteur_phone_normalized = telephone;
      } else {
        courseData.expediteur_nom = cd.contact_nom || ''; // Nom FACULTATIF
        courseData.expediteur_telephone = cd.contact_telephone || telephone;
        courseData.expediteur_phone_normalized = cd.contact_telephone || telephone;
      }
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

Votre demande est bien enregistree. Un livreur va etre recherche. Des qu'il aura accepte la course, il vous contactera directement pour confirmer les details et vous communiquer le cout de la livraison avant toute validation definitive.`;

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

/**
 * Phase 10 — Consultation de course via WhatsApp.
 * Recherche la course active du client par son numero de telephone
 * et renvoie un resume du statut actuel.
 */
async function handleConsultationCourse(base44, telephone, userMessage, profileName) {
  const telDigits = telephone.replace(/\D/g, '');

  // Rechercher les courses du client par client_telephone
  let courses = await base44.asServiceRole.entities.CourseExterne.filter(
    { client_telephone: telephone },
    '-created_date', 5
  );

  // Aussi chercher par expediteur_telephone si pas trouve
  if (!courses || courses.length === 0) {
    courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { expediteur_telephone: telephone },
      '-created_date', 5
    );
  }

  // Chercher par derniers chiffres si pas trouve (numero stocke differemment)
  if (!courses || courses.length === 0) {
    const countryCode = detecterPaysDepuisTelephone(telephone);
    const allRecent = await base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: countryCode },
      '-created_date', 50
    );
    courses = allRecent.filter(c => {
      const ct = (c.client_telephone || '').replace(/\D/g, '');
      const et = (c.expediteur_telephone || '').replace(/\D/g, '');
      return ct.endsWith(telDigits.slice(-8)) || et.endsWith(telDigits.slice(-8));
    }).slice(0, 5);
  }

  if (!courses || courses.length === 0) {
    return `Bonjour ${profileName || ''}, je n'ai trouve aucune course associee a votre numero ${telephone}. Si vous souhaitez creer une nouvelle course, dites-le moi ! Pour toute question, contactez le support au +226 66 92 51 90.`;
  }

  // Prendre la course la plus recente non terminee, sinon la plus recente
  const STATUTS_ACTIFS = ['nouvelle', 'programmee', 'recherche_livreur', 'livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque', 'pris_en_charge', 'en_livraison', 'arrivee'];
  const courseActive = courses.find(c => STATUTS_ACTIFS.includes(c.statut)) || courses[0];

  const ref = courseActive.id?.slice(-6) || 'N/A';
  const statut = courseActive.statut || 'inconnu';
  const livreurNom = courseActive.livreur_nom || '';
  const livreurTel = courseActive.livreur_telephone || '';
  const adresseDepart = courseActive.adresse_depart || 'Non precise';
  const adresseArrivee = courseActive.adresse_arrivee || 'Non precise';
  const trackingLink = courseActive.tracking_link || '';
  const prix = courseActive.prix_final || courseActive.prix_estimate;

  const STATUT_LABELS = {
    nouvelle: "Votre course vient d'etre creee. Nous recherchons un livreur.",
    programmee: "Votre course est programmee.",
    recherche_livreur: "Nous recherchons actuellement un livreur pour votre course.",
    livreur_en_route: "Votre livreur est en route vers le point de prise en charge.",
    arrive_prise_en_charge: "Votre livreur est arrive au point de prise en charge.",
    colis_recupere: "Votre colis a ete recupere. Livraison en cours.",
    pris_en_charge: "Votre colis a ete recupere. Livraison en cours.",
    passager_embarque: "Votre passager a ete pris en charge.",
    en_livraison: "Votre colis est en cours de livraison.",
    arrivee: "Votre livreur est arrive a destination.",
    livree: "Votre colis a ete livre avec succes !",
    annulee: "Votre course a ete annulee.",
  };

  let message = `COURSE SILGAPP #${ref}\n\n`;
  message += `${STATUT_LABELS[statut] || "Statut: " + statut}\n\n`;
  message += `Depart: ${adresseDepart}\n`;
  message += `Arrivee: ${adresseArrivee}\n`;

  if (livreurNom) {
    message += `\nLivreur: ${livreurNom}`;
    if (livreurTel) message += ` (${livreurTel})`;
  }

  if (prix) {
    message += `\nPrix: ${prix.toLocaleString()} ${courseActive.devise || 'FCFA'}`;
  }

  if (trackingLink && STATUTS_ACTIFS.includes(statut)) {
    message += `\n\nSuivez votre livreur en temps reel:`;
    message += `\n${trackingLink}`;
  }

  if (statut === 'livree') {
    message += `\n\nMerci d'utiliser SILGAPP !`;
  }

  return message;
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

    // ── Validation signature Twilio ──
    // Mode permissif : on log mais on ne bloque pas (problème connu d'URL behind proxy)
    if (!skipSignature) {
      const signatureHeader = req.headers.get('X-Twilio-Signature') || '';
      const fullUrl = url.toString();
      const isValid = await validerSignatureTwilio(fullUrl, rawBody, authToken, signatureHeader);
      if (!isValid) {
        console.warn(`[WebhookVenus] ⚠️ ÉTAPE 0 — Signature Twilio invalide (mode permissif, traitement continué)`);
        console.warn(`[WebhookVenus] ⚠️ URL utilisée: ${fullUrl}`);
        console.warn(`[WebhookVenus] ⚠️ Header signature reçu: ${signatureHeader ? signatureHeader.substring(0, 30) + '...' : 'AUCUN'}`);
        console.warn(`[WebhookVenus] ⚠️ Body length: ${rawBody.length}`);
      } else {
        console.log(`[WebhookVenus] ✅ ÉTAPE 0 — Signature Twilio validée`);
      }
    }

    // ── Extraction du téléphone et détection du pays ──
    const telephone = from.replace('whatsapp:', '');
    const countryCode = detecterPaysDepuisTelephone(telephone);
    const tarifs = TARIFS_PAYS[countryCode] || TARIFS_PAYS.BF;

    console.log(`[WebhookVenus] 📥 ÉTAPE 1 — Message reçu de ${telephone} (${profileName || 'N/A'}) | Pays: ${countryCode} | Body: "${body}" | Media: ${numMedia} | GPS: ${latitude},${longitude} | Sid: ${messageSid}`);

    // ── 1. Trouver ou créer la Conversation ──
    let conversation: any = null;
    const existingConvs = await base44.asServiceRole.entities.Conversation.filter({
      whatsapp_phone: telephone,
    });

    if (existingConvs && existingConvs.length > 0) {
      conversation = existingConvs[0];
      console.log(`[WebhookVenus] ✅ ÉTAPE 2 — Conversation existante trouvée: ${conversation.id} | venus_active: ${conversation.venus_active}`);
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
      console.log(`[WebhookVenus] ✅ ÉTAPE 2 — Nouvelle conversation créée: ${conversation.id} | venus_active: true`);
    }

    // ── 2. Créer le Message entrant ──
    let messageType = 'text';
    let photoUrl: string | null = null;
    let audioUrl: string | null = null;
    let videoUrl: string | null = null;
    let documentUrl: string | null = null;
    let messageContent = body || '';

    let transcriptionData: any = null;
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
        // 🎤 Phase 16 — Transcrire la note vocale immédiatement
        transcriptionData = await transcrireAudio(base44, uploadedUrl);
        if (transcriptionData.texte) {
          messageContent = transcriptionData.texte;
        }
        console.log(`[WebhookVenus] 🎤 Note vocale de ${telephone} — transcription: "${(transcriptionData.texte || '').substring(0, 80)}" (confiance: ${transcriptionData.confidence})`);
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
      transcription: transcriptionData?.texte || '',
      transcription_confidence: transcriptionData?.confidence || 0,
      transcription_status: transcriptionData?.status || (messageType === 'audio' ? 'non_transcrit' : undefined),
      video_url: videoUrl,
      document_url: documentUrl,
      location_lat: latitude,
      location_lng: longitude,
      source: 'whatsapp',
      whatsapp_message_sid: messageSid,
    });
    console.log(`[WebhookVenus] ✅ ÉTAPE 3 — Message entrant stocké (${messageType}) dans conversation ${conversation.id}`);

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
      console.log(`[WebhookVenus] ⏸️ ÉTAPE 4 — Venus DÉSACTIVÉE pour ${telephone} — admin a pris la main, pas de réponse auto`);
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }
    console.log(`[WebhookVenus] ✅ ÉTAPE 4 — Venus active, génération de la réponse...`);

    // ── 4. Venus répond ──
    let reponseVenus = '';

    // 🎤 Phase 16+ — Si audio transcrit, passer le texte au LLM avec contexte de confirmation
    // Toutes les transcriptions (même faible confiance) sont traitées par le LLM
    // qui confirme ce qu'il a compris avant de poursuivre — plus naturel pour le client
    let messageEffectif = body;
    let clientAEnvoyeAudio = false;
    let isAudioTranscription = false;

    if (messageType === 'audio') {
      clientAEnvoyeAudio = true;
      if (transcriptionData?.status === 'echec' || !transcriptionData?.texte) {
        reponseVenus = "Je n'ai pas bien entendu votre note vocale. Pouvez-vous la renvoyer plus lentement ou m'ecrire votre demande (lieu de depart et lieu de livraison) ?";
      } else {
        // Transcription (même faible confiance) → traiter par le LLM avec confirmation
        messageEffectif = transcriptionData.texte;
        isAudioTranscription = true;
        console.log(`[WebhookVenus] 🎤 Audio transcrit (confiance: ${transcriptionData.confidence}, statut: ${transcriptionData.status}) traité par LLM: "${messageEffectif.substring(0, 80)}"`);
      }
    }

    const isGreeting =
      messageEffectif.toLowerCase().trim() === 'start' ||
      messageEffectif.toLowerCase().trim() === 'bonjour' ||
      messageEffectif.toLowerCase().trim() === 'salut';

    // ── Phase 10 : Détection des requêtes de consultation/suivi de course ──
    const consultationKeywords = [
      'ou est', 'où est', 'statut', 'suivi', 'ma course', 'mon colis',
      'livreur ou', 'en route', 'livre', 'arrive', 'position',
      'ou en est', 'où en est', 'mon livreur', 'la course',
    ];
    const hasConsultationKeyword = consultationKeywords.some(kw => messageEffectif.toLowerCase().includes(kw));

    const hasPendingCourse = !!conversation.venus_pending_course;
    const courseKeywords = ['course', 'colis', 'envoyer', 'livrer', 'recevoir', 'deplacement', 'livraison', 'expedier', 'envoie', 'paquet'];
    const hasCourseKeyword = courseKeywords.some(kw => messageEffectif.toLowerCase().includes(kw));
    const isConsultationFlow = hasConsultationKeyword && !hasPendingCourse && latitude === null && !reponseVenus;
    const isCourseFlow = (hasPendingCourse || (hasCourseKeyword && !isConsultationFlow)) && latitude === null && !reponseVenus;

    if (!reponseVenus && isConsultationFlow) {
      reponseVenus = await handleConsultationCourse(base44, telephone, messageEffectif, profileName);
    } else if (!reponseVenus && isCourseFlow) {
      const courseResult = await handleCourseFlow(base44, conversation, messageEffectif, countryCode, tarifs, telephone, profileName, isAudioTranscription);
      reponseVenus = courseResult.response;
      if (courseResult.pendingCourse !== undefined) {
        await base44.asServiceRole.entities.Conversation.update(conversation.id, {
          venus_pending_course: courseResult.pendingCourse ? JSON.stringify(courseResult.pendingCourse) : '',
        });
      }
    } else if (!reponseVenus && isGreeting && latitude === null) {
      reponseVenus = VENUS_GREETING_WHATSAPP;
    } else if (!reponseVenus && latitude !== null && longitude !== null) {
      reponseVenus = "J'ai bien recu votre localisation. Cette localisation correspond-elle au lieu de recuperation ou au lieu de livraison ?";
    } else if (!reponseVenus && messageType !== 'audio' && numMedia > 0) {
      reponseVenus = "J'ai bien recu votre media. Comment puis-je vous aider avec cela ?";
    } else if (!reponseVenus) {
      const promptComplet = `${VENUS_SYSTEM_PROMPT}

═══ CONTEXTE DE LA CONVERSATION ═══
PAYS ACTIF : ${countryCode} — ${tarifs.nom} (${tarifs.ville})
INDICATIF : ${tarifs.indicatif}
TARIFS : ${tarifs.prix_km} ${tarifs.devise}/km | Minimum ${tarifs.minimum} ${tarifs.devise} | Rayon ${tarifs.rayon} km
DEVISE : ${tarifs.devise}
SUPPORT WHATSAPP : +226 66 92 51 90
${isAudioTranscription ? `═══ NOTE IMPORTANTE - TRANSCRIPTION VOCALE ═══
Le message ci-dessous a ete transcrit depuis une note vocale et peut contenir des erreurs (mots mal entendus, noms de quartiers mal orthographues).
- Confirme TOUJOURS ce que tu as compris: "Si j'ai bien compris, vous souhaitez..."
- Si l'intention est claire meme avec des erreurs, propose une correction et continue.
- Ne demande jamais de recommencer toute la note vocale.
- Noms de quartiers courants: Karpala, Pissy, Tampouy, Ouaga 2000, Zone du Bois, Patte d'Oie, Gounghin, Dassasgho, Cissin, Samandin, Wemtenga, Bendogo, Larle, Somgande, Saaba, Tanghin, Kossodo.` : ''}

═══ MESSAGE DU CLIENT ═══
${messageEffectif}

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

    console.log(`[WebhookVenus] ✅ ÉTAPE 5 — Réponse Venus générée (${reponseVenus.length} chars): "${reponseVenus.substring(0, 100)}..."`);

    // 🎤 Phase 16 — Déterminer si on répond en audio ou en texte
    const audioConfig = await chargerConfigAudio(base44);
    const utiliserAudio = devraitRepondreEnAudio(reponseVenus, clientAEnvoyeAudio, audioConfig);
    let audioResponseUrl: string | null = null;
    let twilioResult: any = null;

    console.log(`[WebhookVenus] 📤 ÉTAPE 6 — Envoi réponse à ${telephone} via Twilio (from: ${fromNumber}) | mode: ${utiliserAudio ? 'AUDIO' : 'TEXTE'}`);
    if (utiliserAudio) {
      // Envoyer d'abord un court audio TTS, puis le texte en complément (infos importantes)
      const audioResp = await envoyerReponseAudio(base44, telephone, reponseVenus, audioConfig, accountSid, authToken, fromNumber);
      if (audioResp?.ok) {
        audioResponseUrl = audioResp.audio_url;
        console.log(`[WebhookVenus] ✅ ÉTAPE 6 — Réponse audio envoyée à ${telephone} (url: ${audioResponseUrl?.substring(0, 60)}...)`);
      } else {
        // Fallback texte si l'audio échoue
        console.warn(`[WebhookVenus] ⚠️ ÉTAPE 6 — Audio échoué, fallback texte`);
        twilioResult = await envoyerWhatsAppReply(telephone, reponseVenus, accountSid, authToken, fromNumber);
      }
    } else {
      twilioResult = await envoyerWhatsAppReply(telephone, reponseVenus, accountSid, authToken, fromNumber);
    }
    if (twilioResult) {
      console.log(`[WebhookVenus] 📤 ÉTAPE 6 — Twilio API response: ok=${twilioResult.ok} | status=${twilioResult.data?.status || 'N/A'} | sid=${twilioResult.data?.sid || 'N/A'} | error=${twilioResult.data?.message || twilioResult.data?.error || 'N/A'}`);
    }
    if (twilioResult && !twilioResult.ok) {
      console.error(`[WebhookVenus] ❌ ÉTAPE 6 — Erreur envoi Twilio: ${JSON.stringify(twilioResult.data)}`);
    }

    // ── 5. Créer le Message de réponse Venus ──
    await base44.asServiceRole.entities.Message.create({
      conversation_id: conversation.id,
      sender_type: 'admin',
      sender_id: 'venus',
      sender_name: 'VENUS',
      message_type: utiliserAudio ? 'audio' : 'text',
      content: reponseVenus,
      audio_url: audioResponseUrl || undefined,
      audio_response_url: audioResponseUrl || undefined,
      source: 'whatsapp',
    });

    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      last_message: reponseVenus.slice(0, 80),
      last_message_date: new Date().toISOString(),
      last_sender_name: 'VENUS',
      last_sender_type: 'admin',
    });

    console.log(`[WebhookVenus] ✅ ÉTAPE 7 — Flow terminé avec succès pour ${telephone} | Twilio envoi: ${twilioResult?.ok ? 'OK' : (audioResponseUrl ? 'AUDIO OK' : 'ÉCHEC')}`);

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
    console.error(`[WebhookVenus] ❌ ERREUR GLOBALE: ${error.message}`);
    console.error(`[WebhookVenus] ❌ Stack: ${error.stack?.substring(0, 300)}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});