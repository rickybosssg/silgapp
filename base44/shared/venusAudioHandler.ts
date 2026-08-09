// ── Gestion audio VENUS : transcription, TTS, configuration ──────────────────
// Extrait de webhookWhatsAppVenus — aucune logique métier modifiée.

import {
  nettoyerTranscription,
  evaluerConfianceTranscription,
} from './venusAudioEngine.ts';
import { TWILIO_API_BASE } from './venusTwilioUtils.ts';
import { invokeLLMTracked } from './integrationCreditTracker.ts';

export async function transcrireAudio(base44, audioUrl, mediaContentType = '') {
  const startTime = Date.now();
  try {
    console.log(`[WebhookVenus] 🎤 ÉTAPE C — Début transcription audio`);
    console.log(`[WebhookVenus] 🎤   URL audio: ${audioUrl?.substring(0, 100) || 'N/A'}...`);
    console.log(`[WebhookVenus] 🎤   Format d'origine (Twilio): ${mediaContentType || 'inconnu'}`);

    if (!audioUrl) {
      console.error('[WebhookVenus] 🎤 ❌ ÉTAPE C — Aucune URL audio à transcrire');
      return { texte: '', texte_brut: '', confidence: 0, status: 'echec', raisons: ['URL audio manquante'] };
    }

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

    console.log(`[WebhookVenus] 🎤 ÉTAPE C2 — Appel InvokeLLM (Gemini Flash) pour transcription française...`);
    let texteBrut = '';
    let usedFallback = false;

    try {
      const llmResult = await invokeLLMTracked(base44, {
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

    const texteNettoye = nettoyerTranscription(texteBrut);
    console.log(`[WebhookVenus] 🎤 ÉTAPE C3 — Transcription nettoyée: "${texteNettoye.substring(0, 200)}"`);

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

export async function transcrireAudioDepuisTwilio(base44, twilioMediaUrl, accountSid, authToken, mediaContentType) {
  console.log(`[WebhookVenus] 🎤 ÉTAPE D — Fallback: transcription directe depuis URL Twilio`);

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

    let extension = 'ogg';
    if (blobType.includes('mp3') || blobType.includes('mpeg')) extension = 'mp3';
    else if (blobType.includes('wav')) extension = 'wav';
    else if (blobType.includes('m4a') || blobType.includes('mp4')) extension = 'm4a';

    const fileName = `whatsapp_audio_${Date.now()}.${extension}`;
    const file = new File([blob], fileName, { type: blobType });

    const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file });
    if (!uploadResult?.file_url) {
      console.error('[WebhookVenus] 🎤 ❌ ÉTAPE D — Upload fallback échoué');
      return { texte: '', texte_brut: '', confidence: 0, status: 'echec', raisons: ['Upload fallback échoué'] };
    }

    console.log(`[WebhookVenus] 🎤 ✅ ÉTAPE D — Upload réussi, transcription en cours...`);
    return await transcrireAudio(base44, uploadResult.file_url, blobType);
  } catch (e) {
    console.error(`[WebhookVenus] 🎤 ❌ ÉTAPE D — Erreur fallback: ${e.message}`);
    return { texte: '', texte_brut: '', confidence: 0, status: 'echec', raisons: [`Erreur fallback: ${e.message}`] };
  }
}

const AUDIO_CACHE = { data: null, expires: 0 };

export async function chargerConfigAudio(base44) {
  if (AUDIO_CACHE.data && Date.now() < AUDIO_CACHE.expires) return AUDIO_CACHE.data;
  const defaults = {
    audio_response_enabled: false,
    audio_response_voice: 'honey',
    audio_response_language: 'fr',
    audio_only_on_voice_input: true,
    audio_max_duration_chars: 500,
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

export function devraitRepondreEnAudio(reponseTexte, clientAEnvoyeAudio, config) {
  if (!config.audio_response_enabled) return false;
  if (config.audio_only_on_voice_input && !clientAEnvoyeAudio) return false;
  if (reponseTexte.length > config.audio_max_duration_chars) return false;
  const patternsSensibles = [
    /https?:\/\//i,
    /QR/i,
    /#[A-Z0-9]{4,}/,
    /\d{4,}\s*FCFA/i,
    /\n.*\n.*\n.*\n/,
  ];
  if (patternsSensibles.some(p => p.test(reponseTexte))) return false;
  return true;
}

export async function envoyerReponseAudio(base44, telephone, texte, config, accountSid, authToken, fromNumber) {
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