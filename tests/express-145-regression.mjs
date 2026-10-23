import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveExpressClient } from '../base44/shared/expressClientContext.js';
import { extractExpressFields } from '../base44/shared/expressOrder.js';
import { createTranscriptionFile, runBase44Transcription } from '../base44/shared/audioTranscription.js';
import { createAudioTranscriber, transcriptionError } from '../src/lib/audioTranscriptionClient.js';
import { createExpressRecorder } from '../src/lib/expressRecorder.js';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as audioRules from '../base44/shared/audioTranscription.js';
import * as audioContract from '../base44/shared/audioContract.js';

const user = { id: 'test-user', email: 'test@example.invalid' };
const client = { id: 'existing-profile', user_email: user.email, country_code: 'BF', actif: true };
const fakeFile = new File(['synthetic audio '.repeat(8)], 'test.webm', { type: 'audio/webm;codecs=opus' });

test('Commander profile ID is re-read, never replaced by another latest profile', async () => {
  const calls = [];
  const entity = { get: async id => { calls.push(id); return client; }, filter: () => { throw Error('Must reuse selected profile'); } };
  assert.equal((await resolveExpressClient({ user, entity, profileId: client.id })).client.id, client.id);
  assert.deepEqual(calls, [client.id]);
});

test('legacy caller uses the same latest linked profile selection as Commander', async () => {
  const entity = { filter: async (filter, order, limit) => { assert.deepEqual(filter, { user_email: user.email }); assert.equal(order, '-created_date'); assert.equal(limit, 1); return [client]; } };
  assert.equal((await resolveExpressClient({ user, entity })).country, 'BF');
});

test('profile loading waits; missing profile/country and country changes do not create data', async () => {
  let complete;
  const pending = resolveExpressClient({ user, entity: { get: () => new Promise(resolve => { complete = resolve; }) }, profileId: client.id });
  let settled = false; pending.then(() => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false); complete(client); await pending;
  for (const [profile, country, code] of [[null, '', 'CLIENT_PROFILE_REQUIRED'], [{ ...client, country_code: '' }, '', 'CLIENT_COUNTRY_REQUIRED'], [client, 'CI', 'CLIENT_COUNTRY_CHANGED']]) {
    await assert.rejects(resolveExpressClient({ user, entity: { get: async () => profile }, profileId: client.id, expectedCountry: country }), { code });
  }
});

test('ownership, enterprise, inactive and financial blocks remain enforced even with a service-role entity', async () => {
  for (const [profile, actor, code] of [
    [{ ...client, user_email: 'other@example.invalid' }, user, 'CLIENT_PROFILE_MISMATCH'],
    [{ ...client, enterprise_id: 'enterprise' }, user, 'PUBLIC_CLIENT_REQUIRED'],
    [client, { ...user, enterprise_id: 'enterprise' }, 'PUBLIC_CLIENT_REQUIRED'],
    [{ ...client, actif: false }, user, 'CLIENT_DISABLED'],
    [{ ...client, bloque_frais_annulation: true }, user, 'CLIENT_FEES_BLOCKED'],
  ]) await assert.rejects(resolveExpressClient({ user: actor, entity: { get: async () => profile }, profileId: client.id }), { code });
});

test('partial extraction retains known fields without inventing missing or ambiguous values', () => {
  assert.deepEqual(extractExpressFields('de 1200 Logements à Cissin pour 1 000 F.'), { depart: '1200 Logements', arrivee: 'Cissin', prix: '1000' });
  assert.deepEqual(extractExpressFields('de 1200 Logements à Cissin'), { depart: '1200 Logements', arrivee: 'Cissin', prix: '' });
  assert.deepEqual(extractExpressFields('de 1200 Logements à Cissin pour environ mille'), { depart: '1200 Logements', arrivee: 'Cissin', prix: '' });
  assert.deepEqual(extractExpressFields('de Karpala ou Pissy à Cissin pour mille'), { depart: '', arrivee: 'Cissin', prix: '1000' });
  assert.deepEqual(extractExpressFields('inaudible'), { depart: '', arrivee: '', prix: '' });
});

test('Android WEBM/Opus and MP4 are named with matching extensions without transcoding', async () => {
  const bytes = new Uint8Array(await fakeFile.arrayBuffer());
  for (const [mime, name, normalized] of [['audio/webm;codecs=opus', 'commande.webm', 'audio/webm'], ['audio/mp4', 'commande.m4a', 'audio/mp4']]) {
    const file = createTranscriptionFile(bytes, mime); assert.equal(file.name, name); assert.equal(file.type, normalized);
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
  }
  assert.throws(() => createTranscriptionFile(bytes, 'text/plain'), { code: 'AUDIO_FORMAT' });
  assert.throws(() => createTranscriptionFile(new Uint8Array(0), 'audio/webm'), { code: 'AUDIO_SIZE' });
});

test('Base44 adapter accepts wrapped responses, checks transfer/URL before paid STT', async () => {
  const stages = [];
  const core = {
    UploadPrivateFile: async () => ({ data: { file_uri: 'private-fixture' } }),
    CreateFileSignedUrl: async () => ({ data: { signed_url: 'https://fixture.invalid/private' } }),
    TranscribeAudio: async () => ({ data: { transcript: 'Texte simulé' } }),
  };
  assert.equal(await runBase44Transcription(core, fakeFile, new AbortController().signal, event => stages.push(event.stage)), 'Texte simulé');
  assert.deepEqual(stages, ['upload', 'upload', 'signed_url', 'signed_url', 'transcribe', 'transcribe']);
  let transcriptions = 0;
  core.TranscribeAudio = async () => { transcriptions++; };
  core.CreateFileSignedUrl = async () => ({ signed_url: 'http://fixture.invalid' });
  await assert.rejects(runBase44Transcription(core, fakeFile, new AbortController().signal), { code: 'SIGNED_URL_RESPONSE' });
  assert.equal(transcriptions, 0);
});

test('provider failures produce sanitized stage/status diagnostics, never URLs/headers/text', async () => {
  const logs = [];
  const core = { UploadPrivateFile: async () => { throw { response: { status: 403, data: { secret: 'private' } }, message: 'Bearer secret https://private.invalid' }; } };
  await assert.rejects(runBase44Transcription(core, fakeFile, new AbortController().signal, event => logs.push(event)), { code: 'UPLOAD_FAILED' });
  assert.equal(logs[1].http_status, 403); assert.doesNotMatch(JSON.stringify(logs), /secret|private|Bearer/);
  const error = transcriptionError({ response: { status: 400, data: { erreur: 'SIGNED_URL_FAILED', diagnostic_id: 'diagnostic-fixture-001' } } }, 'request-fixture-001');
  assert.match(error.message, /accéder au fichier/); assert.match(error.message, /diagnostic-fixture-001/);
  assert.doesNotMatch(transcriptionError({ response: { data: { erreur: 'Bearer secret' } } }, 'request-fixture-001').message, /Bearer|secret/);
});

test('network interruption never automatically replays a potentially paid request', async () => {
  let calls = 0;
  const invoke = createAudioTranscriber({ functions: { invoke: async () => { calls++; throw new Error('PRIVATE URL'); } } }, { consent: true, clientContext: client });
  await assert.rejects(invoke(fakeFile), /Connexion interrompue/);
  await assert.rejects(invoke(fakeFile), /déjà envoyée/);
  assert.equal(calls, 1);
});

test('concurrent reads of the same audio and an unanswered network request cannot double-send',async()=>{
 let calls=0;const transcribe=createAudioTranscriber({functions:{invoke:async()=>{calls++;return {texte:'fixture'};}}},{consent:true});
 const results=await Promise.allSettled([transcribe(fakeFile),transcribe(fakeFile)]);
 assert.equal(calls,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const timeout=createAudioTranscriber({functions:{invoke:()=>new Promise(()=>{})}},{consent:true,timeoutMs:5});
 await assert.rejects(timeout(fakeFile),/pas répondu à temps/);
 await assert.rejects(timeout(fakeFile),/déjà envoyée/);
});

test('recorder prefers a supported MIME; empty recording and new recording safely release tracks', async () => {
  const received = [], errors = []; let stops = 0; let current;
  class Recorder {
    static isTypeSupported = type => type === 'audio/webm;codecs=opus';
    constructor(_stream, options) { current = this; this.mimeType = options.mimeType; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop(); }
  }
  const recorder = createExpressRecorder({ Recorder, getUserMedia: async () => ({ getTracks: () => [{ stop: () => stops++ }] }), onState: () => {}, onAudio: audio => received.push(audio), onError: error => errors.push(error) });
  await recorder.start(); recorder.stop(); assert.equal(received.length, 0); assert.match(errors[0], /Aucun son/);
  await recorder.start(); current.ondataavailable({ data: fakeFile }); recorder.stop();
  assert.equal(received[0].type, 'audio/webm;codecs=opus'); assert.equal(stops, 2);
});

test('actual endpoint (mock SDK): named audio, selected profile, safe diagnostics and Base44 response', async () => {
  const source=readFileSync(new URL('../base44/functions/audioTranscription/entry.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
  const dependencies={...audioRules,...audioContract,resolveExpressClient};const logs=[];
  const factory=new Function('createClientFromRequest','console','Deno',...Object.keys(dependencies),stripTypeScriptTypes(source).replace('export default async function handler','return async function handler'));
  const row={id:'configuration',cle:'AUDIO_TRANSCRIPTION_V1',provider:'base44',enabled:true,receipts:'[]',lock_owner:''};
  let upload=0,stt=0;
  const entity={filter:async()=>[row],get:async()=>({...row}),updateMany:async(filter,update)=>{if(filter.lock_owner!==row.lock_owner)return {updated:0};Object.assign(row,update.$set);return {updated:1};}};
  const sdk={auth:{me:async()=>user},entities:{ClientExterne:{get:async id=>{assert.equal(id,client.id);return client;}}},asServiceRole:{entities:{AudioTranscriptionControl:entity}},integrations:{Core:{
    UploadPrivateFile:async({file})=>{upload++;assert.equal(file.name,'commande.webm');assert.equal(file.type,'audio/webm');return {file_uri:'SENSITIVE_URI'};},
    CreateFileSignedUrl:async()=>({signed_url:'https://fixture.invalid/SENSITIVE_URL'}),
    TranscribeAudio:async()=>{stt++;return {text:'SENSITIVE_TRANSCRIPT'};},
  }}};
  const handler=factory(()=>sdk,{info:value=>logs.push(JSON.parse(value))},{env:{get:()=>undefined}},...Object.values(dependencies));
  const body={action:'transcribe',client_profile_id:client.id,country_code:'BF',request_id:'request-endpoint-0001',consent:true,mime_type:fakeFile.type,audio_base64:Buffer.from(await fakeFile.arrayBuffer()).toString('base64')};
  const call=()=>handler(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify(body)}));
  const response=await call();assert.equal(response.status,200);const data=await response.json();assert.equal(data.texte,'SENSITIVE_TRANSCRIPT');assert.equal(data.diagnostic_id,body.request_id);assert.equal(upload,1);assert.equal(stt,1);
  assert.doesNotMatch(JSON.stringify(logs),/SENSITIVE|test@example|existing-profile|audio_base64/);
  assert.equal((await (await call()).json()).erreur,'ALREADY_ATTEMPTED');assert.equal(upload,1);
  row.provider='openai';body.request_id='request-endpoint-0002';
  assert.equal((await (await call()).json()).erreur,'PROVIDER_NOT_CONFIGURED');assert.equal(upload,1);assert.equal(stt,1);
});

test('cancellation between transfer and signed URL cannot trigger transcription; malformed provider result is not silence', async()=>{
  const controller=new AbortController();let signed=0;
  await assert.rejects(runBase44Transcription({UploadPrivateFile:async()=>{controller.abort();return {file_uri:'fixture'};},CreateFileSignedUrl:async()=>{signed++;}},fakeFile,controller.signal),{code:'TIMEOUT_OUTCOME_UNKNOWN'});
  assert.equal(signed,0);
  await assert.rejects(runBase44Transcription({UploadPrivateFile:async()=>({file_uri:'fixture'}),CreateFileSignedUrl:async()=>({signed_url:'https://fixture.invalid'}),TranscribeAudio:async()=>({unexpected:'value'})},fakeFile,new AbortController().signal),{code:'PROVIDER_RESPONSE'});
});
