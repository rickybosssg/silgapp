import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { createGuestOrdersService } from '../base44/shared/guestOrders.js';
import { createGuestStore } from '../base44/shared/guestOrderStore.js';
import { GUEST_PREFIX, GUEST_CONTROL_KEY, GUEST_CAPACITY, guestAdminScope, guestSuperAdmin, normalizeGuestPhone, invitationEligibility, guestCourseView } from '../base44/shared/guestOrderPolicy.js';

const copy = value => structuredClone(value);
const admin = { id: 'super', role: 'admin', admin_type: 'global' };
const country = { code: 'BF', nom: 'Burkina Faso', actif: true, indicatif: '+226', phone_min_length: 8, phone_max_length: 8, phone_pattern: '^[05-7][0-9]{7}$', prix_minimum: 500, devise: 'XOF', devise_symbole: 'FCFA' };
const depart = { id: 'dep', nom: 'Saaba', ville: 'Saaba', ville_operationnelle: 'ouagadougou', latitude: 12.3, longitude: -1.4, country_code: 'BF', actif: true };
const arrivee = { ...depart, id: 'arr', nom: 'Cissin', ville: 'Ouagadougou' };
const request = (n = 1) => ({ action: 'create', request_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, read_token: 'a'.repeat(64), action_token: 'b'.repeat(64), device_token: 'c'.repeat(64),
  draft: { country_code: 'BF', depart_id: 'dep', arrivee_id: 'arr', prix: 1000, telephone: '04040101', invitation_consent: false, confirmed: true } });
const matches = (row, filter) => Object.entries(filter).every(([key, expected]) => expected && typeof expected === 'object' && '$in' in expected ? expected.$in.includes(row[key]) : row[key] === expected);

function fixture(options = {}) {
  let time = Date.parse('2026-10-28T03:00:00Z');
  const state = { control: { id: 'control', cle: GUEST_CONTROL_KEY, enabled: true, safety_reviewed: true, countries: '["BF"]', revision: 0, grants: '[]', audit: '[]' }, registry: { id: 'registry', cle: GUEST_CONTROL_KEY, revision: 0, ledger: '[]' }, configError: options.configError, rows: [], creates: 0, publications: 0, cancellations: 0, reads: 0 };
  const controlEntity = {
    filter: async () => { state.reads++; if (state.configError) throw Error('unavailable'); return [copy(state.control)]; },
    updateMany: async (filter, patch) => { if (!matches(state.control, filter)) return { updated: 0 }; Object.assign(state.control, copy(patch.$set)); return { updated: 1 }; },
  };
  const entities = {
    GuestOrderControl: controlEntity,
    GuestOrderRegistry: { filter: async () => [copy(state.registry)], updateMany: async (filter, patch) => { if (!matches(state.registry, filter)) return { updated: 0 }; Object.assign(state.registry, copy(patch.$set)); return { updated: 1 }; } },
    Country: { filter: async filter => copy((options.phoneCountries || [options.country || country]).filter(c => !filter.code || c.code === filter.code)) },
    Quartier: { get: async id => copy(id === 'dep' ? options.depart || depart : options.arrivee || arrivee), filter: async () => copy([depart, arrivee]) },
    CourseExterne: {
      get: async id => { if (options.readError) throw Error('HTTP 429'); return copy(state.rows.find(r => r.id === id)); },
      filter: async filter => copy(state.rows.filter(r => matches(r, filter))),
      create: async data => {
        state.creates++; await new Promise(resolve => setImmediate(resolve));
        if (options.beforeWriteError) throw Error('network lost');
        const row = { ...copy(data), id: '6adaf81d7da49449d2' + String(state.creates).padStart(7, '0'), created_date: new Date(time).toISOString() };
        state.rows.push(row);
        if (options.afterWriteError) throw Error('response lost');
        return copy(row);
      },
    },
  };
  const store = createGuestStore({ asServiceRole: { entities } });
  const service = createGuestOrdersService({ store, entities, now: () => time,
    publish: async row => { state.publications++; if (options.publishError) throw Error('response lost'); const live = state.rows.find(r => r.id === row.id); live.statut = 'recherche_livreur'; live.dispatch_status = 'disponible_push'; return { success: true }; },
    cancel: async row => { state.cancellations++; const live = state.rows.find(r => r.id === row.id); live.statut = 'annulee'; live.annulation_user_id = 'guest'; },
    decide: async row => { const live = state.rows.find(r => r.id === row.id); live.client_decision_attendue = false; live.statut = 'recherche_livreur'; },
  });
  return { service, store, state, entities, advance: ms => { time += ms; } };
}

test('disabled/missing/unsafe configuration fails closed for new orders only', async () => {
  for (const key of ['enabled', 'safety_reviewed']) {
    const f = fixture(); f.state.control[key] = false;
    assert.equal((await f.service.config()).enabled, false);
    await assert.rejects(f.service.create(request()), { code: 'DISABLED' }); assert.equal(f.state.creates, 0);
  }
  const f = fixture({ configError: true }); assert.deepEqual(await f.service.config(), { enabled: false, countries: [], unavailable: true });
});

test('one anonymous order has no account/email/tenant or attacker-supplied accounting', async () => {
  const f = fixture(), result = await f.service.create(request());
  assert.equal(result.success, true); assert.equal(f.state.creates, 1); assert.equal(f.state.publications, 1);
  const row = f.state.rows[0]; assert.equal(row.client_user_email, null); assert.equal(row.enterprise_id, null); assert.equal(row.expediteur_client_id, null);
  assert.equal(row.client_telephone, '22604040101'); assert.equal(row.ville_depart, 'ouagadougou'); assert.equal(row.prix_propose_client, 1000);
  assert.equal(row.source, 'client'); assert.equal(row.delivery_mode, 'standard'); assert.equal(row.tracking_token, null);
  for (const key of ['commission_silga', 'montant_livreur', 'livreur_id', 'created_by_id', 'email']) assert.equal(Object.hasOwn(row, key), false);
});

for (const key of ['enterprise_id', 'statut', 'livreur_id', 'commission_silga', 'client_user_email']) test(`reject forged draft ${key}`, async () => {
  const f = fixture(), body = request(); body.draft[key] = 'forged'; await assert.rejects(f.service.create(body), { code: 'INVALID_FIELDS' }); assert.equal(f.state.creates, 0);
});
for (const price of [0, -1, 499, 1.5, '1000', null, Number.MAX_SAFE_INTEGER + 1]) test(`reject invalid/minimum price ${price}`, async () => {
  const f = fixture(), body = request(); body.draft.prix = price; await assert.rejects(f.service.create(body), { code: 'PRICE_INVALID' });
});
for (const [phone, normalized] of [['04040101', '22604040101'], ['04 04 01 01', '22604040101'], ['+226 04 04 01 01', '22604040101'], ['0022604040101', '22604040101'], ['70000000', '22670000000']]) test(`dynamic BF phone ${phone}`, () => assert.equal(normalizeGuestPhone(phone, country), normalized));
for (const phone of ['12345678', '+22504040101', '0404010', '040401011', 'test70000000']) test(`reject invalid phone ${phone}`, () => assert.throws(() => normalizeGuestPhone(phone, country)));
test('other country phone rules are not replaced with BF defaults', () => {
  assert.equal(normalizeGuestPhone('+233201234567', { ...country, indicatif: '233', phone_min_length: 9, phone_max_length: 9, phone_pattern: '^2[0-9]{8}$' }), '233201234567');
});
test('missing tariff does not invent minimum; unknown/mixed countries and missing coordinates refuse', async () => {
  for (const options of [{ country: { ...country, prix_minimum: null } }, { depart: { ...depart, country_code: 'CI' } }, { arrivee: { ...arrivee, actif: false } }, { depart: { ...depart, latitude: null } }]) {
    const f = fixture(options); await assert.rejects(f.service.create(request())); assert.equal(f.state.creates, 0);
  }
});
test('confirmation, token separation and request allowlist are mandatory', async () => {
  for (const mutate of [b => b.draft.confirmed = false, b => b.action_token = b.read_token, b => b.device_token = 'weak', b => b.enterprise_id = 'fake']) {
    const f = fixture(), body = request(); mutate(body); await assert.rejects(f.service.create(body)); assert.equal(f.state.creates, 0);
  }
});
test('CAS concurrent same request creates and publishes only once', async () => {
  const f = fixture(); const responses = await Promise.all([f.service.create(request()), f.service.create(request()), f.service.create(request())]);
  assert.equal(f.state.creates, 1); assert.equal(f.state.publications, 1); assert.equal(f.state.rows.length, 1);
  assert.ok(responses.some(r => r.success));
});
test('concurrent different requests on same device cannot create two courses', async () => {
  const f = fixture(); const outcomes = await Promise.allSettled([f.service.create(request(1)), f.service.create(request(2))]);
  assert.equal(f.state.creates, 1); assert.equal(outcomes.filter(r => r.status === 'rejected').length, 1);
});
test('timeout after write reconciles initial row and never repeats creation/publication', async () => {
  const f = fixture({ afterWriteError: true }), body = request(); assert.equal((await f.service.create(body)).pending, true);
  assert.equal((await f.service.create(body)).success, true); assert.equal((await f.service.track(body)).success, true);
  assert.equal(f.state.creates, 1); assert.equal(f.state.publications, 0); assert.equal(f.state.rows.length, 1);
});
test('timeout before write remains uncertain, never steals/retries a creating claim', async () => {
  const f = fixture({ beforeWriteError: true }), body = request(); await f.service.create(body); f.advance(3600000);
  assert.equal((await f.service.create(body)).pending, true); assert.equal(f.state.creates, 1);
  const result = await f.service.admin({ action: 'admin_list' }, admin); assert.equal(result.counts.created, null); assert.equal(result.counts.delivered, null); assert.equal(result.counts.pending_attempts, 1);
});
test('uncertain publication is not retriggered by retry or tracking', async () => {
  const f = fixture({ publishError: true }), body = request(); const result = await f.service.create(body); assert.equal(result.dispatch, 'pending');
  await f.service.create(body); await f.service.track(body); assert.equal(f.state.publications, 1); assert.equal(f.state.creates, 1);
});
test('stale open form cannot create after disable; existing tracking/terminal delivery survive disable', async () => {
  const f = fixture(), body = request(); await f.service.catalog({ country_code: 'BF' }); await f.service.create(body);
  await f.service.admin({ action: 'set_enabled', enabled: false }, admin);
  const next = request(2); next.device_token = 'd'.repeat(64); await assert.rejects(f.service.create(next), { code: 'DISABLED' });
  assert.equal((await f.service.track(body)).success, true);
  f.state.rows[0].statut = 'livree'; f.state.rows[0].prix_final = 1000;
  assert.equal((await f.service.track(body)).course.delivered, true); assert.equal(f.state.creates, 1);
  assert.equal(JSON.parse(f.state.control.audit)[0].actor_id, admin.id);
});
test('enable requires Super Admin and readiness; country admins cannot change global flag', async () => {
  const f = fixture(); f.state.control.enabled = false; f.state.control.safety_reviewed = false;
  await assert.rejects(f.service.admin({ action: 'set_enabled', enabled: true }, admin), { code: 'SAFETY_REVIEW_REQUIRED' });
  f.state.control.safety_reviewed = true;
  await assert.rejects(f.service.admin({ action: 'set_enabled', enabled: true }, { ...admin, admin_type: 'pays', country_code: 'BF' }), { code: 'FORBIDDEN' });
  await f.service.admin({ action: 'set_enabled', enabled: true }, admin); assert.equal((await f.service.config()).enabled, true);
});
test('tokens never confer another attempt or action rights; expiry/revocation fail closed', async () => {
  const f = fixture(), body = request(); await f.service.create(body);
  for (const bad of [{ request_id: body.request_id }, { ...body, request_id: request(2).request_id }, { ...body, read_token: body.action_token }]) await assert.rejects(f.service.track(bad), { code: 'ACCESS_DENIED' });
  await assert.rejects(f.service.act({ action: 'cancel', request_id: body.request_id, action_token: body.read_token }), { code: 'ACCESS_DENIED' });
  await f.service.admin({ action: 'revoke', request_id: body.request_id }, admin);
  await assert.rejects(f.service.track(body), { code: 'ACCESS_DENIED' });
  const g = fixture(); await g.service.create(body); g.advance(7 * 86400000); await assert.rejects(g.service.track(body), { code: 'ACCESS_DENIED' });
});
test('tracking DTO omits IDs, emails, phone, finance, driver and token internals', () => {
  const dto = guestCourseView({ ...depart, id: 'private-course', client_telephone: 'private', livreur_telephone: 'private', commission_silga: 200, tracking_token: 'secret', client_user_email: 'private', statut: 'en_livraison', prix_propose_client: 1000 }, 'FCFA');
  for (const key of ['id', 'client_telephone', 'livreur_telephone', 'commission_silga', 'tracking_token', 'client_user_email', 'livreur_id']) assert.equal(Object.hasOwn(dto, key), false);
});
test('course scope changes do not expose another country/account/enterprise', async () => {
  for (const patch of [{ enterprise_id: 'tenant' }, { country_code: 'CI' }, { client_user_email: 'existing' }, { expediteur_client_id: 'existing' }]) {
    const f = fixture(), body = request(); await f.service.create(body); Object.assign(f.state.rows[0], patch); await assert.rejects(f.service.track(body), { code: 'COURSE_SCOPE' });
  }
});
test('before pickup cancellation and withdrawal decision use action token only; picked up incident refuses', async () => {
  const f = fixture(), body = request(); await f.service.create(body);
  f.state.rows[0].livreur_id = 'driver'; await assert.rejects(f.service.act({ ...body, action: 'cancel' }), { code: 'INCIDENT_ADMIN' });
  f.state.rows[0].livreur_id = null; f.state.rows[0].client_decision_attendue = true;
  await f.service.act({ ...body, action: 'retry_dispatch' }); assert.equal(f.state.rows[0].client_decision_attendue, false);
  f.state.rows[0].pickup_confirmed_at = '2026-10-28T03:00:00Z'; await assert.rejects(f.service.act({ ...body, action: 'cancel' }));
  f.state.rows[0].pickup_confirmed_at = null; await f.service.act({ ...body, action: 'cancel' });
  assert.equal(f.state.rows[0].statut, 'annulee'); await assert.rejects(f.service.act({ ...body, action: 'retry_dispatch' }));
});
for (const user of [null, { id: 'client', role: 'user' }, { ...admin, enterprise_id: 'company' }, { ...admin, data: { enterprise_id: 'company' } }]) test(`admin access rejects ${JSON.stringify(user)}`, () => assert.throws(() => guestAdminScope(user)));
test('admin country scope, filters, no conversion invention and read errors remain errors', async () => {
  const f = fixture(), body = request(); await f.service.create(body);
  const user = { ...admin, admin_type: 'pays', country_code: 'BF' };
  await assert.rejects(f.service.admin({ action: 'admin_list', country_code: 'CI' }, user));
  const data = await f.service.admin({ action: 'admin_list', country_code: 'BF', statut: 'annulee' }, user);
  assert.equal(data.rows.length, 0); assert.equal(data.counts.created, 1); assert.equal(data.counts.registrations, null);
  const all = await f.service.admin({ action: 'admin_list' }, user); assert.equal(all.contacts[0].verified_person, false); assert.equal(all.invitation_sending, 'Non disponible');
  f.entities.CourseExterne.filter = async () => { throw Error('HTTP 429'); }; await assert.rejects(f.service.admin({ action: 'admin_list' }, user), /429/);
});
test('promotional consent cannot be granted; old opposition and cooldown are retained', async () => {
  const f = fixture(), body = request(); await f.service.create(body);
  let row = (await f.service.admin({ action: 'admin_list' }, admin)).contacts[0]; assert.equal(row.invitation.eligible, false);
  await assert.rejects(f.service.act({ ...body, action: 'consent', consent: true }), { code: 'CONSENT_INVALID' });
  row = (await f.service.admin({ action: 'admin_list' }, admin)).contacts[0]; assert.equal(row.invitation.eligible, false);
  await f.service.act({ ...body, action: 'consent', consent: false });
  row = (await f.service.admin({ action: 'admin_list' }, admin)).contacts[0]; assert.equal(row.invitation.opposed, true); assert.equal(row.invitation.eligible, false);
  assert.equal(invitationEligibility([{ invitation_consent: true, last_invitation_at: '2026-10-28T00:00:00Z' }], Date.parse('2026-10-29')).eligible, false);
});

test('phone country is independent of route country and stored in international format', async () => {
  const gh = { ...country, code: 'GH', nom: 'Ghana', indicatif: '+233', phone_min_length: 9, phone_max_length: 9, phone_pattern: '^2[0-9]{8}$' };
  const f = fixture({ phoneCountries: [country, gh] }), body = request();
  body.draft.phone_country_code = 'GH'; body.draft.telephone = '+233 20 123 4567';
  const catalog = await f.service.catalog({ country_code: 'BF' });
  assert.deepEqual(catalog.phone_countries.map(c => c.code), ['BF', 'GH']);
  await f.service.create(body);
  assert.equal(f.state.rows[0].country_code, 'BF'); assert.equal(f.state.rows[0].client_telephone, '233201234567');
  const entry = JSON.parse(f.state.registry.ledger)[0]; assert.equal(entry.phone_country_code, 'GH'); assert.equal(entry.invitation_consent, false); assert.equal(entry.consent_at, null); assert.equal(entry.invitation_channel, null);
});

test('unknown phone country and attempted promotional opt-in create nothing', async () => {
  for (const patch of [{ phone_country_code: 'ZZ' }, { invitation_consent: true }]) {
    const f = fixture(), body = request(); Object.assign(body.draft, patch);
    await assert.rejects(f.service.create(body)); assert.equal(f.state.creates, 0);
  }
});

test('guest phone input strips only the selected international prefix and preserves BF zero', async () => {
  const text = fs.readFileSync('src/lib/guestPhone.js', 'utf8').replace(/import .*?;\r?\n/, '').replace('export { normalizeGuestPhone };', '').replaceAll('export function', 'function');
  const context = { String }; vm.createContext(context); vm.runInContext(text + '; globalThis.input=guestNationalInput; globalThis.flag=guestCountryFlag;', context);
  for (const value of ['+226 04 04 01 01', '00226 04 04 01 01', '22604040101']) assert.equal(context.input(value, country), '04040101');
  assert.equal(context.input('04040101', country), '04040101'); assert.equal(context.input('+233201234567', country), '+233201234567');
  assert.equal([...context.flag('BF')].length, 2); assert.equal(context.flag('bad'), '');
});
test('bounded pilot capacity fails closed; no deletion/eviction or global IP ban', () => {
  assert.equal(GUEST_CAPACITY, 200); const source = fs.readFileSync('base44/shared/guestOrders.js', 'utf8');
  assert.doesNotMatch(source, /entities\.[A-Za-z]+\.delete|x-forwarded-for|sendSMS|sendWhatsApp|envoiNotificationPush/);
});

function publicHandler(file, extra = {}) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^import .*;\r?\n/gm, '');
  let handler;
  const context = { Response, Request, console: { log() {}, warn() {}, error() {} }, Deno: { serve: fn => { handler = fn; } }, ...extra };
  vm.runInNewContext(ts.transpileModule(raw, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, context);
  return handler;
}
test('actual public tracking handler rejects guest IDs but preserves ordinary tracking', async () => {
  const { isGuestCourse } = await import('../base44/shared/guestOrderPolicy.js');
  for (const guest of [false, true]) {
    const row = { id: 'course', request_id: guest ? GUEST_PREFIX + request().request_id : 'normal' };
    const handler = publicHandler('base44/functions/getSuiviCourse/entry.ts', { isGuestCourse, createClientFromRequest: () => ({ asServiceRole: { entities: { CourseExterne: { filter: async () => [], get: async () => row } } } }) });
    const result = await handler(new Request('https://isolated.invalid', { method: 'POST', body: JSON.stringify({ token: 'course' }) }));
    assert.equal(result.status, guest ? 404 : 200); if (guest) assert.equal((await result.json()).course, undefined);
  }
});
test('actual client notification handler skips guest before phone/account lookups', async () => {
  const { isGuestCourse } = await import('../base44/shared/guestOrderPolicy.js');
  const handler = publicHandler('base44/functions/notifyClientSync/entry.ts', { isGuestCourse, createClientFromRequest: () => ({ asServiceRole: { entities: { CourseExterne: { get: async () => ({ request_id: GUEST_PREFIX + request().request_id }) } } } }) });
  const response = await handler(new Request('https://isolated.invalid', { method: 'POST', body: JSON.stringify({ course_id: 'guest' }) }));
  assert.equal(response.status, 200); assert.equal((await response.json()).reason, 'guest_private_tracking');
});

test('unavailable creation setting does not block existing private tracking or course decisions', async () => {
  const f = fixture(), body = request(); await f.service.create(body); f.state.configError = true;
  assert.equal((await f.service.config()).enabled, false);
  assert.equal((await f.service.track(body)).success, true);
  await assert.rejects(f.service.create({ ...request(2), device_token: 'd'.repeat(64) }));
  const data = await f.service.admin({ action: 'admin_list' }, admin); assert.equal(data.configuration_unavailable, true); assert.equal(data.counts.created, 1);
  await f.service.act({ ...body, action: 'cancel' }); assert.equal(f.state.rows[0].statut, 'annulee');
});
test('OFF wins before authorization CAS even when catalogue and draft already loaded', async () => {
  const f = fixture(); await f.service.catalog({ country_code: 'BF' });
  const mutate = f.store.mutatePolicy; f.store.mutatePolicy = async fn => { f.state.control.enabled = false; return mutate(fn); };
  await assert.rejects(f.service.create(request()), { code: 'DISABLED' }); assert.equal(f.state.creates, 0);
});
test('already authorized in-flight creation may finish after OFF without losing its private access', async () => {
  const f = fixture(), body = request(); let release, entered;
  const started = new Promise(resolve => { entered = resolve; }), blocked = new Promise(resolve => { release = resolve; });
  const create = f.entities.CourseExterne.create;
  f.entities.CourseExterne.create = async data => { entered(); await blocked; return create(data); };
  const pending = f.service.create(body); await started;
  await f.service.admin({ action: 'set_enabled', enabled: false }, admin); release();
  assert.equal((await pending).success, true); assert.equal((await f.service.track(body)).success, true); assert.equal(f.state.creates, 1);
});
test('per-phone soft rate limit, bounded grants and unavailable registry never fabricate successful deliveries', async () => {
  const f = fixture();
  for (let n = 1; n <= 10; n++) await f.service.create({ ...request(n), device_token: (n + 16).toString(16).repeat(32) });
  await assert.rejects(f.service.create({ ...request(11), device_token: 'd'.repeat(64) }), { code: 'RATE_LIMIT' });
  const adminData = await f.service.admin({ action: 'admin_list' }, admin); assert.equal(adminData.counts.delivered, 0); assert.equal(adminData.counts.created, 10);
  const full = fixture(); full.state.control.grants = JSON.stringify(Array.from({ length: GUEST_CAPACITY }, (_, n) => ({ request_id: String(n) })));
  await assert.rejects(full.service.create(request()), { code: 'CAPACITY' }); assert.equal(full.state.creates, 0);
  const broken = fixture(); broken.state.registry.ledger = 'invalid'; await assert.rejects(broken.service.create(request()), { code: 'CONFIG_INVALID' });
});

test('guest may order again after confirmed delivery without an account or phone identity link', async () => {
  const f = fixture(), first = request(); await f.service.create(first);
  await assert.rejects(f.service.create(request(2)), { code: 'DEVICE_LIMIT' });
  f.state.rows[0].statut = 'livree';
  const second = await f.service.create(request(3));
  assert.equal(second.success, true); assert.equal(f.state.creates, 2); assert.equal(f.state.rows[0].statut, 'livree');
  assert.equal(f.state.rows[1].client_user_email, null); assert.equal(f.state.rows[1].expediteur_client_id, null);
  assert.equal((await f.service.track(first)).course.delivered, true);
  assert.equal(f.state.publications, 2);
});

test('concurrent new attempts share one active slot, not a one-lifetime-order restriction', async () => {
  const f = fixture(); const results = await Promise.allSettled([f.service.create(request(1)), f.service.create(request(2))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.state.creates, 1);
  f.state.rows[0].statut = 'annulee';
  assert.equal((await f.service.create(request(3))).success, true); assert.equal(f.state.creates, 2);
  assert.equal(f.state.rows[0].statut, 'annulee');
});

test('only fresh scoped driver position is returned while assigned; never a full driver object', async () => {
  const f = fixture(), body = request(); await f.service.create(body);
  const driver = { id: 'driver', country_code: 'BF', latitude: 12.3, longitude: -1.5, derniere_position_date: '2026-10-28T03:00:00Z', gps_accuracy: 20, email: 'private', telephone: 'private' };
  let reads = 0; f.entities.Livreur = { get: async () => { reads++; return driver; } };
  assert.equal((await f.service.track(body)).course.driver_position, null); assert.equal(reads, 0);
  f.state.rows[0].livreur_id = 'driver'; f.state.rows[0].statut = 'livreur_en_route';
  let view = (await f.service.track(body)).course;
  assert.deepEqual(Object.keys(view.driver_position).sort(), ['acquired_at', 'lat', 'lng']); assert.equal(view.assigned, true);
  assert.equal(JSON.stringify(view).includes('private'), false);
  for (const patch of [{ country_code: 'GH' }, { enterprise_id: 'company' }, { gps_accuracy: 101 }, { gps_accuracy: null }, { derniere_position_date: '2026-10-28T02:00:00Z' }, { latitude: null }]) {
    const original = { ...driver }; Object.assign(driver, patch); assert.equal((await f.service.track(body)).course.driver_position, null); Object.assign(driver, original); delete driver.enterprise_id;
  }
  f.state.rows[0].statut = 'livree'; assert.equal((await f.service.track(body)).course.driver_position, null);
});

test('reused country selector keeps connected styling and isolates its provided-catalogue view', () => {
  const after = fs.readFileSync('src/components/ui/CountrySelect.jsx', 'utf8');
  const attributes = source => {
    const ast = ts.createSourceFile('selector.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX), rows = [];
    const visit = node => { if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'className') rows.push(node.initializer.getText(ast)); ts.forEachChild(node, visit); }; visit(ast); return rows;
  };
  // Snapshot of the existing selector's JSX class attributes, not private evidence.
  assert.equal(createHash('sha256').update(JSON.stringify(attributes(after))).digest('hex'), '370ae60196d85d29195c83b32e016cddc0de29302dc6309b671ccb9d76cb721b');
  assert.equal((after.match(/useActiveCountries\(\)/g) || []).length, 1);
  assert.doesNotMatch(after.slice(after.indexOf('export function CountrySelectView')), /useActiveCountries|entities\./);
});

const { retryDelayMs, withRequestDeadline } = await import('../src/lib/guestTrackingState.js');
function clientHelpers() {
  const code = fs.readFileSync('src/lib/guestOrderClient.js', 'utf8').replace(/^import .*;\r?\n/gm, '');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, crypto, Preferences: {}, base44: {}, retryDelayMs, withRequestDeadline });
  return exports;
}
test('client persists capabilities before any create and blocks same-tick duplicate confirmation', async () => {
  const { createGuestSubmission } = clientHelpers(); let saved, calls = 0, release;
  const storage = { read: async () => saved, save: async data => { saved = data; } };
  const submit = createGuestSubmission(async () => { assert.ok(saved); calls++; await new Promise(resolve => { release = resolve; }); return { success: true }; }, storage);
  const first = submit(request().draft); assert.equal(await submit(request().draft), null);
  await new Promise(resolve => setImmediate(resolve)); release(); await first; assert.equal(calls, 1);
});
test('storage failure never sends an order; recovery reuses exact draft and request after response loss', async () => {
  const { createGuestSubmission } = clientHelpers(); let saved, calls = 0, failStorage = true;
  const storage = { read: async () => saved, save: async data => { if (failStorage) throw Error('disk'); saved = data; } };
  const sent = [];
  let submit = createGuestSubmission(async (_action, data) => { sent.push(copy(data)); calls++; throw Error('lost response'); }, storage);
  await assert.rejects(submit(request().draft)); assert.equal(calls, 0);
  failStorage = false; await assert.rejects(submit(request().draft));
  const initial = copy(saved);
  submit = createGuestSubmission(async (_action, data) => { sent.push(copy(data)); return { success: true }; }, storage);
  await submit({ ...request().draft, prix: 99999 });
  assert.equal(sent.at(-1).request_id, initial.request_id); assert.deepEqual(sent.at(-1).draft, initial.draft);
  assert.equal(sent.at(-1).read_token, initial.read_token); assert.equal(sent.at(-1).draft.prix, 1000); assert.equal(Object.hasOwn(sent.at(-1), 'draft_rejected'), false);
});
test('local storage is separate, verified and capabilities are not account access tokens', async () => {
  const { guestStorage, newGuestAccess } = clientHelpers(); const values = new Map();
  const storage = guestStorage({ get: async ({ key }) => ({ value: values.get(key) }), set: async ({ key, value }) => values.set(key, value) });
  const access = newGuestAccess(); assert.notEqual(access.read_token, access.action_token); assert.equal(access.read_token.length, 64);
  await storage.save(access); assert.equal((await storage.read()).request_id, access.request_id);
  assert.deepEqual([...values.keys()], ['silgapp_guest_order_v1']);
});

test('client validates direct/wrapped business receipts and refuses empty/malformed success', async () => {
  const { guestApi } = clientHelpers();
  for (const wrapped of [false, true]) {
    const result = { success: true, course: { statut: 'recherche_livreur' } };
    const call = guestApi({ functions: { invoke: async () => wrapped ? { data: result } : result } });
    assert.equal((await call('create')).course.statut, 'recherche_livreur');
  }
  for (const value of [null, {}, { success: true }, { success: false, error: 'Refus réel' }, { data: null }]) {
    const call = guestApi({ functions: { invoke: async () => value } }); await assert.rejects(call('create'));
  }
});

test('both admin menus preserve old Express guard and country selector markup', () => {
  for (const file of ['src/components/layout/Sidebar.jsx', 'src/components/layout/MobileNav.jsx']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /filter\(item => !item.superAdminOnly \|\| canManageExpress\)/);
    assert.match(source, /filter\(item => !item.publicAdminOnly/);
    const old = fs.readFileSync('tests/fixtures/ios73-baseline/' + file, 'utf8');
    const styles = text => [...text.matchAll(/className=(?:"[^"]*"|\{[^\n]+\})/g)].map(m => m[0]);
    assert.deepEqual(styles(source), styles(old), 'No iOS selector/global menu style change');
  }
});

test('audit capacity never prevents OFF; repeated OFF is idempotent; corrupt policy closes creation only', async () => {
  const f = fixture(); f.state.control.audit = JSON.stringify(Array.from({ length: 500 }, () => ({ enabled: true })));
  await f.service.admin({ action: 'set_enabled', enabled: false }, admin);
  await f.service.admin({ action: 'set_enabled', enabled: false }, admin);
  assert.equal(JSON.parse(f.state.control.audit).length, 501); assert.equal((await f.service.config()).enabled, false);
  await assert.rejects(f.service.admin({ action: 'set_enabled', enabled: true }, admin), { code: 'AUDIT_CAPACITY' });
  const g = fixture(), body = request(); await g.service.create(body); g.state.control.audit = 'corrupted';
  assert.equal((await g.service.config()).enabled, false); assert.equal((await g.service.track(body)).success, true);
});

test('real withdrawal status en_attente remains cancellable only when awaiting a client decision', async () => {
  const f = fixture(), body = request(); await f.service.create(body);
  Object.assign(f.state.rows[0], { statut: 'en_attente', client_decision_attendue: true, livreur_id: null });
  assert.equal((await f.service.track(body)).course.can_cancel, true);
  await f.service.act({ ...body, action: 'cancel' }); assert.equal(f.state.rows[0].statut, 'annulee');
});

test('validation refusal permits correction with the SAME durable request/capabilities; network uncertainty does not', async () => {
  const { createGuestSubmission } = clientHelpers(); let saved, attempts = 0, ids = 0; const bodies = [];
  const storage = { read: async () => saved, save: async value => { saved = copy(value); } };
  const make = () => { ids++; const body = request(); return { request_id: body.request_id, read_token: body.read_token, action_token: body.action_token, device_token: body.device_token }; };
  const call = async (_action, body) => { bodies.push(copy(body)); if (++attempts === 1) throw Object.assign(Error('Numéro invalide'), { code: 'PHONE_INVALID', status: 400 }); return { success: true, course: { statut: 'nouvelle' } }; };
  let submit = createGuestSubmission(call, storage, make);
  await assert.rejects(submit({ ...request().draft, telephone: '123' }), { draftRejected: true });
  assert.equal(saved.draft_rejected, true); assert.equal(saved.draft.telephone, '123');
  submit = createGuestSubmission(call, storage, make); // Reopen with persisted receipt.
  await submit({ ...request().draft, telephone: '04040101' });
  assert.equal(ids, 1); assert.equal(bodies[0].request_id, bodies[1].request_id); assert.equal(bodies[0].action_token, bodies[1].action_token);
  assert.equal(bodies[1].draft.telephone, '04040101'); assert.equal(saved.draft_rejected, false); assert.equal(Object.hasOwn(bodies[1], 'draft_rejected'), false);
});

test('direct/wrapped SDK validation codes survive without carrying Axios credentials', async () => {
  const { guestApi } = clientHelpers();
  for (const wrapped of [false, true]) {
    const data = { success: false, error: 'Prix invalide', code: 'PRICE_INVALID' };
    const call = guestApi({ functions: { invoke: async () => { if (wrapped) throw { response: { data }, config: { secret: 'not copied' } }; return data; } } });
    await assert.rejects(call('create'), e => e.code === 'PRICE_INVALID' && !e.config && !JSON.stringify(e).includes('not copied'));
  }
});
