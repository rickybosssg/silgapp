import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  VENUS_SYSTEM_PROMPT,
  VENUS_GREETING_WHATSAPP,
  TARIFS_PAYS,
  detecterPaysDepuisTelephone,
} from '../../shared/venusPrompt.ts';
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

    // ── Appeler la transcription Whisper ──
    console.log(`[WebhookVenus] 🎤 ÉTAPE C2 — Appel Core.TranscribeAudio (Whisper)...`);
    let result: any;
    let texteBrut = '';
    let usedFallback = false;

    try {
      result = await base44.asServiceRole.integrations.Core.TranscribeAudio({ audio_url: audioUrl });
      const tempsMs = Date.now() - startTime;
      console.log(`[WebhookVenus] 🎤 ÉTAPE C2 — TranscribeAudio terminé en ${tempsMs}ms`);
      console.log(`[WebhookVenus] 🎤   Type de réponse: ${typeof result}`);
      console.log(`[WebhookVenus] 🎤   Clés de réponse: ${result && typeof result === 'object' ? Object.keys(result).join(', ') : 'N/A'}`);

      texteBrut = typeof result === 'string' ? result : (result?.text || result?.transcript || '');
      console.log(`[WebhookVenus] 🎤   Transcription brute: "${(texteBrut || '').substring(0, 200)}"`);
      console.log(`[WebhookVenus] 🎤   Longueur: ${texteBrut?.length || 0} caractères`);
    } catch (transcribeErr) {
      console.error(`[WebhookVenus] 🎤 ❌ ÉTAPE C2 — TranscribeAudio a échoué: ${transcribeErr.message}`);
      console.error(`[WebhookVenus] 🎤   Nom erreur: ${transcribeErr.name}`);
    }

    // ── Fallback: si Whisper échoue ou retourne vide, utiliser InvokeLLM avec file_urls ──
    if (!texteBrut || texteBrut.trim().length < 2) {
      console.warn(`[WebhookVenus] 🎤 ⚠️ ÉTAPE C2b — Whisper vide/échec — fallback InvokeLLM (gemini_3_flash)...`);
      try {
        const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Tu es un expert en transcription audio. Transcris ce message vocal en français. Le texte peut contenir des noms de quartiers de Ouagadougou (Karpala, Pissy, Tampouy, Ouaga 2000, Zone du Bois, Patte d'Oie, Gounghin, Dassasgho, Cissin, Samandin, Wemtenga, Bendogo, Larle, Somgande, Saaba, Tanghin, Kossodo), des numéros de téléphone, ou des demandes de livraison. Réponds UNIQUEMENT avec le texte transcrit, sans commentaire. Si l'audio est inaudible, réponds "INAUDIBLE".`,
          file_urls: [audioUrl],
          model: 'gemini_3_flash',
        });
        const fallbackText = typeof llmResult === 'string' ? llmResult : (llmResult?.response || llmResult?.text || '');
        console.log(`[WebhookVenus] 🎤 ÉTAPE C2b — Fallback LLM terminé | Texte: "${(fallbackText || '').substring(0, 200)}"`);
        if (fallbackText && fallbackText.trim().length >= 2 && !fallbackText.toUpperCase().includes('INAUDIBLE')) {
          texteBrut = fallbackText.trim();
          usedFallback = true;
        }
      } catch (fallbackErr) {
        console.error(`[WebhookVenus] 🎤 ❌ ÉTAPE C2b — Fallback LLM aussi échoué: ${fallbackErr.message}`);
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
      methode: usedFallback ? 'llm_fallback' : 'whisper',
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

async function handleCourseFlow(base44, conversation, userMessage, countryCode, tarifs, telephone, profileName, isAudioTranscription = false) {
  let pendingCourse: any = null;
  try {
    pendingCourse = conversation.venus_pending_course ? JSON.parse(conversation.venus_pending_course) : null;
  } catch { pendingCourse = null; }

  const courseContext = pendingCourse ? JSON.stringify(pendingCourse, null, 2) : 'Aucune course en cours';

  // ── Détection déterministe de confirmation (anti-boucle) ──
  // Si le récapitulatif a déjà été présenté (all_info_collected = true) et que
  // le client répond par une confirmation, créer la course SANS appeler le LLM.
  const CONFIRM_KEYWORDS = [
    'oui', 'ok', "d'accord", 'd accord', 'je confirme', 'valider', 'confirmer',
    'confirme', "c'est bon", 'cest bon', 'go', "c'est ok", 'cest ok', 'parfait',
    'pas de probleme', 'exact', 'certainement', 'bien sur', 'ouais', 'volontiers',
    'je valide', 'valide', 'oui je confirme', 'tout est bon', 'correct', 'daco',
  ];
  const REFUSE_KEYWORDS = ['non', 'annuler', 'annule', 'je refuse', 'non merci', 'pas maintenant', 'je ne confirme pas'];

  function normalizeTypeCourse(type) {
    if (!type) return null;
    const t = type.toLowerCase().trim();
    if (['expedier', 'recevoir', 'deplacement'].includes(t)) return t;
    if (t.includes('expedi') || t.includes('envoi') || t.includes('envoyer')) return 'expedier';
    if (t.includes('recev') || t.includes('reception')) return 'recevoir';
    if (t.includes('deplac') || t.includes('trajet') || t.includes('transport person')) return 'deplacement';
    if (t.includes('livraison') || t.includes('colis')) return 'expedier';
    return null;
  }

  const msgLowerConfirm = userMessage.toLowerCase().trim();
  const isRefusal = REFUSE_KEYWORDS.some(kw => msgLowerConfirm === kw || msgLowerConfirm.startsWith(kw + ' ') || msgLowerConfirm.startsWith(kw + '.') || msgLowerConfirm.startsWith(kw + '!'));
  const isConfirmation = !isRefusal && msgLowerConfirm.length <= 25 && CONFIRM_KEYWORDS.some(kw => msgLowerConfirm.includes(kw));
  const resumePresented = pendingCourse?.all_info_collected === true && !pendingCourse?.course_created;
  let bypassResult: any = null;
  if (resumePresented && isConfirmation) {
    bypassResult = { is_course_request: true, course_data: {}, all_info_collected: true, user_confirmed: true, is_cancellation: false, response: '' };
    console.log(`[WebhookVenus] ✅ Confirmation déterministe détectée ("${userMessage}") — création directe (bypass LLM)`);
  } else if (resumePresented && isRefusal && !isConfirmation) {
    console.log(`[WebhookVenus] ❌ Refus déterministe détecté ("${userMessage}") — annulation`);
    return { response: "Aucun problème, j'annule cette demande. N'hésitez pas à me solliciter si vous avez besoin d'autre chose.", pendingCourse: null, courseCreated: false };
  }

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

6b. ANTI-BOUCLE CRITIQUE: Si all_info_collected est deja vrai dans la course en cours (le resume a DEJA ete presente) et que le client repond par une confirmation (oui, ok, d'accord, je confirme, valider, confirmer, etc.), mets user_confirmed a true IMMEDIATEMENT. Ne repete JAMAIS le resume. Ne repose JAMAIS une question deja validee. Une etape validee ne doit jamais etre reposee au client.

7. Si ce n'est pas une demande de course, mets is_course_request a false et reponds normalement.

8. Garde les champs deja collectes dans course_data (ne les perds pas).

9. Ta response doit etre en texte plain, sans markdown, concise et chaleureuse.
10. Si gps_depart_lat est defini dans course_data, le lieu de depart est DEJA CONNU (GPS partage). Ne JAMAIS le redemander. Considere adresse_depart comme valide.
11. Si gps_arrivee_lat est defini dans course_data, le lieu d'arrivee est DEJA CONNU (GPS partage). Ne JAMAIS le redemander. Considere adresse_arrivee comme valide.
12. Si pending_location_lat est defini, une localisation est en attente d'assignation. Ne pas la traiter comme une adresse — l'assignation est geree hors LLM.
13. Si adresse_depart est "Localisation GPS partagee", c'est une adresse VALIDE (GPS). Ne pas la redemander ni la traiter comme manquante. Idem pour adresse_arrivee.

Reponds UNIQUEMENT avec un JSON:`;

  let result: any;
  if (bypassResult) {
    result = bypassResult;
  } else {
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
    result = typeof llmRes === 'string' ? JSON.parse(llmRes) : llmRes;
  }

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

  // Preserver les champs GPS et adresses assignees par localisation
  // (le LLM ne doit pas ecraser les donnees GPS deja validees par le client)
  if (pendingCourse?.gps_depart_lat != null) {
    updatedCourse.gps_depart_lat = pendingCourse.gps_depart_lat;
    updatedCourse.gps_depart_lng = pendingCourse.gps_depart_lng;
    if (!updatedCourse.adresse_depart) updatedCourse.adresse_depart = pendingCourse.adresse_depart;
  }
  if (pendingCourse?.gps_arrivee_lat != null) {
    updatedCourse.gps_arrivee_lat = pendingCourse.gps_arrivee_lat;
    updatedCourse.gps_arrivee_lng = pendingCourse.gps_arrivee_lng;
    if (!updatedCourse.adresse_arrivee) updatedCourse.adresse_arrivee = pendingCourse.adresse_arrivee;
  }
  if (pendingCourse?.pending_location_lat != null) {
    updatedCourse.pending_location_lat = pendingCourse.pending_location_lat;
    updatedCourse.pending_location_lng = pendingCourse.pending_location_lng;
  }

  // ── Persister all_info_collected dans le pending course (anti-boucle) ──
  // Marque que le récapitulatif a été présenté — la prochaine confirmation
  // du client créera la course sans repasser par le LLM
  if (result.all_info_collected) {
    updatedCourse.all_info_collected = true;
  }

  // ── Normaliser type_course en valeurs d'enum valides ──
  const normalizedType = normalizeTypeCourse(updatedCourse.type_course);
  if (normalizedType) {
    updatedCourse.type_course = normalizedType;
  }

  // Verifier si on peut creer la course
  // Conditions: type_course + adresse_depart + adresse_arrivee + (contact_telephone OU contact_is_client)
  // Le nom du destinataire est FACULTATIF et ne bloque jamais la creation
  const hasRequiredContact = updatedCourse.contact_telephone || updatedCourse.contact_is_client;
  const hasDepart = updatedCourse.adresse_depart || updatedCourse.gps_depart_lat != null;
  const hasArrivee = updatedCourse.adresse_arrivee || updatedCourse.gps_arrivee_lat != null;
  if (result.all_info_collected && result.user_confirmed && updatedCourse.type_course && hasDepart && hasArrivee && hasRequiredContact) {
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
      dispatch_status: 'en_attente',
      notes: cd.notes || '',
      gps_depart_lat: cd.gps_depart_lat,
      gps_depart_lng: cd.gps_depart_lng,
      gps_arrivee_lat: cd.gps_arrivee_lat,
      gps_arrivee_lng: cd.gps_arrivee_lng,
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
      result.response = `Votre course a ete creee avec succes dans SILGAPP !

Type: ${typeLabel}
De: ${cd.adresse_depart || 'Localisation GPS'}
Vers: ${cd.adresse_arrivee || 'Localisation GPS'}

Je recherche maintenant un livreur disponible. Je vous informerai des qu'un livreur aura accepte votre demande. Le livreur vous contactera ensuite pour confirmer les derniers details et le cout de la livraison.`;

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

  // ── Fallback: si bypass mais création impossible (infos incomplètes) ──
  if (bypassResult) {
    delete updatedCourse.all_info_collected;
    return {
      response: 'Je n\'ai pas toutes les informations necessaires pour creer votre course. Pouvez-vous reformuler votre demande en precisant le type (envoyer un colis, recevoir un colis, ou se deplacer), le lieu de depart et le lieu de livraison ?',
      pendingCourse: updatedCourse,
      courseCreated: false,
    };
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
            whatsapp_phone: livreurCourse.client_telephone,
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
              formData.append('To', `whatsapp:${livreurCourse.client_telephone}`);
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
        if (!audioUrl) {
          console.error('[WebhookVenus] 🎤 ❌ Upload du fichier audio échoué — tentative de fallback direct avec URL Twilio');
          // ── Fallback: essayer de transcrire directement depuis l'URL Twilio ──
          transcriptionData = await transcrireAudioDepuisTwilio(base44, mediaUrl0, accountSid, authToken, contentType0);
        } else {
          // 🎤 Phase 16 — Transcrire la note vocale immédiatement
          transcriptionData = await transcrireAudio(base44, uploadedUrl, contentType0);
        }
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

    // ── 3b. Vérifier le mode maintenance VENUS ──
    let reponseVenus = '';
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
    let messageEffectif = body;
    let clientAEnvoyeAudio = false;
    let isAudioTranscription = false;
    let forceConfirmationAudio = false;

    if (messageType === 'audio') {
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

        console.log(`[WebhookVenus] 🎤 ✅ Audio accepté | Confiance: ${transcriptionData.confiance.toFixed(2)} | Force confirmation: ${forceConfirmationAudio} | Texte: "${messageEffectif.substring(0, 100)}"`);
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

    // ── Contact livreur : détection d'intention ou relayage de message ──
    if (!reponseVenus) {
      const contactResponse = await handleContactLivreur(base44, conversation, messageEffectif, telephone, profileName);
      if (contactResponse) {
        reponseVenus = contactResponse;
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
    }

    // ═══════════════════════════════════════════════════════════════
    // MOTEUR DE RAISONNEMENT ET DE MÉMOIRE VENUS
    // ═══════════════════════════════════════════════════════════════
    let reasoningResult: any = null;

    if (!reponseVenus) {
      // ── Charger la mémoire courte ──
      let pendingCourse: any = null;
      try { pendingCourse = conversation.venus_pending_course ? JSON.parse(conversation.venus_pending_course) : null; } catch { pendingCourse = null; }

      // ── Bypass déterministe: confirmation anti-boucle ──
      const CONFIRM_KW_BYPASS = ['oui','ok',"d'accord",'d accord','je confirme','valider','confirmer','confirme',"c'est bon",'cest bon','go',"c'est ok",'cest ok','parfait','exact','certainement','bien sur','ouais','volontiers','je valide','valide','correct','daco'];
      const msgLowerBypass = messageEffectif.toLowerCase().trim();
      const isConfBypass = msgLowerBypass.length <= 25 && CONFIRM_KW_BYPASS.some(kw => msgLowerBypass.includes(kw));
      const resumeBypass = pendingCourse?.all_info_collected === true && !pendingCourse?.course_created;

      if (resumeBypass && isConfBypass) {
        console.log(`[WebhookVenus] ✅ Confirmation déterministe — création directe (bypass LLM)`);
        const cr = await creerCourseDepuisMemoire(base44, pendingCourse, countryCode, tarifs, telephone, profileName);
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
        // ── Charger la mémoire longue, l'historique, la course active ──
        const memoireLongue = await chargerMemoireLongue(base44, telephone, countryCode);
        const historiqueRecent = await chargerHistoriqueRecent(base44, conversation.id, 6);
        const courseActive = await trouverCourseActive(base44, telephone, countryCode);

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

        if (reasoningResult.action === 'creer_course') {
          const um = { ...(pendingCourse || {}), ...reasoningResult.memoire_courte_update };
          um.all_info_collected = true; um.user_confirmed = true;
          const cr2 = await creerCourseDepuisMemoire(base44, um, countryCode, tarifs, telephone, profileName);
          if (cr2.success) {
            reponseFinale = cr2.message;
            um.course_created = true; um.course_id = cr2.course.id;
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
    console.error(`[WebhookVenus] ❌ ERREUR GLOBALE: ${error.message}`);
    console.error(`[WebhookVenus] ❌ Stack: ${error.stack?.substring(0, 300)}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});