// frozen:base44/shared/loyaltyEvidencePermissionProbeRelease.js
var PROBE_RELEASE = Object.freeze({
  enabled: false,
  app_id: "6a0ec08f3af5e1d1284254c1",
  actor_user_id: "6a0ec08f3af5e1d1284254c2",
  data_environment: "dev",
  run_id: null,
  epoch_id: null,
  proof_ids: Object.freeze([]),
  opens_at: null,
  expires_at: null,
  normal_delete_authorized: false
});

// frozen:base44/shared/loyaltyEvidencePermissionProbeHandler.js
var APP_ID = "6a0ec08f3af5e1d1284254c1";
var ACTOR_ID = "6a0ec08f3af5e1d1284254c2";
var ENTITY = "ClientLoyaltyEvidence";
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var RUN = /^TEST_LOYALTY_PERMISSION_[A-Z0-9_]{8,60}$/;
var ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
var iso = (v) => typeof v === "string" && ISO.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
var response = (status, value) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
var stop = (code) => {
  throw Object.assign(new Error(code), { probeCode: code });
};
var statusOf = (e) => Number(e?.status ?? e?.statusCode ?? e?.response?.status);
var exactKeys = (o, keys) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));
var validConfig = (c, now) => c?.enabled === true && c.app_id === APP_ID && c.actor_user_id === ACTOR_ID && c.data_environment === "dev" && RUN.test(c.run_id || "") && UUID.test(c.epoch_id || "") && Array.isArray(c.proof_ids) && c.proof_ids.length === 3 && c.proof_ids.every((v) => UUID.test(v)) && new Set(c.proof_ids).size === 3 && iso(c.opens_at) && iso(c.expires_at) && Date.parse(c.opens_at) <= now && now < Date.parse(c.expires_at) && Date.parse(c.expires_at) - Date.parse(c.opens_at) <= 3e5 && typeof c.normal_delete_authorized === "boolean";
function synthetic(c, index, issuedAt) {
  const row = {
    version: "closed-ledger-v1",
    epoch_id: c.epoch_id,
    proof_id: c.proof_ids[index],
    kind: "origin",
    subject_type: "CourseExterne",
    subject_id: `${c.run_id}_FAKE_SUBJECT_${index}`,
    country_code: "BF",
    issued_at: issuedAt,
    actor_user_id: `${c.run_id}_FAKE_ACTOR`,
    payload_json: JSON.stringify({ TEST: true, permission_probe: c.run_id, index, no_business_receipt: true })
  };
  if (index !== 2) row.beneficiary_user_id = `${c.run_id}_FAKE_BENEFICIARY`;
  return row;
}
function sameFixture(actual, expected) {
  if (!actual || typeof actual.id !== "string" || !actual.id || /\s/.test(actual.id)) return false;
  if (!Object.entries(expected).every(([k, v]) => actual[k] === v)) return false;
  return Object.hasOwn(expected, "beneficiary_user_id") || actual.beneficiary_user_id == null;
}
function createEvidencePermissionProbe({ getApi, release = PROBE_RELEASE, clock = () => Date.now() } = {}) {
  let claimed = false;
  return async (req) => {
    const now = clock();
    if (!validConfig(release, now)) return response(503, { success: false, code: "PROBE_CLOSED" });
    if (req.method !== "POST") return response(405, { success: false, code: "POST_REQUIRED" });
    if (req.headers.get("X-Data-Env") !== "dev") return response(400, { success: false, code: "DEV_HEADER_REQUIRED" });
    if (req.headers.get("Base44-Functions-Version") !== "preview") return response(400, { success: false, code: "PREVIEW_REQUIRED" });
    if (req.headers.get("Base44-App-Id") !== APP_ID) return response(503, { success: false, code: "APP_ID_UNVERIFIED" });
    if (Number(req.headers.get("Content-Length") || 0) > 256) return response(400, { success: false, code: "INVALID_BODY" });
    let api, user;
    try {
      api = getApi(req);
      user = await api.auth.me();
    } catch {
      return response(401, { success: false, code: "AUTH_REQUIRED" });
    }
    if (user?.id !== ACTOR_ID || user?.role !== "admin") return response(403, { success: false, code: "OPERATOR_FORBIDDEN" });
    let body;
    try {
      const raw = await req.text();
      if (raw.length > 256) throw Error();
      body = JSON.parse(raw);
    } catch {
      return response(400, { success: false, code: "INVALID_BODY" });
    }
    if (!exactKeys(body, ["run_id"]) || body.run_id !== release.run_id) return response(400, { success: false, code: "INVALID_RUN" });
    if (!validConfig(release, clock())) return response(503, { success: false, code: "PROBE_CLOSED" });
    if (claimed) return response(409, { success: false, code: "INVOCATION_ALREADY_CLAIMED" });
    claimed = true;
    const checks = [], records = [];
    let createAttempts = 0;
    try {
      const requireWindow = () => {
        if (!validConfig(release, clock())) stop("WINDOW_EXPIRED_STOP_NO_RETRY");
      };
      const normal = api.entities.ClientLoyaltyEvidence;
      const service = api.asServiceRole.entities.ClientLoyaltyEvidence;
      requireWindow();
      const existing = await service.filter({ epoch_id: release.epoch_id }, "created_date", 4, 0);
      if (!Array.isArray(existing) || existing.length !== 0) stop("RUN_NOT_EMPTY_OR_UNVERIFIED");
      const create = async (entity, row) => {
        requireWindow();
        if (++createAttempts > 3) stop("CREATE_BUDGET_EXCEEDED");
        return await entity.create(row);
      };
      const forbidden = async (name, action) => {
        requireWindow();
        try {
          await action();
        } catch (e) {
          if (statusOf(e) === 403) {
            checks.push({ name, state: "denied_403" });
            return;
          }
          stop(`${name.toUpperCase()}_UNCERTAIN_OR_UNEXPECTED`);
        }
        stop(`${name.toUpperCase()}_UNEXPECTEDLY_ALLOWED`);
      };
      const getExact = async (id, fixture) => {
        requireWindow();
        const row = await service.get(id);
        if (!sameFixture(row, fixture) || row.id !== id) stop("SERVICE_READBACK_MISMATCH");
        return row;
      };
      const issuedAt = new Date(now).toISOString();
      await forbidden("normal_create", () => create(normal, synthetic(release, 0, issuedAt)));
      const first = synthetic(release, 1, issuedAt);
      const a = await create(service, first);
      if (!sameFixture(a, first)) stop("SERVICE_CREATE_ACK_UNVERIFIED");
      records.push({ id: a.id, proof_id: first.proof_id, tag: "TEST_PRESENT_BENEFICIARY" });
      await getExact(a.id, first);
      checks.push({ name: "service_append_read_present", state: "passed" });
      let visible;
      requireWindow();
      try {
        visible = await normal.filter({ proof_id: first.proof_id }, "created_date", 1, 0);
      } catch (e) {
        if (statusOf(e) === 403) visible = [];
        else stop("NORMAL_READ_UNCERTAIN_OR_UNEXPECTED");
      }
      if (!Array.isArray(visible) || visible.length !== 0) stop("NORMAL_READ_DISCLOSED_TEST_ROW");
      checks.push({ name: "normal_read", state: "denied_or_empty" });
      await forbidden("normal_update", () => normal.update(a.id, { payload_json: JSON.stringify({ TEST: true, unauthorized_change: release.run_id }) }));
      await getExact(a.id, first);
      if (release.normal_delete_authorized) {
        await forbidden("normal_delete", () => normal.delete(a.id));
        await getExact(a.id, first);
      } else checks.push({ name: "normal_delete", state: "not_run_not_authorized" });
      const second = synthetic(release, 2, issuedAt);
      const b = await create(service, second);
      if (!sameFixture(b, second) || b.id === a.id) stop("SERVICE_CREATE_ACK_UNVERIFIED");
      records.push({ id: b.id, proof_id: second.proof_id, tag: "TEST_OMITTED_BENEFICIARY" });
      await getExact(b.id, second);
      checks.push({ name: "service_append_read_omitted", state: "passed" });
      return response(200, { success: true, run_id: release.run_id, data_environment: "dev", create_attempts: createAttempts, records, checks, close_required: true, standalone_fls_proof: false, business_cas_proof: false });
    } catch (e) {
      return response(409, { success: false, code: e?.probeCode || "OUTCOME_UNCERTAIN_STOP_NO_RETRY", run_id: release.run_id, data_environment: "dev", create_attempts: createAttempts, records, checks, close_required: true });
    }
  };
}

// frozen:base44/functions/testClientLoyaltyEvidencePermissions/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.57";
Deno.serve(createEvidencePermissionProbe({
  getApi: createClientFromRequest,
  release: PROBE_RELEASE
}));
