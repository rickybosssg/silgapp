import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as transcriptionRules from '../base44/shared/audioTranscription.js';
import * as audioContract from '../base44/shared/audioContract.js';
import { resolveExpressClient } from '../base44/shared/expressClientContext.js';
import { createAudioTranscriptionService, createAudioStore, manageAudioConfig, runBase44Transcription, runOpenAITranscription, isAudioSuperAdmin } from '../base44/shared/audioTranscription.js';
import { createAudioTranscriber, createRecordingTranscriber } from '../src/lib/audioTranscriptionClient.js';

const file = new File(['synthetic '.repeat(10)], 'test.wav', { type: 'audio/wav' });
const user = { id: 'test-client', email: 'test@example.invalid', country_code: 'BF' };
const admin = { ...user, role: 'admin', admin_type: 'global' };
const input = { user, file, requestId: 'request-synthetic-0001', consent: true };
function setup({ provider = 'base44', enabled = true, result = 'de Karpala à Tanghin pour mille francs', availability = { base44: true, openai: true }, timeoutMs = 1000 } = {}) {
  const row = { id: 'control', cle: 'AUDIO_TRANSCRIPTION_V1', provider, enabled, receipts: '[]', lock_owner: '' };
  const entity = { get: async () => ({ ...row }), filter: async () => [{ ...row }], update: async (_, value) => Object.assign(row, value), updateMany: async (filter, update) => {
    if (filter.lock_owner !== row.lock_owner || (filter.receipts !== undefined && filter.receipts !== row.receipts)) return { updated: 0 };
    Object.assign(row, update.$set); return { updated: 1 };
  } };
  const calls = [];
  const adapters = Object.fromEntries(['base44', 'openai'].map(name => [name, async () => { calls.push(name); return typeof result === 'function' ? result() : result; }]));
  const service = createAudioTranscriptionService({ getConfig: async () => row, store: createAudioStore(entity), availability, adapters, timeoutMs });
  return { row, entity, service, calls };
}
test('service : auth, consentement, rôle, taille, format et activation refusent avant coût', async () => {
  for (const value of [{ ...input, user: null }, { ...input, consent: false }, { ...input, requestId: '' }, { ...input, user: { ...user, enterprise_id: 'other' } }, { ...input, test: true }, { ...input, file: new File(['x'], 'x', { type: 'text/plain' }) }]) {
    const h = setup(); assert.ok((await h.service(value)).erreur); assert.equal(h.calls.length, 0);
  }
  const h = setup({ enabled: false }); assert.equal((await h.service(input)).erreur, 'DISABLED'); assert.equal(h.calls.length, 0);
});
test('service : choix serveur uniquement, pas de fallback, clé privée absente du contrat', async () => {
  for (const provider of ['base44', 'openai']) {
    const h = setup({ provider }); assert.equal((await h.service({ ...input, provider: 'attacker' })).erreur, null); assert.deepEqual(h.calls, [provider]);
  }
  const h = setup({ result: () => { throw Error('https://signed.invalid/?secret=private'); } });
  assert.deepEqual(await h.service(input), { texte: '', erreur: 'TRANSCRIPTION_FAILED_OUTCOME_UNKNOWN' }); assert.deepEqual(h.calls, ['base44']);
  const disabled = setup({ provider: 'openai', availability: { base44: true, openai: false } });
  assert.equal((await disabled.service(input)).erreur, 'PROVIDER_NOT_CONFIGURED'); assert.equal(disabled.calls.length, 0);
});
test('global audio OFF overrides legacy pilot identity and expiry without changing pilot metadata', async () => {
  const h = setup({ enabled: false });
  h.row.pilot_user_id = user.id;
  h.row.pilot_until = new Date(Date.now() + 60000).toISOString();
  assert.equal((await h.service({ ...input, user: { ...user, id: 'another-client' } })).erreur, 'DISABLED');
  assert.equal((await h.service(input)).erreur, 'DISABLED');
  assert.equal((await h.service({ ...input, user: admin, test: true })).erreur, 'DISABLED');
  assert.equal(h.calls.length, 0);
  assert.equal(h.row.enabled, false);
  const expired = setup({ enabled: false });
  expired.row.pilot_user_id = user.id; expired.row.pilot_until = '2000-01-01T00:00:00Z';
  assert.equal((await expired.service(input)).erreur, 'DISABLED');
  const config = setup({ enabled: false });
  await manageAudioConfig({ user: admin, action: 'save', input: { provider: 'base44', enabled: false, pilotForMe: true, pilot_user_id: 'attacker' }, entity: config.entity, availability: { base44: true } });
  assert.equal(config.row.pilot_user_id, admin.id); assert.equal(config.row.enabled, false);
});
test('service : double requête, replay après succès et timeout ne refacturent pas', async () => {
  const h = setup(); const outcomes = await Promise.all([h.service(input), h.service(input)]);
  assert.equal(outcomes.filter(x => !x.erreur).length, 1); assert.equal(h.calls.length, 1);
  assert.equal((await h.service(input)).erreur, 'ALREADY_ATTEMPTED');
  const timeout = setup({ result: () => new Promise(() => {}), timeoutMs: 10 });
  assert.equal((await timeout.service(input)).erreur, 'TIMEOUT_OUTCOME_UNKNOWN');
  assert.equal((await timeout.service(input)).erreur, 'ALREADY_ATTEMPTED'); assert.equal(timeout.calls.length, 1);
});
test('silence et réponse non textuelle ne produisent pas de commande', async () => {
  for (const result of ['', '   ', 'INAUDIBLE', '[silence]', { amount: 1000 }]) assert.equal((await setup({ result }).service(input)).erreur, 'NO_SPEECH');
});
test('adaptateur Base44 : stockage privé et URL 120 secondes ; une seule transcription', async () => {
  const calls = []; const core = {
    UploadPrivateFile: async args => { assert.equal(args.file, file); calls.push('private'); return { file_uri: 'PRIVATE' }; },
    CreateFileSignedUrl: async args => { assert.deepEqual(args, { file_uri: 'PRIVATE', expires_in: 120 }); calls.push('signed'); return { signed_url: 'https://test.invalid/signed' }; },
    TranscribeAudio: async args => { assert.deepEqual(args, { audio_url: 'https://test.invalid/signed' }); calls.push('transcribe'); return { text: 'TEST' }; },
  };
  assert.equal(await runBase44Transcription(core, file, new AbortController().signal), 'TEST'); assert.deepEqual(calls, ['private', 'signed', 'transcribe']);
  calls.length = 0; core.UploadPrivateFile = async () => { throw Error('network'); };
  await assert.rejects(runBase44Transcription(core, file, new AbortController().signal)); assert.equal(calls.length, 0);
});
test('adaptateur OpenAI : endpoint officiel, modèle serveur, JSON, pas de retry', async () => {
  let calls = 0;
  const fetchImpl = async (url, options) => { calls++; assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions'); assert.equal(options.body.get('model'), 'gpt-4o-mini-transcribe'); assert.equal(options.body.get('response_format'), 'json'); assert.equal(options.body.get('language'), 'fr'); assert.equal(options.body.get('file').name, 'commande.wav'); return { ok: true, json: async () => ({ text: 'TEST' }) }; };
  assert.equal(await runOpenAITranscription({ file, signal: new AbortController().signal, apiKey: 'NOT-A-REAL-KEY', model: 'gpt-4o-mini-transcribe', fetchImpl }), 'TEST'); assert.equal(calls, 1);
  await assert.rejects(runOpenAITranscription({ file, apiKey: '', model: 'test-model', fetchImpl })); assert.equal(calls, 1);
});
test('configuration : seul admin global hors entreprise ; persistance sans secret', async () => {
  for (const actor of [null, user, { ...admin, admin_type: 'pays' }, { ...admin, enterprise_id: 'enterprise' }, { ...admin, silgapp_role: 'admin_entreprise' }]) {
    assert.equal(isAudioSuperAdmin(actor), false);
    const h = setup(); await assert.rejects(manageAudioConfig({ user: actor, action: 'save', input: {}, entity: h.entity, availability: {} }), /FORBIDDEN/);
  }
  const h = setup();
  const value = await manageAudioConfig({ user: admin, action: 'save', input: { provider: 'openai', enabled: false, api_key: 'MUST-NOT-PERSIST' }, entity: h.entity, availability: { base44: true, openai: false } });
  assert.equal(h.row.provider, 'openai'); assert.equal(h.row.enabled, false); assert.equal(h.row.api_key, undefined); assert.equal(value.openai.verified, false);
  await assert.rejects(manageAudioConfig({ user: admin, action: 'save', input: { provider: 'openai', enabled: true }, entity: h.entity, availability: { openai: false } }), /NOT_CONFIGURED/);
});
test('explicit new recordings get distinct IDs; identical audio object cannot be retried', async () => {
  const ids=[];const api={functions:{invoke:async(_,body)=>{ids.push(body.request_id);return {data:{texte:'TEST',erreur:null}};}}};
  const transcribe=createRecordingTranscriber(api);
  const first=new Blob(['synthetic first'],{type:'audio/webm'}), second=new Blob(['synthetic second'],{type:'audio/webm'});
  await transcribe(first,{});await assert.rejects(transcribe(first,{}));await transcribe(second,{});
  assert.equal(ids.length,2);assert.notEqual(ids[0],ids[1]);
});

test('client : consentement, annulation et double envoi ; aucun provider ni secret envoyé', async () => {
  const payloads = []; const api = { functions: { invoke: async (_, body) => { payloads.push(body); return { data: { texte: 'TEST', erreur: null } }; } } };
  await assert.rejects(createAudioTranscriber(api)(file)); assert.equal(payloads.length, 0);
  const aborted = new AbortController(); aborted.abort(); await assert.rejects(createAudioTranscriber(api, { consent: true })(file, { signal: aborted.signal }));
  const transcribe = createAudioTranscriber(api, { consent: true }); assert.equal(await transcribe(file), 'TEST'); await assert.rejects(transcribe(file));
  assert.equal(payloads.length, 1); assert.equal(payloads[0].provider, undefined); assert.equal(payloads[0].api_key, undefined);
  const schema = JSON.parse(readFileSync(new URL('../base44/entities/AudioTranscriptionControl.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual(schema.rls, { read: false, create: false, update: false, delete: false });
});

test('endpoint réel simulé : auth, admin entreprise, rôle pays et identité du profil', async () => {
  const source = readFileSync(new URL('../base44/functions/audioTranscription/entry.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
  const dependencies = { ...transcriptionRules, ...audioContract, resolveExpressClient };
  const factory = new Function('createClientFromRequest', 'Deno', ...Object.keys(dependencies), stripTypeScriptTypes(source).replace('export default async function handler', 'return async function handler'));
  for (const actor of [null, user, { ...admin, enterprise_id: 'other' }, { ...admin, admin_type: 'pays' }]) {
    const h = setup(); let mutations = 0;
    const entity = { ...h.entity, update: async () => { mutations++; } };
    const sdk = { auth: { me: async () => actor }, asServiceRole: { entities: { AudioTranscriptionControl: entity } } };
    const handler = factory(() => sdk, { env: { get: () => undefined } }, ...Object.values(dependencies));
    const response = await handler(new Request('https://test.invalid', { method: 'POST', body: JSON.stringify({ action: 'save', provider: 'openai', enabled: true }) }));
    assert.ok([401, 403].includes(response.status)); assert.equal(mutations, 0);
  }
  const h = setup(); let paidCalls = 0;
  const sdk = { auth: { me: async () => user }, entities: { ClientExterne: { filter: async () => [] } }, asServiceRole: { entities: { AudioTranscriptionControl: h.entity } }, integrations: { Core: { UploadPrivateFile: async () => { paidCalls++; } } } };
  const handler = factory(() => sdk, { env: { get: name => name === 'AUDIO_BASE44_APPROVED' ? 'true' : undefined } }, ...Object.values(dependencies));
  const response = await handler(new Request('https://test.invalid', { method: 'POST', body: JSON.stringify({ action: 'transcribe', request_id: input.requestId, consent: true, mime_type: 'audio/wav', audio_base64: Buffer.from(await file.arrayBuffer()).toString('base64') }) }));
  assert.equal(response.status, 403); assert.equal(paidCalls, 0);
});
