import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { AUDIO_CONFIG_KEY, audioFailure, audioEnabledForUser, audioProviderRuntime, createAudioStore, createAudioTranscriptionService, createTranscriptionFile, manageAudioConfig, runBase44Transcription, runOpenAITranscription } from '../../shared/audioTranscription.js';
import { audioMime, safeAudioCode, safeDiagnosticId, safeHttpStatus } from '../../shared/audioContract.js';
import { resolveExpressClient } from '../../shared/expressClientContext.js';
import { interpretExpressText } from '../../shared/expressInterpretation.js';

// No deployment, configuration or secret creation is performed by this source.
export default async function handler(req: Request) {
  let diagnosticId = crypto.randomUUID();
  const trace = (event: Record<string, unknown>) => console.info(JSON.stringify({ event: 'express_audio', diagnostic_id: diagnosticId, ...event }));
  const reply = (body: Record<string, unknown>, status = 200) => {
    if (body.erreur) trace({ stage: 'result', code: safeAudioCode(body.erreur), http_status: status });
    return Response.json({ ...body, diagnostic_id: diagnosticId, audio_contract: 'providers-v1' }, { status });
  };
  try {
    if (req.method !== 'POST') return reply(audioFailure('METHOD'), 405);
    const api = createClientFromRequest(req);
    const user = await api.auth.me();
    if (!user?.id) return reply(audioFailure('AUTH_REQUIRED'), 401);
    const raw = await req.text();
    if (raw.length > 7 * 1024 * 1024) return reply(audioFailure('AUDIO_SIZE'), 413);
    const input = JSON.parse(raw);
    diagnosticId = safeDiagnosticId(input.request_id) || diagnosticId;
    const entity = api.asServiceRole.entities.AudioTranscriptionControl;
    const runtime = audioProviderRuntime(name => Deno.env.get(name));
    const availability = runtime.availability;
    if (input.action === 'capability') {
      const rows = await entity.filter({ cle: AUDIO_CONFIG_KEY }, 'created_date', 2);
      const config = rows.length === 1 ? rows[0] : null;
      const provider = config?.provider || 'base44';
      // Do not activate the separate, undeployed paid interpretation experiment.
      return reply({ enabled: !!(audioEnabledForUser(config, user) && availability[provider] === true), provider, structured_interpretation: false,
        erreur: config && audioEnabledForUser(config, user) && availability[provider] !== true ? 'PROVIDER_NOT_CONFIGURED' : null });
    }
    if (['status', 'save'].includes(input.action)) {
      return reply(await manageAudioConfig({ user, action: input.action, input, entity, availability, diagnostics: runtime.diagnostics }));
    }
    if (input.action === 'interpret') {
      const interpretationEnabled = false;
      if (!interpretationEnabled) return reply(audioFailure('ACTION_INVALID'), 400);
      const context = await resolveExpressClient({ user, entity: api.entities.ClientExterne, profileId: input.client_profile_id, expectedCountry: input.country_code });
      const rows = await entity.filter({ cle: AUDIO_CONFIG_KEY }, 'created_date', 2);
      const previous: Record<string, string> = {};
      for (const key of ['depart', 'arrivee', 'prix']) {
        if (typeof input.previous?.[key] !== 'string' || input.previous[key].length > 160) return reply(audioFailure('ACTION_INVALID'), 400);
        previous[key] = input.previous[key];
      }
      const fields = await interpretExpressText({ core: api.integrations.Core, store: createAudioStore(entity), config: rows.length === 1 ? rows[0] : null, user: { ...user, country_code: context.country }, text: input.text, previous, requested: ['depart', 'arrivee', 'prix'].includes(input.requested) ? input.requested : '', requestId: input.request_id });
      return reply({ fields });
    }
    if (!['transcribe', 'test'].includes(input.action)) return reply(audioFailure('ACTION_INVALID'), 400);
    // Provider, model, URLs, credentials and country cannot be supplied by the APK.
    if (typeof input.audio_base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.audio_base64)) return reply(audioFailure('AUDIO_FORMAT'), 400);
    const bytes = Uint8Array.from(atob(input.audio_base64), char => char.charCodeAt(0));
    const file = createTranscriptionFile(bytes, input.mime_type);
    trace({ stage: 'received', mime: audioMime(file.type), size_bytes: file.size });
    const service = createAudioTranscriptionService({
      availability, store: createAudioStore(entity), model: runtime.availability.openai ? runtime.model : null,
      getConfig: async () => {
        const rows = await entity.filter({ cle: AUDIO_CONFIG_KEY }, 'created_date', 2);
        if (rows.length !== 1) return null;
        return rows[0];
      },
      adapters: {
        base44: (audio, signal) => runBase44Transcription(api.integrations.Core, audio, signal, trace),
        openai: (audio, signal) => runOpenAITranscription({ file: audio, signal, apiKey: runtime.apiKey, model: runtime.model }),
      },
    });
    let actor = user;
    if (input.action === 'transcribe') {
      const context = await resolveExpressClient({ user, entity: api.entities.ClientExterne, profileId: input.client_profile_id, expectedCountry: input.country_code });
      actor = { ...user, country_code: context.country };
    }
    return reply(await service({ user: actor, file, requestId: input.request_id, consent: input.consent === true, test: input.action === 'test', testProvider: input.test_provider }));
  } catch (error) {
    const status = safeHttpStatus(error?.response?.status) || safeHttpStatus(error?.status);
    const code = status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN' : safeAudioCode(error?.code);
    return reply(audioFailure(code), status || (code === 'FORBIDDEN' || code === 'PUBLIC_CLIENT_REQUIRED' || code.startsWith('CLIENT_') ? 403 : 400));
  }
}
