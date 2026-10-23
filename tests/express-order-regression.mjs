import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { buildExpressCourse, createExpressSubmission, parseExpressPrice, parseExpressTranscript, resolveExpressQuartier } from '../base44/shared/expressOrder.js';
import { createExpressRecorder } from '../src/lib/expressRecorder.js';
import { getCourseLocationTarget } from '../src/lib/courseLocationTarget.js';

// Synthetic fixtures only. Coordinates are not a production neighborhood catalog.
const user = { email: 'client@example.invalid' };
const client = { user_email: user.email, country_code: 'BF', telephone: 'TEST-CONTACT', nom: 'Test' };
const depart = { id: 'q1', nom: 'Karpala', ville: 'Ville test', country_code: 'BF', actif: true, latitude: 10, longitude: -1 };
const arrivee = { ...depart, id: 'q2', nom: 'Tanghin', latitude: 11 };
const make = overrides => buildExpressCourse({ user, client, depart, arrivee, prix: 1000, ...overrides });
const deferred = () => { let resolve; let reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };

test('transcription strictement limitée à départ, arrivée, prix', () => {
  assert.deepEqual(parseExpressTranscript('de Karpala à Tanghin pour 1 000 F.'), { depart: 'Karpala', arrivee: 'Tanghin', prix: '1000' });
  for (const text of ['', 'INAUDIBLE', 'de Karpala à Tanghin', 'de Karpala à Tanghin pour 1000 F appelez 123']) assert.throws(() => parseExpressTranscript(text));
});
test('prix français en lettres sans valeur supposée ni correction ambiguë', () => {
  for (const [text, expected] of [['mille francs', '1000'], ['cinq cents francs CFA', '500'], ['mille cinq cents', '1500'], ['mille cinq cent F', '1500'], ['deux mille vingt et un', '2021'], ['quatre-vingts', '80'], ['quatre-vingt-dix', '90'], ['soixante et onze', '71'], ['1 500 F', '1500']]) assert.equal(parseExpressPrice(text), expected);
  assert.equal(parseExpressTranscript('De Karpala à Tanghin pour mille francs.').prix, '1000');
  for (const text of ['mille ou cinq cents', 'mille cinq cents non mille', 'environ mille', 'mille mille', 'cinq cents mille cinq cents mille', 'cent zéro', 'zéro', '0', '-500', '1,5', 'cinq euros']) assert.throws(() => parseExpressPrice(text));
  for (const text of ['de Karpala à Tanghin pour mille non cinq cents', 'de Karpala à Tanghin ou Pissy pour mille', 'de Karpala à Tanghin pour environ mille']) assert.throws(() => parseExpressTranscript(text));
});
test('résolution exacte, alias, ambiguïté, inconnu et isolation pays', () => {
  assert.equal(resolveExpressQuartier('Kárpala', [depart], 'BF').id, 'q1');
  assert.equal(resolveExpressQuartier('kp', [{ ...depart, variantes: 'kp' }], 'BF').id, 'q1');
  assert.throws(() => resolveExpressQuartier('Karpala', [depart, { ...depart, id: 'q3', ville: 'Autre ville' }], 'BF'), /ambigu/);
  assert.equal(resolveExpressQuartier('Karpala (Ville test)', [depart, { ...depart, id: 'q3', ville: 'Autre ville' }], 'BF').id, 'q1');
  for (const input of ['Karpla', 'Inconnu', '']) assert.throws(() => resolveExpressQuartier(input, [depart], 'BF'));
  assert.throws(() => resolveExpressQuartier('Karpala', [depart], 'CI'));
  assert.throws(() => resolveExpressQuartier('Karpala', [{ ...depart, actif: false }], 'BF'));
});
test('authentification, prix, profil bloqué et coordonnées invalides échouent fermés', () => {
  assert.throws(() => make({ user: null }));
  assert.throws(() => make({ client: { ...client, user_email: 'other@example.invalid' } }));
  assert.throws(() => make({ client: { ...client, bloque_frais_annulation: true } }));
  assert.throws(() => make({ arrivee: { ...arrivee, country_code: 'CI' } }));
  for (const prix of [0, -1, 1.5, Infinity, NaN, '', 'mille', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => make({ prix }));
  for (const coords of [{ latitude: null }, { latitude: '' }, { latitude: 91 }, { longitude: 181 }, { latitude: NaN }, { latitude: 0, longitude: 0 }]) assert.throws(() => make({ depart: { ...depart, ...coords } }));
});
test('prix confirmé préservé, contact initial distinct des deux cibles GPS', () => {
  const course = make();
  assert.equal(course.prix_propose_client, 1000);
  assert.equal(course.contact_createur_course, client.telephone);
  assert.equal(course.destinataire_telephone, '');
  assert.equal(course.destinataire_client_id, null);
  assert.equal(course.gps_depart_source, 'quartier');
  assert.equal(course.gps_arrivee_source, 'quartier');
  assert.match(course.adresse_arrivee, /approximative/);
  assert.equal(course.gps_arrivee_lat, arrivee.latitude);
  for (const phase of ['recuperation', 'livraison']) assert.deepEqual(getCourseLocationTarget({ ...course, expediteur_client_id: 'creator', destinataire_client_id: 'creator' }, phase, 'CREATOR'), { telephone: '', clientId: null });
  assert.deepEqual(getCourseLocationTarget({ destinataire_client_id: 'recipient' }, 'livraison', 'RECIPIENT'), { telephone: 'RECIPIENT', clientId: 'recipient' });
});
test('contact express client et contacts classiques conservés selon la phase', () => {
  const source = readFileSync(new URL('../src/lib/courseContact.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
  const contact = new Function(`${source}\nreturn getCourseContactForPhase;`)();
  const express = make();
  for (const phase of ['recuperation', 'livraison']) {
    assert.deepEqual(contact(express, phase), { telephone: client.telephone, nom: 'Test', role: 'Client' });
  }
  const classic = { source: 'client', expediteur_telephone: 'SENDER', destinataire_telephone: 'RECIPIENT' };
  assert.equal(contact(classic, 'recuperation').telephone, 'SENDER');
  assert.equal(contact(classic, 'livraison').telephone, 'RECIPIENT');
  assert.equal(contact({ ...classic, source: 'admin', contact_createur_course: 'ADMIN' }, 'livraison').telephone, 'ADMIN');
  assert.equal(contact({ type_course: 'deplacement', passager_telephone: 'PASSENGER' }, 'livraison').telephone, 'PASSENGER');
});
test('double confirmation et réponse perdue réutilisent request_id', async () => {
  const response = deferred(); const calls=[];
  const submit=createExpressSubmission(async (name, payload) => { calls.push({ name, payload }); return response.promise; }, () => 'test-request');
  assert.equal(calls.length, 0);
  const first=submit({ prix:1000 });
  assert.equal(await submit({ prix:1000 }), null);
  response.resolve({ data: { success:true, course: { id:'course-test' } } });
  assert.equal((await first).id, 'course-test');
  assert.equal(await submit({ prix:1000 }), null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'creerCourseClient');
  const retries=[];
  const retry=createExpressSubmission(async (_, payload) => { retries.push(payload); if(retries.length===1)throw Error('network'); return { success:true, course:{id:'same-course'} }; }, () => 'stable-id');
  await assert.rejects(retry({ prix:1000 }));
  await retry({ prix:1000 });
  assert.equal(retries[0].request_id,retries[1].request_id);
});

function recorderHarness(getUserMedia) {
  let stopped=0; const audios=[]; const errors=[]; const states=[];
  const stream={getTracks:()=>[{stop:()=>stopped++}]};
  class FakeRecorder {
    static current;
    constructor() { FakeRecorder.current=this; this.state='inactive'; this.mimeType='audio/webm'; }
    start(){this.state='recording';}
    stop(){this.state='inactive'; this.ondataavailable?.({data:new Blob(['synthetic-data'])}); this.onstop?.();}
  }
  const control=createExpressRecorder({ getUserMedia:getUserMedia || (async()=>stream), Recorder:FakeRecorder, onState:s=>states.push(s), onAudio:b=>audios.push(b), onError:e=>errors.push(e) });
  return { control, stream, audios, errors, states, FakeRecorder, stopped:()=>stopped };
}
test('aucun démarrage automatique ; arrêt et libération des pistes', async () => {
  let calls=0;
  const h=recorderHarness(async()=>{calls++;return h.stream;});
  assert.equal(calls,0);
  await h.control.start(); await h.control.start();
  assert.equal(calls,1);
  h.control.stop();
  assert.equal(h.audios.length,1);
  assert.equal(h.stopped(),1);
  h.control.cancel();
});
test('refus micro, erreur recorder, annulation avant/après autorisation', async () => {
  const denied=recorderHarness(async()=>{throw Object.assign(Error(),{name:'NotAllowedError'});});
  await denied.control.start(); assert.match(denied.errors[0],/refusé/);
  const h=recorderHarness(); await h.control.start(); h.control.cancel();
  assert.equal(h.audios.length,0); assert.equal(h.stopped(),1);
  const permission=deferred(); const pending=recorderHarness(()=>permission.promise);
  const start=pending.control.start(); pending.control.cancel(); permission.resolve(pending.stream); await start;
  assert.equal(pending.stopped(),1); assert.equal(pending.audios.length,0);
  const broken=recorderHarness(); await broken.control.start(); broken.FakeRecorder.current.onerror();
  assert.equal(broken.audios.length,0); assert.equal(broken.stopped(),1); assert.equal(broken.errors.length,1);
});
test('intégration statique : bouton avant Commander, confirmation et moteur non connecté', () => {
  const read = p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  const app=read('src/pages/ClientExterneApp.jsx');
  assert.ok(app.indexOf('<ExpressVoiceOrder') < app.indexOf('data-testid="commander-card"'));
  assert.match(app,/navigate\("\/client\/course\/expedier"/);
  const component=read('src/components/client/ExpressVoiceOrder.jsx');
  assert.match(component,/transcribe = null/); assert.match(component,/Confirmer ma commande/); assert.match(component,/bg-red-600/);
  assert.doesNotMatch(component,/InvokeLLM|TranscribeAudio|UploadFile|getCurrentPosition/);
  const entry=read('base44/functions/creerCourseClient/entry.ts');
  assert.match(entry,/base44.auth.me\(\)/); assert.match(entry,/draft.confirmed !== true/); assert.match(entry,/acquireCreationMutex/);
  const card=read('src/components/livreur/CourseActiveCard.jsx');
  assert.match(card,/getCourseLocationTarget\(course, "livraison"/);
  assert.match(card,/getCourseLocationTarget\(course, "recuperation"/);
});
