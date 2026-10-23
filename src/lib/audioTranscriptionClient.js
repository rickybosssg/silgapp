import { AUDIO_EXTENSIONS, audioMime, safeAudioCode, safeDiagnosticId, unwrapAudioResponse } from '../../base44/shared/audioContract.js';
import { EXPRESS_PROFILE_MESSAGES } from '../../base44/shared/expressClientContext.js';

const messages = {
  ...EXPRESS_PROFILE_MESSAGES,
  FORBIDDEN: 'Votre profil client ou son pays ne permet pas encore la transcription. Vérifiez votre profil.',
  AUDIO_SIZE: 'Audio vide ou trop volumineux (5 Mo maximum). Enregistrez une phrase courte.',
  AUDIO_FORMAT: 'Format audio non reconnu. Vous pouvez saisir les trois champs.',
  DISABLED: 'La transcription est désactivée. La saisie manuelle reste disponible.',
  NOT_PROVISIONED: 'Configuration de transcription indisponible. Utilisez la saisie manuelle.',
  PROVIDER_NOT_CONFIGURED: 'Le moteur enregistré est indisponible. Aucun autre moteur ne sera utilisé.',
  PROVIDER_QUOTA: 'Le moteur de transcription a atteint sa limite. Utilisez la saisie manuelle.',
  NO_SPEECH: 'Aucune parole reconnue. Réenregistrez ou saisissez les informations manquantes.',
  UPLOAD_FAILED: 'Le transfert audio a échoué. Vérifiez le réseau ; aucun nouvel envoi automatique.',
  SIGNED_URL_FAILED: 'Le moteur ne peut pas accéder au fichier audio. Utilisez la saisie manuelle.',
  PRIVATE_UPLOAD_RESPONSE: 'Le transfert audio n’a pas été confirmé. Utilisez la saisie manuelle.',
  SIGNED_URL_RESPONSE: 'Le lien audio retourné est invalide. Utilisez la saisie manuelle.',
  PROVIDER_ERROR: 'Le moteur enregistré a refusé la transcription. Utilisez la saisie manuelle.',
  PROVIDER_RESPONSE: 'Le moteur enregistré n’a pas retourné le texte attendu. Utilisez la saisie manuelle.',
  NETWORK_ERROR: 'Connexion interrompue. Le résultat audio est incertain ; aucun nouvel envoi automatique.',
  TIMEOUT_OUTCOME_UNKNOWN: 'Le moteur n’a pas répondu à temps. Le traitement peut avoir été facturé ; aucun nouvel envoi automatique.',
  TRANSCRIPTION_FAILED_OUTCOME_UNKNOWN: 'La transcription a échoué, sans résultat confirmé. Aucun nouvel envoi automatique.',
  ALREADY_ATTEMPTED: 'Cet enregistrement a déjà été envoyé. Aucun nouvel envoi automatique.',
  BUSY_OR_ALREADY_ATTEMPTED: 'La transcription est occupée ou cet audio a déjà été envoyé. Utilisez la saisie manuelle.',
};
export function transcriptionError(error, requestId) {
  const body = unwrapAudioResponse(error?.response) || error;
  const fallback = error?.response?.status === 401 ? 'AUTH_REQUIRED' : error?.response?.status === 403 ? 'FORBIDDEN' : 'NETWORK_ERROR';
  const code = safeAudioCode(body?.erreur, fallback);
  const id = safeDiagnosticId(body?.diagnostic_id) || safeDiagnosticId(requestId);
  return new Error(`${messages[code] || 'Transcription indisponible. Utilisez la saisie manuelle.'}${id ? ` Référence : ${id}.` : ''}`);
}

// Stable APK contract; server alone selects providers. Nothing calls on import.
// Each deliberate new recording gets a new request; the same blob cannot be resent.
export function createRecordingTranscriber(api, clientContext = {}) {
  const attempts = new WeakMap();
  return (blob, options) => {
    let attempt = attempts.get(blob);
    if (!attempt) {
      attempt = createAudioTranscriber(api, { consent: true, clientContext: options?.clientContext || clientContext });
      attempts.set(blob, attempt);
    }
    return attempt(blob, options);
  };
}

// Available only when the deployed capability explicitly announces the action.
// One interpretation attempt per deliberate audio result, never auto-retried.
export function createExpressInterpreter(api) {
  return async (text, { previous, requested, clientContext, signal }) => {
    if (signal?.aborted) throw Error('Annulé.');
    const requestId = crypto.randomUUID();
    let timer;
    try {
      const response = await Promise.race([
        api.functions.invoke('audioTranscription', { action: 'interpret', request_id: requestId, text, previous, requested, client_profile_id: clientContext.id, country_code: clientContext.country_code }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Interprétation non confirmée.')), 35000); }),
      ]);
      if (signal?.aborted) throw Error('Annulé.');
      const body = unwrapAudioResponse(response);
      if (body?.erreur || !body?.fields || ['depart', 'arrivee', 'prix'].some(key => typeof body.fields[key] !== 'string')) throw Error('Interprétation indisponible.');
      return body.fields;
    } finally { clearTimeout(timer); }
  };
}
export function createAudioTranscriber(api, { requestId = crypto.randomUUID(), consent = false, test = false, testProvider = undefined, onResult = (_result) => {}, clientContext = /** @type {{id?: string, country_code?: string}} */ ({}), timeoutMs = 60000 } = {}) {
  let attempted = false;
  return async (blob, { signal } = /** @type {{signal?: AbortSignal}} */ ({})) => {
    if (!consent) throw Error('Confirmez votre accord pour envoyer cet audio et consommer la transcription.');
    if (attempted) throw Error('Tentative déjà envoyée. Vérifiez son résultat avant tout nouvel essai.');
    if (signal?.aborted) throw Error('Annulé.');
    if (!blob?.size || blob.size > 5 * 1024 * 1024) throw Error('Audio trop volumineux ou vide.');
    if (!AUDIO_EXTENSIONS[audioMime(blob.type)]) throw Error(messages.AUDIO_FORMAT);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    if (signal?.aborted) throw Error('Annulé.');
    if (attempted) throw Error('Tentative déjà envoyée. Vérifiez son résultat avant tout nouvel essai.');
    attempted = true;
    let response;
    let timer;
    try {
      response = await Promise.race([
        api.functions.invoke('audioTranscription', { action: test ? 'test' : 'transcribe', request_id: requestId, consent: true, mime_type: blob.type, audio_base64: btoa(binary), client_profile_id: clientContext.id, country_code: clientContext.country_code, ...(test && testProvider ? { test_provider: testProvider } : {}) }),
        new Promise((_, reject) => { timer = setTimeout(() => reject({ erreur: 'TIMEOUT_OUTCOME_UNKNOWN' }), timeoutMs); }),
      ]);
    } catch (error) { throw transcriptionError(error, requestId); }
    finally { clearTimeout(timer); }
    if (signal?.aborted) throw Error('Annulé. L’envoi déjà effectué peut avoir été facturé ; aucun nouvel appel automatique.');
    const result = unwrapAudioResponse(response);
    if (result?.erreur || typeof result?.texte !== 'string') throw transcriptionError(result, requestId);
    onResult({ provider: ['base44', 'openai'].includes(result.provider_used) ? result.provider_used : null, model: result.model_used || null });
    return result.texte;
  };
}
