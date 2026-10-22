// Server-only adapters. No imports into the client bundle and no automatic fallback.
export const AUDIO_CONFIG_KEY = 'AUDIO_TRANSCRIPTION_V1';
export const isAudioSuperAdmin = user => user?.role === 'admin' && user?.admin_type === 'global' && !user?.enterprise_id && user?.silgapp_role !== 'admin_entreprise';
export const audioFailure = code => ({ texte: '', erreur: code });
export const audioEnabledForUser = (config, user) => config?.enabled === true ||
  (!!user?.id && config?.pilot_user_id === user.id && Date.parse(config.pilot_until || '') > Date.now());
const fail = code => { throw Object.assign(new Error(code), { code }); };
export function validateAudioFile(file) {
  if (!file || typeof file.arrayBuffer !== 'function' || file.size <= 44 || file.size > 5 * 1024 * 1024) fail('AUDIO_SIZE');
  if (!['audio/wav', 'audio/x-wav', 'audio/webm', 'video/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg'].includes(file.type.split(';')[0])) fail('AUDIO_FORMAT');
}
export function audioConfigStatus(config, availability) {
  return { provider: config?.provider || 'base44', enabled: config?.enabled === true, provisioned: !!config?.id,
    base44: { configured: availability.base44 === true, verified: false },
    openai: { configured: availability.openai === true, verified: false }, fallback: false };
}
export async function runBase44Transcription(core, file, signal) {
  const check = () => { if (signal.aborted) fail('TIMEOUT_OUTCOME_UNKNOWN'); };
  check();
  const uploaded = await core.UploadPrivateFile({ file });
  check();
  if (typeof uploaded?.file_uri !== 'string') fail('PRIVATE_UPLOAD_RESPONSE');
  const signed = await core.CreateFileSignedUrl({ file_uri: uploaded.file_uri, expires_in: 120 });
  check();
  if (typeof signed?.signed_url !== 'string' || !signed.signed_url.startsWith('https://')) fail('SIGNED_URL_RESPONSE');
  // Signature is the candidate contract from VENUS; real isolated verification still required.
  const result = await core.TranscribeAudio({ audio_url: signed.signed_url });
  check();
  return typeof result === 'string' ? result : result?.text || result?.transcript;
}
export async function runOpenAITranscription({ file, signal, apiKey, model, fetchImpl = fetch }) {
  if (!apiKey || !model) fail('OPENAI_NOT_CONFIGURED');
  const body = new FormData();
  const extension = { 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg' }[file.type.split(';')[0]] || 'webm';
  body.append('file', file, `commande.${extension}`);
  body.append('model', model);
  body.append('language', 'fr');
  body.append('response_format', 'json');
  const response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body, signal, redirect: 'error',
  });
  if (!response.ok) fail(response.status === 429 ? 'PROVIDER_QUOTA' : 'PROVIDER_ERROR');
  return (await response.json())?.text;
}

// store.claim must persist the request before the first paid operation and never
// reclaim an uncertain request. It is backed by a preprovisioned singleton/CAS.
export function createAudioTranscriptionService({ getConfig, availability, store, adapters, timeoutMs = 45000 }) {
  return async ({ user, file, requestId, consent, test = false }) => {
    let release;
    try {
      if (!user?.id) fail('AUTH_REQUIRED');
      if (test ? !isAudioSuperAdmin(user) : (!user.country_code || user.enterprise_id || !user.email)) fail('FORBIDDEN');
      if (consent !== true) fail('CONSENT_REQUIRED');
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId || '')) fail('REQUEST_ID_REQUIRED');
      validateAudioFile(file);
      const config = await getConfig();
      if (!config?.id) fail('NOT_PROVISIONED');
      if (!test && !audioEnabledForUser(config, user)) fail('DISABLED');
      const provider = config.provider || 'base44';
      if (!['base44', 'openai'].includes(provider) || availability[provider] !== true) fail('PROVIDER_NOT_CONFIGURED');
      release = await store.claim(`${user.id}:${requestId}`, config.id);
      const controller = new AbortController();
      let timer;
      try {
        const operation = Promise.resolve().then(() => adapters[provider](file, controller.signal));
        const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Object.assign(Error(), { code: 'TIMEOUT_OUTCOME_UNKNOWN' })); }, timeoutMs); });
        const raw = await Promise.race([operation, deadline]);
        const texte = typeof raw === 'string' ? raw.trim() : '';
        if (!texte || /^\[?(?:silence|inaudible|bruit)\]?[.!]?$/iu.test(texte)) fail('NO_SPEECH');
        if (texte.length > 4000) fail('PROVIDER_RESPONSE');
        return { texte, erreur: null };
      } finally { clearTimeout(timer); }
    } catch (error) {
      // Never return provider errors containing signed URLs, headers or secrets.
      return audioFailure(error?.code || 'TRANSCRIPTION_FAILED_OUTCOME_UNKNOWN');
    } finally { if (release) await release().catch(() => {}); }
  };
}

export function createAudioStore(entity) {
  return {
    async claim(key, id) {
      const row = await entity.get(id);
      let receipts;
      try { receipts = JSON.parse(row.receipts || '[]'); } catch { fail('RECEIPTS_INVALID'); }
      if (!Array.isArray(receipts)) fail('RECEIPTS_INVALID');
      if (receipts.includes(key)) fail('ALREADY_ATTEMPTED');
      if (receipts.length >= 1000) fail('RECEIPTS_CAPACITY');
      const owner = crypto.randomUUID();
      const claimed = await entity.updateMany({ id, receipts: row.receipts || '[]', lock_owner: '' }, { $set: { lock_owner: owner, receipts: JSON.stringify([...receipts, key]) } });
      if (Number(claimed?.updated) !== 1) fail('BUSY_OR_ALREADY_ATTEMPTED');
      return async () => { await entity.updateMany({ id, lock_owner: owner }, { $set: { lock_owner: '' } }); };
    },
  };
}

export async function manageAudioConfig({ user, action, input, entity, availability }) {
  if (!isAudioSuperAdmin(user)) fail('FORBIDDEN');
  const rows = await entity.filter({ cle: AUDIO_CONFIG_KEY }, 'created_date', 2);
  if (rows.length > 1) fail('CONFIG_DUPLICATE');
  const config = rows[0];
  if (action === 'save') {
    if (!['base44', 'openai'].includes(input.provider) || typeof input.enabled !== 'boolean') fail('CONFIG_INVALID');
    if (input.enabled && availability[input.provider] !== true) fail('PROVIDER_NOT_CONFIGURED');
    if (input.pilotForMe !== undefined && typeof input.pilotForMe !== 'boolean') fail('CONFIG_INVALID');
    const pilot = input.pilotForMe === undefined ? {} : input.pilotForMe ?
      { pilot_user_id: user.id, pilot_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() } :
      { pilot_user_id: '', pilot_until: '' };
    if (!config) {
      // Explicit admin save only. Concurrent first saves fail closed if duplicated.
      const created = await entity.create({ cle: AUDIO_CONFIG_KEY, provider: input.provider, enabled: input.enabled, receipts: '[]', lock_owner: '', ...pilot });
      const check = await entity.filter({ cle: AUDIO_CONFIG_KEY }, 'created_date', 2);
      if (check.length !== 1 || check[0].id !== created.id) fail('CONFIG_DUPLICATE');
      return audioConfigStatus(created, availability);
    }
    await entity.update(config.id, { provider: input.provider, enabled: input.enabled, ...pilot });
    return audioConfigStatus({ ...config, provider: input.provider, enabled: input.enabled, ...pilot }, availability);
  }
  if (action !== 'status') fail('ACTION_INVALID');
  return audioConfigStatus(config, availability);
}