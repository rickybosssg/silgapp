import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { AUDIO_CONFIG_KEY, audioFailure, audioEnabledForUser, createAudioStore, createAudioTranscriptionService, manageAudioConfig, runBase44Transcription, runOpenAITranscription } from '../../shared/audioTranscription.js';

// No deployment, configuration or secret creation is performed by this source.
export default async function handler(req: Request) {
  try {
    if (req.method !== 'POST') return Response.json(audioFailure('METHOD'), { status: 405 });
    const api = createClientFromRequest(req);
    const user = await api.auth.me();
    if (!user?.id) return Response.json(audioFailure('AUTH_REQUIRED'), { status: 401 });
    const raw = await req.text();
    if (raw.length > 7 * 1024 * 1024) return Response.json(audioFailure('AUDIO_SIZE'), { status: 413 });
    const input = JSON.parse(raw);
    const entity = api.asServiceRole.entities.AudioTranscriptionControl;
    // Built-in Base44 requires no extra key. Client use stays OFF in the control
    // row; only an explicit global-admin test can run while it is disabled.
    // OpenAI approval defaults OFF. Presence never proves provider validity.
    const availability = {
      base44: true,
      openai: Deno.env.get('AUDIO_OPENAI_APPROVED') === 'true' && !!Deno.env.get('OPENAI_API_KEY') && !!Deno.env.get('AUDIO_OPENAI_MODEL'),
    };
    if (input.action === 'capability') {
      const rows = await entity.filter({ cle: AUDIO_CONFIG_KEY }, 'created_date', 2);
      const config = rows.length === 1 ? rows[0] : null;
      return Response.json({ enabled: !!(audioEnabledForUser(config, user) && availability[config.provider]) });
    }
    if (['status', 'save'].includes(input.action)) {
      return Response.json(await manageAudioConfig({ user, action: input.action, input, entity, availability }));
    }
    if (!['transcribe', 'test'].includes(input.action)) return Response.json(audioFailure('ACTION_INVALID'), { status: 400 });
    // Provider, model, URLs, credentials and country cannot be supplied by the APK.
    if (typeof input.audio_base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.audio_base64)) return Response.json(audioFailure('AUDIO_FORMAT'), { status: 400 });
    const bytes = Uint8Array.from(atob(input.audio_base64), char => char.charCodeAt(0));
    const file = new File([bytes], 'commande', { type: String(input.mime_type || '') });
    const service = createAudioTranscriptionService({
      availability, store: createAudioStore(entity),
      getConfig: async () => {
        const rows = await entity.filter({ cle: AUDIO_CONFIG_KEY }, 'created_date', 2);
        if (rows.length !== 1) return null;
        return rows[0];
      },
      adapters: {
        base44: (audio, signal) => runBase44Transcription(api.integrations.Core, audio, signal),
        openai: (audio, signal) => runOpenAITranscription({ file: audio, signal, apiKey: Deno.env.get('OPENAI_API_KEY'), model: Deno.env.get('AUDIO_OPENAI_MODEL') }),
      },
    });
    let actor = user;
    if (input.action === 'transcribe') {
      const profiles = await api.entities.ClientExterne.filter({ user_email: user.email }, '-created_date', 2);
      const profile = profiles.length === 1 ? profiles[0] : null;
      if (!profile?.country_code || profile.enterprise_id || profile.bloque_frais_annulation) return Response.json(audioFailure('FORBIDDEN'), { status: 403 });
      actor = { ...user, country_code: profile.country_code };
    }
    return Response.json(await service({ user: actor, file, requestId: input.request_id, consent: input.consent === true, test: input.action === 'test' }));
  } catch (error) {
    return Response.json(audioFailure(error?.code || 'REQUEST_FAILED'), { status: error?.code === 'FORBIDDEN' ? 403 : 400 });
  }
}