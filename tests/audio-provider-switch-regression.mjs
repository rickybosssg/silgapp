import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as rules from '../base44/shared/audioTranscription.js';
import * as contract from '../base44/shared/audioContract.js';
import { resolveExpressClient } from '../base44/shared/expressClientContext.js';
import { createAudioTranscriber } from '../src/lib/audioTranscriptionClient.js';

const admin = { id: 'admin-test', role: 'admin', admin_type: 'global' };
const file = new File(['test-only '.repeat(12)], 'test.wav', { type: 'audio/wav' });
const env = { OPENAI_API_KEY: 'FAKE-TEST-ONLY', AUDIO_OPENAI_APPROVED: 'true', AUDIO_OPENAI_MODEL: 'gpt-4o-mini-transcribe' };

test('runtime: missing key, approval, model or unsupported model fails closed', () => {
  for (const patch of [{ OPENAI_API_KEY: '' }, { AUDIO_OPENAI_APPROVED: 'false' }, { AUDIO_OPENAI_MODEL: '' }, { AUDIO_OPENAI_MODEL: 'unsupported' }]) {
    const values = { ...env, ...patch };
    const result = rules.audioProviderRuntime(name => values[name]);
    assert.equal(result.availability.base44, true);
    assert.equal(result.availability.openai, false);
    assert.ok(result.diagnostics.error);
    assert.ok(!JSON.stringify(result.diagnostics).includes(env.OPENAI_API_KEY));
  }
  assert.equal(rules.audioProviderRuntime(name => env[name]).availability.openai, true);
});

test('same service honors successive saved providers, reports actual adapter, never falls back', async () => {
  const config = { id: 'control', enabled: true, provider: 'base44' };
  const calls = [];
  const service = rules.createAudioTranscriptionService({ getConfig: async () => ({ ...config }), availability: { base44: true, openai: true },
    model: env.AUDIO_OPENAI_MODEL, store: { claim: async () => async () => {} },
    adapters: { base44: async () => { calls.push('base44'); return 'TEST'; }, openai: async () => { calls.push('openai'); return 'TEST'; } } });
  for (const provider of ['base44', 'openai', 'base44']) {
    config.provider = provider;
    const result = await service({ user: admin, test: true, file, consent: true, requestId: crypto.randomUUID() });
    assert.equal(result.provider_used, provider);
    assert.equal(result.model_used, provider === 'openai' ? env.AUDIO_OPENAI_MODEL : null);
  }
  assert.deepEqual(calls, ['base44', 'openai', 'base44']);
  config.provider = 'openai';
  const unavailable = rules.createAudioTranscriptionService({ getConfig: async () => config, availability: { base44: true, openai: false }, store: { claim: () => assert.fail('No claim for unavailable provider') }, adapters: { base44: () => assert.fail('No fallback') } });
  assert.equal((await unavailable({ user: admin, test: true, file, consent: true, requestId: crypto.randomUUID() })).erreur, 'PROVIDER_NOT_CONFIGURED');
});

test('actual handler simulated: status is sanitized and capability follows saved provider without cost', async () => {
  const source = readFileSync(new URL('../base44/functions/audioTranscription/entry.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
  const dependencies = { ...rules, ...contract, resolveExpressClient };
  const factory = new Function('createClientFromRequest', 'Deno', ...Object.keys(dependencies), stripTypeScriptTypes(source).replace('export default async function handler', 'return async function handler'));
  const config = { id: 'control', provider: 'base44', enabled: true };
  const sdk = { auth: { me: async () => admin }, asServiceRole: { entities: { AudioTranscriptionControl: { filter: async () => [{ ...config }] } } } };
  const handler = factory(() => sdk, { env: { get: name => env[name] } }, ...Object.values(dependencies));
  const invoke = async action => (await handler(new Request('https://test.invalid', { method: 'POST', body: JSON.stringify({ action }) }))).json();
  const status = await invoke('status');
  assert.equal(status.provider, 'base44');
  assert.equal(status.openai.configured, true);
  assert.equal(status.openai.verified, false);
  assert.ok(!JSON.stringify(status).includes(env.OPENAI_API_KEY));
  config.provider = 'openai';
  assert.equal((await invoke('capability')).provider, 'openai');
  assert.equal((await invoke('capability')).enabled, true);
  assert.equal((await invoke('interpret')).erreur, 'ACTION_INVALID');
});

test('save readback detects unconfirmed persistence and preserves receipts', async () => {
  const config = { id: 'control', provider: 'base44', enabled: true, receipts: '["existing"]', lock_owner: 'existing-lock' };
  const entity = { filter: async () => [{ ...config }], update: async () => {} };
  await assert.rejects(rules.manageAudioConfig({ user: admin, action: 'save', input: { provider: 'openai', enabled: true }, entity, availability: { openai: true } }), /CONFIG_SAVE_UNCONFIRMED/);
  assert.equal(config.receipts, '["existing"]'); assert.equal(config.lock_owner, 'existing-lock');
});

test('SDK auth errors keep HTTP status without leaking SDK error text', async () => {
  const source = readFileSync(new URL('../base44/functions/audioTranscription/entry.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
  const dependencies = { ...rules, ...contract, resolveExpressClient };
  const factory = new Function('createClientFromRequest', 'Deno', ...Object.keys(dependencies), stripTypeScriptTypes(source).replace('export default async function handler', 'return async function handler'));
  for (const status of [401,403]) {
    const handler = factory(() => ({ auth: { me: async () => { throw Object.assign(Error('PRIVATE-SDK-DETAILS'), { status }); } } }), {}, ...Object.values(dependencies));
    const response = await handler(new Request('https://test.invalid', { method: 'POST', body: '{}' }));
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.erreur, status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN');
    assert.ok(!JSON.stringify(body).includes('PRIVATE-SDK-DETAILS'));
  }
});

test('client preserves string contract and exposes only actual result metadata', async () => {
  let metadata;
  const api = { functions: { invoke: async () => ({ data: { texte: 'TEST', provider_used: 'openai', model_used: env.AUDIO_OPENAI_MODEL } }) } };
  assert.equal(await createAudioTranscriber(api, { consent: true, onResult: value => { metadata = value; } })(file), 'TEST');
  assert.deepEqual(metadata, { provider: 'openai', model: env.AUDIO_OPENAI_MODEL });
});

test('comparison override is restricted to global-admin test and never saves global provider', async () => {
  const config = { id: 'control', provider: 'base44', enabled: true };
  const calls = [];
  const service = rules.createAudioTranscriptionService({ getConfig: async () => config, availability: { base44: true, openai: true }, model: env.AUDIO_OPENAI_MODEL,
    store: { claim: async () => async () => {} }, adapters: { base44: async () => { calls.push('base44'); return 'TEST'; }, openai: async () => { calls.push('openai'); return 'TEST'; } } });
  const input = { user: admin, file, requestId: crypto.randomUUID(), consent: true, testProvider: 'openai' };
  assert.equal((await service({ ...input, test: true })).provider_used, 'openai');
  assert.equal(config.provider, 'base44');
  assert.equal((await service({ ...input, test: true, user: { ...admin, admin_type: 'pays' } })).erreur, 'FORBIDDEN');
  assert.equal((await service({ ...input, user: { id: 'client', email: 'client@example.invalid', country_code: 'BF' } })).erreur, 'FORBIDDEN');
  assert.deepEqual(calls, ['openai']);
});

test('OpenAI adapter rejects unsupported model and HTTP failure without fallback or retry', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: false, status: 429 }; };
  await assert.rejects(rules.runOpenAITranscription({ file, apiKey: env.OPENAI_API_KEY, model: 'unknown', fetchImpl }), /OPENAI_MODEL_UNSUPPORTED/);
  assert.equal(calls, 0);
  await assert.rejects(rules.runOpenAITranscription({ file, apiKey: env.OPENAI_API_KEY, model: env.AUDIO_OPENAI_MODEL, fetchImpl }), /PROVIDER_QUOTA/);
  assert.equal(calls, 1);
});
