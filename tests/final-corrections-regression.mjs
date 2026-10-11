import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { captureDeliveryGps } from '../src/lib/deliveryGps.js';

const read = path => readFileSync(path, 'utf8');
const gpsCode = ts.transpile(read('base44/shared/deliveryGps.ts').replace('export ', ''), { target: ts.ScriptTarget.ES2022 });
const validateGps = new Function(`${gpsCode};return validatedDeliveryGps;`)();
assert.deepEqual(validateGps(0, 0), { latitude: 0, longitude: 0 });
for (const coords of [[91, 0], [0, 181], [null, null], ['', ''], [NaN, 2]]) {
  assert.equal(validateGps(...coords), null);
}
assert.deepEqual(await captureDeliveryGps(null), {});
assert.deepEqual(await captureDeliveryGps({ getCurrentPosition: (_ok, fail) => fail() }), {});
assert.deepEqual(await captureDeliveryGps({ getCurrentPosition: ok => ok({ coords: { latitude: 12.3, longitude: -1.5 } }) }), { latitude: 12.3, longitude: -1.5 });

// Execute the real transition endpoint with isolated entity adapters.
let handlerCode = read('base44/functions/transitionStatutLivreur/entry.ts')
  .replace(/^import .*;\r?\n/gm, '').replace('export default async function', 'async function handler');
handlerCode = ts.transpile(handlerCode, { target: ts.ScriptTarget.ES2022 });
async function transition({ actor = 'test', current = 'livreur_en_route', race = false } = {}) {
  let row = { id: 'a', statut: current, livreur_id: 'driver', source: 'client', eco_mission_id: 'm', prix_final: 1250, commission_silga: 250 };
  let progresses = 0;
  const api = { auth: { me: async () => ({ email: actor }) }, asServiceRole: { entities: {
    CourseExterne: {
      get: async () => ({ ...row }),
      updateMany: async (filter, patch) => {
        if (race) row.statut = 'annulee';
        if (row.statut !== filter.statut) return { updated: 0 };
        row = { ...row, ...patch.$set }; return { updated: 1 };
      },
    },
    Livreur: { get: async () => ({ user_email: 'test', email: 'test' }) },
  } } };
  const handler = new Function('createClientFromRequest', 'validatedDeliveryGps', 'updateEcoMissionRouteProgress',
    `${handlerCode};return handler;`)(() => api, validateGps, async () => { progresses++; return { updated: true }; });
  const response = await handler(new Request('https://isolated.invalid', { method: 'POST', body: JSON.stringify({
    course_id: 'a', statut_cible: 'colis_recupere', latitude: 12.3, longitude: -1.5, confirmation_method: 'bouton', commission_silga: 0,
  }) }));
  return { status: response.status, body: await response.json(), row, progresses };
}
const pickup = await transition();
assert.equal(pickup.status, 200);
assert.equal(pickup.row.latitude_recuperation, 12.3);
assert.equal(pickup.row.commission_silga, 250);
assert.equal(pickup.row.prix_final, 1250);
assert.equal(pickup.progresses, 1);
assert.equal((await transition({ actor: 'other' })).status, 403);
assert.equal((await transition({ current: 'colis_recupere', actor: 'other' })).status, 403);
assert.equal((await transition({ current: 'colis_recupere' })).progresses, 1);
const cancelled = await transition({ race: true });
assert.equal(cancelled.status, 409);
assert.equal(cancelled.row.statut, 'annulee');
assert.equal(cancelled.progresses, 0);

// Source-contract checks below are not device or backend tests.
const client = read('src/pages/ClientExterneApp.jsx');
assert.match(client, /saved\?\.id !== id \|\| saved.statut !== "livree"/);
assert.ok(!client.includes('onCancel={async'));
assert.match(client, /setMessageCourseId\(coursePrincipale.id\)/);
const tracking = read('src/components/client/SuiviCourseFullscreen.jsx');
assert.match(tracking, /onClick=\{onClose\} aria-label="Fermer le suivi"/);
const form = read('src/pages/CourseExterneFormSync.jsx');
assert.match(form, /formData.delivery_mode === "eco"/);
assert.match(form, /dm: deliveryMode/);
assert.match(form, /submitter\?\.dataset\?\.courseConfirm !== "true"/);
assert.match(form, /onAddAnother=/);
const cancel = read('base44/functions/annulerCourseExterne/entry.ts');
const clientNotice = cancel.slice(cancel.indexOf('if (clientEmail) {'), cancel.indexOf('// ── AUCUN REDISPATCH'));
assert.ok(!clientNotice.includes('Notification.create'));
assert.equal(clientNotice.split("invoke('envoiNotificationPush'").length - 1, 1);
const chat = read('src/components/chat/ChatWindow.jsx');
assert.ok(chat.includes('key={`${props.courseId ? "course" : "conversation"}:${props.courseId || props.conversationId}:${props.senderType}:${props.senderId}`}'));
assert.ok(chat.includes('const clientMessageId = pendingSendRef.current.id'));
assert.ok(chat.includes('return sendMessage(audioData)'));
assert.match(chat, /video_url: file_url/);
assert.match(read('src/components/chat/CourseChatPanel.jsx'), /<ChatWindow/);
assert.match(read('base44/functions/envoyerMessage/entry.ts'), /video_url: video_url \|\| null/);
console.log('PASS: GPS and transition endpoint simulations; client/navigation/notification/chat source contracts. No production calls.');
