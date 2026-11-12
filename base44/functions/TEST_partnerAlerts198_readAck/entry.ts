// bundle:base44/functions/TEST_partnerAlerts198_readAck/exact/policy.js
function scopeKey(s) {
  if (!s || !["boutique", "restaurant", "pharmacie"].includes(s.kind) || !["country", "establishmentId", "actorId"].every((k) => typeof s[k] === "string" && s[k].trim()) || s.enterpriseId !== null && typeof s.enterpriseId !== "string") throw new Error("INVALID_SCOPE");
  return JSON.stringify([s.country, s.enterpriseId, s.kind, s.establishmentId, s.actorId]);
}
function eventKey(a) {
  if (!a || !["order", "pharmacy_conversation"].includes(a.type) || typeof a.sourceId !== "string" || !a.sourceId.trim()) throw new Error("INVALID_EVENT");
  return JSON.stringify([a.country, a.enterpriseId, a.kind, a.establishmentId, a.type, a.sourceId]);
}
function sameScope(a, s) {
  return a.country === s.country && a.enterpriseId === s.enterpriseId && a.kind === s.kind && a.establishmentId === s.establishmentId;
}
function authorize(a, s) {
  scopeKey(s);
  eventKey(a);
  if (!sameScope(a, s) || !Array.isArray(s.allowedEstablishmentIds) || !s.allowedEstablishmentIds.includes(a.establishmentId)) throw new Error("FORBIDDEN");
  if (a.type === "pharmacy_conversation" && a.kind !== "pharmacie" || a.type === "order" && a.kind === "pharmacie") throw new Error("INVALID_EVENT");
}
function acknowledge(a, s, receipt) {
  authorize(a, s);
  if (a.status !== "pending") return a;
  if (!receipt || receipt.persisted !== true || receipt.sourceId !== a.sourceId || receipt.actorId !== s.actorId || !Number.isFinite(receipt.at) || receipt.at < a.createdAt)
    throw new Error("UNCONFIRMED_ACTION");
  const expected = a.type === "order" ? "take_charge" : "pharmacy_reply";
  if (receipt.action !== expected || a.type === "pharmacy_conversation" && !receipt.messageId)
    throw new Error("WRONG_ACTION");
  return { ...a, status: "acknowledged", acknowledgedAt: receipt.at, acknowledgedBy: s.actorId };
}
function visiblePending(rows, s) {
  scopeKey(s);
  const seen = /* @__PURE__ */ new Set();
  return rows.filter((a) => {
    authorize(a, s);
    const key = eventKey(a);
    if (seen.has(key)) throw new Error("DUPLICATE_SERVER_EVENT");
    seen.add(key);
    if (!["pending", "acknowledged", "cancelled"].includes(a.status)) throw new Error("INVALID_STATUS");
    return a.status === "pending";
  });
}

// bundle:base44/functions/TEST_partnerAlerts198_readAck/exact/api.js
function createPartnerAlertsApi({ auth, store, clock = Date.now }) {
  async function resolve(request, body) {
    const actor = await auth(request);
    if (!actor?.id) throw Object.assign(Error("AUTH_REQUIRED"), { status: 401 });
    const scope = await store.authorizedScope(actor, { kind: body.kind, establishmentId: body.establishmentId });
    if (!scope || scope.actorId !== actor.id) throw Object.assign(Error("FORBIDDEN"), { status: 403 });
    scopeKey(scope);
    return scope;
  }
  return async function handle(request, body) {
    let writing = false;
    try {
      if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("INVALID_REQUEST");
      const allowed = ["action", "kind", "establishmentId", "sourceId", "requestId"];
      if (Object.keys(body).some((k) => !allowed.includes(k))) throw Error("UNEXPECTED_FIELD");
      if (!["read", "take_charge", "reconcile"].includes(body.action)) throw Error("INVALID_ACTION");
      const scope = await resolve(request, body);
      if (body.action === "read") {
        const snapshot = await store.readCompleteSnapshot(scope);
        if (snapshot?.complete !== true || !Array.isArray(snapshot.rows)) throw Error("READ_INCOMPLETE");
        visiblePending(snapshot.rows, scope);
        return { status: 200, body: { success: true, scopeKey: scopeKey(scope), ...snapshot } };
      }
      if (typeof body.sourceId !== "string" || !body.sourceId.trim()) throw Error("INVALID_SOURCE");
      const event = await store.readEvent(scope, body.sourceId);
      authorize(event, scope);
      if (event.sourceId !== body.sourceId) throw Error("SOURCE_MISMATCH");
      if (body.action === "reconcile") return { status: 200, body: { success: true, scopeKey: scopeKey(scope), event } };
      if (event.type !== "order") throw Error("PHARMACY_REPLY_REQUIRED");
      if (typeof body.requestId !== "string" || !body.requestId.trim() || body.requestId.length > 128) throw Error("INVALID_REQUEST_ID");
      if (event.status !== "pending") return { status: 200, body: { success: true, scopeKey: scopeKey(scope), event, replayed: true } };
      const receipt = { persisted: true, action: "take_charge", sourceId: event.sourceId, actorId: scope.actorId, at: clock() };
      const proposed = acknowledge(event, scope, receipt);
      writing = true;
      const changed = await store.compareAndAcknowledge({
        scope,
        eventKey: eventKey(event),
        expectedRevision: event.revision,
        sourceId: event.sourceId,
        requestId: body.requestId,
        acknowledgedAt: proposed.acknowledgedAt,
        acknowledgedBy: proposed.acknowledgedBy
      });
      const confirmed = await store.readEvent(scope, body.sourceId);
      authorize(confirmed, scope);
      if (!["acknowledged", "cancelled"].includes(confirmed.status)) throw Error("ACK_UNCONFIRMED");
      if (changed === true) try {
        await store.notifyStateChanged(scope, confirmed);
      } catch {
      }
      return { status: 200, body: { success: true, scopeKey: scopeKey(scope), event: confirmed } };
    } catch (error) {
      const status = writing ? 503 : error.status || (/FORBIDDEN|PHARMACY_REPLY_REQUIRED/.test(error.message) ? 403 : 400);
      return { status, body: { success: false, error: writing ? "ACK_UNCONFIRMED" : "ALERT_REQUEST_UNAVAILABLE", uncertain: writing } };
    }
  };
}
async function acknowledgePharmacyReply({ store, messageId, clock = Date.now }) {
  const message = await store.readPersistedMessage(messageId);
  if (!message?.id || message.id !== messageId || message.automated === true || !message.senderUserId || !message.conversationId) throw Error("INVALID_REPLY");
  const scope = await store.scopeForPersistedPharmacySender(message);
  if (!scope || scope.kind !== "pharmacie" || scope.actorId !== message.senderUserId) throw Error("FORBIDDEN");
  const event = await store.readEvent(scope, message.conversationId);
  authorize(event, scope);
  if (event.type !== "pharmacy_conversation") throw Error("INVALID_EVENT");
  if (event.status !== "pending") return event;
  const next = acknowledge(event, scope, { persisted: true, action: "pharmacy_reply", sourceId: message.conversationId, actorId: scope.actorId, at: message.createdAt, messageId });
  const changed = await store.compareAndAcknowledge({ scope, eventKey: eventKey(event), expectedRevision: event.revision, sourceId: event.sourceId, requestId: "message:" + message.id, acknowledgedAt: next.acknowledgedAt, acknowledgedBy: next.acknowledgedBy });
  const confirmed = await store.readEvent(scope, event.sourceId);
  authorize(confirmed, scope);
  if (!["acknowledged", "cancelled"].includes(confirmed.status)) throw Error("ACK_UNCONFIRMED");
  if (changed === true) try {
    await store.notifyStateChanged(scope, confirmed);
  } catch {
  }
  return confirmed;
}

// bundle:base44/functions/TEST_partnerAlerts198_readAck/exact/base44-adapter.js
function createBase44PartnerAlertStore({ sdk, rolloutStart, mutationContractVerified = false, now = Date.now }) {
  const sr = sdk.asServiceRole.entities;
  const parseTime = (v) => {
    const n = Date.parse(v);
    if (!Number.isFinite(n)) throw Error("INVALID_TIME");
    return n;
  };
  const floor = parseTime(rolloutStart);
  const meta = { boutique: { entity: "Boutique", orders: "CommandeBoutique", parent: "boutique_id" }, restaurant: { entity: "Restaurant", orders: "CommandeRestaurant", parent: "restaurant_id" }, pharmacie: { entity: "Pharmacie", orders: "Conversation" } };
  const participants = (c) => {
    const p = JSON.parse(c.participants || "[]");
    if (!Array.isArray(p)) throw Error("INVALID_PARTICIPANTS");
    return p;
  };
  async function assertOwner(scope) {
    const m = meta[scope.kind];
    if (!m) throw Error("INVALID_TYPE");
    const shop = await sr[m.entity].get(scope.establishmentId);
    if (shop?.id !== scope.establishmentId || shop.partenaire_id !== scope.actorId || shop.pays_code !== scope.country || shop.enterprise_id || scope.enterpriseId !== null) throw Error("FORBIDDEN");
    return shop;
  }
  function event(row, scope) {
    const m = meta[scope.kind];
    if (scope.kind === "pharmacie") {
      if (!participants(row).some((p) => p.type === "partenaire" && p.id === scope.establishmentId)) throw Error("FORBIDDEN");
    } else if (row[m.parent] !== scope.establishmentId || row.pays_code !== scope.country || row.enterprise_id) throw Error("FORBIDDEN");
    const createdAt = parseTime(row.created_date);
    if (createdAt < floor) throw Error("BEFORE_ROLLOUT");
    const terminal = scope.kind !== "pharmacie" && ["annulee", "livree"].includes(row.statut);
    const businessHandled = scope.kind !== "pharmacie" && ["commande_recue", "paiement_verification", "paiement_valide", "paiement_refuse", "en_preparation", "prete_recuperation", "livreur_assigne", "commande_recuperee", "en_livraison"].includes(row.statut);
    return {
      kind: scope.kind,
      country: scope.country,
      enterpriseId: null,
      establishmentId: scope.establishmentId,
      type: scope.kind === "pharmacie" ? "pharmacy_conversation" : "order",
      sourceId: row.id,
      createdAt,
      status: terminal ? "cancelled" : businessHandled || row.partner_alert_ack_at && row.partner_alert_ack_by === scope.actorId ? "acknowledged" : "pending",
      revision: row.updated_date,
      acknowledgedAt: row.partner_alert_ack_at ? parseTime(row.partner_alert_ack_at) : null,
      acknowledgedBy: row.partner_alert_ack_by || null
    };
  }
  async function readSource(scope, id) {
    await assertOwner(scope);
    const row = await sr[meta[scope.kind].orders].get(id);
    if (row?.id !== id) throw Error("SOURCE_MISSING");
    event(row, scope);
    return row;
  }
  return {
    async authorizedScope(actor, target) {
      const m = meta[target.kind];
      if (!m || !target.establishmentId) return null;
      const shop = await sr[m.entity].get(target.establishmentId);
      if (shop?.id !== target.establishmentId || shop.partenaire_id !== actor.id || typeof shop.pays_code !== "string" || !shop.pays_code || shop.enterprise_id) return null;
      return { actorId: actor.id, kind: target.kind, country: shop.pays_code, enterpriseId: null, establishmentId: shop.id, allowedEstablishmentIds: [shop.id] };
    },
    async readCompleteSnapshot(scope) {
      await assertOwner(scope);
      const m = meta[scope.kind];
      const filter = scope.kind === "pharmacie" ? { participant_user_ids: { $in: [scope.actorId] }, created_date: { $gte: rolloutStart } } : { [m.parent]: scope.establishmentId, pays_code: scope.country, created_date: { $gte: rolloutStart } };
      const rows = await sr[m.orders].filter(filter, "-created_date", 201);
      if (!Array.isArray(rows) || rows.length > 200) throw Error("READ_INCOMPLETE");
      const scoped = scope.kind === "pharmacie" ? rows.filter((r) => participants(r).some((p) => p.type === "partenaire" && p.id === scope.establishmentId)) : rows;
      return { complete: true, rows: scoped.map((r) => event(r, scope)) };
    },
    async readEvent(scope, id) {
      return event(await readSource(scope, id), scope);
    },
    async compareAndAcknowledge({ scope, sourceId, expectedRevision, requestId, acknowledgedAt, acknowledgedBy }) {
      if (mutationContractVerified !== true) throw Error("SERVER_CONTRACT_UNVERIFIED");
      const row = await readSource(scope, sourceId);
      if (acknowledgedBy !== scope.actorId) throw Error("FORBIDDEN");
      if (!row.updated_date || row.updated_date !== expectedRevision || event(row, scope).status !== "pending") return false;
      const m = meta[scope.kind], filter = { id: sourceId, updated_date: row.updated_date };
      if (scope.kind !== "pharmacie") {
        filter[m.parent] = scope.establishmentId;
        filter.pays_code = scope.country;
        filter.statut = row.statut;
      } else filter.participants = row.participants;
      const result = await sr[m.orders].updateMany(filter, { $set: { partner_alert_ack_at: new Date(acknowledgedAt).toISOString(), partner_alert_ack_by: scope.actorId, partner_alert_request_id: requestId } });
      if (result?.success !== true || result.has_more === true || ![0, 1].includes(result.updated)) throw Error("CAS_OUTCOME_UNCERTAIN");
      await assertOwner(scope);
      return result.updated === 1;
    },
    async notifyStateChanged() {
    },
    async readPersistedMessage(id) {
      const m = await sr.Message.get(id);
      if (m?.id !== id) throw Error("MESSAGE_NOT_FOUND");
      throw Error("PHARMACY_SENDER_RESOLVER_REQUIRED");
    },
    async scopeForPersistedPharmacySender() {
      throw Error("PHARMACY_SENDER_RESOLVER_REQUIRED");
    }
  };
}

// bundle:base44/functions/TEST_partnerAlerts198_readAck/wrapper.js
var PINNED_ACTOR = "6a0ec08f3af5e1d1284254c2";
var CLOSED_CONFIG = Object.freeze({ enabled: false, rolloutStart: null, country: null, boutiqueId: null, restaurantId: null, boutiqueOrderId: null, restaurantOrderId: null });
var fail = () => {
  throw Object.assign(Error("TEST_SCOPE_FORBIDDEN"), { status: 403 });
};
var eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function createTestCommerceWrapper({ createClientFromRequest: createClientFromRequest2, config = CLOSED_CONFIG }) {
  const specs = { boutique: { parent: "Boutique", orders: "CommandeBoutique", field: "boutique_id", parentId: config.boutiqueId, orderId: config.boutiqueOrderId }, restaurant: { parent: "Restaurant", orders: "CommandeRestaurant", field: "restaurant_id", parentId: config.restaurantId, orderId: config.restaurantOrderId } };
  return async (request) => {
    if (config.enabled !== true) return Response.json({ code: "TEST_CLOSED" }, { status: 503 });
    if (request.method !== "POST") return Response.json({ code: "METHOD" }, { status: 405 });
    if (request.headers.get("X-Data-Env") !== "dev") return Response.json({ code: "DEV_REQUIRED" }, { status: 403 });
    const ids = [config.boutiqueId, config.restaurantId, config.boutiqueOrderId, config.restaurantOrderId];
    if (ids.some((x) => typeof x !== "string" || !x) || new Set(ids).size !== 4 || !config.country || !Number.isFinite(Date.parse(config.rolloutStart))) return Response.json({ code: "FIXTURES_UNSET" }, { status: 503 });
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ code: "BODY" }, { status: 400 });
    }
    const spec = body && Object.hasOwn(specs, body.kind) ? specs[body.kind] : null;
    if (!spec || !["read", "reconcile", "take_charge"].includes(body.action) || Object.keys(body).some((k) => !["action", "kind", "establishmentId", "sourceId", "requestId"].includes(k)) || body.establishmentId !== spec.parentId || body.action !== "read" && body.sourceId !== spec.orderId || body.action === "read" && body.sourceId !== void 0) return Response.json({ code: "TARGET" }, { status: 403 });
    try {
      const sdk = createClientFromRequest2(request), actor = await sdk.auth.me();
      if (actor?.id !== PINNED_ACTOR || actor.role !== "admin" || actor.enterprise_id) fail();
      const parentCheck = (row) => {
        if (row?.id !== spec.parentId || row.partenaire_id !== PINNED_ACTOR || row.pays_code !== config.country || row.enterprise_id) fail();
        return row;
      };
      const orderCheck = (row) => {
        if (row?.id !== spec.orderId || row[spec.field] !== spec.parentId || row.pays_code !== config.country || row.enterprise_id) fail();
        return row;
      };
      const entities = new Proxy({}, { get(_target, key) {
        if (key === spec.parent) return { get: async (id) => {
          if (id !== spec.parentId) fail();
          return parentCheck(await sdk.asServiceRole.entities[key].get(id));
        } };
        if (key === spec.orders) return {
          get: async (id) => {
            if (id !== spec.orderId) fail();
            return orderCheck(await sdk.asServiceRole.entities[key].get(id));
          },
          filter: async (q, sort, limit) => {
            if (!eq(q, { [spec.field]: spec.parentId, pays_code: config.country, created_date: { $gte: config.rolloutStart } }) || sort !== "-created_date" || limit !== 201) fail();
            const row = orderCheck(await sdk.asServiceRole.entities[key].get(spec.orderId));
            return Date.parse(row.created_date) >= Date.parse(config.rolloutStart) ? [row] : [];
          },
          updateMany: async (q, update) => {
            if (Object.keys(q).sort().join(",") !== ["id", "updated_date", spec.field, "pays_code", "statut"].sort().join(",") || q.id !== spec.orderId || q[spec.field] !== spec.parentId || q.pays_code !== config.country || q.statut !== "commande_envoyee" || typeof q.updated_date !== "string") fail();
            const fields = update?.$set;
            if (Object.keys(update || {}).join(",") !== "$set" || !fields || Object.keys(fields).sort().join(",") !== "partner_alert_ack_at,partner_alert_ack_by,partner_alert_request_id" || fields.partner_alert_ack_by !== PINNED_ACTOR || !Number.isFinite(Date.parse(fields.partner_alert_ack_at))) fail();
            const prior = orderCheck(await sdk.asServiceRole.entities[key].get(spec.orderId));
            if (prior.partner_alert_ack_at) return { success: true, updated: 0, has_more: false };
            await sdk.asServiceRole.entities[spec.parent].get(spec.parentId).then(parentCheck);
            return sdk.asServiceRole.entities[key].updateMany(q, update);
          }
        };
        fail();
      } });
      const safeSdk = { asServiceRole: { entities } };
      const store = createBase44PartnerAlertStore({ sdk: safeSdk, rolloutStart: config.rolloutStart, mutationContractVerified: true });
      const handle = createPartnerAlertsApi({ auth: async () => actor, store });
      const result = await handle(request, body);
      return Response.json(result.body, { status: result.status });
    } catch {
      return Response.json({ code: "TEST_REJECTED" }, { status: 403 });
    }
  };
}

// bundle:base44/functions/TEST_partnerAlerts198_readAck/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.57";
Deno.serve(createTestCommerceWrapper({ createClientFromRequest, config: CLOSED_CONFIG }));
