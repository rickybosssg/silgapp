import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  VENUS_SYSTEM_PROMPT,
  VENUS_GREETING_WHATSAPP,
  TARIFS_PAYS,
  detecterPaysDepuisTelephone,
} from '../../shared/venusPrompt.ts';
import { genererReferenceCourse } from '../../shared/venusCourseReference.ts';
import {
  rechercherConnaissancesValidees,
  genererReponseAugmentee,
  SEUIL_CONFIANCE,
} from '../../shared/venusLearningEngine.ts';
import {
  chargerMemoireLongue,
  mettreAJourMemoireLongue,
  chargerHistoriqueRecent,
  trouverCourseActive,
  raisonnerVenus,
  creerCourseDepuisMemoire,
  loggerRaisonnement,
} from '../../shared/venusReasoningEngine.ts';
import {
  getExecutionActive,
  repondreWorkflow,
  lancerWorkflow,
  getWorkflowCodeFromIntention,
} from '../../shared/venusWorkflowEngine.ts';
import {
  getMaintenanceMode,
  declencherEscalade,
} from '../../shared/venusSupervisionEngine.ts';
import {
  nettoyerTranscription,
  evaluerConfianceTranscription,
  peutAgirSurAudio,
  genererMessageConfirmationAudio,
  genererMessageRepetitionAudio,
} from '../../shared/venusAudioEngine.ts';
import {
  detecterEtTraiterIncident,
} from '../../shared/venusIncidentEngine.ts';
import {
  detecterIntentionModification,
  extraireChampEtValeur,
  appliquerModification,
  getChampLabel,
  getChampsModifiables,
  STATUTS_NON_MODIFIABLES,
  genererRecapModification,
} from '../../shared/venusCourseModifierEngine.ts';
import { normalizePhone } from '../../shared/phoneUtils.ts';
import { loggerMessageVenus, calculateCost } from '../../shared/venusOpenAITracker.ts';
import { genererExempleApprentissage } from '../../shared/venusLearningPipeline.ts';

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

/**
 * Envoie l'indicateur de saisie WhatsApp officiel via Twilio v3.
 * Marque automatiquement le message comme lu ET affiche
 * "SILGAPP NOTIFICATIONS est en train d'écrire..." pendant 25 secondes
 * (ou jusqu'à ce qu'une réponse soit livrée).
 */
async function envoyerIndicateurSaisie(messageSid, accountSid, authToken) {
  if (!messageSid || !accountSid || !authToken) return false;
  try {
    const url = 'https://messaging.twilio.com/v3/Indicators/Typing.json';
    const credentials = btoa(`${accountSid}:${authToken}`);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'WHATSAPP',
        messageId: messageSid,
      }),
    });
    if (resp.ok) {
      console.log(`[WebhookVenus] ⌨️ Indicateur de saisie envoyé pour ${messageSid}`);
      return true;
    }
    const errText = await resp.text().catch(() => '');
    console.warn(`[WebhookVenus] ⌨️ Indicateur de saisie échoué: HTTP ${resp.status} | messageId: ${messageSid} | Response: ${errText.substring(0, 500)}`);
    return false;
  } catch (e) {
    console.warn(`[WebhookVenus] ⌨️ Erreur indicateur de saisie: ${e.message}`);
    return false;
  }
}

async function downloadAndUploadMedia(mediaUrl, accountSid, authToken, base44, mediaContentType = '') {
  try {
    if (!mediaUrl) {
      console.error('[WebhookVenus] 📎 ❌ Aucun MediaUrl fourni par Twilio');
      return null;
    }

    console.log(`[WebhookVenus] 📎 ÉTAPE A — Téléchargement média Twilio | URL: ${mediaUrl.substring(0, 80)}... | Content-Type attendu: ${mediaContentType || 'inconnu'}`);

    const credentials = btoa(`${accountSid}:${authToken}`);

    // ── Télécharger avec gestion manuelle des redirections ──
    // Twilio media URLs redirigent vers S3 — l'en-tête Authorization
    // peut être perdu lors d'une redirection cross-origin
    let resp = await fetch(mediaUrl, {
      headers: { Authorization: `Basic ${credentials}` },
      redirect: 'manual',
    });

    // Suivre manuellement les redirections (302 → location header)
    let redirectCount = 0;
    while ((resp.status === 301 || resp.status === 302 || resp.status === 307 || resp.status === 308) && redirectCount < 5) {
      const redirectUrl = resp.headers.get('location');
      if (!redirectUrl) break;
      redirectCount++;
      console.log(`[WebhookVenus] 📎   Redirection ${redirectCount} → ${redirectUrl.substring(0, 80)}...`);
      // Les URLs redirigées (S3) sont généralement pré-signées et ne nécessitent pas d'auth
      const needsAuth = redirectUrl.includes('api.twilio.com');
      resp = await fetch(redirectUrl, {
        headers: needsAuth ? { Authorization: `Basic ${credentials}` } : {},
        redirect: 'manual',
      });
    }

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => '');
      console.error(`[WebhookVenus] 📎 ❌ ÉTAPE A — Téléchargement échoué | HTTP ${resp.status} ${resp.statusText} | Redirections: ${redirectCount} | Réponse: ${errorText.substring(0, 200)}`);
      return null;
    }

    const blob = await resp.blob();
    const blobSize = blob.size;
    const blobType = blob.type || mediaContentType || '';

    // ── Vérifier que le contenu téléchargé est bien un média (pas une page d'erreur XML) ──
    if (blobType.includes('xml') || blobType.includes('html') || blobType.includes('text/')) {
      const errorPeek = await blob.text().catch(() => '');
      console.error(`[WebhookVenus] 📎 ❌ ÉTAPE A — Type de réponse inattendu: ${blobType} | Contenu: ${errorPeek.substring(0, 200)}`);
      return null;
    }

    console.log(`[WebhookVenus] 📎 ✅ ÉTAPE A — Média téléchargé | Taille: ${blobSize} octets | Type: ${blobType} | Redirections: ${redirectCount}`);

    if (blobSize === 0) {
      console.error('[WebhookVenus] 📎 ❌ ÉTAPE A — Fichier téléchargé VIDE (0 octet)');
      return null;
    }

    if (blobSize < 100) {
      console.warn(`[WebhookVenus] 📎 ⚠️ ÉTAPE A — Fichier très petit (${blobSize} octets) — possible contenu invalide`);
    }

    // ── Déterminer l'extension du fichier selon le content-type ──
    let extension = 'bin';
    if (blobType.includes('ogg') || blobType.includes('opus')) extension = 'ogg';
    else if (blobType.includes('mp3') || blobType.includes('mpeg')) extension = 'mp3';
    else if (blobType.includes('wav')) extension = 'wav';
    else if (blobType.includes('webm')) extension = 'webm';
    else if (blobType.includes('m4a') || blobType.includes('mp4')) extension = 'm4a';
    else if (blobType.includes('image/jpeg')) extension = 'jpg';
    else if (blobType.includes('image/png')) extension = 'png';
    else if (blobType.includes('video/')) extension = 'mp4';
    else if (blobType.includes('pdf')) extension = 'pdf';

    // ── Créer un objet File avec nom et content-type corrects ──
    // UploadFile nécessite un objet File (avec name) et non un Blob simple
    const fileName = `whatsapp_media_${Date.now()}.${extension}`;
    const file = new File([blob], fileName, { type: blobType || 'application/octet-stream' });

    console.log(`[WebhookVenus] 📎 ÉTAPE B — Upload vers stockage Base44 | Fichier: ${fileName} | Taille: ${blobSize} octets | Type: ${blobType}`);

    const result = await base44.asServiceRole.integrations.Core.UploadFile({ file });

    if (!result?.file_url) {
      console.error('[WebhookVenus] 📎 ❌ ÉTAPE B — Upload échoué — aucune URL retournée');
      return null;
    }

    console.log(`[WebhookVenus] 📎 ✅ ÉTAPE B — Upload réussi | URL: ${result.file_url.substring(0, 80)}...`);
    return result.file_url;
  } catch (e) {
    console.error(`[WebhookVenus] 📎 ❌ Erreur downloadAndUploadMedia: ${e.message} | Stack: ${e.stack?.substring(0, 200)}`);
    return null;
  }
}

/**
 * Phase 16 — Transcription d'une note vocale WhatsApp en texte.
 * Utilise Core.TranscribeAudio (Whisper) qui supporte le français et les accents africains.
 * Retourne { texte, confidence, status }.
 */
async function transcrireAudio(base44, audioUrl, mediaContentType = '') {
  const startTime = Date.now();
  try {
    console.log(`[WebhookVenus] 🎤 ÉTAPE C — Début transcription audio`);
    console.log(`[WebhookVenus] 🎤   URL audio: ${audioUrl?.substring(0, 100) || 'N/A'}...`);
    console.log(`[WebhookVenus] 🎤   Format d'origine (Twilio): ${mediaContentType || 'inconnu'}`);

    if (!audioUrl) {
      console.error('[WebhookVenus] 🎤 ❌ ÉTAPE C — Aucune URL audio à transcrire');
      return { texte: '', texte_brut: '', confidence: 0, status: 'echec', raisons: ['URL audio manquante'] };
    }

    // ── Vérifier que l'URL audio est accessible ──
    console.log(`[WebhookVenus] 🎤 ÉTAPE C1 — Vérification accessibilité URL audio...`);
    try {
      const headResp = await fetch(audioUrl, { method: 'HEAD' });
      const audioSize = headResp.headers.get('content-length') || 'inconnu';
      const audioType = headResp.headers.get('content-type') || 'inconnu';
      console.log(`[WebhookVenus] 🎤   HEAD ${headResp.status} | Taille: ${audioSize} octets | Type: ${audioType}`);
      if (!headResp.ok) {
        console.error(`[WebhookVenus] 🎤 ❌ ÉTAPE C1 — URL audio inaccessible (HTTP ${headResp.status})`);
        return { texte: '', texte_brut: '', confidence: 0, status: 'echec', raisons: [`URL audio inaccessible: HTTP ${headResp.status}`] };
      }
    } catch (headErr) {
      console.warn(`[WebhookVenus] 🎤 ⚠️ ÉTAPE C1 — HEAD request échouée (continuons quand même): ${headErr.message}`);
    }

    // ── Appeler Gemini Flash pour transcription (français forcé) ──
    // Gemini Flash est utilisé en priorité car il permet de forcer la langue française,
    // contrairement à Whisper qui détecte parfois le portugais sur les audios courts
    console.log(`[WebhookVenus] 🎤 ÉTAPE C2 — Appel InvokeLLM (Gemini Flash) pour transcription française...`);
    let texteBrut = '';
    let usedFallback = false;

    try {
      const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `Tu es un expert en transcription audio. Transcris ce message vocal en français. L'audio est en français (parlé possiblement avec un accent africain burkinabè). Le texte peut contenir des noms de quartiers de Ouagadougou (Karpala, Pissy, Tampouy, Ouaga 2000, Zone du Bois, Patte d'Oie, Gounghin, Dassasgho, Cissin, Samandin, Wemtenga, Bendogo, Larle, Somgande, Saaba, Tanghin, Kossodo), des numéros de téléphone, ou des demandes de livraison. Réponds UNIQUEMENT avec le texte transcrit en français, sans commentaire. Si l'audio est inaudible, réponds "INAUDIBLE".`,
        file_urls: [audioUrl],
        model: 'gemini_3_flash',
      });
      const llmText = typeof llmResult === 'string' ? llmResult : (llmResult?.response || llmResult?.text || '');
      console.log(`[WebhookVenus] 🎤 ÉTAPE C2 — Gemini Flash terminé | Texte: "${(llmText || '').substring(0, 200)}"`);
      if (llmText && llmText.trim().length >= 2 && !llmText.toUpperCase().includes('INAUDIBLE')) {
        texteBrut = llmText.trim();
      }
    } catch (llmErr) {
      console.error(`[WebhookVenus] 🎤 ❌ ÉTAPE C2 — Gemini Flash échoué: ${llmErr.message}`);
    }

    // ── Fallback: si Gemini échoue ou retourne vide, utiliser Whisper ──
    if (!texteBrut || texteBrut.trim().length < 2) {
      console.warn(`[WebhookVenus] 🎤 ⚠️ ÉTAPE C2b — Gemini vide/échec — fallback Whisper...`);
      usedFallback = true;
      try {
        const result = await base44.asServiceRole.integrations.Core.TranscribeAudio({ audio_url: audioUrl });
        const whisperText = typeof result === 'string' ? result : (result?.text || result?.transcript || '');
        console.log(`[WebhookVenus] 🎤 ÉTAPE C2b — Whisper fallback terminé | Texte: "${(whisperText || '').substring(0, 200)}"`);
        if (whisperText && whisperText.trim().length >= 2) {
          texteBrut = whisperText.trim();
        }
      } catch (transcribeErr) {
        console.error(`[WebhookVenus] 🎤 ❌ ÉTAPE C2b — Whisper aussi échoué: ${transcribeErr.message}`);
      }
    }

    if (!texteBrut || texteBrut.trim().length < 2) {
      console.warn(`[WebhookVenus] 🎤 ❌ ÉTAPE C2 — Toutes les méthodes de transcription ont échoué`);
      return { texte: '', texte_brut: '', confidence: 0, status: 'echec', raisons: ['Transcription vide — Whisper et LLM fallback ont échoué'] };
    }

    // ── Nettoyer la transcription ──
    const texteNettoye = nettoyerTranscription(texteBrut);
    console.log(`[WebhookVenus] 🎤 ÉTAPE C3 — Transcription nettoyée: "${texteNettoye.substring(0, 200)}"`);

    // ── Évaluer la confiance ──
    const evalConfiance = evaluerConfianceTranscription(texteBrut, texteNettoye);
    console.log(`[WebhookVenus] 🎤 ÉTAPE C4 — Confiance: ${evalConfiance.confidence.toFixed(2)} | Statut: ${evalConfiance.status} | Raisons: ${evalConfiance.raisons.join('; ')}`);

    return {
      texte: texteNettoye,
      texte_brut: texteBrut,
      confidence: evalConfiance.confidence,
      status: evalConfiance.status,
      raisons: evalConfiance.raisons,
      methode: usedFallback ? 'whisper' : 'llm_fallback',
    };
  } catch (e) {
    const tempsMs = Date.now() - startTime;
    console.error(`[WebhookVenus] 🎤 ❌ ÉTAPE C — Erreur transcription audio après ${tempsMs}ms: ${e.message}`);
    console.error(`[WebhookVenus] 🎤   Stack: ${e.stack?.substring(0, 300)}`);
    console.error(`[WebhookVenus] 🎤   Nom erreur: ${e.name}`);
    return { texte: '', texte_brut: '', confidence: 0, status: 'echec', raisons: [`Erreur transcription: ${e.name} — ${e.message}`], methode: 'aucune' };
  }
}

/**
 * Fallback — Transcription directe depuis une URL Twilio.
 * Télécharge le fichier, l'upload, puis transcrit.
 * Utilisé quand downloadAndUploadMedia a échoué.
 */
async function transcrireAudioDepuisTwilio(base44, twilioMediaUrl, accountSid, authToken, mediaContentType) {
  console.log(`[WebhookVenus] 🎤 ÉTAPE D — Fallback: transcription directe depuis URL Twilio`);
  
  // Réessayer le téléchargement avec gestion des redirections
  try {
    const credentials = btoa(`${accountSid}:${authToken}`);
    let resp = await fetch(twilioMediaUrl, {
      headers: { Authorization: `Basic ${credentials}` },
      redirect: 'manual',
    });

    let redirectCount = 0;
    while ((resp.status === 301 || resp.status === 302 || resp.status === 307 || resp.status === 308) && redirectCount < 5) {
      const redirectUrl = resp.headers.get('location');
      if (!redirectUrl) break;
      redirectCount++;
      const needsAuth = redirectUrl.includes('api.twilio.com');
      resp = await fetch(redirectUrl, {
        headers: needsAuth ? { Authorization: `Basic ${credentials}` } : {},
        redirect: 'manual',
      });
    }

    if (!resp.ok) {
      console.error(`[WebhookVenus] 🎤 ❌ ÉTAPE D — Téléchargement fallback échoué: HTTP ${resp.status}`);
      return { texte: '', texte_brut: '', confidence: 0, status: 'echec', raisons: [`Téléchargement fallback échoué: HTTP ${resp.status}`] };
    }

    const blob = await resp.blob();
    const blobType = blob.type || mediaContentType || 'audio/ogg';
    console.log(`[WebhookVenus] 🎤 ÉTAPE D — Fichier téléchargé: ${blob.size} octets | Type: ${blobType}`);

    // Déterminer l'extension
    let extension = 'ogg';
    if (blobType.includes('mp3') || blobType.includes('mpeg')) extension = 'mp3';
    else if (blobType.includes('wav')) extension = 'wav';
    else if (blobType.includes('m4a') || blobType.includes('mp4')) extension = 'm4a';

    const fileName = `whatsapp_audio_${Date.now()}.${extension}`;
    const file = new File([blob], fileName, { type: blobType });

    // Upload
    const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file });
    if (!uploadResult?.file_url) {
      console.error('[WebhookVenus] 🎤 ❌ ÉTAPE D — Upload fallback échoué');
      return { texte: '', texte_brut: '', confidence: 0, status: 'echec', raisons: ['Upload fallback échoué'] };
    }

    console.log(`[WebhookVenus] 🎤 ✅ ÉTAPE D — Upload réussi, transcription en cours...`);
    // Transcrire
    return await transcrireAudio(base44, uploadResult.file_url, blobType);
  } catch (e) {
    console.error(`[WebhookVenus] 🎤 ❌ ÉTAPE D — Erreur fallback: ${e.message}`);
    return { texte: '', texte_brut: '', confidence: 0, status: 'echec', raisons: [`Erreur fallback: ${e.message}`] };
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
  // Priorité: prix_final > manual_price (si accepté) > prix_estimate
  const prix = courseActive.prix_final || (courseActive.manual_price_status === 'accepted' ? courseActive.manual_price : null) || courseActive.prix_estimate;

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

/**
 * Gestion de l'assignation d'une localisation partagee a un champ (depart ou arrivee).
 * Si une localisation est en attente (pending_location_lat) et que le client indique
 * "recuperation" ou "livraison", assigne la localisation au bon champ de maniere permanente.
 * Retourne la reponse VENUS si l'assignation a ete faite, ou null sinon.
 */
async function handleLocationAssignment(base44, conversation, userMessage) {
  let pendingCourse: any = null;
  try {
    pendingCourse = conversation.venus_pending_course ? JSON.parse(conversation.venus_pending_course) : null;
  } catch { pendingCourse = null; }

  if (!pendingCourse || pendingCourse.pending_location_lat == null) {
    return null;
  }

  const msgLower = userMessage.toLowerCase();
  const isPickup = ['recuperation', 'récupération', 'recuperer', 'récupérer', 'depart', 'départ', 'prise en charge', 'recupere', 'récupère'].some(kw => msgLower.includes(kw));
  const isDelivery = ['livraison', 'livrer', 'arrivee', 'arrivée', 'destination', 'arriver'].some(kw => msgLower.includes(kw));

  if (!isPickup && !isDelivery) {
    return null;
  }

  // Eviter la reassignation d'un champ deja connu
  if (isPickup && pendingCourse.gps_depart_lat != null) {
    return "J'ai deja enregistre votre lieu de recuperation. Veuillez m'envoyer la localisation du lieu de livraison, ou indiquez-moi le quartier de livraison.";
  }
  if (isDelivery && pendingCourse.gps_arrivee_lat != null) {
    return "J'ai deja enregistre votre lieu de livraison. Veuillez m'envoyer la localisation du lieu de recuperation, ou indiquez-moi le quartier de depart.";
  }

  if (isPickup) {
    pendingCourse.gps_depart_lat = pendingCourse.pending_location_lat;
    pendingCourse.gps_depart_lng = pendingCourse.pending_location_lng;
    pendingCourse.adresse_depart = 'Localisation GPS partagee';
    delete pendingCourse.pending_location_lat;
    delete pendingCourse.pending_location_lng;

    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      venus_pending_course: JSON.stringify(pendingCourse),
    });

    console.log(`[WebhookVenus] 📍 Localisation assignee au DEPART pour ${conversation.id}`);

    if (pendingCourse.gps_arrivee_lat == null && !pendingCourse.adresse_arrivee) {
      return "Merci. J'ai bien enregistre votre lieu de recuperation. Veuillez maintenant m'envoyer la localisation du lieu de livraison, ou si vous ne l'avez pas, indiquez-moi le quartier de livraison.";
    } else if (!pendingCourse.type_course) {
      return "Merci. J'ai bien enregistre votre lieu de recuperation. Quel type de course souhaitez-vous ? (envoyer un colis, recevoir un colis, ou vous deplacer)";
    } else {
      return "Merci. J'ai bien enregistre votre lieu de recuperation. Votre demande est prete. Souhaitez-vous confirmer la creation de cette course ? Repondez 'oui' pour confirmer.";
    }
  }

  if (isDelivery) {
    pendingCourse.gps_arrivee_lat = pendingCourse.pending_location_lat;
    pendingCourse.gps_arrivee_lng = pendingCourse.pending_location_lng;
    pendingCourse.adresse_arrivee = 'Localisation GPS partagee';
    delete pendingCourse.pending_location_lat;
    delete pendingCourse.pending_location_lng;

    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      venus_pending_course: JSON.stringify(pendingCourse),
    });

    console.log(`[WebhookVenus] 📍 Localisation assignee a l'ARRIVEE pour ${conversation.id}`);

    if (pendingCourse.gps_depart_lat == null && !pendingCourse.adresse_depart) {
      return "Merci. J'ai bien enregistre votre lieu de livraison. Veuillez maintenant m'envoyer la localisation du lieu de recuperation, ou si vous ne l'avez pas, indiquez-moi le quartier de depart.";
    } else if (!pendingCourse.type_course) {
      return "Merci. J'ai bien enregistre votre lieu de livraison. Quel type de course souhaitez-vous ? (envoyer un colis, recevoir un colis, ou vous deplacer)";
    } else {
      return "Merci. J'ai bien enregistre votre lieu de livraison. Votre demande est prete. Souhaitez-vous confirmer la creation de cette course ? Repondez 'oui' pour confirmer.";
    }
  }

  return null;
}

/**
 * Gestion de la décision de redispatch (client répond à "voulez-vous un autre livreur ?").
 * - Détecte 'oui' / 'non' dans la réponse du client
 * - Si 'oui' → passe dispatch_status à 'en_attente' et relance le dispatch
 * - Si 'non' → annule définitivement la course
 */
async function handleRedispatchDecision(base44: any, conversation: any, userMessage: string) {
  let pendingCourse: any = null;
  try {
    pendingCourse = conversation.venus_pending_course ? JSON.parse(conversation.venus_pending_course) : null;
  } catch { pendingCourse = null; }

  if (!pendingCourse?.redispatch_pending || !pendingCourse?.redispatch_course_id) {
    return null;
  }

  const courseId = pendingCourse.redispatch_course_id;
  const msgLower = userMessage.toLowerCase().trim();

  const OUI_KEYWORDS = [
    'oui', 'ok', "d'accord", 'd accord', 'ouai', 'ouais', 'volontiers', 'bien sur',
    "c'est bon", 'cest bon', 'go', 'confirme', 'valider', 'valide', 'oui je veux',
    'rechercher', 'relancer', 'encore', 'pourquoi pas', 'cest ok', "c'est ok",
  ];
  const NON_KEYWORDS = [
    'non', 'annuler', 'annule', 'je refuse', 'non merci', 'pas besoin',
    'plus besoin', 'laisse', 'laisser', 'stop', 'rien', 'non plus', 'c bon', 'cest bon',
  ];

  const isOui = OUI_KEYWORDS.some(kw => msgLower === kw || msgLower.startsWith(kw + ' ') || msgLower.startsWith(kw + '.') || msgLower.startsWith(kw + '!'));
  const isNon = NON_KEYWORDS.some(kw => msgLower === kw || msgLower.startsWith(kw + ' ') || msgLower.startsWith(kw + '.') || msgLower.startsWith(kw + '!'));

  // Si ni oui ni non clair → re-demander
  if (!isOui && !isNon) {
    return "Je n'ai pas bien compris votre réponse. Voulez-vous que je recherche un autre livreur pour votre course ? Répondez 'oui' pour relancer la recherche ou 'non' pour annuler définitivement.";
  }

  // Nettoyer le flag redispatch_pending
  delete pendingCourse.redispatch_pending;
  delete pendingCourse.redispatch_course_id;
  delete pendingCourse.redispatch_motif;
  await base44.asServiceRole.entities.Conversation.update(conversation.id, {
    venus_pending_course: JSON.stringify(pendingCourse),
  });

  if (isOui) {
    // Vérifier que la course est toujours en attente
    const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
    if (!course || course.statut === 'annulee' || course.statut === 'livree') {
      return "Cette course n'est plus disponible. N'hésitez pas à me solliciter si vous avez besoin d'une nouvelle course.";
    }

    // Passer dispatch_status à 'en_attente' pour permettre au dispatch de traiter la course
    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      dispatch_status: 'en_attente',
    });

    // Relancer le dispatch immédiatement (fire-and-forget)
    base44.asServiceRole.functions.invoke('dispatchExterneAuto', {
      action: 'lancer_recherche_auto',
      course_id: courseId,
    }).catch((err: any) => {
      console.error('[WebhookVenus] ❌ Erreur relance dispatch:', err?.message || err);
    });

    console.log(`[WebhookVenus] ✅ Client a accepté redispatch pour course ${courseId}`);
    return "Parfait ! Je lance immédiatement la recherche d'un nouveau livreur pour votre course. Je vous informerai dès qu'un livreur aura accepté. Le livreur vous contactera ensuite pour confirmer les derniers détails.";
  } else {
    // Annuler définitivement la course
    await base44.asServiceRole.entities.CourseExterne.update(courseId, {
      statut: 'annulee',
      dispatch_status: 'expire',
    });

    console.log(`[WebhookVenus] ❌ Client a refusé redispatch pour course ${courseId} — annulation définitive`);
    return "D'accord, j'annule définitivement votre course. N'hésitez pas à me solliciter si vous avez besoin d'autre chose. Merci d'utiliser SILGAPP !";
  }
}

/**
 * Gestion du contact avec le livreur pendant une course active.
 * - Détecte l'intention "parler au livreur", "appeler le livreur", etc.
 * - Entre en mode "contact_livreur" et fournit les coordonnées du livreur
 * - Relaye les messages du client vers le livreur (WhatsApp + push notification)
 */
async function handleContactLivreur(base44: any, conversation: any, userMessage: string, telephone: string, profileName: string) {
  let pendingCourse: any = null;
  try {
    pendingCourse = conversation.venus_pending_course ? JSON.parse(conversation.venus_pending_course) : null;
  } catch { pendingCourse = null; }

  const STATUTS_ACTIFS = ['livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque', 'pris_en_charge', 'en_livraison', 'arrivee'];

  // ── Mode "contact_livreur" actif → relayer le message au livreur ──
  if (pendingCourse?.contact_livreur_mode === true && pendingCourse?.contact_livreur_course_id) {
    const exitKeywords = ['merci', 'au revoir', 'aurevoir', 'fin', 'annuler', 'quitter', 'stop', 'plus besoin', "c'est bon", 'cest bon', 'terminer', 'c bon', 'cest fini'];
    const msgLower = userMessage.toLowerCase().trim();
    if (exitKeywords.some(kw => msgLower === kw || msgLower.startsWith(kw + ' ') || msgLower.startsWith(kw + '.') || msgLower.startsWith(kw + '!'))) {
      delete pendingCourse.contact_livreur_mode;
      delete pendingCourse.contact_livreur_course_id;
      delete pendingCourse.contact_livreur_livreur_id;
      delete pendingCourse.contact_livreur_livreur_tel;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, {
        venus_pending_course: JSON.stringify(pendingCourse),
      });
      return "D'accord, j'ai mis fin à la conversation avec le livreur. N'hésitez pas si vous avez besoin d'autre chose.";
    }

    const courseId = pendingCourse.contact_livreur_course_id;
    const livreurId = pendingCourse.contact_livreur_livreur_id;
    const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);

    if (!course) {
      delete pendingCourse.contact_livreur_mode;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(pendingCourse) });
      return "Cette course n'est plus disponible. Pour toute question, contactez le support au +226 66 92 51 90.";
    }

    if (!STATUTS_ACTIFS.includes(course.statut)) {
      delete pendingCourse.contact_livreur_mode;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(pendingCourse) });
      const statutLabel = course.statut === 'livree' ? 'livrée' : course.statut === 'annulee' ? 'annulée' : 'terminée';
      return `Votre course est désormais ${statutLabel}. Le contact avec le livreur n'est plus disponible. Merci d'utiliser SILGAPP !`;
    }

    const livreurTel = course.livreur_telephone;
    const livreurNom = course.livreur_nom || 'votre livreur';

    if (!livreurTel) {
      delete pendingCourse.contact_livreur_mode;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(pendingCourse) });
      return "Je ne parviens pas à joindre votre livreur. Pour toute question, contactez le support au +226 66 92 51 90.";
    }

    // 1. Notification BDD + Push pour le livreur
    let pushSent = false;
    try {
      const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId);
      if (livreur?.user_email) {
        await base44.asServiceRole.entities.Notification.create({
          titre: `💬 Message de votre client ${profileName || telephone}`,
          message: userMessage.substring(0, 200),
          type: 'message_client',
          course_id: courseId,
          destinataire_email: livreur.user_email,
          lue: false,
        });
        pushSent = true;
        base44.asServiceRole.functions.invoke('envoiNotificationPush', {
          destinataire_email: livreur.user_email,
          livreur_id: livreurId,
          titre: '💬 Message de votre client',
          message: userMessage.substring(0, 100),
          type: 'message_client',
          course_id: courseId,
        }).catch((err: any) => console.error('[WebhookVenus] ❌ Push livreur:', err.message));
      }
    } catch (e) { console.error('[WebhookVenus] Erreur notif livreur:', e.message); }

    // 2. Envoyer via WhatsApp au livreur
    let whatsappSent = false;
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886';

    if (accountSid && authToken) {
      const INDICATIFS: any = { BF: '+226', CI: '+225', TG: '+228', BJ: '+229', SN: '+221', ML: '+223', GN: '+224', NE: '+227', GH: '+233' };
      const indicatif = INDICATIFS[course.country_code] || '+226';
      let tel = livreurTel.replace(/\s+/g, '').replace(/[^\d+]/g, '');
      if (!tel.startsWith('+')) tel = indicatif + tel;
      try {
        const from = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;
        const creds = btoa(`${accountSid}:${authToken}`);
        const formData = new URLSearchParams();
        formData.append('From', from);
        formData.append('To', `whatsapp:${tel}`);
        formData.append('Body', `💬 *Message de votre client ${profileName || telephone}:*\n\n${userMessage}\n\n_Répondez ici ou dans l'application SILGAPP_`);
        const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        });
        const data = await resp.json();
        whatsappSent = resp.ok && !!data.sid;
      } catch (e) { console.error('[WebhookVenus] Erreur WhatsApp livreur:', e.message); }
    }

    return `✅ Votre message a été transmis au livreur ${livreurNom} :\n\n"${userMessage}"\n\n${whatsappSent ? "Il vous répondra dès que possible via WhatsApp." : pushSent ? "Il a été notifié dans l'application SILGAPP." : "Vous pouvez l'appeler directement."}\n\nÉcrivez un autre message ou dites "fin" pour terminer.`;
  }

  // ── Détection de l'intention "contacter le livreur" ──
  const contactKeywords = [
    'parler au livreur', 'parler a mon livreur', 'parler avec le livreur',
    'contacter le livreur', 'contacter mon livreur', 'contacter livreur',
    'appeler le livreur', 'appeler mon livreur', 'appeler livreur',
    'ecrire au livreur', 'écrire au livreur',
    'envoyer un message au livreur', 'message au livreur',
    'joindre le livreur', 'joindre mon livreur',
    'numero du livreur', 'numéro du livreur', 'numero de mon livreur',
    'telephone du livreur', 'téléphone du livreur', 'tel du livreur',
    'le contact du livreur', 'contact du livreur', 'contact livreur',
    'communiquer avec le livreur',
    'le numero de mon livreur', 'le telephone du livreur',
  ];
  const msgLower = userMessage.toLowerCase();
  const isContactIntent = contactKeywords.some(kw => msgLower.includes(kw));
  if (!isContactIntent) return null;

  // Trouver la course active avec un livreur assigné
  let courses = await base44.asServiceRole.entities.CourseExterne.filter(
    { client_telephone: telephone }, '-created_date', 10
  );
  if (!courses || courses.length === 0) {
    courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { expediteur_telephone: telephone }, '-created_date', 10
    );
  }
  if (!courses || courses.length === 0) {
    const cc = detecterPaysDepuisTelephone(telephone);
    const allRecent = await base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: cc }, '-created_date', 50
    );
    const telDigits = telephone.replace(/\D/g, '');
    courses = allRecent.filter(c => {
      const ct = (c.client_telephone || '').replace(/\D/g, '');
      const et = (c.expediteur_telephone || '').replace(/\D/g, '');
      return ct.endsWith(telDigits.slice(-8)) || et.endsWith(telDigits.slice(-8));
    }).slice(0, 10);
  }

  const courseActive = courses.find(c => STATUTS_ACTIFS.includes(c.statut) && c.livreur_telephone);
  if (!courseActive) {
    return "Je ne trouve pas de course active avec un livreur assigné pour le moment. Si vous souhaitez créer une nouvelle course ou suivre une course, dites-le moi ! Pour toute question, contactez le support au +226 66 92 51 90.";
  }

  // Activer le mode contact_livreur
  pendingCourse = pendingCourse || {};
  pendingCourse.contact_livreur_mode = true;
  pendingCourse.contact_livreur_course_id = courseActive.id;
  pendingCourse.contact_livreur_livreur_id = courseActive.livreur_id;
  pendingCourse.contact_livreur_livreur_tel = courseActive.livreur_telephone;
  await base44.asServiceRole.entities.Conversation.update(conversation.id, {
    venus_pending_course: JSON.stringify(pendingCourse),
  });

  const livreurNom = courseActive.livreur_nom || 'votre livreur';
  const livreurTel = courseActive.livreur_telephone;
  const trackingLink = courseActive.tracking_link || '';

  let response = `🧑‍✈️ Votre livreur : ${livreurNom}\n\n`;
  response += `📞 Pour l'appeler : ${livreurTel}\n\n`;
  response += `Vous pouvez :\n`;
  response += `1. Appeler le livreur au numéro ci-dessus\n`;
  response += `2. Écrire un message ici — je le transmettrai immédiatement au livreur\n`;
  if (trackingLink) {
    response += `3. Suivre la position du livreur : ${trackingLink}\n`;
  }
  response += `\nÉcrivez votre message ou dites "fin" pour terminer.`;
  return response;
}

/**
 * Gestion de l'annulation de course par le client via WhatsApp.
 *
 * Cette fonction est DÉTERMINISTE (0 crédit LLM) et gère deux cas :
 * 1. Le client demande directement l'annulation ("annule", "annuler ma course", etc.)
 * 2. Le client confirme une annulation demandée par VENUS ("oui" après que VENUS a demandé "Tu confirmes l'annulation ?")
 *
 * Séquence obligatoire :
 *   1. Appeler l'API d'annulation (annulerCourseExterne)
 *   2. Vérifier que la DB confirme le statut "annulee"
 *   3. Stopper toutes les notifications liées à la course
 *   4. Seulement après vérification, retourner le message de succès
 *   5. Si échec, retourner un message d'erreur — JAMAIS de faux succès
 */
async function handleAnnulationCourse(base44: any, conversation: any, userMessage: string, telephone: string, profileName: string, countryCode: string): Promise<string | null> {
  const msgLower = userMessage.toLowerCase().trim();

  // ── Mots-clés d'annulation directe (incluant fautes d'orthographe courantes) ──
  const ANNUL_KEYWORDS = [
    'annule', 'annuler', 'annulation', 'annulez',
    'anule', 'anuler', 'anulation', 'anulez', // fautes courantes (un seul 'n')
    'supprime', 'supprimer', 'supprimez',
    'stoppe', 'stopper', 'arrete', 'arrêter', 'arrête',
    'je veux annuler', 'annule la course', 'annule ma course',
    'anule la course', 'anule ma course', // fautes
    'annule cette course', 'anule cette course',
    'plus besoin de la course',
  ];
  // Exclure les négations
  const isNegative = msgLower.includes('ne veux pas') || msgLower.includes('ne pas annuler') || msgLower.includes('garde') || msgLower.includes('annule pas');
  const isDirectAnnulation = !isNegative && ANNUL_KEYWORDS.some(kw => msgLower.includes(kw));

  // ── Détection de confirmation ("oui" après que VENUS a demandé l'annulation) ──
  const CONFIRM_KW = ['oui', 'ok', "d'accord", 'd accord', 'confirme', 'valider', 'valide', 'go', 'ouais', 'volontiers', 'correct', 'daco', 'je confirme'];
  const isConfirmation = msgLower.length <= 30 && CONFIRM_KW.some(kw => msgLower === kw || msgLower.startsWith(kw + ' ') || msgLower.startsWith(kw + '.') || msgLower.startsWith(kw + '!'));

  let shouldCancel = isDirectAnnulation;
  let isConfirmationTrigger = false;

  // Si c'est une confirmation, vérifier que VENUS a demandé une annulation
  if (!shouldCancel && isConfirmation) {
    try {
      const recentMessages = await base44.asServiceRole.entities.Message.filter(
        { conversation_id: conversation.id, sender_type: 'admin', source: 'whatsapp' },
        '-created_date', 3
      ).catch(() => []);
      const lastVenusMsg = (recentMessages?.[0]?.content || '').toLowerCase();
      if (lastVenusMsg.includes('annul')) {
        shouldCancel = true;
        isConfirmationTrigger = true;
        console.log('[WebhookVenus] 🗑️ Confirmation d\'annulation détectée (VENUS avait demandé confirmation)');
      }
    } catch {}
  }

  if (!shouldCancel) return null;

  // ── Trouver la course active ──
  const STATUTS_ACTIFS = ['nouvelle', 'programmee', 'recherche_livreur', 'livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque', 'pris_en_charge', 'en_livraison', 'arrivee'];

  let courses = await base44.asServiceRole.entities.CourseExterne.filter(
    { client_telephone: telephone }, '-created_date', 10
  );
  if (!courses || courses.length === 0) {
    courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { expediteur_telephone: telephone }, '-created_date', 10
    );
  }
  if (!courses || courses.length === 0) {
    const allRecent = await base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: countryCode }, '-created_date', 50
    );
    const telDigits = telephone.replace(/\D/g, '');
    courses = (allRecent || []).filter(c => {
      const ct = (c.client_telephone || '').replace(/\D/g, '');
      const et = (c.expediteur_telephone || '').replace(/\D/g, '');
      return ct.endsWith(telDigits.slice(-8)) || et.endsWith(telDigits.slice(-8));
    }).slice(0, 10);
  }

  const courseActive = courses?.find(c => STATUTS_ACTIFS.includes(c.statut));
  if (!courseActive) {
    // Si déclenché par confirmation (VENUS avait demandé d'annuler) mais aucune course active trouvée,
    // retourner null pour laisser le moteur de raisonnement traiter le "Oui" et créer la nouvelle course.
    // Cela évite la boucle: VENUS dit "course en cours" → client dit "Oui" → "aucune course" → client recommence.
    if (isConfirmationTrigger) {
      console.log('[WebhookVenus] 🗑️ Confirmation d\'annulation mais aucune course active trouvée — passage au moteur de raisonnement');
      return null;
    }
    return "Je ne trouve aucune course active à annuler. Si vous souhaitez créer une nouvelle course, dites-le moi ! Pour toute question, contactez le support au +226 66 92 51 90.";
  }

  // ── Effectuer l'annulation avec vérification DB obligatoire ──
  try {
    console.log(`[WebhookVenus] 🗑️ Annulation demandée pour course ${courseActive.id} (statut actuel: ${courseActive.statut})`);

    // 1. Appeler l'API/backend d'annulation
    await base44.asServiceRole.functions.invoke('annulerCourseExterne', {
      course_id: courseActive.id,
      motif: 'client_change_avis',
      source: 'admin',
    });

    // 2. Vérifier que la DB confirme réellement le statut "annulee"
    const courseVerifiee = await base44.asServiceRole.entities.CourseExterne.get(courseActive.id);

    if (courseVerifiee && courseVerifiee.statut === 'annulee') {
      // 3. Vérifier que la recherche de livreur est arrêtée (dispatch_status = expire)
      // 4. Stopper toutes les notifications liées à cette course
      const notifsActives = await base44.asServiceRole.entities.Notification.filter({
        course_id: courseActive.id, lue: false,
      }).catch(() => []);
      for (const n of notifsActives) {
        await base44.asServiceRole.entities.Notification.update(n.id, { lue: true }).catch(() => null);
      }

      console.log(`[WebhookVenus] ✅ Annulation CONFIRMÉE en DB pour course ${courseActive.id} | dispatch: ${courseVerifiee.dispatch_status} | ${notifsActives.length} notifications stoppées`);

      return `✅ Votre course a été annulée avec succès.\n\n📝 Référence : ${genererReferenceCourse(courseActive)}\n\nSi vous souhaitez créer une nouvelle course, je suis à votre disposition.`;
    } else {
      // L'annulation n'a pas été confirmée en DB — NE JAMAIS annoncer un succès
      console.error(`[WebhookVenus] ❌ Annulation ÉCHOUÉE pour course ${courseActive.id} — statut DB: ${courseVerifiee?.statut || 'introuvable'}`);
      return "⚠️ Je n'ai pas pu annuler votre course. Une erreur technique est survenue. Veuillez réessayer ou contacter le support au +226 66 92 51 90.";
    }
  } catch (e: any) {
    console.error(`[WebhookVenus] ❌ Erreur annulation course ${courseActive.id}:`, e.message);
    return "⚠️ Je n'ai pas pu annuler votre course pour le moment. Veuillez réessayer ou contacter le support au +226 66 92 51 90.";
  }
}

/**
 * Gestion de la réponse du client à une proposition de prix manuel via WhatsApp.
 * - Détecte si le client a une course en attente de validation de prix (manual_price_status = 'pending_client_validation')
 * - Si le client dit "oui" → accepte le prix (dispatchExterneAuto action=valider_prix_manuel accepted=true)
 * - Si le client dit "non" → refuse le prix (dispatchExterneAuto action=valider_prix_manuel accepted=false)
 * - Retourne null si aucune course en attente de validation de prix
 */
async function handlePrixManuelResponse(base44: any, conversation: any, userMessage: string, telephone: string, countryCode: string): Promise<string | null> {
  const msgLower = userMessage.toLowerCase().trim();

  const OUI_KW = ['oui', 'ok', "d'accord", 'd accord', 'confirme', 'valider', 'valide', 'go', 'ouais', 'volontiers', 'accepte', 'accepter', "c'est bon", 'cest bon', 'correct', 'daco', 'je confirme'];
  const NON_KW = ['non', 'refuse', 'refuser', 'je refuse', 'non merci', 'pas ok', 'trop cher', 'c est trop', 'cest trop', 'no'];

  const isOui = msgLower.length <= 30 && OUI_KW.some(kw => msgLower === kw || msgLower.startsWith(kw + ' ') || msgLower.startsWith(kw + '.') || msgLower.startsWith(kw + '!'));
  const isNon = NON_KW.some(kw => msgLower === kw || msgLower.startsWith(kw + ' ') || msgLower.startsWith(kw + '.') || msgLower.startsWith(kw + '!'));
  if (!isOui && !isNon) return null;

  // Vérifier qu'un message VENUS récent mentionne un prix (pour éviter les faux positifs)
  try {
    const recentMessages = await base44.asServiceRole.entities.Message.filter(
      { conversation_id: conversation.id, sender_type: 'admin', source: 'whatsapp' },
      '-created_date', 5
    ).catch(() => []);
    const hasPrixContext = (recentMessages || []).some(m =>
      (m.content || '').toLowerCase().includes('prix') && (m.content || '').toLowerCase().includes('livreur')
    );
    if (!hasPrixContext) return null;
  } catch { return null; }

  // Trouver la course avec manual_price_status = 'pending_client_validation'
  const STATUTS_RECHERCHE = ['recherche_livreur', 'nouvelle'];
  let courses = await base44.asServiceRole.entities.CourseExterne.filter(
    { client_telephone: telephone }, '-created_date', 10
  );
  if (!courses || courses.length === 0) {
    courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { expediteur_telephone: telephone }, '-created_date', 10
    );
  }
  if (!courses || courses.length === 0) {
    const allRecent = await base44.asServiceRole.entities.CourseExterne.filter(
      { country_code: countryCode }, '-created_date', 50
    );
    const telDigits = telephone.replace(/\D/g, '');
    courses = (allRecent || []).filter(c => {
      const ct = (c.client_telephone || '').replace(/\D/g, '');
      const et = (c.expediteur_telephone || '').replace(/\D/g, '');
      return ct.endsWith(telDigits.slice(-8)) || et.endsWith(telDigits.slice(-8));
    }).slice(0, 10);
  }

  const courseEnAttente = courses?.find(c =>
    c.manual_price_status === 'pending_client_validation' &&
    STATUTS_RECHERCHE.includes(c.statut)
  );
  if (!courseEnAttente) return null;

  console.log(`[WebhookVenus] 💰 Réponse prix manuel détectée — course ${courseEnAttente.id} — client dit: ${isOui ? 'OUI' : 'NON'}`);

  try {
    const result = await base44.asServiceRole.functions.invoke('dispatchExterneAuto', {
      action: 'valider_prix_manuel',
      course_id: courseEnAttente.id,
      accepted: isOui,
    });

    if (isOui) {
      const prix = Number(courseEnAttente.manual_price || 0);
      const devise = courseEnAttente.devise || 'FCFA';
      console.log(`[WebhookVenus] 💰 ✅ Prix accepté pour course ${courseEnAttente.id}`);

      // ── Générer le lien de suivi s'il n'existe pas encore ──
      let trackingLink = courseEnAttente.tracking_link || '';
      if (!trackingLink) {
        try {
          const token = crypto.randomUUID();
          trackingLink = `https://silgapp.base44.app/suivi-public/${token}`;
          await base44.asServiceRole.entities.CourseExterne.update(courseEnAttente.id, {
            tracking_token: token, tracking_link: trackingLink, tracking_shared_at: new Date().toISOString(),
          });
        } catch (e) { console.warn(`[WebhookVenus] Generation tracking link échouée:`, e.message); }
      }

      // ── Envoyer le QR Code + PIN via envoyerSuiviWhatsApp ──
      try {
        await base44.asServiceRole.functions.invoke('envoyerSuiviWhatsApp', {
          course_id: courseEnAttente.id, evenement: 'livreur_assigne',
        });
      } catch (e) { console.warn(`[WebhookVenus] Envoi QR/PIN échoué:`, e.message); }

      const pin = courseEnAttente.pickup_code_4_digits || '';
      return `✅ Parfait ! Vous avez accepté le prix de ${prix.toLocaleString()} ${devise}.\n\n🚗 Votre livreur ${courseEnAttente.livreur_nom || ''} est maintenant en route vers le point de récupération.${pin ? `\n\n🔐 Votre code PIN de récupération : ${pin}` : ''}${trackingLink ? `\n\n🔗 Suivez votre livreur en temps réel :\n${trackingLink}` : ''}\n\n📱 Le QR Code de récupération vous a également été envoyé. Ne le partagez qu'au moment de la récupération du colis.`;
    } else {
      console.log(`[WebhookVenus] 💰 ❌ Prix refusé pour course ${courseEnAttente.id} — redispatch`);
      return `D'accord, j'ai bien noté votre refus. Je recherche immédiatement un autre livreur pour votre course. Je vous informerai dès qu'un nouveau livreur aura accepté.`;
    }
  } catch (e: any) {
    console.error(`[WebhookVenus] 💌 Erreur validation prix manuel: ${e.message}`);
    return null;
  }
}

/**
 * Handler: Modification de course (multi-étapes déterministe)
 *
 * États gérés dans venus_pending_course:
 * - modification_mode + attente_valeur: VENUS a demandé la nouvelle valeur
 * - modification_mode + attente_confirmation: VENUS a affiché le récap, attend oui/non
 *
 * Si aucune intention de modification n'est détectée, retourne null (le flux continue).
 */
async function handleModifierCourse(base44, conversation, userMessage, telephone, profileName, countryCode) {
  let pendingCourse: any = null;
  try { pendingCourse = conversation.venus_pending_course ? JSON.parse(conversation.venus_pending_course) : null; } catch { pendingCourse = null; }
  if (!pendingCourse) pendingCourse = {};

  const msgLower = userMessage.toLowerCase().trim();
  const CONFIRM_KW_MOD = ['oui', 'ok', "d'accord", 'd accord', 'je confirme', 'valider', 'confirmer', 'confirme', "c'est bon", 'cest bon', 'go', "c'est ok", 'cest ok', 'parfait', 'exact', 'ouais', 'je valide', 'valide', 'correct', 'daco'];
  const REFUSE_KW_MOD = ['non', 'annuler', 'annule', 'je refuse', 'non merci', 'pas maintenant', 'finalement non', 'laisse tomber'];

  // ── État: attente_confirmation ──
  if (pendingCourse.modification_mode && pendingCourse.modification_statut === 'attente_confirmation') {
    const isRefuse = REFUSE_KW_MOD.some(kw => msgLower === kw || msgLower.startsWith(kw + ' ') || msgLower.startsWith(kw + '!'));
    const isConfirm = !isRefuse && msgLower.length <= 30 && CONFIRM_KW_MOD.some(kw => msgLower.includes(kw));

    if (isRefuse) {
      const cleared = { ...pendingCourse };
      delete cleared.modification_mode;
      delete cleared.modification_statut;
      delete cleared.modification_champ;
      delete cleared.modification_ancienne_valeur;
      delete cleared.modification_nouvelle_valeur;
      delete cleared.modification_recap_presente;
      delete cleared.modification_course_id;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, {
        venus_pending_course: JSON.stringify(cleared),
      });
      return "D'accord, modification annulée. N'hésitez pas si vous avez besoin d'autre chose.";
    }

    if (isConfirm) {
      const champ = pendingCourse.modification_champ;
      const courseId = pendingCourse.modification_course_id;
      const newValue = pendingCourse.modification_nouvelle_valeur;
      const champLabel = getChampLabel(champ);

      const result = await appliquerModification(base44, {
        course_id: courseId,
        modifications: { [champ]: newValue },
        auteur: telephone,
        canal: 'whatsapp',
      });

      // Nettoyer l'état de modification
      const cleared = { ...pendingCourse };
      delete cleared.modification_mode;
      delete cleared.modification_statut;
      delete cleared.modification_champ;
      delete cleared.modification_ancienne_valeur;
      delete cleared.modification_nouvelle_valeur;
      delete cleared.modification_recap_presente;
      delete cleared.modification_course_id;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, {
        venus_pending_course: JSON.stringify(cleared),
      });

      if (result.success && result.changes?.length > 0 && result.changes[0].verifie) {
        const change = result.changes[0];
        let msg = `✅ Modification appliquée avec succès !\n\n${champLabel} :\n  Avant : ${change.ancienne_valeur || 'N/A'}\n  Après : ${change.valeur_reelle || 'N/A'}\n\nLa modification a bien été enregistrée dans le système.`;
        if (result.livreur_notifie) msg += '\n\n📢 Le livreur a été informé de cette modification.';
        if (result.prix_recalcule) msg += '\n💰 Le tarif a été recalculé en fonction de la nouvelle adresse.';
        return msg;
      } else {
        const errMsg = result.errors?.[0]?.error || 'Une erreur est survenue.';
        return `❌ La modification n'a pas pu être appliquée. ${errMsg} Veuillez réessayer ou contacter le support au +226 66 92 51 90.`;
      }
    }

    // Pas une confirmation/refus → le client change d'avis ou donne une autre valeur
    // On reprend le flux depuis le début
  }

  // ── État: attente_valeur ──
  if (pendingCourse.modification_mode && pendingCourse.modification_statut === 'attente_valeur') {
    const newValue = userMessage.trim();
    if (newValue.length < 2) {
      return `Je n'ai pas bien compris la nouvelle valeur. Pouvez-vous reformuler ? (ou répondez "annuler" pour abandonner)`;
    }

    const champ = pendingCourse.modification_champ;
    const ancienneValeur = pendingCourse.modification_ancienne_valeur;
    const champLabel = getChampLabel(champ);

    // Vérifier que le champ est toujours modifiable (la course a pu changer de statut)
    const course = await base44.asServiceRole.entities.CourseExterne.get(pendingCourse.modification_course_id);
    if (!course) {
      const cleared = { ...pendingCourse };
      delete cleared.modification_mode;
      delete cleared.modification_statut;
      delete cleared.modification_champ;
      delete cleared.modification_ancienne_valeur;
      delete cleared.modification_nouvelle_valeur;
      delete cleared.modification_recap_presente;
      delete cleared.modification_course_id;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(cleared) });
      return "Cette course n'existe plus. La modification ne peut pas être appliquée.";
    }

    if (STATUTS_NON_MODIFIABLES.includes(course.statut)) {
      const cleared = { ...pendingCourse };
      delete cleared.modification_mode;
      delete cleared.modification_statut;
      delete cleared.modification_champ;
      delete cleared.modification_ancienne_valeur;
      delete cleared.modification_nouvelle_valeur;
      delete cleared.modification_recap_presente;
      delete cleared.modification_course_id;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(cleared) });
      return `Cette course est maintenant au statut "${course.statut}" et ne peut plus être modifiée.`;
    }

    pendingCourse.modification_nouvelle_valeur = newValue;
    pendingCourse.modification_statut = 'attente_confirmation';
    pendingCourse.modification_recap_presente = true;
    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      venus_pending_course: JSON.stringify(pendingCourse),
    });

    return genererRecapModification(champ, ancienneValeur, newValue);
  }

  // ── État initial: détection d'intention de modification ──
  const isModificationIntent = detecterIntentionModification(userMessage);
  if (!isModificationIntent) return null;

  // Trouver la course active
  const courseActive = await trouverCourseActive(base44, telephone, countryCode);
  if (!courseActive) {
    return "Je ne trouve pas de course active à modifier. Si vous souhaitez créer une nouvelle course, dites-le moi simplement.";
  }

  // Vérifier le statut
  if (STATUTS_NON_MODIFIABLES.includes(courseActive.statut)) {
    return `Cette course est au statut "${courseActive.statut}" et ne peut plus être modifiée. Si vous avez un problème avec cette course, n'hésitez pas à le décrire et je transmettrai à un responsable.`;
  }

  // Extraire le champ et la valeur via LLM
  const extraction = await extraireChampEtValeur(base44, userMessage, courseActive);

  // Vérifier que le champ extrait est modifiable
  if (extraction.champ) {
    const allowed = getChampsModifiables(courseActive.statut);
    if (!allowed.includes(extraction.champ)) {
      return `Désolé, le champ "${getChampLabel(extraction.champ)}" ne peut plus être modifié à ce stade de la course (statut: ${courseActive.statut}). Les champs encore modifiables sont : ${allowed.map(c => getChampLabel(c)).join(', ')}.`;
    }
  }

  // Si le champ et la valeur sont trouvés → afficher le récap
  if (extraction.champ && extraction.valeur) {
    pendingCourse.modification_mode = true;
    pendingCourse.modification_course_id = courseActive.id;
    pendingCourse.modification_statut = 'attente_confirmation';
    pendingCourse.modification_champ = extraction.champ;
    pendingCourse.modification_ancienne_valeur = courseActive[extraction.champ] || 'N/A';
    pendingCourse.modification_nouvelle_valeur = extraction.valeur;
    pendingCourse.modification_recap_presente = true;
    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      venus_pending_course: JSON.stringify(pendingCourse),
    });

    return genererRecapModification(extraction.champ, courseActive[extraction.champ], extraction.valeur);
  }

  // Si le champ est trouvé mais pas la valeur → demander la valeur
  if (extraction.champ && !extraction.valeur) {
    pendingCourse.modification_mode = true;
    pendingCourse.modification_course_id = courseActive.id;
    pendingCourse.modification_statut = 'attente_valeur';
    pendingCourse.modification_champ = extraction.champ;
    pendingCourse.modification_ancienne_valeur = courseActive[extraction.champ] || 'N/A';
    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      venus_pending_course: JSON.stringify(pendingCourse),
    });

    return `Vous souhaitez modifier : ${getChampLabel(extraction.champ)}.\n\nActuellement : ${courseActive[extraction.champ] || 'N/A'}\n\nQuelle est la nouvelle valeur ? (ou répondez "annuler" pour abandonner)`;
  }

  // Si aucun champ identifié → demander de clarifier
  if (extraction.question) {
    return extraction.question;
  }

  return "Que souhaitez-vous modifier sur votre course ? (adresse de récupération, adresse de livraison, destinataire, instructions, etc.)";
}

Deno.serve(async (req) => {
  let typingInterval: any = null;
  try {
    const base44 = createClientFromRequest(req);

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');

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
    const toRaw = params.To || '';
    const body = params.Body || '';
    const messageSid = params.MessageSid || '';
    const profileName = params.ProfileName || '';
    const numMedia = parseInt(params.NumMedia || '0', 10);
    const latitude = params.Latitude ? parseFloat(params.Latitude) : null;
    const longitude = params.Longitude ? parseFloat(params.Longitude) : null;

    // ── Dual-number: utiliser le numéro To (celui qui a reçu le message) comme From pour la réponse.
    //    Si le message arrive sur +22655483838 (VENUS), la réponse partira depuis +22655483838.
    //    Sinon, fallback sur TWILIO_WHATSAPP_FROM ou le sandbox.
    const fromNumber = toRaw
      ? (toRaw.startsWith('whatsapp:') ? toRaw : `whatsapp:${toRaw}`)
      : (Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886');

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
    // telephone = format Twilio brut (+226XXXXXXXX) — utilisé pour les appels API Twilio
    // normalizedTel = format canonique DB (226XXXXXXXX sans +) — utilisé pour tout stockage DB
    const telephone = from.replace('whatsapp:', '');
    const countryCode = detecterPaysDepuisTelephone(telephone);
    const tarifs = TARIFS_PAYS[countryCode] || TARIFS_PAYS.BF;
    const normalizedTel = normalizePhone(telephone, countryCode) || telephone.replace(/\D/g, '');

    console.log(`[WebhookVenus] 📥 ÉTAPE 1 — Message reçu de ${telephone} (${profileName || 'N/A'}) | To: ${toRaw || 'N/A'} | Pays: ${countryCode} | Body: "${body}" | Media: ${numMedia} | GPS: ${latitude},${longitude} | Sid: ${messageSid} | FromNumber(réponse): ${fromNumber}`);

    // ── Détection: le sender est-il un livreur répondant à un client ? ──
    // Si le client est en mode "contact_livreur", relaye la réponse du livreur au client
    const telLast8 = telephone.replace(/\D/g, '').slice(-8);
    if (telLast8.length >= 8 && body) {
      try {
        const STATUTS_ACTIFS_LIVREUR = ['livreur_en_route', 'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque', 'pris_en_charge', 'en_livraison', 'arrivee'];
        const recentCourses = await base44.asServiceRole.entities.CourseExterne.filter(
          { country_code: countryCode }, '-created_date', 30
        );
        const livreurCourse = recentCourses.find(c =>
          STATUTS_ACTIFS_LIVREUR.includes(c.statut) &&
          c.livreur_telephone &&
          (c.livreur_telephone || '').replace(/\D/g, '').endsWith(telLast8)
        );
        if (livreurCourse && livreurCourse.client_telephone) {
          // Vérifier que le client est en mode contact_livreur
          const clientConvs = await base44.asServiceRole.entities.Conversation.filter({
            whatsapp_phone: normalizePhone(livreurCourse.client_telephone, countryCode) || livreurCourse.client_telephone,
          });
          const clientConv = clientConvs?.[0];
          let clientPending: any = null;
          try { clientPending = clientConv?.venus_pending_course ? JSON.parse(clientConv.venus_pending_course) : null; } catch {}
          if (clientPending?.contact_livreur_mode === true) {
            console.log(`[WebhookVenus] 🧑‍✈️ Livreur ${livreurCourse.livreur_nom || ''} répond au client ${livreurCourse.client_telephone} — relayage`);
            const lAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
            const lAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
            const lFromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886';
            if (lAccountSid && lAuthToken) {
              const from = lFromNumber.startsWith('whatsapp:') ? lFromNumber : `whatsapp:${lFromNumber}`;
              const creds = btoa(`${lAccountSid}:${lAuthToken}`);
              const formData = new URLSearchParams();
              formData.append('From', from);
              formData.append('To', `whatsapp:+${(livreurCourse.client_telephone || '').replace(/\D/g, '')}`);
              formData.append('Body', `💬 *Réponse de votre livreur ${livreurCourse.livreur_nom || ''}:*\n\n${body}`);
              await fetch(`https://api.twilio.com/2010-04-01/Accounts/${lAccountSid}/Messages.json`, {
                method: 'POST',
                headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString(),
              });
            }
            return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
              status: 200,
              headers: { 'Content-Type': 'text/xml' },
            });
          }
        }
      } catch (e) {
        console.error('[WebhookVenus] Erreur détection livreur sender:', e.message);
      }
    }

    // ── 1. Trouver ou créer la Conversation ──
    // Recherche multi-format : le numéro peut être stocké au format canonique (226XXXXXXXX)
    // ou au format legacy (+226XXXXXXXX). On cherche aussi par derniers chiffres pour
    // les données mal formées, afin d'éviter de créer des conversations en double.
    let conversation: any = null;
    let existingConvs = await base44.asServiceRole.entities.Conversation.filter({
      whatsapp_phone: normalizedTel,
    });

    // Fallback: format legacy avec +
    if (!existingConvs || existingConvs.length === 0) {
      existingConvs = await base44.asServiceRole.entities.Conversation.filter({
        whatsapp_phone: `+${normalizedTel}`,
      });
    }

    // Fallback: chercher par derniers chiffres (données mal formées)
    if (!existingConvs || existingConvs.length === 0) {
      const last8 = normalizedTel.slice(-8);
      if (last8.length >= 8) {
        const allWaConvs = await base44.asServiceRole.entities.Conversation.filter(
          { source: 'whatsapp' }, '-last_message_date', 200
        );
        existingConvs = (allWaConvs || []).filter(c => {
          const cd = (c.whatsapp_phone || '').replace(/\D/g, '');
          return cd.endsWith(last8);
        });
      }
    }

    if (existingConvs && existingConvs.length > 0) {
      conversation = existingConvs[0];
      // Normaliser le whatsapp_phone au format canonique si nécessaire
      if (conversation.whatsapp_phone !== normalizedTel) {
        console.log(`[WebhookVenus] 🔧 Normalisation whatsapp_phone: "${conversation.whatsapp_phone}" → "${normalizedTel}"`);
        await base44.asServiceRole.entities.Conversation.update(conversation.id, {
          whatsapp_phone: normalizedTel,
        }).catch(() => null);
        conversation.whatsapp_phone = normalizedTel;
      }
      // Mettre à jour silgapp_from_number si nécessaire (dual-number)
      if (fromNumber && conversation.silgapp_from_number !== fromNumber) {
        await base44.asServiceRole.entities.Conversation.update(conversation.id, {
          silgapp_from_number: fromNumber,
        }).catch(() => null);
        conversation.silgapp_from_number = fromNumber;
      }
      console.log(`[WebhookVenus] ✅ ÉTAPE 2 — Conversation existante trouvée: ${conversation.id} | venus_active: ${conversation.venus_active} | from_number: ${fromNumber}`);
    } else {
      const participants = JSON.stringify([
        { type: 'client', id: normalizedTel, name: profileName || telephone },
        { type: 'admin', id: 'all', name: 'Admin SILGAPP' },
      ]);
      conversation = await base44.asServiceRole.entities.Conversation.create({
        participants,
        title: profileName || telephone,
        whatsapp_phone: normalizedTel,
        silgapp_from_number: fromNumber,
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
      console.log(`[WebhookVenus] 📎 Média détecté | NumMedia: ${numMedia} | MediaUrl0: ${mediaUrl0?.substring(0, 80) || 'N/A'}... | ContentType0: ${contentType0}`);
      const uploadedUrl = await downloadAndUploadMedia(mediaUrl0, accountSid, authToken, base44, contentType0);

      if (contentType0.startsWith('image/')) {
        messageType = 'photo';
        photoUrl = uploadedUrl;
      } else if (contentType0.startsWith('video/')) {
        messageType = 'video';
        videoUrl = uploadedUrl;
      } else if (contentType0.startsWith('audio/')) {
        messageType = 'audio';
        audioUrl = uploadedUrl;
        // ── Règle stricte: les messages vocaux ne sont plus transcrits ni interprétés ──
        // L'audio est conservé dans la conversation mais VENUS répond avec un message standard
        console.log(`[WebhookVenus] 🎤 Note vocale reçue de ${telephone} — non transcrite (règle stricte), réponse standard à venir`);
      } else {
        messageType = 'document';
        documentUrl = uploadedUrl;
      }
      if (!messageContent) messageContent = `[${messageType}]`;
    }

    await base44.asServiceRole.entities.Message.create({
      conversation_id: conversation.id,
      sender_type: 'client',
      sender_id: normalizedTel,
      sender_name: profileName || telephone,
      message_type: messageType,
      content: messageContent,
      photo_url: photoUrl,
      audio_url: audioUrl,
      transcription: transcriptionData?.texte || '',
      transcription_brute: transcriptionData?.texte_brut || '',
      transcription_confidence: transcriptionData?.confidence || 0,
      transcription_status: transcriptionData?.status || (messageType === 'audio' ? 'non_transcrit' : undefined),
      transcription_raisons: transcriptionData?.raisons ? JSON.stringify(transcriptionData.raisons) : '',
      transcription_methode: transcriptionData?.methode || 'aucune',
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

    // ── Indicateur de saisie WhatsApp + confirmation de lecture ──
    // Envoie l'indicateur officiel Twilio qui marque le message comme lu
    // et affiche "SILGAPP NOTIFICATIONS est en train d'écrire..." pendant 25s.
    // Renouvelé toutes les 20s si le traitement est long (LLM, RAG, création de course).
    // L'indicateur disparaît automatiquement dès que la réponse est livrée.
    let typingStartTime = 0;
    if (messageSid) {
      await envoyerIndicateurSaisie(messageSid, accountSid, authToken);
      typingStartTime = Date.now();
      typingInterval = setInterval(() => {
        envoyerIndicateurSaisie(messageSid, accountSid, authToken).catch(() => {});
      }, 20000);
    }

    // ── 3b. Règle stricte: les messages vocaux reçoivent une réponse standard ──
    let reponseVenus = '';
    if (messageType === 'audio') {
      reponseVenus = "Désolée, mon système de compréhension des messages vocaux n'est pas encore suffisamment fiable. Merci de m'écrire votre demande par message texte afin que je puisse vous aider correctement.";
      console.log(`[WebhookVenus] 🎤 Réponse standard envoyée pour message vocal de ${telephone}`);
    }

    // ── 3c. Vérifier le mode maintenance VENUS ──
    const maintenanceMode = await getMaintenanceMode(base44);
    if (maintenanceMode.active) {
      const maintenanceMessage = maintenanceMode.message || "Certaines fonctionnalités sont momentanément indisponibles. Nous revenons très vite !";
      reponseVenus = `Bonjour${profileName ? ' ' + profileName : ''} ! ${maintenanceMessage}\n\nPour toute urgence, contactez le support au +226 66 92 51 90.`;
      console.log(`[WebhookVenus] 🔧 Mode maintenance actif — réponse de maintenance envoyée à ${telephone}`);
    }

    // ── 4a. MOTEUR DE WORKFLOWS — Vérifier s'il y a un workflow actif ──
    // Si un workflow est en cours pour cette conversation, le moteur prend le relais
    // de manière DÉTERMINISTE (sans IA). VENUS a décidé de lancer le workflow,
    // maintenant le moteur exécute les étapes.
    if (!reponseVenus) {
      try {
        const workflowActive = await getExecutionActive(base44, conversation.id);
        if (workflowActive) {
          console.log(`[WebhookVenus] 🔄 Workflow actif: ${workflowActive.workflow_code} (étape: ${workflowActive.etape_actuelle}) — routage vers le moteur`);
          const wfResult = await repondreWorkflow(base44, workflowActive.id, body || messageContent, {
            telephone,
            profileName,
            countryCode,
            tarifs,
            conversation_id: conversation.id,
          });
          if (wfResult.reponse) {
            reponseVenus = wfResult.reponse;
            console.log(`[WebhookVenus] ✅ Workflow a répondu (${reponseVenus.length} chars)`);
          }
          if (wfResult.termine) {
            console.log(`[WebhookVenus] ✅ Workflow terminé pour ${telephone}`);
          }
        }
      } catch (e) {
        console.error('[WebhookVenus] Erreur workflow engine:', e.message);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CHAÎNE DE TRAITEMENT AUDIO — Phase préproduction
    // 1. Transcription Whisper (déjà faite ci-dessus)
    // 2. Nettoyage (déjà fait dans transcrireAudio)
    // 3. Évaluation de la confiance (déjà faite)
    // 4. Gating : bloquer si confiance trop faible, forcer confirmation sinon
    // 5. Passer le texte nettoyé à VENUS avec flag force_confirmation
    // ═══════════════════════════════════════════════════════════════
    let messageEffectif = messageContent || body;
    let clientAEnvoyeAudio = false;
    let isAudioTranscription = false;
    let forceConfirmationAudio = false;

    if (!reponseVenus && messageType === 'audio') {
      clientAEnvoyeAudio = true;

      if (transcriptionData?.status === 'echec' || !transcriptionData?.texte || transcriptionData?.confidence < 0.5) {
        // ── Confiance trop faible ou échec → demander de répéter ──
        reponseVenus = genererMessageRepetitionAudio();
        console.warn(`[WebhookVenus] 🎤 ⚠️ Audio rejeté (confiance: ${transcriptionData?.confidence || 0}) — demande de répétition`);

      } else {
        // ── Transcription utilisable → nettoyer et passer à VENUS ──
        messageEffectif = transcriptionData.texte;
        isAudioTranscription = true;

        // ── Évaluer si on peut agir ou si on doit forcer la confirmation ──
        const gating = peutAgirSurAudio(transcriptionData.confidence);
        forceConfirmationAudio = gating.forceConfirmation;

        console.log(`[WebhookVenus] 🎤 ✅ Audio accepté | Confiance: ${transcriptionData.confidence.toFixed(2)} | Force confirmation: ${forceConfirmationAudio} | Texte: "${messageEffectif.substring(0, 100)}"`);
        console.log(`[WebhookVenus] 🎤 📊 Brut: "${(transcriptionData.texte_brut || '').substring(0, 80)}" → Nettoyé: "${messageEffectif.substring(0, 80)}"`);
      }
    }

    // ── Décision de redispatch (livreur a annulé, Venus demande si client veut un autre) ──
    if (!reponseVenus) {
      const redispatchResponse = await handleRedispatchDecision(base44, conversation, messageEffectif);
      if (redispatchResponse) {
        reponseVenus = redispatchResponse;
      }
    }

    // ── Annulation de course (bypass déterministe — 0 crédit LLM) ──
    // Détecte les demandes d'annulation directes ET les confirmations après question VENUS.
    // Effectue l'annulation avec vérification DB obligatoire avant d'annoncer le succès.
    if (!reponseVenus) {
      const annulResponse = await handleAnnulationCourse(base44, conversation, messageEffectif, telephone, profileName, countryCode);
      if (annulResponse) {
        reponseVenus = annulResponse;
      }
    }

    // ── Réponse à une proposition de prix manuel (oui/non après message prix) ──
    if (!reponseVenus) {
      const prixResponse = await handlePrixManuelResponse(base44, conversation, messageEffectif, telephone, countryCode);
      if (prixResponse) {
        reponseVenus = prixResponse;
      }
    }

    // ── Contact livreur : détection d'intention ou relayage de message ──
    if (!reponseVenus) {
      const contactResponse = await handleContactLivreur(base44, conversation, messageEffectif, telephone, profileName);
      if (contactResponse) {
        reponseVenus = contactResponse;
      }
    }

    // ── Modification de course (multi-étapes déterministe) ──
    if (!reponseVenus) {
      const modResponse = await handleModifierCourse(base44, conversation, messageEffectif, telephone, profileName, countryCode);
      if (modResponse) {
        reponseVenus = modResponse;
      }
    }

    // ── Gestion de l'assignation de localisation (avant tout autre flow) ──
    // Si une localisation est en attente et le client indique "recuperation" ou "livraison",
    // assigner la localisation au bon champ de maniere permanente
    if (!reponseVenus && latitude === null) {
      const locResponse = await handleLocationAssignment(base44, conversation, messageEffectif);
      if (locResponse) {
        reponseVenus = locResponse;
      }
    }

    // ── Sauvegarder la localisation GPS dans la mémoire courte ──
    if (!reponseVenus && latitude !== null && longitude !== null) {
      let pendingCourseLoc: any = null;
      try { pendingCourseLoc = conversation.venus_pending_course ? JSON.parse(conversation.venus_pending_course) : {}; } catch { pendingCourseLoc = {}; }
      pendingCourseLoc.pending_location_lat = latitude;
      pendingCourseLoc.pending_location_lng = longitude;
      await base44.asServiceRole.entities.Conversation.update(conversation.id, {
        venus_pending_course: JSON.stringify(pendingCourseLoc),
      });
      console.log(`[WebhookVenus] 📍 Localisation sauvegardée en attente d'assignation pour ${conversation.id}`);
      // ── Mettre à jour la variable locale pour que le moteur de raisonnement voie la localisation ──
      conversation.venus_pending_course = JSON.stringify(pendingCourseLoc);
    }

    // ── Détection d'incidents (avant le moteur de raisonnement) ──
    // Détecte les situations critiques (accident, panne, colis perdu, etc.)
    // et les escalade vers l'administrateur avec un message rassurant au client.
    if (!reponseVenus) {
      try {
        const courseActiveIncident = await trouverCourseActive(base44, telephone, countryCode);
        const incidentResult = await detecterEtTraiterIncident(base44, {
          message: messageEffectif,
          telephone,
          profileName,
          countryCode,
          conversation_id: conversation.id,
          courseActive: courseActiveIncident,
        });
        if (incidentResult) {
          reponseVenus = incidentResult.message_client;
          console.log(`[WebhookVenus] 🚨 Incident détecté: ${incidentResult.incident?.type_incident} (${incidentResult.incident?.niveau_gravite}) — admin notifié`);
        }
      } catch (e) {
        console.error('[WebhookVenus] Erreur détection incident:', e.message);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // MOTEUR DE RAISONNEMENT ET DE MÉMOIRE VENUS
    // ═══════════════════════════════════════════════════════════════
    let reasoningResult: any = null;

    if (!reponseVenus) {
      // ── Charger la mémoire courte ──
      let pendingCourse: any = null;
      try { pendingCourse = conversation.venus_pending_course ? JSON.parse(conversation.venus_pending_course) : null; } catch { pendingCourse = null; }

      // ── Détection: demande de NOUVELLE course → vider la mémoire stale ──
      // Si le client dit "nouvelle course", "créons une course", "je veux une autre course"
      // ET qu'une course a déjà été créée/cancelée (course_created=true), on vide la mémoire
      // courte pour forcer VENUS à re-collecter les informations depuis zéro.
      // Cela évite de réutiliser les adresses d'une course précédente terminée.
      if (pendingCourse?.course_created) {
        const NEW_COURSE_KW = [
          'nouvelle course', 'creons une course', 'créons une course',
          'creer une course', 'créer une course', 'je veux une course',
          'je voudrais une course', 'je veux une autre course',
          'je voudrais une autre course', 'une autre course', 'nouveau colis',
          'nouvel envoi', 'nouvelle livraison', 'encore une course',
          'je veux envoyer un colis', 'je voudrais envoyer un colis',
          'je veux envoyer un autre', 'je voudrais envoyer un autre',
          'je voudrais un livreur', 'je veux un livreur',
        ];
        const msgLowerNC = messageEffectif.toLowerCase().trim();
        const isNewCourseRequest = NEW_COURSE_KW.some(kw => msgLowerNC.includes(kw));
        if (isNewCourseRequest) {
          console.log(`[WebhookVenus] 🔄 Demande de nouvelle course détectée — vidage de la mémoire courte stale`);
          pendingCourse = {};
          await base44.asServiceRole.entities.Conversation.update(conversation.id, {
            venus_pending_course: JSON.stringify(pendingCourse),
          });
        }
      }

      // ── Bypass déterministe: ABANDON de la création en cours ──
      // Si le client dit "laisse tomber", "oublie", "plus besoin" etc.,
      // on vide la mémoire courte immédiatement pour stopper la relance automatique.
      const ABANDON_KW = [
        'laisse tomber', 'laissez tomber', 'on laisse tomber',
        'oublie', 'oubliez', 'oublions', "j'oublie",
        'plus besoin', 'plus la peine', 'plus maintenant',
        'je ne veux plus', 'je veux plus', 'abandonne', 'abandonner',
        'tant pis', 'laisse couler', 'oublie ça', 'oublie ca',
        'non on laisse', 'non laisse', 'non oublie',
        'non rien', 'laisse faire', 'plus rien',
        'je change d avis', "je change d'avais",
      ];
      const msgLowerAbandon = messageEffectif.toLowerCase().trim();
      const isAbandonMsg = msgLowerAbandon.length <= 60 && ABANDON_KW.some(kw => msgLowerAbandon.includes(kw));
      const hasPendingNotCreated = pendingCourse && Object.keys(pendingCourse).length > 0 && !pendingCourse.course_created;

      if (isAbandonMsg && hasPendingNotCreated) {
        console.log(`[WebhookVenus] 🗑️ Abandon détecté — vidage mémoire courte (stop relance)`);
        pendingCourse = {};
        await base44.asServiceRole.entities.Conversation.update(conversation.id, {
          venus_pending_course: JSON.stringify(pendingCourse),
        });
        reponseVenus = `Entendu — je laisse tomber la création de la livraison. Aucune course n'a été créée. Si tu veux la relancer plus tard, dis-le-moi et je m'en occupe. Besoin d'autre chose ? Pour assistance, tu peux appeler le support au +226 66 92 51 90.`;
      }

      // ── Bypass déterministe: confirmation anti-boucle ──
      const CONFIRM_KW_BYPASS = ['oui','ok',"d'accord",'d accord','je confirme','valider','confirmer','confirme',"c'est bon",'cest bon','go',"c'est ok",'cest ok','parfait','exact','certainement','bien sur','ouais','volontiers','je valide','valide','correct','daco'];
      const msgLowerBypass = messageEffectif.toLowerCase().trim();
      const isConfBypass = msgLowerBypass.length <= 25 && CONFIRM_KW_BYPASS.some(kw => msgLowerBypass.includes(kw));
      const resumeBypass = pendingCourse?.all_info_collected === true && !pendingCourse?.course_created;

      // ── Vérifier que TOUTES les infos requises sont présentes avant le bypass ──
      // Empêche la création quand le LLM a marqué all_info_collected=true prématurément
      // (ex: VENUS demandait encore le numéro du destinataire)
      const hasTypeBypass = !!pendingCourse?.type_course;
      const hasDepartBypass = pendingCourse?.adresse_depart || pendingCourse?.gps_depart_lat != null;
      const hasArriveeBypass = pendingCourse?.adresse_arrivee || pendingCourse?.gps_arrivee_lat != null;
      const hasContactBypass = pendingCourse?.contact_telephone || pendingCourse?.contact_is_client;
      const allRequiredPresent = hasTypeBypass && hasDepartBypass && hasArriveeBypass && hasContactBypass;

      // ── Vérifier le dernier message VENUS — s'il posait une question, ne pas bypass ──
      let venusWasAskingQuestion = false;
      if (resumeBypass && isConfBypass) {
        try {
          const lastVenusMsgs = await base44.asServiceRole.entities.Message.filter(
            { conversation_id: conversation.id, sender_type: 'admin', source: 'whatsapp' },
            '-created_date', 1
          ).catch(() => []);
          const lastVenusContent = lastVenusMsgs?.[0]?.content || '';
          venusWasAskingQuestion = lastVenusContent.includes('?') ||
            /peux-tu|pouvez-vous|quel est|quelle est|donnez|indiquez|precisez|j'ai besoin/i.test(lastVenusContent);
          if (venusWasAskingQuestion) {
            console.log(`[WebhookVenus] ⚠️ Bypass annulé — VENUS posait une question ("${lastVenusContent.substring(0, 60)}...")`);
          }
        } catch {}
      }

      if (resumeBypass && isConfBypass && allRequiredPresent && !venusWasAskingQuestion) {
        console.log(`[WebhookVenus] ✅ Confirmation déterministe — création directe (bypass LLM)`);
        const cr = await creerCourseDepuisMemoire(base44, pendingCourse, countryCode, tarifs, telephone, profileName, conversation.silgapp_from_number);
        if (cr.success) {
          reponseVenus = cr.message;
          pendingCourse.course_created = true;
          pendingCourse.course_id = cr.course.id;
          await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(pendingCourse) });
          const ltmBP = await chargerMemoireLongue(base44, telephone, countryCode);
          if (ltmBP) {
            await mettreAJourMemoireLongue(base44, ltmBP.id, {
              adresse_recuperee: pendingCourse.adresse_depart, adresse_livraison: pendingCourse.adresse_arrivee,
              destinataire_nom: pendingCourse.contact_nom, destinataire_telephone: pendingCourse.contact_telephone,
              type_course_prefere: pendingCourse.type_course, client_nom: profileName,
              increment_courses: true,
            });
          }
        }
      }

      if (!reponseVenus) {
        // ── Charger la mémoire longue, l'historique, la course active en PARALLÈLE ──
        const tCtxStart = Date.now();
        const [memoireLongue, historiqueRecent, courseActive] = await Promise.all([
          chargerMemoireLongue(base44, telephone, countryCode),
          chargerHistoriqueRecent(base44, conversation.id, 6),
          trouverCourseActive(base44, telephone, countryCode),
        ]);
        console.log(`[WebhookVenus] ⏱️ Contexte chargé en parallèle: ${Date.now() - tCtxStart}ms`);

        // ── Appeler le moteur de raisonnement ──
        reasoningResult = await raisonnerVenus(base44, {
          messageClient: messageEffectif,
          memoireCourte: pendingCourse || {},
          memoireLongue, historiqueRecent, courseActive,
          countryCode, tarifs, telephone, profileName, isAudioTranscription,
          force_confirmation: forceConfirmationAudio,
        });

        // ── Exécuter l'action choisie ──
        let reponseFinale = reasoningResult.reponse;
        let courseCreee = false;

        if (reasoningResult.action === 'creer_course') {
          const um = { ...(pendingCourse || {}), ...reasoningResult.memoire_courte_update };
          um.all_info_collected = true; um.user_confirmed = true;
          const cr2 = await creerCourseDepuisMemoire(base44, um, countryCode, tarifs, telephone, profileName, conversation.silgapp_from_number);
          if (cr2.success) {
            reponseFinale = cr2.message;
            courseCreee = true;
            um.course_created = true; um.course_id = cr2.course.id;
            pendingCourse = um;
            await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(um) });
            if (memoireLongue) {
              await mettreAJourMemoireLongue(base44, memoireLongue.id, {
                adresse_recuperee: um.adresse_depart, adresse_livraison: um.adresse_arrivee,
                destinataire_nom: um.contact_nom, destinataire_telephone: um.contact_telephone,
                type_course_prefere: um.type_course, client_nom: profileName,
                increment_courses: true,
                ...reasoningResult.memoire_longue_update,
              });
            }
          } else if (cr2.message) { reponseFinale = cr2.message; }
        } else if (reasoningResult.action === 'suivre_course') {
          reponseFinale = await handleConsultationCourse(base44, telephone, messageEffectif, profileName);
        } else if (reasoningResult.action === 'contacter_livreur') {
          reponseFinale = await handleContactLivreur(base44, conversation, messageEffectif, telephone, profileName);
        } else if (reasoningResult.action === 'annuler_course') {
          // ── ANNULATION AVEC VÉRIFICATION DB OBLIGATOIRE ──
          // VENUS ne doit JAMAIS annoncer un succès d'annulation sans vérification DB.
          if (!courseActive) {
            reponseFinale = "Je ne trouve aucune course active à annuler. Si vous souhaitez créer une nouvelle course, dites-le moi ! Pour toute question, contactez le support au +226 66 92 51 90.";
          } else {
            try {
              console.log(`[WebhookVenus] 🗑️ Annulation demandée pour course ${courseActive.id} (statut actuel: ${courseActive.statut})`);
              // 1. Appeler l'API/backend d'annulation
              await base44.asServiceRole.functions.invoke('annulerCourseExterne', {
                course_id: courseActive.id,
                motif: 'client_change_avis',
                source: 'admin',
              });
              // 2. Vérifier que la DB confirme réellement le statut "annulee"
              const courseVerifiee = await base44.asServiceRole.entities.CourseExterne.get(courseActive.id);
              if (courseVerifiee && courseVerifiee.statut === 'annulee') {
                // 3. Vérifier que la recherche de livreur est arrêtée (dispatch_status expire)
                // 4. Stopper toutes les notifications liées à cette course
                const notifsActives = await base44.asServiceRole.entities.Notification.filter({
                  course_id: courseActive.id, lue: false,
                }).catch(() => []);
                for (const n of notifsActives) {
                  await base44.asServiceRole.entities.Notification.update(n.id, { lue: true }).catch(() => null);
                }
                console.log(`[WebhookVenus] ✅ Annulation CONFIRMÉE en DB pour course ${courseActive.id} | dispatch: ${courseVerifiee.dispatch_status} | ${notifsActives.length} notifications stoppées`);
                reponseFinale = `✅ Votre course a été annulée avec succès.\n\n📝 Référence : ${genererReferenceCourse(courseActive)}\n\nSi vous souhaitez créer une nouvelle course, je suis à votre disposition.`;
              } else {
                // L'annulation n'a pas été confirmée en DB — NE JAMAIS annoncer un succès
                console.error(`[WebhookVenus] ❌ Annulation ÉCHOUÉE pour course ${courseActive.id} — statut DB: ${courseVerifiee?.statut || 'introuvable'}`);
                reponseFinale = "⚠️ Je n'ai pas pu annuler votre course. Une erreur technique est survenue. Veuillez réessayer ou contacter le support au +226 66 92 51 90.";
              }
            } catch (e) {
              console.error(`[WebhookVenus] ❌ Erreur annulation course ${courseActive.id}:`, e.message);
              reponseFinale = "⚠️ Je n'ai pas pu annuler votre course pour le moment. Veuillez réessayer ou contacter le support au +226 66 92 51 90.";
            }
          }
        }

        // ═══════════════════════════════════════════════════════════════
        // DÉTECTION DE FAUSSE CRÉATION DE COURSE (anti-hallucination)
        // ═══════════════════════════════════════════════════════════════
        // Si VENUS dit "je lance la recherche" dans sa réponse mais qu'aucune
        // course n'a réellement été créée (action ≠ creer_course ou création échouée),
        // forcer la création de manière DÉTERMINISTE.
        // Cela empêche VENUS d'annoncer un faux succès au client.
        if (!courseCreee) {
          const PATTERNS_RECHERCHE = [
            /je lance la recherche/i,
            /la recherche est (bien )?en cours/i,
            /je recherche (maintenant )?un livreur/i,
            /recherche d'un livreur/i,
            /je .* recherche.* livreur/i,
            /livreur est en cours de recherche/i,
            /je lance .* recherche/i,
            /recherche .* lanc/i,
          ];
          const ditRechercheLancee = PATTERNS_RECHERCHE.some(p => p.test(reponseFinale));
          if (ditRechercheLancee) {
            console.warn(`[WebhookVenus] ⚠️ FAUSSE CRÉATION — VENUS dit "recherche lancée" mais action=${reasoningResult.action} — création forcée déterministe`);
            const umFb = { ...(pendingCourse || {}), ...reasoningResult.memoire_courte_update };
            // Si le contact destinataire est manquant, utiliser le client comme contact par défaut
            // Le livreur collectera les informations réelles du destinataire plus tard
            if (!umFb.contact_telephone && !umFb.contact_is_client) {
              umFb.contact_is_client = true;
            }
            umFb.all_info_collected = true;
            umFb.user_confirmed = true;
            const crFb = await creerCourseDepuisMemoire(base44, umFb, countryCode, tarifs, telephone, profileName);
            if (crFb.success) {
              reponseFinale = crFb.message;
              courseCreee = true;
              umFb.course_created = true;
              umFb.course_id = crFb.course.id;
              pendingCourse = umFb;
              await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(umFb) });
              if (memoireLongue) {
                await mettreAJourMemoireLongue(base44, memoireLongue.id, {
                  adresse_recuperee: umFb.adresse_depart, adresse_livraison: umFb.adresse_arrivee,
                  destinataire_nom: umFb.contact_nom, destinataire_telephone: umFb.contact_telephone,
                  type_course_prefere: umFb.type_course, client_nom: profileName,
                  increment_courses: true,
                  ...reasoningResult.memoire_longue_update,
                });
              }
              console.log(`[WebhookVenus] ✅ Course créée DÉTERMINISTEMENT (fallback anti-faux-succès) — ${crFb.course.id}`);
            } else if (crFb.error === 'MISSING_INFO' || crFb.error === 'MISSING_TYPE') {
              // Informations réellement manquantes — remplacer la réponse trompeuse
              console.warn(`[WebhookVenus] ⚠️ Fallback échoué (${crFb.error}) — remplacement de la réponse trompeuse`);
              reponseFinale = "Je n'ai pas encore toutes les informations nécessaires pour créer votre course. Pouvez-vous préciser le type de course (envoyer un colis, recevoir un colis, ou se déplacer), le lieu de départ et le lieu de livraison ?";
            }
          }
        }

        reponseVenus = reponseFinale;

        // ── Mettre à jour la mémoire courte ──
        if (reasoningResult.memoire_courte_update && Object.keys(reasoningResult.memoire_courte_update).length > 0) {
          const up = { ...(pendingCourse || {}), ...reasoningResult.memoire_courte_update };
          await base44.asServiceRole.entities.Conversation.update(conversation.id, { venus_pending_course: JSON.stringify(up) });
        }

        // ── Mettre à jour la mémoire longue ──
        if (memoireLongue && reasoningResult.memoire_longue_update && Object.keys(reasoningResult.memoire_longue_update).length > 0) {
          await mettreAJourMemoireLongue(base44, memoireLongue.id, reasoningResult.memoire_longue_update);
        }

        // ── Journaliser le raisonnement ──
        await loggerRaisonnement(base44, {
          conversation_id: conversation.id, client_telephone: telephone, client_nom: profileName,
          message_recu: body || `[${messageType}]`, result: reasoningResult,
          memoire_courte_snapshot: pendingCourse || {}, memoire_longue_id: memoireLongue?.id,
          reponse_envoyee: reponseVenus,
        });
      }
    }

    // ── Audit: logger le message pour le tableau de bord OpenAI ──
    const _metaLog: any = reasoningResult || {};
    const _modelForCost = _metaLog._model_openai || '';
    const _tokensPrompt = _metaLog._tokens_prompt || 0;
    const _tokensCompletion = _metaLog._tokens_completion || 0;
    const _coutUsd = _modelForCost ? calculateCost(_modelForCost, _tokensPrompt, _tokensCompletion) : 0;
    const _tokensTotal = _metaLog._tokens_openai || 0;
    loggerMessageVenus(base44, {
      telephone,
      conversation_id: conversation.id,
      message_client: (messageEffectif || body || '').substring(0, 2000),
      decision_moteur: reasoningResult?.decision_moteur || 'regle_metier',
      openai_appele: reasoningResult?.openai_appele ?? false,
      model_utilise: reasoningResult?.model_utilise || '',
      rag_documents: reasoningResult?.document_sources,
      outils_utilises: reasoningResult?.outils_utilises,
      temps_reponse_ms: reasoningResult?.temps_traitement_ms || 0,
      cout_usd: _coutUsd,
      tokens_total: _tokensTotal,
      reponse_envoyee: (reponseVenus || '').substring(0, 2000),
      intention: reasoningResult?.intention,
      action: reasoningResult?.action,
      confiance: reasoningResult?.confiance,
      statut: reasoningResult?.decision_moteur === 'erreur' ? 'erreur' : 'succes',
    }).catch(() => {});

    // ── Mode apprentissage: générer un exemple d'apprentissage (fire-and-forget) ──
    // GPT comprend et enseigne. L'administrateur valide. VENUS observe et apprend.
    if (reasoningResult && reponseVenus) {
      genererExempleApprentissage(base44, {
        conversation_id: conversation.id,
        telephone,
        message_client: messageEffectif || body || '',
        reponse_envoyee: reponseVenus,
        reasoningResult,
        model_used: reasoningResult?.model_utilise || '',
        tokens_total: _tokensTotal,
        cost_usd: _coutUsd,
        country_code: countryCode,
        profileName,
      }).catch(() => {});
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

    // ── Arrêter le renouvellement de l'indicateur de saisie + timeout d'attente ──
    // L'indicateur disparaît automatiquement dès que la réponse est livrée.
    if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }

    // ── Garantir un délai minimum (2.5s) entre l'indicateur de saisie et la réponse ──
    // Sans ce délai, le traitement étant trop rapide (salutations cachées, etc.),
    // l'indicateur "en train d'écrire..." disparaît avant que l'utilisateur ne le voie.
    if (typingStartTime > 0) {
      const elapsed = Date.now() - typingStartTime;
      const MIN_TYPING_DISPLAY_MS = 2500;
      if (elapsed < MIN_TYPING_DISPLAY_MS) {
        const waitMs = MIN_TYPING_DISPLAY_MS - elapsed;
        console.log(`[WebhookVenus] ⌨️ Attente ${waitMs}ms pour visibilité indicateur de saisie (écoulé: ${elapsed}ms)`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }

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

    // ── 7. Log VenusInteraction (avec Centre d'Apprentissage) ──
    const conversationIdLog = `wa_${telephone.replace(/[^0-9]/g, '')}`;
    try {
      await base44.asServiceRole.entities.VenusInteraction.create({
        conversation_id: conversationIdLog,
        question: body || `[${messageType}]`,
        reponse: reponseVenus,
        country_code: countryCode,
        user_type: 'client',
        date_conversation: new Date().toISOString().split('T')[0],
        statut: reasoningResult ? (reasoningResult.confiance < SEUIL_CONFIANCE ? 'non_resolu' : 'resolu') : 'resolu',
        satisfaction: reasoningResult ? (reasoningResult.confiance < SEUIL_CONFIANCE ? 'negative' : (reasoningResult.knowledge_id ? 'positive' : 'neutre')) : 'neutre',
        duree_secondes: reasoningResult ? Math.round(reasoningResult.temps_traitement_ms / 1000) : 0,
        intention: reasoningResult?.intention || undefined,
        knowledge_id: reasoningResult?.knowledge_id || undefined,
        confidence_score: reasoningResult?.confiance || undefined,
        temps_recherche_ms: reasoningResult?.temps_traitement_ms || undefined,
      });
    } catch (logErr) {
      console.error('[WebhookVenus] Erreur logging VenusInteraction:', logErr.message);
    }

    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    if (typingInterval) { clearInterval(typingInterval); }
    console.error(`[WebhookVenus] ❌ ERREUR GLOBALE: ${error.message}`);
    console.error(`[WebhookVenus] ❌ Stack: ${error.stack?.substring(0, 300)}`);

    // ── Envoyer un vrai message d'erreur au client (jamais un faux succès) ──
    try {
      const eAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const eAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const eFromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886';
      let eTelephone = '';
      try {
        const eBody = await req.clone().text();
        const eParams = Object.fromEntries(new URLSearchParams(eBody));
        eTelephone = (eParams.From || '').replace('whatsapp:', '');
      } catch {}
      if (eAccountSid && eAuthToken && eTelephone) {
        await envoyerWhatsAppReply(
          eTelephone,
          "⚠️ Une erreur technique est survenue lors du traitement de votre demande. Veuillez réessayer dans quelques instants. Si le problème persiste, contactez le support au +226 66 92 51 90.",
          eAccountSid, eAuthToken, eFromNumber
        ).catch(() => {});
      }
    } catch {}

    return Response.json({ error: error.message }, { status: 500 });
  }
});