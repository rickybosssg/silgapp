import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createGuestOrdersService } from '../base44/shared/guestOrders.js';
import { createGuestStore } from '../base44/shared/guestOrderStore.js';
import { GUEST_CONTROL_KEY, isGuestCourse, failGuest, guestCanCancel } from '../base44/shared/guestOrderPolicy.js';

const clone = value => structuredClone(value);
const silent = { log() {}, info() {}, warn() {}, error() {} };
function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: () => dependencies, console: silent, Response, Request, TextDecoder, TextEncoder, crypto, setTimeout, clearTimeout });
  return exports;
}
const terminal = load('base44/shared/courseTerminalGuard.ts');
const safety = load('base44/shared/transitionSafety.ts');
const deliveryGps = load('base44/shared/deliveryGps.ts');
const commission = load('base44/shared/commissionLock.ts');

function model(price = 500, benefit = 'normal') {
  const config = { code: 'BF', actif: true, indicatif: '226', phone_min_length: 8, phone_max_length: 8, phone_pattern: '^[05-7][0-9]{7}$', prix_minimum: 500, devise: 'FCFA', commission_pct: 20, seuil_encours_max: 50000 };
  const rows = [], state = { writes: [], outbound: [], accountingClaims: 0, recalculations: 0, creates: 0, revision: 0 };
  const drivers = ['driver1', 'driver2'].map(id => ({ id, user_email: id + '@example.invalid', nom: id, country_code: 'BF', enterprise_id: null, validation: 'valide', actif: true, statut: 'disponible', bloque_encours: false, type_livreur: 'externe', base_comptable_date: '2026-01-01T00:00:00Z', credit_surplus: 0 }));
  let actor = { id: 'user1', email: 'driver1@example.invalid', country_code: 'BF', enterprise_id: null };
  function match(row, filter) {
    return Object.entries(filter).every(([key, value]) => {
      if (key === '$or') return value.some(f => match(row, f));
      const actual = row[key] ?? null;
      if (value && typeof value === 'object') {
        if ('$in' in value) return value.$in.includes(actual);
        if ('$nin' in value) return !value.$nin.includes(actual);
        if ('$ne' in value) return actual !== value.$ne;
        if ('$lt' in value) return actual < value.$lt;
        if ('$exists' in value) return (row[key] !== undefined) === value.$exists;
      }
      return actual === value;
    });
  }
  const table = (data, kind) => ({
    get: async id => clone(data.find(v => v.id === id)),
    filter: async query => clone(data.filter(row => match(row, query))),
    create: async value => { const row = { ...clone(value), id: kind + '-' + data.length, created_date: '2026-10-28T00:00:00Z' }; data.push(row); if (kind === 'course') state.creates++; return clone(row); },
    update: async (id, patch) => { const row = data.find(r => r.id === id); Object.assign(row, clone(patch), { updated_date: 'r' + ++state.revision }); state.writes.push({ kind, patch: clone(patch) }); return clone(row); },
    updateMany: async (query, patch) => { let updated = 0; for (const row of data.filter(r => match(r, query))) { Object.assign(row, clone(patch.$set), { updated_date: 'r' + ++state.revision }); updated++; state.writes.push({ kind, patch: clone(patch.$set) }); if (kind === 'course' && patch.$set.encours_comptabilise_at) state.accountingClaims++; } return { updated }; },
  });
  const entities = {
    CourseExterne: table(rows, 'course'), Livreur: table(drivers, 'driver'),
    GuestOrderControl: table([{ id: 'control', cle: GUEST_CONTROL_KEY, enabled: true, safety_reviewed: true, countries: '["BF"]', revision: 0, grants: '[]', audit: '[]' }], 'control'),
    GuestOrderRegistry: table([{ id: 'registry', cle: GUEST_CONTROL_KEY, revision: 0, ledger: '[]' }], 'registry'),
    Country: { filter: async () => [config] },
    Quartier: { get: async id => ({ id, nom: id, ville: 'Ouagadougou', ville_operationnelle: 'ouagadougou', country_code: 'BF', actif: true, latitude: 12.3, longitude: -1.5 }) },
    DispatchNotification: { filter: async () => [] }, EcoProposal: { updateMany: async () => ({ updated: 0 }) },
  };
  const api = { auth: { me: async () => actor }, asServiceRole: { entities, functions: { invoke: async (name, body) => {
    if (name === 'calculPrixCourseExterne' || name === 'verifierEncoursLivreur') {
      const response = await handlers[name](new Request('https://isolated.invalid', { method: 'POST', body: JSON.stringify(body) })); return { data: await response.json() };
    }
    state.outbound.push({ name }); return { data: { success: false, isolated_no_send: true } };
  } } } };
  const shared = { ...terminal, ...safety, ...commission, createClientFromRequest: () => api,
    chargerConfigPays: async () => config, normalizeCommissionPct: value => Number(value), normalizeEnterpriseId: value => value || null,
    STATUTS_TERMINAUX_COURSE: ['annulee', 'livree', 'terminee'], STATUTS_ACTIFS_COURSE: ['livreur_en_route', 'client_contacte', 'en_route_expediteur', 'colis_recupere', 'en_livraison'],
    dispatchLog() {}, journaliserDispatch: async () => {}, marquerAccepte: async () => {}, waitUntil: promise => promise,
    reponseDejaPrise: reason => ({ success: false, accepted: false, reason }),
    verifyLivreurIdentity: async (_api, id) => ({ verified: true, livreur: clone(drivers.find(d => d.id === id)) }),
    verifyCityCompatibility: async () => ({ compatible: true }), verifyCurrentCityAtClaim: async () => ({ compatible: true }), buildLivreurCityFilter: async () => ({}),
    evaluerAvantageCommission: async () => ({ taux_applique: benefit === 'normal' ? 20 : 0, taux_normal: 20, mode: benefit, ...(benefit === 'pass_zero' ? { pass_id: 'pass' } : {}), ...(benefit === 'happy_hour' ? { happy_hour_id: 'happy' } : {}) }),
    notifierLivreursUnifie: async () => ({ notified: 2, push_sent: 0, push_failed: 0 }),
    ...deliveryGps, updateEcoMissionRouteProgress: async () => null, completeEcoMissionIfNeeded: async () => null,
    recalculerSoldeLivreur: async () => { state.recalculations++; return { solde: rows.reduce((sum, row) => sum + (row.encours_comptabilise_montant || 0), 0), seuil: 50000, bloque: false, statut_paiement: 'a_payer', devise: 'FCFA' }; },
  };
  const v2 = load('base44/shared/dispatchV2.ts', shared);
  const transition = load('base44/functions/transitionStatutLivreur/entry.ts', shared).default;
  const finalise = load('base44/functions/finaliserLivraisonLivreur/entry.ts', shared).default;
  const handlers = {
    calculPrixCourseExterne: load('base44/functions/calculPrixCourseExterne/entry.ts', shared).default,
    verifierEncoursLivreur: load('base44/functions/verifierEncoursLivreur/entry.ts', shared).default,
  };
  const service = createGuestOrdersService({ store: createGuestStore(api), entities, publish: row => v2.publierCourseDansFil(api, row),
    cancel: async row => {
      const r = await terminal.cancelCourseTerminal(api, row.id, 'guest-actor', 'client', fresh => { if (fresh.livreur_id) failGuest('INCIDENT_ADMIN', 'Assigned', 409); return {}; });
      if (!r.success) throw Error(r.error);
    }, decide: async () => { throw Error('not exercised'); } });
  const request = { request_id: '00000000-0000-4000-8000-000000000001', read_token: 'a'.repeat(64), action_token: 'b'.repeat(64), device_token: 'c'.repeat(64), draft: { country_code: 'BF', depart_id: 'Saaba', arrivee_id: 'Cissin', prix: price, telephone: '04040101', invitation_consent: false, confirmed: true } };
  const invoke = async (fn, body) => { const r = await fn(new Request('https://isolated.invalid', { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };
  return { service, api, request, rows, drivers, state, v2, transition, finalise, handlers, invoke, setActor: id => { actor = { id, email: id + '@example.invalid', country_code: 'BF', enterprise_id: null }; } };
}

for (const price of [500, 1000, 2500]) test(`actual handlers: guest -> V2 -> contact/pickup/delivery -> accounting once at ${price} (isolated adapters)`, async () => {
  const f = model(price); await f.service.create(f.request); const row = f.rows[0]; assert.equal(row.dispatch_status, 'disponible_push'); assert.equal(f.state.creates, 1);
  assert.equal((await f.v2.accepterCourseV2(f.api, row.id, 'driver1')).accepted, true); assert.equal(row.commission_taux_applique, 20);
  await f.service.admin({ action: 'set_enabled', enabled: false }, { id: 'admin', role: 'admin', admin_type: 'global' });
  assert.equal((await f.service.config()).enabled, false, 'Existing accepted delivery must finish with new guest orders OFF');
  for (const target of ['client_contacte', 'en_route_expediteur', 'colis_recupere', 'en_livraison']) {
    const response = await f.invoke(f.transition, { course_id: row.id, statut_cible: target, confirmation_method: 'bouton' });
    assert.equal(response.status, 200, JSON.stringify(response.body));
  }
  assert.ok(row.heure_recuperation); assert.equal(row.client_user_email, null);
  const delivery = await f.invoke(f.finalise, { course_id: row.id }); assert.equal(delivery.body.success, true, JSON.stringify(delivery));
  assert.equal(row.statut, 'livree'); assert.equal(row.prix_final, price); assert.equal(row.commission_silga, price * .2); assert.equal(row.montant_livreur, price * .8);
  await f.invoke(f.handlers.verifierEncoursLivreur, { course_id: row.id }); await f.invoke(f.handlers.verifierEncoursLivreur, { course_id: row.id });
  await f.invoke(f.finalise, { course_id: row.id }); assert.equal(f.state.accountingClaims, 1); assert.equal(f.state.recalculations, 1);
  assert.equal((await f.service.track(f.request)).course.delivered, true); assert.equal(isGuestCourse(row), true);
});

test('actual V2 accepts only one contender for the guest course; no guest email required', async () => {
  const f = model(); await f.service.create(f.request); const row = f.rows[0];
  const results = await Promise.all([f.v2.accepterCourseV2(f.api, row.id, 'driver1'), f.v2.accepterCourseV2(f.api, row.id, 'driver2')]);
  assert.equal(results.filter(r => r.accepted).length, 1); assert.ok(row.livreur_id); assert.equal(row.client_user_email, null);
});

test('actual terminal guard prevents publication/acceptance after guest cancellation', async () => {
  const f = model(); await f.service.create(f.request); await f.service.act({ ...f.request, action: 'cancel' }); const row = f.rows[0];
  assert.equal(row.statut, 'annulee'); assert.equal((await f.v2.publierCourseDansFil(f.api, row)).success, false);
  assert.notEqual((await f.v2.accepterCourseV2(f.api, row.id, 'driver1')).accepted, true); assert.equal(f.state.accountingClaims, 0);
});

test('actual CRM synchronization ignores guest before any contact/account mutation', async () => {
  const fn = load('base44/functions/syncCrmOnLivraison/entry.ts', { isGuestCourse, createClientFromRequest: () => ({}) }).default;
  const response = await fn(new Request('https://isolated.invalid', { method: 'POST', body: JSON.stringify({ course_data: { request_id: 'guest-v1:case' }, country_code: 'BF' }) }));
  assert.equal((await response.json()).reason, 'guest_contact_not_identity');
});

test('actual endpoint permits only its anonymous surface; admin/oversize/malformed requests refuse', async () => {
  const f = model(); f.api.auth.me = async () => null;
  f.api.asServiceRole.entities.SystemConfig = { filter: async () => [] };
  f.api.asServiceRole.entities.AppConfig = { filter: async () => [{ valeur: 'true' }] };
  const fn = load('base44/functions/guestOrders/entry.ts', {
    createClientFromRequest: () => f.api, createGuestOrdersService, createGuestStore, failGuest, isGuestCourse, guestCanCancel, ...terminal,
    isV2Enabled: async () => true, publierCourseDansFil: (...args) => f.v2.publierCourseDansFil(...args), genererReferenceCourse: () => 'TEST-PRIVATE',
  }).default;
  const send = (body, method = 'POST') => fn(new Request('https://isolated.invalid', { method, ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }));
  assert.equal((await send(null, 'GET')).status, 405);
  assert.equal((await send('invalid')).status, 400);
  assert.equal((await send('x'.repeat(9000))).status, 413);
  assert.equal((await send({ action: 'admin_list' })).status, 403);
  const response = await send({ ...f.request, action: 'create' }); assert.equal(response.status, 200);
  const payload = await response.json(); assert.equal(payload.course.reference, 'TEST-PRIVATE');
  assert.equal(JSON.stringify(payload).includes(f.request.read_token), false); assert.equal(f.state.creates, 1);
  f.api.asServiceRole.entities.AppConfig.filter = async () => [];
  assert.equal((await send({ ...f.request, action: 'create' })).status, 503);
  assert.equal(f.state.creates, 1, 'Missing V2 config cannot provision another flag or course');
  f.api.asServiceRole.entities.SystemConfig.filter = async () => { throw Object.assign(Error('secret-header-should-never-escape'), { status: 429 }); };
  const limited = await send({ ...f.request, action: 'create' }); assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '30'); assert.equal((await limited.text()).includes('secret-header'), false);
});

test('guest cancellation racing actual V2 acceptance has no resurrection or double assignment', async () => {
  const f = model(); await f.service.create(f.request); const row = f.rows[0];
  await Promise.allSettled([f.service.act({ ...f.request, action: 'cancel' }), f.v2.accepterCourseV2(f.api, row.id, 'driver1')]);
  if (row.statut === 'annulee') {
    assert.notEqual((await f.v2.accepterCourseV2(f.api, row.id, 'driver2')).accepted, true);
    assert.equal((await f.v2.publierCourseDansFil(f.api, row)).success, false);
  } else { assert.equal(row.livreur_id, 'driver1'); assert.equal(row.statut, 'livreur_en_route'); }
  assert.equal(f.state.creates, 1); assert.equal(f.state.accountingClaims, 0);
});

for (const benefit of ['pass_zero', 'happy_hour']) test(`actual existing ${benefit} financial lock remains zero for a guest delivery`, async () => {
  const f = model(1000, benefit); await f.service.create(f.request); const row = f.rows[0];
  assert.equal((await f.v2.accepterCourseV2(f.api, row.id, 'driver1')).accepted, true);
  for (const target of ['client_contacte', 'colis_recupere', 'en_livraison']) assert.equal((await f.invoke(f.transition, { course_id: row.id, statut_cible: target })).status, 200);
  assert.equal((await f.invoke(f.finalise, { course_id: row.id })).body.success, true);
  assert.equal(row.prix_final, 1000); assert.equal(row.commission_silga, 0); assert.equal(row.montant_livreur, 1000);
  await f.invoke(f.handlers.verifierEncoursLivreur, { course_id: row.id }); await f.invoke(f.handlers.verifierEncoursLivreur, { course_id: row.id });
  assert.equal(f.state.accountingClaims, 1); assert.equal(row.encours_comptabilise_montant, 0);
});

test('actual guest retry after withdrawal preserves course but never claims dispatch on a publication failure', async () => {
  const f = model(); await f.service.create(f.request); const row = f.rows[0];
  Object.assign(row, { statut: 'en_attente', client_decision_attendue: true, livreur_id: null, accepted_by_livreur_id: 'old-driver' });
  f.api.asServiceRole.entities.AppConfig = { filter: async () => [{ valeur: 'true' }] };
  const fn = load('base44/functions/guestOrders/entry.ts', { createClientFromRequest: () => f.api, createGuestOrdersService, createGuestStore, failGuest, isGuestCourse, guestCanCancel, ...terminal,
    publierCourseDansFil: async () => ({ success: false, reason: 'temporary_failure' }), genererReferenceCourse: () => 'TEST' }).default;
  const response = await fn(new Request('https://isolated.invalid', { method: 'POST', body: JSON.stringify({ action: 'retry_dispatch', request_id: f.request.request_id, action_token: f.request.action_token }) }));
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'DISPATCH_PENDING');
  assert.equal(row.statut, 'nouvelle'); assert.equal(row.accepted_by_livreur_id, ''); assert.equal(f.state.creates, 1); assert.equal(f.state.accountingClaims, 0);
});
