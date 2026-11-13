// frozen:base44/shared/admissionCausality.js
function resolveAdmissionHead(rows) {
  const fail5 = () => {
    throw Object.assign(new Error("LOYALTY_ADMISSION_BRANCH_AMBIGUOUS"), { code: "LOYALTY_ADMISSION_BRANCH_AMBIGUOUS", status: 503 });
  };
  if (!rows.length) return null;
  const by = new Map(rows.map((r) => [r.proof_id, r]));
  if (by.size !== rows.length) fail5();
  const ancestors = /* @__PURE__ */ new Map();
  function lineage(r, visiting = /* @__PURE__ */ new Set()) {
    if (ancestors.has(r.proof_id)) return ancestors.get(r.proof_id);
    if (visiting.has(r.proof_id)) fail5();
    visiting.add(r.proof_id);
    const ids = /* @__PURE__ */ new Set([r.proof_id]), parent = r.payload.basis_proof_id;
    if (parent !== null) {
      const p = by.get(parent);
      if (!p || p.subject_id !== r.subject_id || p.kind !== "admission" || Date.parse(p.issued_at) > Date.parse(r.issued_at)) fail5();
      for (const x of lineage(p, visiting)) ids.add(x);
    }
    visiting.delete(r.proof_id);
    ancestors.set(r.proof_id, ids);
    return ids;
  }
  for (const r of rows) lineage(r);
  const barriers = rows.filter((r) => r.payload.state === "revoked");
  const candidates = rows.filter((r) => barriers.every((b) => ancestors.get(r.proof_id).has(b.proof_id)));
  const heads = candidates.filter((r) => !candidates.some((x) => x !== r && ancestors.get(x.proof_id).has(r.proof_id)));
  if (heads.length !== 1) fail5();
  return heads[0];
}

// frozen:base44/shared/loyaltyProgress.js
var LOYALTY_VERSION = 1;
var LOYALTY_TIERS = Object.freeze(["Bronze", "Argent", "Or", "Platinium"]);
function loyaltyProgress(completed) {
  if (!Number.isSafeInteger(completed) || completed < 0) throw new Error("INVALID_LOYALTY_COUNT");
  const tierIndex = Math.min(3, Math.floor(completed / 50));
  const stars = Math.min(5, Math.floor((completed - tierIndex * 50) / 10));
  return {
    completed,
    tierIndex,
    tier: LOYALTY_TIERS[tierIndex],
    stars,
    milestone: Math.min(20, Math.floor(completed / 10))
  };
}
function advanceLoyalty(previous, next) {
  const now = loyaltyProgress(next);
  if (!previous) return { highWater: now.milestone, event: null };
  const highWater = Math.max(previous.highWater, now.milestone);
  if (now.milestone <= previous.highWater) return { highWater, event: null };
  const oldTier = Math.min(3, Math.floor(previous.highWater / 5));
  return { highWater, event: now.tierIndex > oldTier ? "tier" : "star" };
}

// frozen:base44/shared/ledgerPolicy.js
var CAPTURE_BOUNDARY_SEMANTICS = "protected-epoch-open-v1";
var DRIVER_EVIDENCE_SEMANTICS = "native-driver-binding-v1";
var START = "2026-11-13T00:00:00.000Z";
var ENTITY = "ClientLoyaltyEvidence";
var branded = /* @__PURE__ */ new WeakSet();
var fail = (code) => {
  throw Object.assign(new Error(code), { code, status: 503 });
};
var iso = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
var id = (s) => typeof s === "string" && s.length > 0 && s.length <= 200 && !/\s|[\x00-\x1f\x7f]/.test(s);
var hash = (s) => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
var uuid = (s) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
function parseLedgerPolicy(raw, now = Date.now()) {
  const v = raw?.validation;
  if (!raw || raw.version !== 1 || raw.protocol !== "closed-ledger-v1" || raw.capture_boundary_semantics !== CAPTURE_BOUNDARY_SEMANTICS || raw.driver_evidence_semantics !== DRIVER_EVIDENCE_SEMANTICS || raw.entity !== ENTITY || !id(raw.policy_id) || !uuid(raw.epoch_id) || raw.programme_start_at !== START || raw.time_zone !== "Africa/Ouagadougou" || !iso(raw.capture_effective_at) || !v || v.state !== "validated" || !id(v.operator_id) || !iso(v.validated_at) || Date.parse(v.validated_at) > now || Date.parse(raw.capture_effective_at) > Date.parse(v.validated_at)) fail("LOYALTY_LEDGER_POLICY_INVALID");
  for (const name of ["schema_sha256", "published_writers_sha256", "published_finalizer_sha256", "legacy_fixed_writer_audit_sha256", "permission_test_sha256", "registry_setup_sha256"]) if (!hash(v[name])) fail("LOYALTY_LEDGER_SETUP_UNVERIFIED");
  for (const name of ["ordinary_crud_denied", "new_namespace_verified_empty", "published_writers_verified", "legacy_writers_cannot_target_registry", "native_origin_authority_verified", "native_admission_authority_verified", "protected_commit_authority_verified", "no_automation_state_to_proof", "all_public_paths_covered"]) if (v[name] !== true) fail("LOYALTY_LEDGER_SETUP_UNVERIFIED");
  const p = Object.freeze({ ...raw, validation: Object.freeze({ ...v }) });
  branded.add(p);
  return p;
}
function assertLedgerPolicy(p) {
  if (!branded.has(p)) fail("LOYALTY_LEDGER_SETUP_UNVERIFIED");
}

// frozen:base44/shared/ledger.js
var VERSION = "closed-ledger-v1";
var TYPES = /* @__PURE__ */ new Set(["CourseExterne", "CommandeBoutique", "CommandeRestaurant", "Conversation"]);
var DIRECT = { CourseExterne: "direct", CommandeBoutique: "order", CommandeRestaurant: "order", Conversation: "pharmacy" };
var f = (code = "LOYALTY_PROOF_INCOMPLETE") => {
  throw Object.assign(new Error(code), { code, status: code === "AUTH_REQUIRED" ? 401 : ["AUTH_FORBIDDEN", "LOYALTY_PROFILE_FORBIDDEN"].includes(code) ? 403 : code === "INVALID_REQUEST" ? 400 : 503 });
};
var empty = (x) => x === null || x === void 0 || x === "";
var publicRow = (x) => x && !x.enterprise_id;
var cancelled = (x) => x.statut === "annulee" || ["annulation_user_id", "date_annulation", "annulation_source", "annulation_event_at"].some((k) => !empty(x[k]));
var stable = (x) => JSON.stringify(x);
function checkConversation(row, clientId, userId, pharmacyId) {
  let parts;
  try {
    parts = JSON.parse(row?.participants);
  } catch {
    f();
  }
  if (!publicRow(row) || !Array.isArray(parts) || parts.length !== 2 || parts.filter((p) => p?.type === "client" && p.id === clientId).length !== 1 || parts.filter((p) => p?.type === "partenaire" && p.id === pharmacyId).length !== 1 || !Array.isArray(row.participant_user_ids) || !row.participant_user_ids.includes(userId)) f();
}
var deliveryTime = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)) return NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === value.slice(0, 19) ? ms : NaN;
};
var FIELDS = ["version", "epoch_id", "proof_id", "kind", "subject_type", "subject_id", "country_code", "issued_at", "actor_user_id", "beneficiary_user_id", "payload"];
var PAYLOAD = {
  admission: ["evidence_semantics", "native_user_id", "subject_email", "tenant_key", "state", "approval_reference", "profile_revision", "basis_proof_id", "mutation_target"],
  origin: ["beneficiary_user_id", "client_profile_id", "source_kind", "parent_proof_id", "request_id", "pharmacy_partner_id"],
  admin_unlinked: ["creation_semantics", "grant_action", "reason", "request_id", "tenant_key"],
  delivery: ["state", "beneficiary_user_id", "client_profile_id", "driver_profile_id", "origin_proof_id", "admission_proof_id", "operation_id", "completed_at", "request_id"]
};
var exact = (x, keys) => x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length === keys.length && keys.every((k) => Object.hasOwn(x, k));
function valid(r, p) {
  if (!exact(r, FIELDS) || r.version !== VERSION || r.epoch_id !== p.epoch_id || !uuid(r.proof_id) || !PAYLOAD[r.kind] || !exact(r.payload, r.kind === "origin" && r.payload?.source_kind === "admin_delegated" ? [...PAYLOAD.origin, "delegation_snapshot"] : PAYLOAD[r.kind]) || !id(r.subject_id) || !id(r.actor_user_id) || !iso(r.issued_at) || Date.parse(r.issued_at) < Date.parse(p.capture_effective_at) || !/^[A-Z]{2}$/.test(r.country_code)) f();
  const q = r.payload;
  if (r.beneficiary_user_id !== (["admission", "admin_unlinked"].includes(r.kind) ? null : q.beneficiary_user_id)) f();
  if (r.kind === "admission") {
    if (q.evidence_semantics !== DRIVER_EVIDENCE_SEMANTICS || r.subject_type !== "Livreur" || !(id(q.native_user_id) || q.state === "revoked" && q.native_user_id === null) || !(id(q.subject_email) || q.state === "revoked" && q.subject_email === null) || !(q.tenant_key === "public" || q.state === "revoked" && typeof q.tenant_key === "string" && q.tenant_key.startsWith("enterprise:") && id(q.tenant_key.slice(11))) || !["admitted", "revoked"].includes(q.state) || !id(q.approval_reference) || !id(q.profile_revision) || !(q.basis_proof_id === null || uuid(q.basis_proof_id)) || !(q.mutation_target === null || q.state === "revoked" && exact(q.mutation_target, ["user_email", "country_code", "enterprise_id"]) && id(q.mutation_target.user_email) && /^[A-Z]{2}$/.test(q.mutation_target.country_code) && (q.mutation_target.enterprise_id === null || id(q.mutation_target.enterprise_id)))) f();
  } else if (r.kind === "admin_unlinked") {
    if (r.subject_type !== "CourseExterne" || q.creation_semantics !== "authorized-admin-create-v1" || q.grant_action !== "creerCourseAdmin" || !["legacy_no_tuple", "explicit_unlinked"].includes(q.reason) || !(q.request_id === null || id(q.request_id)) || !(q.tenant_key === "public" || typeof q.tenant_key === "string" && q.tenant_key.startsWith("enterprise:") && id(q.tenant_key.slice(11)))) f();
  } else if (r.kind === "origin") {
    if (q.source_kind === "pharmacy" ? !id(q.pharmacy_partner_id) : q.pharmacy_partner_id !== null) f();
    if (!TYPES.has(r.subject_type) || !id(q.beneficiary_user_id) || !id(q.client_profile_id) || q.source_kind !== DIRECT[r.subject_type] && !(r.subject_type === "CourseExterne" && ["order", "pharmacy", "admin_delegated"].includes(q.source_kind)) || !(q.parent_proof_id === null || uuid(q.parent_proof_id)) || !(q.request_id === null || id(q.request_id)) || /^(guest_|guest-v1:)/.test(q.request_id || "")) f();
    if (q.parent_proof_id === null && q.source_kind !== "admin_delegated" && r.actor_user_id !== q.beneficiary_user_id) f();
    if (q.source_kind === "admin_delegated") {
      const d = q.delegation_snapshot;
      if (r.subject_type !== "CourseExterne" || !exact(d, ["version", "profile_id", "profile_updated_date", "native_user_id", "native_user_snapshot_sha256", "country_code", "enterprise_id", "normalized_phone", "actor_user_id", "grant_action"]) || d.version !== 1 || d.profile_id !== q.client_profile_id || !id(d.profile_updated_date) || d.native_user_id !== q.beneficiary_user_id || !/^([a-f0-9]{64})$/.test(d.native_user_snapshot_sha256) || d.country_code !== r.country_code || d.enterprise_id !== null || !/^\d{7,16}$/.test(d.normalized_phone) || d.actor_user_id !== r.actor_user_id || d.grant_action !== "creerCourseAdmin") f();
    }
    if (r.subject_type !== "CourseExterne" && q.parent_proof_id !== null) f();
    if (r.subject_type === "CourseExterne" && ["direct", "admin_delegated"].includes(q.source_kind) !== (q.parent_proof_id === null)) f();
  } else {
    if (r.subject_type !== "CourseExterne" || !["confirmed", "revoked"].includes(q.state) || !(q.request_id === null || id(q.request_id))) f();
    if (q.state === "confirmed") {
      if (!id(q.beneficiary_user_id) || !id(q.client_profile_id) || !id(q.driver_profile_id) || !uuid(q.origin_proof_id) || !uuid(q.admission_proof_id) || !uuid(q.operation_id) || !iso(q.completed_at) || Date.parse(q.completed_at) > Date.parse(r.issued_at)) f();
    } else {
      for (const key2 of ["beneficiary_user_id", "client_profile_id", "driver_profile_id"]) if (q[key2] !== null && !id(q[key2])) f();
      for (const key2 of ["origin_proof_id", "admission_proof_id", "operation_id"]) if (q[key2] !== null && !uuid(q[key2])) f();
      if (q.completed_at !== null && (!iso(q.completed_at) || Date.parse(q.completed_at) > Date.parse(r.issued_at))) f();
    }
  }
  return r;
}
function createLedgerRuntime(ports, config, { clock = () => (/* @__PURE__ */ new Date()).toISOString(), randomUUID = () => crypto.randomUUID() } = {}) {
  const policy = config?.policy;
  const enabled = config?.captureEnabled === true, readerEnabled = config?.readerEnabled === true;
  if (enabled || readerEnabled) assertLedgerPolicy(policy);
  const now = () => {
    const t = clock();
    if (!iso(t)) f("LOYALTY_CLOCK_INVALID");
    return t;
  };
  const actor = async () => {
    const u = await ports.auth.me();
    if (!id(u?.id) || !id(u?.email)) f("AUTH_REQUIRED");
    return u;
  };
  const scan = async (query) => {
    const rows = [];
    let cursor = null;
    const seen = /* @__PURE__ */ new Set();
    for (let n = 0; n < 50; n++) {
      const pg = await ports.evidence.scan({ ...query, epoch_id: policy.epoch_id }, { cursor, limit: 100 });
      if (!pg || !Array.isArray(pg.items) || pg.items.length > 100 || typeof pg.has_more !== "boolean") f("LOYALTY_HISTORY_INCOMPLETE");
      for (const r of pg.items) {
        valid(r, policy);
        if (Date.parse(r.issued_at) > Date.parse(now())) f();
        if (seen.has(r.proof_id)) f("LOYALTY_READ_CHANGED");
        seen.add(r.proof_id);
        if (Object.entries(query).some(([k, v]) => (k === "beneficiary_user_id" ? r.payload.beneficiary_user_id : r[k]) !== v)) f("LOYALTY_SCOPE_INVALID");
        rows.push(r);
      }
      if (!pg.has_more) return rows;
      if (!pg.next_cursor || pg.next_cursor === cursor) f("LOYALTY_HISTORY_INCOMPLETE");
      cursor = pg.next_cursor;
    }
    f("LOYALTY_HISTORY_INCOMPLETE");
  };
  const get = async (proofId2) => {
    if (!uuid(proofId2)) f();
    const r = await ports.evidence.get(proofId2);
    if (!r || r.proof_id !== proofId2) f();
    valid(r, policy);
    if (Date.parse(r.issued_at) > Date.parse(now())) f();
    return r;
  };
  const append = async (record) => {
    valid(record, policy);
    try {
      await ports.evidence.append(record);
    } catch {
    }
    const saved = await get(record.proof_id);
    if (stable(saved) !== stable(record)) f("LOYALTY_WRITE_UNCERTAIN");
    return saved;
  };
  const make = (kind, type, subject, country2, u, payload) => ({ version: VERSION, epoch_id: policy.epoch_id, proof_id: randomUUID(), kind, subject_type: type, subject_id: subject, country_code: country2, issued_at: now(), actor_user_id: u.id, beneficiary_user_id: payload.beneficiary_user_id || null, payload: kind === "admission" ? { evidence_semantics: DRIVER_EVIDENCE_SEMANTICS, ...payload } : payload });
  const uniqueOrigin = async (type, subject) => {
    const rows = await scan({ kind: "origin", subject_type: type, subject_id: subject });
    if (rows.length !== 1) f();
    return rows[0];
  };
  const admissionHead = async (profile, at = now()) => resolveAdmissionHead((await scan({ kind: "admission", subject_type: "Livreur", subject_id: profile })).filter((r) => Date.parse(r.issued_at) <= Date.parse(at)));
  const latestAdmission = async (profile, at = now()) => {
    const head = await admissionHead(profile, at);
    if (head?.payload.state !== "admitted") f();
    return head;
  };
  const currentDriverAllows = async (admission, u, country2) => {
    const d = await ports.drivers.get(admission.subject_id);
    if (!d || d.id !== admission.subject_id || d.enterprise_id || d.country_code !== country2 || d.user_email !== u.email) f();
    const countryRow = await ports.countries.get(country2);
    if (countryRow?.code !== country2 || countryRow.actif !== true) f();
    return d;
  };
  const capture = async (action) => {
    try {
      return { state: "recorded", proof_id: (await action()).proof_id };
    } catch {
      return { state: "incomplete" };
    }
  };
  async function createNativeOrigin({ profile_id, subject_type, pharmacy_id = null }, newCreate) {
    if (!enabled) return { result: await newCreate(), loyalty: { state: "disabled" } };
    let context;
    try {
      const u = await actor(), profile = await ports.clients.get(profile_id);
      if (!TYPES.has(subject_type) || !publicRow(u) || !publicRow(profile) || profile?.id !== profile_id || profile.user_email !== u.email || profile.actif === false || !/^[A-Z]{2}$/.test(profile.country_code) || u.country_code && u.country_code !== profile.country_code) f();
      const active = await ports.countries.get(profile.country_code);
      if (active?.code !== profile.country_code || active.actif !== true) f();
      let pharmacy = null;
      if (subject_type === "Conversation") {
        pharmacy = await ports.pharmacies.get(pharmacy_id);
        if (pharmacy?.id !== pharmacy_id || !publicRow(pharmacy) || pharmacy.actif !== true || pharmacy.pays_code !== profile.country_code) f();
      }
      context = { u, profile, pharmacy };
    } catch {
    }
    const result = await newCreate();
    if (!context || result?.created !== true) return { result, loyalty: { state: "incomplete" } };
    const loyalty = await capture(async () => {
      const row = result.row, { u, profile } = context;
      if (!id(row?.id) || result.entity !== subject_type || !publicRow(row)) f();
      if (subject_type === "Conversation") {
        checkConversation(row, profile.id, u.id, context.pharmacy.id);
        const reread = await ports.sources.get("Conversation", row.id);
        checkConversation(reread, profile.id, u.id, context.pharmacy.id);
        if (reread?.id !== row.id) f();
      } else if ((row.country_code || row.pays_code) !== profile.country_code) f();
      return append(make("origin", subject_type, row.id, profile.country_code, u, { beneficiary_user_id: u.id, client_profile_id: profile.id, source_kind: DIRECT[subject_type], pharmacy_partner_id: context.pharmacy?.id ?? null, parent_proof_id: null, request_id: empty(row.request_id) ? null : row.request_id }));
    });
    return { result, loyalty };
  }
  async function createAdminUnlinkedOrigin(decision, newCreate) {
    if (!enabled) return { result: await newCreate(), loyalty: { state: "disabled" } };
    let context;
    try {
      const u = await actor();
      if (ports.approvals?.isPinnedDelegatedOrigin?.(decision, u.id) !== true) f();
      const d = ports.approvals.readDelegatedDecision(decision, u.id);
      if (d.mode !== "unlinked" || d.actor_user_id !== u.id || d.actor_email !== u.email || d.grant_action !== "creerCourseAdmin" || !["legacy_no_tuple", "explicit_unlinked"].includes(d.reason) || !/^[A-Z]{2}$/.test(d.country_code) || !(d.enterprise_id === null || id(d.enterprise_id))) f();
      context = { u, d };
    } catch {
    }
    const result = await newCreate();
    if (!context || result?.created !== true) return { result, loyalty: { state: "incomplete" } };
    return { result, loyalty: await capture(async () => {
      const { u, d } = context, row = result.row;
      if (result.entity !== "CourseExterne" || !id(row?.id) || row.source !== "admin" || row.country_code !== d.country_code || (row.enterprise_id ?? null) !== d.enterprise_id || !empty(row.client_user_email)) f();
      return append(make("admin_unlinked", "CourseExterne", row.id, d.country_code, u, { creation_semantics: "authorized-admin-create-v1", grant_action: "creerCourseAdmin", reason: d.reason, request_id: empty(row.request_id) ? null : row.request_id, tenant_key: d.enterprise_id ? "enterprise:" + d.enterprise_id : "public" }));
    }) };
  }
  async function createDelegatedOrigin(decision, newCreate) {
    if (!enabled) return { result: await newCreate(), loyalty: { state: "disabled" } };
    let context;
    try {
      const u = await actor();
      if (ports.approvals?.isPinnedDelegatedOrigin?.(decision, u.id) !== true) f();
      const d = ports.approvals.readDelegatedDecision(decision, u.id);
      if (d.actor_user_id !== u.id || d.actor_email !== u.email || d.grant_action !== "creerCourseAdmin" || d.enterprise_id !== null || !id(d.beneficiary_user_id) || !id(d.beneficiary_email)) f();
      const profile = await ports.delegatedProfiles.get(d.profile_id), native = await ports.nativeUsers.get(d.beneficiary_user_id);
      if (profile?.id !== d.profile_id || profile.updated_date !== d.profile_updated_date || profile.user_email !== d.beneficiary_email || profile.country_code !== d.country_code || !publicRow(profile) || profile.actif !== true || native?.id !== d.beneficiary_user_id || native.email !== d.beneficiary_email || !publicRow(native) || native.country_code != null && native.country_code !== d.country_code) f();
      const country2 = await ports.countries.get(d.country_code);
      if (country2?.code !== d.country_code || country2.actif !== true) f();
      context = { u, d };
    } catch {
    }
    const result = await newCreate();
    if (!context || result?.created !== true) return { result, loyalty: { state: "incomplete" } };
    return { result, loyalty: await capture(async () => {
      const { u, d } = context, row = result.row;
      if (result.entity !== "CourseExterne" || !id(row?.id) || row.source !== "admin" || row.country_code !== d.country_code || !publicRow(row) || row.client_user_email !== d.beneficiary_email || row.type_course === "expedier" && row.expediteur_client_id !== d.profile_id || row.type_course === "recevoir" && row.destinataire_client_id !== d.profile_id) f();
      return append(make("origin", "CourseExterne", row.id, d.country_code, u, { beneficiary_user_id: d.beneficiary_user_id, client_profile_id: d.profile_id, source_kind: "admin_delegated", pharmacy_partner_id: null, parent_proof_id: null, request_id: empty(row.request_id) ? null : row.request_id, delegation_snapshot: { ...d.candidate, actor_user_id: u.id, grant_action: d.grant_action } }));
    }) };
  }
  async function createLinkedCourse({ source_type, source_id }, newCreate) {
    if (!enabled) return { result: await newCreate(), loyalty: { state: "disabled" } };
    let context;
    try {
      if (!["CommandeBoutique", "CommandeRestaurant", "Conversation"].includes(source_type)) f();
      const u = await actor(), origin = await uniqueOrigin(source_type, source_id);
      context = { u, origin };
    } catch {
    }
    const result = await newCreate();
    if (!context || result?.created !== true) return { result, loyalty: { state: "incomplete" } };
    const loyalty = await capture(async () => {
      const { u, origin } = context, row = result.row, key2 = { CommandeBoutique: "commande_boutique_id", CommandeRestaurant: "commande_restaurant_id", Conversation: "conversation_id" }[source_type];
      if (result.entity !== "CourseExterne" || !id(row?.id) || row[key2] !== source_id || row.country_code !== origin.country_code || !publicRow(row)) f();
      const source = await ports.sources.get(source_type, source_id);
      if (!source || source.id !== source_id || source_type !== "Conversation" && source.course_id !== row.id || (source.country_code || source.pays_code ? (source.country_code || source.pays_code) !== origin.country_code : source_type !== "Conversation") || !publicRow(source) || ["annulee", "paiement_refuse"].includes(source.statut)) f();
      if (source_type === "Conversation") {
        checkConversation(source, origin.payload.client_profile_id, origin.payload.beneficiary_user_id, origin.payload.pharmacy_partner_id);
        if (row.pharmacie_id !== origin.payload.pharmacy_partner_id || row.destinataire_client_id !== origin.payload.client_profile_id) f();
        const pharmacy = await ports.pharmacies.get(origin.payload.pharmacy_partner_id);
        if (pharmacy?.id !== row.pharmacie_id || pharmacy.user_email !== u.email || pharmacy.pays_code !== origin.country_code || pharmacy.actif !== true || !publicRow(pharmacy) || !publicRow(u)) f();
      }
      const check = await uniqueOrigin(source_type, source_id);
      if (stable(check) !== stable(origin)) f();
      return append(make("origin", "CourseExterne", row.id, origin.country_code, u, { ...origin.payload, parent_proof_id: origin.proof_id, request_id: empty(row.request_id) ? null : row.request_id }));
    });
    return { result, loyalty };
  }
  async function bindApprovedDriverReference(reference, approval) {
    if (!enabled) return { state: "disabled" };
    if (ports.approvals?.isPinnedReference(reference, approval) !== true) f("LOYALTY_ADMISSION_NOT_APPROVED");
    if (reference.evidence_semantics !== DRIVER_EVIDENCE_SEMANTICS || !["admitted", "revoked"].includes(reference.state)) f("LOYALTY_ADMISSION_NOT_APPROVED");
    const u = await actor();
    if (u.role !== "admin" || u.id !== approval.admin_user_id) f("AUTH_FORBIDDEN");
    if (!iso(approval.approved_at) || !iso(approval.expires_at) || Date.parse(approval.approved_at) > Date.parse(now()) || Date.parse(now()) >= Date.parse(approval.expires_at) || !id(approval.reference)) f("LOYALTY_ADMISSION_NOT_APPROVED");
    if (reference.state === "revoked") {
      const prior = await latestAdmission(reference.profile_id);
      if (prior.payload.native_user_id !== reference.native_user_id || prior.payload.subject_email !== reference.subject_email || prior.country_code !== reference.country_code) f("LOYALTY_ADMISSION_REFERENCE_CHANGED");
      return append(make("admission", "Livreur", reference.profile_id, reference.country_code, u, { ...prior.payload, basis_proof_id: prior.proof_id, mutation_target: null, state: "revoked", approval_reference: approval.reference, profile_revision: reference.expected_updated_date }));
    }
    const basis = await admissionHead(reference.profile_id);
    const driver = await ports.drivers.get(reference.profile_id), native = await ports.nativeUsers.get(reference.native_user_id);
    if (!driver || driver.id !== reference.profile_id || driver.updated_date !== reference.expected_updated_date || driver.user_email !== reference.subject_email || driver.country_code !== reference.country_code || driver.enterprise_id || native?.id !== reference.native_user_id || native.email !== reference.subject_email || native.enterprise_id || native.country_code && native.country_code !== reference.country_code) f("LOYALTY_ADMISSION_REFERENCE_CHANGED");
    const country2 = await ports.countries.get(reference.country_code);
    if (country2?.code !== reference.country_code || country2.actif !== true) f();
    return append(make("admission", "Livreur", driver.id, reference.country_code, u, { native_user_id: native.id, subject_email: native.email, tenant_key: "public", state: reference.state === "revoked" ? "revoked" : "admitted", approval_reference: approval.reference, profile_revision: driver.updated_date, basis_proof_id: basis?.proof_id ?? null, mutation_target: null }));
  }
  const CREATE_DRIVER_SOURCES = /* @__PURE__ */ new Set(["createLivreur:new", "initLivreurAuto:new", "migrerClientVersLivreur:new", "manageDriverInvitation:new", "manageEnterprise:new"]);
  const DECIDE_DRIVER_SOURCES = /* @__PURE__ */ new Set(["updateLivreur:admin_decision", "updateLivreur:self_revoke", "updateLivreur:self_identity", "manageDriverInvitation:validate_driver", "manageDriverInvitation:reactivate_driver", "manageDriverInvitation:refuse_driver", "manageDriverInvitation:suspend_driver", "manageEnterprise:toggle_livreur"]);
  async function nativeDriverContext(source, native_user_id, create, decision) {
    const u = await actor(), native = await ports.nativeUsers.get(native_user_id);
    if (!(create ? CREATE_DRIVER_SOURCES : DECIDE_DRIVER_SOURCES).has(source) || !id(native?.id) || native.id !== native_user_id || !id(native.email) || !publicRow(native) || !publicRow(u)) f();
    if (create) {
      if (u.role !== "admin" && u.id !== native.id) f();
    } else if (u.role !== "admin" && !(decision === "revoked" && source === "updateLivreur:self_revoke" && u.id === native.id)) f();
    return { u, native, source };
  }
  async function appendNativeDriverDecision(context, row, state) {
    const { u, native, source } = context;
    if (!id(row?.id) || !id(row.updated_date) || row.user_email !== native.email || !publicRow(row) || !/^[A-Z]{2}$/.test(row.country_code) || native.country_code && native.country_code !== row.country_code) f();
    const current = await ports.drivers.get(row.id);
    for (const k of ["id", "updated_date", "user_email", "country_code", "enterprise_id"]) if ((current?.[k] ?? null) !== (row[k] ?? null)) f("LOYALTY_ADMISSION_REFERENCE_CHANGED");
    const country2 = await ports.countries.get(row.country_code);
    if (country2?.code !== row.country_code || country2.actif !== true) f();
    return append(make("admission", "Livreur", row.id, row.country_code, u, { native_user_id: native.id, subject_email: native.email, tenant_key: "public", state, approval_reference: "native:" + source + ":" + randomUUID(), profile_revision: row.updated_date, basis_proof_id: context.basis?.proof_id ?? null, mutation_target: null }));
  }
  async function createNativeDriverBinding({ source, native_user_id }, newCreate) {
    if (!enabled) return { result: await newCreate(), loyalty: { state: "disabled" } };
    let context;
    try {
      context = await nativeDriverContext(source, native_user_id, true);
      context.basis = null;
    } catch {
    }
    const result = await newCreate();
    if (!context || result?.created !== true) return { result, loyalty: { state: "incomplete" } };
    return { result, loyalty: await capture(() => appendNativeDriverDecision(context, result.row, "admitted")) };
  }
  async function establishNativeDriverBinding({ source, profile_id, native_user_id, decision = "admitted" }, authorizedDecision) {
    if (decision !== "admitted" || !["updateLivreur:admin_decision", "manageDriverInvitation:validate_driver"].includes(source)) return { result: await authorizedDecision(), loyalty: { state: "not_identity_establishment" } };
    if (!enabled) return { result: await authorizedDecision(), loyalty: { state: "disabled" } };
    let context;
    try {
      context = await nativeDriverContext(source, native_user_id, false, "admitted");
      const before = await ports.drivers.get(profile_id);
      if (before?.id !== profile_id || before.user_email !== context.native.email || !publicRow(before)) f();
      context.before = before;
      context.basis = await admissionHead(profile_id);
    } catch {
      context = null;
    }
    const result = await authorizedDecision();
    if (!context || result?.updated !== true || result.row?.id !== profile_id) return { result, loyalty: { state: "incomplete" } };
    return { result, loyalty: await capture(async () => {
      for (const key2 of ["user_email", "country_code", "enterprise_id"]) if ((context.before[key2] ?? null) !== (result.row[key2] ?? null)) f("LOYALTY_ADMISSION_REFERENCE_CHANGED");
      return appendNativeDriverDecision(context, result.row, "admitted");
    }) };
  }
  async function guardNegativeDriverMutation({ source, profile_id, expected_updated_date, mutation, target = null, authority }, authorizedMutation) {
    if (["suspend", "refuse", "deactivate", "admin_offline"].includes(mutation)) return { result: await authorizedMutation(), loyalty: { state: "not_identity_change" } };
    if (mutation !== "identity") f("INVALID_REQUEST");
    if (!enabled) f("LOYALTY_NEGATIVE_BARRIER_UNAVAILABLE");
    const u = await actor();
    if (!DECIDE_DRIVER_SOURCES.has(source) || !["identity", "suspend", "refuse", "deactivate", "admin_offline"].includes(mutation)) f("INVALID_REQUEST");
    const before = await ports.drivers.get(profile_id);
    if (before?.id !== profile_id || !id(expected_updated_date) || before.updated_date !== expected_updated_date || !/^[A-Z]{2}$/.test(before.country_code) || !(empty(before.enterprise_id) || id(before.enterprise_id))) f("LOYALTY_ADMISSION_REFERENCE_CHANGED");
    const enterprise = empty(before.enterprise_id) ? null : before.enterprise_id;
    if (mutation === "identity") {
      if (!exact(target, ["user_email", "country_code", "enterprise_id"]) || !id(target.user_email) || !/^[A-Z]{2}$/.test(target.country_code) || !(target.enterprise_id === null || id(target.enterprise_id))) f("INVALID_REQUEST");
      if (["user_email", "country_code", "enterprise_id"].every((k) => (before[k] ?? null) === (target[k] ?? null))) f("INVALID_REQUEST");
    } else if (target !== null) f("INVALID_REQUEST");
    const bound = Object.freeze({ actor_user_id: u.id, source, profile_id, expected_updated_date, mutation, country_code: before.country_code, enterprise_id: enterprise, target: target ? Object.freeze({ ...target }) : null });
    if (!authority || ports.approvals?.isPinnedNegativeDecision?.(authority, bound) !== true) f("AUTH_FORBIDDEN");
    if (authority.kind === "general_admin") {
      if (u.role !== "admin") f("AUTH_FORBIDDEN");
    } else if (authority.kind === "enterprise_agent") {
      if (!enterprise || authority.enterprise_id !== enterprise || authority.country_code !== before.country_code) f("AUTH_FORBIDDEN");
      if (target && (target.enterprise_id !== enterprise || target.country_code !== before.country_code)) f("AUTH_FORBIDDEN");
    } else if (authority.kind === "self_owner") {
      if (source !== "updateLivreur:self_identity" || mutation !== "identity" || target === null || typeof before.user_email !== "string" || before.user_email.trim().toLowerCase() !== u.email.trim().toLowerCase()) f("AUTH_FORBIDDEN");
    } else f("AUTH_FORBIDDEN");
    const basis = await admissionHead(profile_id);
    const barrier = await append(make("admission", "Livreur", profile_id, before.country_code, u, { native_user_id: basis?.payload.native_user_id ?? null, subject_email: basis?.payload.subject_email ?? null, tenant_key: enterprise ? "enterprise:" + enterprise : "public", state: "revoked", approval_reference: "native:" + source + ":scoped-negative:" + randomUUID(), profile_revision: before.updated_date, basis_proof_id: basis?.proof_id ?? null, mutation_target: target ? { ...target } : null }));
    const result = await authorizedMutation();
    return { result, loyalty: { state: "recorded", proof_id: barrier.proof_id } };
  }
  async function guardDriverIdentityMutation({ source, profile_id, expected_updated_date, target, authority = null }, authorizedMutation) {
    if (authority !== null) return guardNegativeDriverMutation({ source, profile_id, expected_updated_date, target, authority, mutation: "identity" }, authorizedMutation);
    if (!enabled) f("LOYALTY_IDENTITY_BARRIER_UNAVAILABLE");
    const u = await actor();
    if (u.role !== "admin" || source !== "updateLivreur:admin_decision") f("AUTH_FORBIDDEN");
    if (!exact(target, ["user_email", "country_code", "enterprise_id"]) || !id(target.user_email) || !/^[A-Z]{2}$/.test(target.country_code) || !(target.enterprise_id === null || id(target.enterprise_id))) f("INVALID_REQUEST");
    const before = await ports.drivers.get(profile_id);
    if (before?.id !== profile_id || before.updated_date !== expected_updated_date || !id(before.user_email) || !/^[A-Z]{2}$/.test(before.country_code)) f("LOYALTY_ADMISSION_REFERENCE_CHANGED");
    if (["user_email", "country_code", "enterprise_id"].every((k) => (before[k] ?? null) === (target[k] ?? null))) f("INVALID_REQUEST");
    const basis = await admissionHead(profile_id);
    const barrier = await append(make("admission", "Livreur", profile_id, before.country_code, u, { native_user_id: basis?.payload.native_user_id ?? null, subject_email: before.user_email, tenant_key: "public", state: "revoked", approval_reference: "native:" + source + ":identity-barrier:" + randomUUID(), profile_revision: before.updated_date, basis_proof_id: basis?.proof_id ?? null, mutation_target: { ...target } }));
    const result = await authorizedMutation();
    return { result, loyalty: { state: "recorded", proof_id: barrier.proof_id } };
  }
  async function finalize({ course_id }, protectedCommit) {
    if (!enabled) return { result: await protectedCommit(), loyalty: { state: "disabled" } };
    let context;
    try {
      const u = await actor(), course = await ports.courses.get(course_id), origin = await uniqueOrigin("CourseExterne", course_id), admission = await latestAdmission(course.livreur_id);
      if (course.id !== course_id || cancelled(course) || !publicRow(course) || !["arrivee", "en_livraison", "colis_recupere", "pris_en_charge"].includes(course.statut) || course.country_code !== origin.country_code || admission.country_code !== course.country_code || admission.payload.native_user_id !== u.id || admission.payload.subject_email !== u.email || !publicRow(u) || u.country_code && u.country_code !== course.country_code) f();
      await currentDriverAllows(admission, u, course.country_code);
      if ((await scan({ kind: "delivery", subject_type: "CourseExterne", subject_id: course_id })).some((r) => r.payload.state === "revoked")) f();
      context = { u, origin, admission };
    } catch {
    }
    const result = await protectedCommit();
    if (!context || result?.committed !== true) return { result, loyalty: { state: "incomplete" } };
    const loyalty = await capture(async () => {
      const { u, origin, admission } = context, course = result.course;
      if (course?.id !== course_id || course.statut !== "livree" || course.auto_completed === true || cancelled(course) || !publicRow(course) || course.country_code !== origin.country_code || course.livreur_id !== admission.subject_id || !uuid(result.operation_id) || !iso(result.completed_at) || Date.parse(result.completed_at) > Date.parse(now()) || Date.parse(result.completed_at) < Date.parse(origin.issued_at) || Date.parse(result.completed_at) < Date.parse(admission.issued_at)) f();
      await currentDriverAllows(admission, u, course.country_code);
      if (stable(await uniqueOrigin("CourseExterne", course_id)) !== stable(origin) || stable(await latestAdmission(course.livreur_id)) !== stable(admission)) f();
      if ((await scan({ kind: "delivery", subject_type: "CourseExterne", subject_id: course_id })).some((r) => r.payload.state === "revoked")) f();
      return append(make("delivery", "CourseExterne", course_id, origin.country_code, u, { state: "confirmed", beneficiary_user_id: origin.payload.beneficiary_user_id, client_profile_id: origin.payload.client_profile_id, driver_profile_id: admission.subject_id, origin_proof_id: origin.proof_id, admission_proof_id: admission.proof_id, operation_id: result.operation_id, completed_at: result.completed_at, request_id: origin.payload.request_id }));
    });
    return { result, loyalty };
  }
  async function cancel({ course_id }, authorizedCancel) {
    if (!enabled) return { result: await authorizedCancel(), loyalty: { state: "disabled" } };
    let context;
    try {
      const u = await actor(), course = await ports.courses.get(course_id);
      if (course?.id !== course_id || !/^[A-Z]{2}$/.test(course.country_code) || !publicRow(course)) f();
      context = { u, course, origin: null };
      try {
        context.origin = await uniqueOrigin("CourseExterne", course_id);
      } catch {
      }
    } catch {
    }
    const result = await authorizedCancel();
    if (!context || result?.cancelled !== true) return { result, loyalty: { state: "incomplete" } };
    return { result, loyalty: await capture(() => append(make("delivery", "CourseExterne", course_id, context.course.country_code, context.u, { state: "revoked", beneficiary_user_id: context.origin?.payload.beneficiary_user_id ?? null, client_profile_id: context.origin?.payload.client_profile_id ?? null, driver_profile_id: null, origin_proof_id: context.origin?.proof_id ?? null, admission_proof_id: null, operation_id: null, completed_at: null, request_id: context.origin?.payload.request_id ?? null }))) };
  }
  async function read(body) {
    if (!exact(body, ["profile_id", "country_code"]) || !id(body.profile_id) || !/^[A-Z]{2}$/.test(body.country_code)) f("INVALID_REQUEST");
    const { profile_id, country_code } = body;
    if (!readerEnabled) f("LOYALTY_SOURCE_NOT_VERIFIED");
    const u = await actor(), profile = await ports.clients.get(profile_id);
    if (profile?.id !== profile_id || profile.country_code !== country_code || profile.user_email !== u.email || !publicRow(profile) || !publicRow(u) || profile.actif === false || !/^[A-Z]{2}$/.test(profile.country_code) || u.country_code && u.country_code !== profile.country_code) f("LOYALTY_PROFILE_FORBIDDEN");
    async function collect() {
      const origins = await scan({ kind: "origin", beneficiary_user_id: u.id, country_code: profile.country_code });
      const deliveries = await scan({ kind: "delivery", beneficiary_user_id: u.id, country_code: profile.country_code });
      const legacy = await ports.courses.listOwned(u, profile);
      if (!Array.isArray(legacy) || legacy.length > 1e4) f("LOYALTY_HISTORY_INCOMPLETE");
      const byId = /* @__PURE__ */ new Map();
      for (const c of legacy) {
        if (!id(c?.id) || c.country_code !== profile.country_code || !(c.client_user_email === u.email || c.destinataire_client_id === profile.id || c.loyalty_identity_beneficiary_user_id === u.id)) f("LOYALTY_SCOPE_INVALID");
        if (byId.has(c.id)) f("LOYALTY_READ_CHANGED");
        byId.set(c.id, c);
      }
      for (const r of [...origins.filter((r2) => r2.subject_type === "CourseExterne"), ...deliveries]) if (!byId.has(r.subject_id)) byId.set(r.subject_id, await ports.courses.get(r.subject_id));
      const rows = [...byId.values()];
      if (rows.some((c) => !c || !id(c.id))) f();
      return { origins, deliveries, rows };
    }
    const a = await collect(), eligible = [], chain = [], courseEvidence = /* @__PURE__ */ new Map(), orderAliases = /* @__PURE__ */ new Map(), originEvidence = /* @__PURE__ */ new Map();
    async function readUniqueOrigin(type, subject, required = true) {
      const query = { kind: "origin", subject_type: type, subject_id: subject }, rows = await scan(query);
      originEvidence.set(type + ":" + subject, { query, rows });
      if (rows.length > 1 || required && rows.length !== 1) f();
      return rows[0] ?? null;
    }
    async function authoritativeOrigin(course) {
      const origin = await readUniqueOrigin("CourseExterne", course.id, false);
      if (!origin) return null;
      if (origin.country_code !== course.country_code) f();
      if (origin.payload.parent_proof_id) {
        const parent = await get(origin.payload.parent_proof_id), q = origin.payload;
        if (parent.kind !== "origin" || parent.subject_type === "CourseExterne" || parent.payload.beneficiary_user_id !== q.beneficiary_user_id || parent.payload.client_profile_id !== q.client_profile_id || parent.country_code !== origin.country_code || parent.payload.source_kind !== q.source_kind || Date.parse(parent.issued_at) > Date.parse(origin.issued_at)) f();
        if (stable(await readUniqueOrigin(parent.subject_type, parent.subject_id)) !== stable(parent)) f();
        if (parent.subject_type === "Conversation" && (course.conversation_id !== parent.subject_id || course.pharmacie_id !== parent.payload.pharmacy_partner_id || q.pharmacy_partner_id !== parent.payload.pharmacy_partner_id || course.destinataire_client_id !== q.client_profile_id)) f();
        if (parent.subject_type === "CommandeBoutique" && course.commande_boutique_id !== parent.subject_id) f();
        if (parent.subject_type === "CommandeRestaurant" && course.commande_restaurant_id !== parent.subject_id) f();
        chain.push(parent);
      }
      chain.push(origin);
      return origin;
    }
    function belongsToViewer(origin, course) {
      if (origin.payload.beneficiary_user_id === u.id) {
        if (origin.payload.client_profile_id !== profile.id) f();
        return true;
      }
      if (origin.payload.client_profile_id === profile.id || course.destinataire_client_id !== profile.id) f();
      return false;
    }
    for (const course of a.rows) {
      if (course.country_code !== profile.country_code || !publicRow(course)) f("LOYALTY_SCOPE_INVALID");
      if (course.auto_completed === true || /^(guest_|guest-v1:)/.test(course.request_id || "")) continue;
      const knownProof = a.origins.some((o) => o.subject_type === "CourseExterne" && o.subject_id === course.id) || a.deliveries.some((r2) => r2.subject_id === course.id);
      const knownDates = ["delivery_confirmed_at", "heure_livraison", "colis_livre_at"].map((k) => course[k]).filter((x) => !empty(x));
      if (!knownProof && course.statut === "livree" && knownDates.length && knownDates.every((t) => Number.isFinite(deliveryTime(t)) && deliveryTime(t) < Date.parse(START))) continue;
      const receipts = await scan({ kind: "delivery", subject_type: "CourseExterne", subject_id: course.id });
      courseEvidence.set(course.id, receipts);
      const unlinkedQuery = { kind: "admin_unlinked", subject_type: "CourseExterne", subject_id: course.id };
      const unlinked = await scan(unlinkedQuery);
      originEvidence.set("admin_unlinked:" + course.id, { query: unlinkedQuery, rows: unlinked });
      if (unlinked.length) {
        if (unlinked.length !== 1) f();
        const proof = unlinked[0];
        if (proof.country_code !== course.country_code || proof.payload.tenant_key !== "public" || course.source !== "admin" || proof.payload.request_id !== (empty(course.request_id) ? null : course.request_id)) f();
        const positive = await readUniqueOrigin("CourseExterne", course.id, false);
        if (positive || receipts.some((r2) => r2.payload.state === "confirmed")) f();
        chain.push(proof);
        continue;
      }
      if (receipts.some((r2) => r2.payload.state === "revoked") || cancelled(course)) continue;
      const confirmed2 = receipts.filter((r2) => r2.payload.state === "confirmed");
      if (!confirmed2.length) {
        const origin2 = await authoritativeOrigin(course);
        if (origin2 && !belongsToViewer(origin2, course)) continue;
        const dates = ["delivery_confirmed_at", "heure_livraison", "colis_livre_at"].map((k) => course[k]).filter((x) => !empty(x));
        if (course.statut !== "livree") continue;
        if (dates.length && dates.every((t) => Number.isFinite(deliveryTime(t)) && deliveryTime(t) < Date.parse(START))) continue;
        if (origin2) f("LOYALTY_PROOF_PENDING");
        f();
      }
      const r = confirmed2[0], q = r.payload;
      if (confirmed2.some((x) => x.payload.operation_id !== q.operation_id || stable(x.payload) !== stable(q) || x.actor_user_id !== r.actor_user_id || x.country_code !== r.country_code)) f();
      if (Date.parse(q.completed_at) < Date.parse(START)) continue;
      if (r.country_code !== profile.country_code || Date.parse(q.completed_at) > Date.parse(now()) || course.statut !== "livree" || course.livreur_id !== q.driver_profile_id || course.delivery_confirmed_at !== q.completed_at) f();
      const origin = await authoritativeOrigin(course), admission = await get(q.admission_proof_id);
      if (!origin || origin.proof_id !== q.origin_proof_id) f();
      if (origin.kind !== "origin" || origin.subject_type !== "CourseExterne" || origin.subject_id !== course.id || origin.country_code !== r.country_code || origin.payload.beneficiary_user_id !== q.beneficiary_user_id || origin.payload.client_profile_id !== q.client_profile_id || origin.payload.request_id !== q.request_id || admission.kind !== "admission" || admission.subject_id !== q.driver_profile_id || admission.country_code !== r.country_code || admission.payload.native_user_id !== r.actor_user_id || admission.payload.state !== "admitted" || Date.parse(origin.issued_at) > Date.parse(q.completed_at) || Date.parse(admission.issued_at) > Date.parse(q.completed_at)) f();
      const activeAtCommit = await latestAdmission(q.driver_profile_id, q.completed_at);
      if (activeAtCommit.proof_id !== admission.proof_id) f();
      chain.push(admission);
      if (!belongsToViewer(origin, course)) continue;
      if (origin.payload.parent_proof_id) {
        const parent = await get(origin.payload.parent_proof_id);
        if (["CommandeBoutique", "CommandeRestaurant"].includes(parent.subject_type)) orderAliases.set(r.proof_id, parent.subject_type + ":" + parent.subject_id);
      }
      eligible.push(r);
    }
    const b = await collect();
    if (stable(a) !== stable(b)) f("LOYALTY_READ_CHANGED");
    for (const [course_id, receipts] of courseEvidence) if (stable(await scan({ kind: "delivery", subject_type: "CourseExterne", subject_id: course_id })) !== stable(receipts)) f("LOYALTY_READ_CHANGED");
    for (const { query, rows } of originEvidence.values()) if (stable(await scan(query)) !== stable(rows)) f("LOYALTY_READ_CHANGED");
    for (const proof of chain) if (stable(await get(proof.proof_id)) !== stable(proof)) f("LOYALTY_READ_CHANGED");
    const current = await ports.clients.get(profile_id);
    if (current?.id !== profile_id || current.user_email !== u.email || current.country_code !== profile.country_code || current.enterprise_id || current.actif === false) f("LOYALTY_PROFILE_FORBIDDEN");
    const aliases = /* @__PURE__ */ new Map();
    const find = (k) => {
      while (aliases.get(k) !== k) k = aliases.get(k);
      return k;
    };
    for (const r of eligible) {
      const keys = ["course:" + r.subject_id, "operation:" + r.payload.operation_id];
      if (r.payload.request_id) keys.push("request:" + r.payload.request_id);
      if (orderAliases.has(r.proof_id)) keys.push("order:" + orderAliases.get(r.proof_id));
      for (const k of keys) if (!aliases.has(k)) aliases.set(k, k);
      const root = find(keys[0]);
      for (const k of keys) aliases.set(find(k), root);
    }
    const completed = new Set(eligible.map((r) => find("course:" + r.subject_id))).size;
    return { success: true, version: 1, completeness: "complete", policy_id: policy.policy_id, user_id: u.id, profile_id: profile.id, country_code: profile.country_code, ...loyaltyProgress(completed), observed_at: now(), latest_eligible_confirmed_at: eligible.length ? eligible.map((r) => r.payload.completed_at).sort().at(-1) : null };
  }
  return Object.freeze({ createNativeOrigin, createDelegatedOrigin, createAdminUnlinkedOrigin, createLinkedCourse, bindApprovedDriverReference, createNativeDriverBinding, establishNativeDriverBinding, guardNegativeDriverMutation, guardDriverIdentityMutation, finalize, cancel, read });
}

// frozen:base44/shared/base44LedgerPorts.js
var BASE = ["version", "epoch_id", "proof_id", "kind", "subject_type", "subject_id", "country_code", "issued_at", "actor_user_id", "beneficiary_user_id"];
var STORED = [...BASE, "payload_json"];
var COURSE = ["id", "statut", "request_id", "auto_completed", "country_code", "enterprise_id", "client_user_email", "destinataire_client_id", "loyalty_identity_beneficiary_user_id", "pharmacie_id", "conversation_id", "livreur_id", "delivery_confirmed_at", "heure_livraison", "colis_livre_at", "annulation_user_id", "date_annulation", "annulation_source", "annulation_event_at"];
var CLIENT = ["id", "user_email", "country_code", "enterprise_id", "actif"];
var DRIVER = ["id", "user_email", "country_code", "enterprise_id", "actif", "validation", "admin_hors_ligne", "updated_date"];
var SOURCE = ["id", "country_code", "pays_code", "enterprise_id", "course_id", "statut"];
var META = ["id", "created_date", "updated_date", "created_by_id", "created_by", "updated_by", "updated_by_id"];
var projected = (rows, fields2) => {
  if (rows.some((r) => Object.keys(r).some((k) => !fields2.includes(k) && !META.includes(k)))) fail2();
  return rows;
};
var fail2 = () => {
  throw Object.assign(new Error("LOYALTY_READ_INVALID"), { code: "LOYALTY_READ_INVALID", status: 503 });
};
function decode(row) {
  if (!row || typeof row.payload_json !== "string") fail2();
  let payload;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    fail2();
  }
  return { ...Object.fromEntries(BASE.map((k) => [k, row[k] ?? null])), payload };
}
function encode(row) {
  return { ...Object.fromEntries(BASE.filter((k) => k !== "beneficiary_user_id" || row[k] != null).map((k) => [k, row[k] ?? null])), payload_json: JSON.stringify(row.payload) };
}
function createBase44LedgerPorts(api, { isPinnedReference = () => false, isPinnedNegativeDecision = () => false } = {}) {
  const service = api.asServiceRole.entities, ordinary = api.entities;
  async function one(entity, q, fields2) {
    const page = await entity.filter(q, { limit: 2, sort: "id", fields: fields2 });
    if (!page || !Array.isArray(page.items) || page.items.length > 1 || page.has_more === true) fail2();
    projected(page.items, fields2);
    const row = page.items[0] ?? null;
    if (row && Object.entries(q).some(([k, v]) => row[k] !== v)) fail2();
    return row;
  }
  return {
    auth: api.auth,
    approvals: { isPinnedReference, isPinnedNegativeDecision },
    evidence: {
      append: (record) => service[ENTITY].create(encode(record)),
      get: async (proof_id) => {
        const r = await one(service[ENTITY], { proof_id }, STORED);
        return r ? decode(r) : null;
      },
      scan: async (query, { cursor, limit }) => {
        const page = cursor ? await service[ENTITY].list({ cursor, limit }) : await service[ENTITY].filter(query, { limit, sort: "proof_id", fields: STORED });
        if (!page || !Array.isArray(page.items) || typeof page.has_more !== "boolean") fail2();
        return { items: projected(page.items, STORED).map(decode), has_more: page.has_more, next_cursor: page.next_cursor };
      }
    },
    clients: { get: (id3) => one(ordinary.ClientExterne, { id: id3 }, CLIENT) },
    delegatedProfiles: { get: (id3) => one(service.ClientExterne, { id: id3 }, [...CLIENT, "updated_date"]) },
    drivers: { get: (id3) => one(service.Livreur, { id: id3 }, DRIVER) },
    nativeUsers: { get: async (id3) => {
      const rows = await service.User.filter({ id: id3 }, "id", 2, 0, ["id", "email", "country_code", "enterprise_id"]);
      if (!Array.isArray(rows) || rows.length > 1) fail2();
      projected(rows, ["id", "email", "country_code", "enterprise_id"]);
      if (rows[0] && rows[0].id !== id3) fail2();
      return rows[0] ?? null;
    } },
    countries: { get: (code) => one(service.Country, { code }, ["id", "code", "actif"]) },
    sources: { get: (type, id3) => {
      if (!["CommandeBoutique", "CommandeRestaurant", "Conversation"].includes(type)) fail2();
      return one((type === "Conversation" ? ordinary : service)[type], { id: id3 }, type === "Conversation" ? [...SOURCE, "participants", "participant_user_ids"] : SOURCE);
    } },
    pharmacies: { get: (id3) => one(service.Pharmacie, { id: id3 }, ["id", "user_email", "pays_code", "enterprise_id", "actif"]) },
    courses: {
      get: (id3) => one(service.CourseExterne, { id: id3 }, COURSE),
      listOwned: async (user, profile) => {
        const q = { country_code: profile.country_code, $or: [{ client_user_email: user.email }, { destinataire_client_id: profile.id }, { loyalty_identity_beneficiary_user_id: user.id }] };
        const rows = [];
        let cursor = null;
        for (let n = 0; n < 100; n++) {
          const page = cursor ? await service.CourseExterne.list({ cursor, limit: 100 }) : await service.CourseExterne.filter(q, { limit: 100, sort: "id", fields: COURSE });
          if (!page || !Array.isArray(page.items) || page.items.length > 100 || typeof page.has_more !== "boolean") fail2();
          rows.push(...projected(page.items, COURSE));
          if (!page.has_more) return rows;
          if (!page.next_cursor || page.next_cursor === cursor) fail2();
          cursor = page.next_cursor;
        }
        fail2();
      }
    }
  };
}

// frozen:base44/shared/ledgerConfig.js
var LEDGER_CONFIG = Object.freeze({ captureEnabled: false, readerEnabled: false, policy: null });

// frozen:base44/shared/captureRuntimeFactory.js
function makeCaptureContextFactory(getApi, config = LEDGER_CONFIG) {
  return async function createLoyaltyCaptureContext2(req) {
    const disabled = () => ({ runtime: createLedgerRuntime({}, { captureEnabled: false, readerEnabled: false, policy: null }), resolveNativeUserByEmail: async () => null });
    if (config.captureEnabled !== true) return disabled();
    try {
      const policy = parseLedgerPolicy(config.policy);
      const api = await getApi(req), user = await api.auth.me();
      if (!user?.id || !user?.email) return disabled();
      const ports = createBase44LedgerPorts(api);
      ports.auth = { me: async () => user };
      const runtime = createLedgerRuntime(ports, { captureEnabled: true, readerEnabled: false, policy });
      const resolveNativeUserByEmail = async (email) => {
        if (typeof email !== "string" || !email || email.trim() !== email) return null;
        try {
          const fields2 = ["id", "email", "country_code", "enterprise_id"];
          const rows = await api.asServiceRole.entities.User.filter({ email }, "id", 2, 0, fields2);
          if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.id || rows[0].email !== email) return null;
          return Object.fromEntries(fields2.filter((k) => Object.hasOwn(rows[0], k)).map((k) => [k, rows[0][k]]));
        } catch {
          return null;
        }
      };
      return { runtime, resolveNativeUserByEmail };
    } catch {
      return disabled();
    }
  };
}
function makeCaptureRuntimeFactory(getApi, config = LEDGER_CONFIG) {
  const context = makeCaptureContextFactory(getApi, config);
  return async (req) => (await context(req)).runtime;
}

// frozen:base44/shared/loyaltyCaptureFactory.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.57";
var createLoyaltyCaptureContext = makeCaptureContextFactory(createClientFromRequest);
var createLoyaltyCaptureRuntime = makeCaptureRuntimeFactory(createClientFromRequest);
async function captureNativeCreate(req, profile_id, subject_type, create, pharmacy_id = null) {
  const runtime = await createLoyaltyCaptureRuntime(req);
  const captured = await runtime.createNativeOrigin({ profile_id, subject_type, pharmacy_id }, async () => ({ created: true, entity: subject_type, row: await create() }));
  return captured.result.row;
}
async function captureLinkedCreate(req, source_type, source_id, createAndLink) {
  const runtime = await createLoyaltyCaptureRuntime(req);
  const captured = await runtime.createLinkedCourse({ source_type, source_id }, async () => ({ created: true, entity: "CourseExterne", row: await createAndLink() }));
  return captured.result.row;
}

// frozen:base44/shared/loyaltyIdentity.js
var LOYALTY_IDENTITY_PREFIX = "loyalty_identity_";
var LOYALTY_IDENTITY_FIELDS = Object.freeze([
  "version",
  "beneficiary_user_id",
  "client_profile_id",
  "country_code",
  "attested_at",
  "source_kind",
  "source_id",
  "pharmacy_id"
].map((name) => LOYALTY_IDENTITY_PREFIX + name));
var KINDS = /* @__PURE__ */ new Set(["direct", "order", "pharmacy"]);
var id2 = (value) => typeof value === "string" && value.length > 0 && value.length <= 256 && value === value.trim() && !Array.from(value).some((char) => char.charCodeAt(0) <= 31 || char.charCodeAt(0) === 127);
var countryOk = (value) => typeof value === "string" && /^[A-Z]{2}$/.test(value);
var publicRow2 = (row) => row && !row.enterprise_id;
var millis = (now) => now === void 0 ? Date.now() : new Date(now).getTime();
var iso2 = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function stripLoyaltyIdentity(value, seen = /* @__PURE__ */ new WeakMap()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  const result = Array.isArray(value) ? [] : {};
  seen.set(value, result);
  for (const [key2, item] of Object.entries(value)) {
    if (!key2.toLowerCase().startsWith(LOYALTY_IDENTITY_PREFIX)) {
      Object.defineProperty(result, key2, { value: stripLoyaltyIdentity(item, seen), enumerable: true, writable: true, configurable: true });
    }
  }
  return result;
}
function validateLoyaltyIdentity(source, { kind, country: country2, clientId, now } = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source) || !publicRow2(source)) return null;
  const keys = Object.keys(source).filter((key2) => key2.toLowerCase().startsWith(LOYALTY_IDENTITY_PREFIX));
  if (keys.length !== LOYALTY_IDENTITY_FIELDS.length || keys.some((key2) => !LOYALTY_IDENTITY_FIELDS.includes(key2))) return null;
  if (LOYALTY_IDENTITY_FIELDS.some((key2) => !Object.hasOwn(source, key2))) return null;
  const v = Object.fromEntries(LOYALTY_IDENTITY_FIELDS.map((key2) => [key2.slice(LOYALTY_IDENTITY_PREFIX.length), source[key2]]));
  const at = millis(now);
  if (v.version !== 1 || !id2(v.beneficiary_user_id) || !id2(v.client_profile_id) || !countryOk(v.country_code) || !KINDS.has(v.source_kind) || !iso2(v.attested_at) || !Number.isFinite(at) || Date.parse(v.attested_at) > at || !(v.source_id === "" || id2(v.source_id)) || (v.source_kind === "pharmacy" ? !id2(v.pharmacy_id) : v.pharmacy_id !== "") || kind !== void 0 && v.source_kind !== kind || country2 !== void 0 && v.country_code !== country2 || clientId !== void 0 && v.client_profile_id !== clientId) return null;
  return Object.fromEntries(LOYALTY_IDENTITY_FIELDS.map((key2) => [key2, source[key2]]));
}
function attestLoyaltyIdentity({ user, client, country: country2, kind, parent, now } = {}) {
  const at = millis(now);
  if (!publicRow2(user) || !publicRow2(client) || !id2(user.id) || !id2(client.id) || !countryOk(country2) || client.country_code !== country2 || !KINDS.has(kind) || !Number.isFinite(at) || client.actif === false || user.country_code && user.country_code !== country2) return {};
  if (kind !== "direct" && (!publicRow2(parent) || !id2(parent.id) || parent.pays_code !== country2 || parent.actif === false)) return {};
  return {
    loyalty_identity_version: 1,
    loyalty_identity_beneficiary_user_id: user.id,
    loyalty_identity_client_profile_id: client.id,
    loyalty_identity_country_code: country2,
    loyalty_identity_attested_at: new Date(at).toISOString(),
    loyalty_identity_source_kind: kind,
    loyalty_identity_source_id: "",
    loyalty_identity_pharmacy_id: kind === "pharmacy" ? parent.id : ""
  };
}
function copyLoyaltyIdentity({ source, kind, clientId, country: country2, parentId, pharmacyId, now } = {}) {
  if (!source || !id2(source.id) || !id2(clientId) || !countryOk(country2) || !["order", "pharmacy"].includes(kind)) return {};
  const tuple = validateLoyaltyIdentity(source, { kind, country: country2, clientId, now });
  if (!tuple || tuple.loyalty_identity_source_id !== "") return {};
  if (kind === "order") {
    if (!id2(parentId) || source.client_id !== clientId || source.pays_code !== country2) return {};
    const parents = [source.boutique_id, source.restaurant_id].filter((value) => value !== void 0 && value !== null && value !== "");
    if (parents.length !== 1 || parents[0] !== parentId) return {};
  } else {
    if (!id2(pharmacyId) || tuple.loyalty_identity_pharmacy_id !== pharmacyId || parentId !== void 0 && parentId !== pharmacyId) return {};
    let parts;
    try {
      parts = typeof source.participants === "string" ? JSON.parse(source.participants) : null;
    } catch {
      return {};
    }
    if (!Array.isArray(parts) || parts.length !== 2 || parts.filter((p) => p && p.type === "client" && p.id === clientId).length !== 1 || parts.filter((p) => p && p.type === "partenaire" && p.id === pharmacyId).length !== 1) return {};
  }
  return { ...tuple, loyalty_identity_source_id: source.id };
}

// frozen:base44/shared/commerceSingletonJournal.js
var bindingKeys = ["request_id", "actor_id", "scope_id", "operation", "payload_hash"];
var validKey = (value) => typeof value === "string" && value.length > 0 && value.length <= 200;
var same = (a, b) => bindingKeys.every((k) => a[k] === b[k]);
var bytes = (value) => new TextEncoder().encode(value).length;
var reconcile = (reason) => ({ decision: "reconcile", reason, may_execute: false });
function fail3(code) {
  throw Object.assign(new Error(code), { code });
}
function binding(request) {
  if (!request || bindingKeys.some((k) => !validKey(request[k]))) fail3("REQUEST_BINDING_INVALID");
  return Object.fromEntries(bindingKeys.map((k) => [k, request[k]]));
}
function createCommerceSingletonJournal({ storage, singletonId, authorize, newClaimId, maxEntries = 200, maxBytes = 65536 }) {
  if (!validKey(singletonId) || !storage || typeof storage.get !== "function" || typeof storage.updateMany !== "function" || typeof authorize !== "function" || typeof newClaimId !== "function") fail3("PROVISIONED_JOURNAL_REQUIRED");
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 1e3 || !Number.isSafeInteger(maxBytes) || maxBytes < 256 || maxBytes > 1048576) fail3("JOURNAL_LIMITS_INVALID");
  async function access(request) {
    const req = binding(request);
    if (await authorize(req) !== true) fail3("AUTHORIZATION_REQUIRED");
    return req;
  }
  async function read() {
    const root = await storage.get(singletonId);
    if (!root || root.id !== singletonId || root.state !== "ready" || !Number.isSafeInteger(root.revision) || root.revision < 0 || root.revision >= Number.MAX_SAFE_INTEGER || typeof root.ledger !== "string" || bytes(root.ledger) > maxBytes) fail3("JOURNAL_UNAVAILABLE");
    let entries;
    try {
      entries = JSON.parse(root.ledger);
    } catch {
      fail3("JOURNAL_INVALID");
    }
    if (!Array.isArray(entries) || entries.length > maxEntries) fail3("JOURNAL_INVALID");
    const ids = /* @__PURE__ */ new Set();
    for (const e of entries) {
      binding(e);
      if (ids.has(e.request_id) || !validKey(e.claim_id) || !["running", "completed", "unknown"].includes(e.state) || e.state === "completed" && !validKey(e.result_id)) fail3("JOURNAL_INVALID");
      ids.add(e.request_id);
    }
    return { root, entries };
  }
  function existing(entries, req) {
    const entry = entries.find((e) => e.request_id === req.request_id);
    if (!entry) return null;
    if (!same(entry, req)) fail3("REQUEST_BINDING_CONFLICT");
    return entry.state === "completed" ? { decision: "replay_receipt", result_id: entry.result_id, requires_authorized_result_read: true, may_execute: false } : reconcile("REQUEST_ALREADY_RESERVED");
  }
  async function cas(root, entries) {
    const ledger = JSON.stringify(entries);
    if (entries.length > maxEntries || bytes(ledger) > maxBytes) fail3("JOURNAL_CAPACITY_REACHED");
    const receipt = await storage.updateMany({ id: singletonId, revision: root.revision, state: "ready", ledger: root.ledger }, { $set: { revision: root.revision + 1, ledger } });
    return receipt?.success === true && receipt.updated === 1 && receipt.has_more !== true;
  }
  async function inspect(request) {
    const req = await access(request);
    const { entries } = await read();
    return existing(entries, req) || { decision: "unreserved", may_execute: false };
  }
  async function execute(request, perform) {
    if (typeof perform !== "function") fail3("EFFECT_REQUIRED");
    const req = await access(request);
    let snapshot;
    try {
      snapshot = await read();
    } catch (e) {
      return reconcile(e.code || "JOURNAL_READ_UNCERTAIN");
    }
    const found = existing(snapshot.entries, req);
    if (found) return found;
    if (snapshot.entries.length >= maxEntries) return reconcile("JOURNAL_CAPACITY_REACHED");
    const claim_id = newClaimId();
    if (!validKey(claim_id)) fail3("CLAIM_ID_INVALID");
    const entry = { ...req, claim_id, state: "running" };
    try {
      if (!await cas(snapshot.root, [...snapshot.entries, entry])) return reconcile("CLAIM_NOT_CONFIRMED");
    } catch (e) {
      return reconcile(e.code || "CLAIM_OUTCOME_UNCERTAIN");
    }
    let result;
    try {
      result = await perform(Object.freeze({ ...req, claim_id }));
    } catch {
      return reconcile("EFFECT_OUTCOME_UNCERTAIN");
    }
    if (!validKey(result?.result_id)) return reconcile("EFFECT_RECEIPT_INVALID");
    try {
      const latest = await read();
      const current = latest.entries.find((e) => e.request_id === req.request_id);
      if (!current || !same(current, req) || current.claim_id !== claim_id || current.state !== "running") return reconcile("RESERVATION_CHANGED");
      const completed = latest.entries.map((e) => e.request_id === req.request_id ? { ...e, state: "completed", result_id: result.result_id } : e);
      if (!await cas(latest.root, completed)) return reconcile("RECEIPT_NOT_CONFIRMED");
      return { decision: "completed", result_id: result.result_id, requires_authorized_result_read: true, may_execute: false };
    } catch (e) {
      return reconcile(e.code || "RECEIPT_OUTCOME_UNCERTAIN");
    }
  }
  return Object.freeze({ inspect, execute });
}

// frozen:base44/shared/commerceSegmentedJournal.js
var fields = ["request_id", "actor_id", "scope_id", "operation", "payload_hash"];
var key = (x) => typeof x === "string" && x.length > 0 && x.length <= 200;
var size = (x) => new TextEncoder().encode(x).length;
var stop = (reason) => ({ decision: "reconcile", reason, may_execute: false });
function fail4(code) {
  throw Object.assign(new Error(code), { code });
}
function binding2(x) {
  if (!x || fields.some((k) => !key(x[k]))) fail4("INVALID_BINDING");
  return Object.fromEntries(fields.map((k) => [k, x[k]]));
}
var same2 = (a, b) => fields.every((k) => a[k] === b[k]);
var confirmed = (r) => r?.success === true && r.updated === 1 && r.has_more !== true;
function createCommerceSegmentedJournal({ storage, rootId, authorize, newClaimId, maxEntries = 200, maxBytes = 65536, maxSegments = 64, maxManifestBytes = 16384 }) {
  if (!key(rootId) || !storage || ["get", "create", "updateMany"].some((k) => typeof storage[k] !== "function") || typeof authorize !== "function" || typeof newClaimId !== "function") fail4("CONFIG_REQUIRED");
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 1e3 || !Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > 1048576 || !Number.isSafeInteger(maxSegments) || maxSegments < 2 || maxSegments > 256 || !Number.isSafeInteger(maxManifestBytes) || maxManifestBytes < 1024 || maxManifestBytes > 65536) fail4("INVALID_LIMITS");
  function revision(x) {
    if (!Number.isSafeInteger(x) || x < 0 || x >= Number.MAX_SAFE_INTEGER) fail4("INVALID_REVISION");
  }
  function entries(row) {
    revision(row.revision);
    if (typeof row.ledger !== "string" || size(row.ledger) > maxBytes) fail4("INVALID_LEDGER");
    let a;
    try {
      a = JSON.parse(row.ledger);
    } catch {
      fail4("INVALID_LEDGER");
    }
    if (!Array.isArray(a) || a.length > maxEntries) fail4("INVALID_LEDGER");
    const ids = /* @__PURE__ */ new Set(), claims = /* @__PURE__ */ new Set();
    for (const e of a) {
      binding2(e);
      if (!key(e.claim_id) || ids.has(e.request_id) || claims.has(e.claim_id) || !["running", "completed", "unknown"].includes(e.state) || e.state === "completed" && !key(e.result_id)) fail4("INVALID_LEDGER");
      ids.add(e.request_id);
      claims.add(e.claim_id);
    }
    return a;
  }
  function fits(a) {
    return a.length <= maxEntries && size(JSON.stringify(a.map((e) => e.state === "completed" ? e : { ...e, state: "completed", result_id: "\0".repeat(200) }))) <= maxBytes;
  }
  async function access(x) {
    const req = binding2(x);
    if (await authorize(req) !== true) fail4("AUTHORIZATION_REQUIRED");
    return req;
  }
  async function root() {
    const r = await storage.get(rootId);
    if (!r || r.id !== rootId || r.state !== "segmented" || r.journal_version !== 2) fail4("SEGMENTED_ROOT_REQUIRED");
    revision(r.revision);
    let ids;
    try {
      ids = JSON.parse(r.segment_ids);
    } catch {
      fail4("INVALID_MANIFEST");
    }
    if (typeof r.segment_ids !== "string" || size(r.segment_ids) > maxManifestBytes || !Array.isArray(ids) || ids.length < 1 || ids.length > maxSegments || ids.some((x) => !key(x) || x === rootId) || new Set(ids).size !== ids.length) fail4("INVALID_MANIFEST");
    return { row: r, ids };
  }
  async function segment(id3) {
    const r = await storage.get(id3);
    if (!r || r.id !== id3 || r.root_id !== rootId || r.journal_version !== 2 || !["open", "sealed"].includes(r.state)) fail4("INVALID_SEGMENT");
    return { row: r, entries: entries(r) };
  }
  async function scan() {
    const manifest = await root();
    const segments = [];
    const requests = /* @__PURE__ */ new Set(), claims = /* @__PURE__ */ new Set();
    for (const id3 of manifest.ids) {
      const s = await segment(id3);
      for (const e of s.entries) {
        if (requests.has(e.request_id) || claims.has(e.claim_id)) fail4("DUPLICATE_BINDING");
        requests.add(e.request_id);
        claims.add(e.claim_id);
      }
      segments.push(s);
    }
    if (segments.slice(0, -1).some((s) => s.row.state !== "sealed")) fail4("INVALID_SEGMENT_ORDER");
    return { ...manifest, segments, claims };
  }
  function found(s, req) {
    for (const seg of s.segments) {
      const e = seg.entries.find((e2) => e2.request_id === req.request_id);
      if (!e) continue;
      if (!same2(e, req)) fail4("REQUEST_BINDING_CONFLICT");
      return e.state === "completed" ? { decision: "replay_receipt", result_id: e.result_id, requires_authorized_result_read: true, may_execute: false } : stop("REQUEST_ALREADY_RESERVED");
    }
    return null;
  }
  async function segmentCas(row, a, state = row.state) {
    if (!fits(a)) fail4("SEGMENT_CAPACITY");
    return confirmed(await storage.updateMany({ id: row.id, root_id: rootId, journal_version: 2, revision: row.revision, state: row.state, ledger: row.ledger }, { $set: { revision: row.revision + 1, state, ledger: JSON.stringify(a) } }));
  }
  async function newSegment(state, ledger) {
    const expected = { root_id: rootId, journal_version: 2, state, revision: 0, ledger };
    const created = await storage.create(expected);
    if (!created || !key(created.id) || created.id === rootId || Object.entries(expected).some(([k, v]) => created[k] !== v)) fail4("SEGMENT_CREATE_UNCERTAIN");
    return created.id;
  }
  async function rotate(snapshot) {
    const tail = snapshot.segments.at(-1);
    if (snapshot.ids.length >= maxSegments) return stop("JOURNAL_SEGMENT_LIMIT");
    if (tail.row.state === "open" && !await segmentCas(tail.row, tail.entries, "sealed")) return stop("SEAL_NOT_CONFIRMED");
    const fresh = await root();
    if (fresh.row.revision !== snapshot.row.revision || fresh.row.segment_ids !== snapshot.row.segment_ids) return stop("MANIFEST_CHANGED");
    const id3 = await newSegment("open", "[]");
    if (fresh.ids.includes(id3)) return stop("SEGMENT_ID_COLLISION");
    const segment_ids = JSON.stringify([...fresh.ids, id3]);
    if (size(segment_ids) > maxManifestBytes) return stop("MANIFEST_CAPACITY");
    const ok = confirmed(await storage.updateMany({ id: rootId, state: "segmented", journal_version: 2, revision: fresh.row.revision, segment_ids: fresh.row.segment_ids }, { $set: { revision: fresh.row.revision + 1, segment_ids } }));
    return ok ? { decision: "rotated", may_execute: false } : stop("ROTATION_NOT_CONFIRMED");
  }
  async function inspect(request) {
    const req = await access(request);
    const s = await scan();
    return found(s, req) || { decision: "unreserved", may_execute: false };
  }
  async function execute(request, perform) {
    if (typeof perform !== "function") fail4("EFFECT_REQUIRED");
    const req = await access(request);
    let s;
    try {
      s = await scan();
    } catch (e) {
      return stop(e.code || "READ_UNCERTAIN");
    }
    const prior = found(s, req);
    if (prior) return prior;
    const claim_id = newClaimId();
    if (!key(claim_id) || s.claims.has(claim_id)) fail4("CLAIM_ID_CONFLICT");
    const entry = { ...req, claim_id, state: "running" };
    let tail = s.segments.at(-1);
    if (tail.row.state === "sealed" || !fits([...tail.entries, entry])) {
      try {
        const r = await rotate(s);
        if (r.decision !== "rotated") return r;
        s = await scan();
      } catch (e) {
        return stop(e.code || "ROTATION_UNCERTAIN");
      }
      const competing = found(s, req);
      if (competing) return competing;
      if (s.claims.has(claim_id)) fail4("CLAIM_ID_CONFLICT");
      tail = s.segments.at(-1);
    }
    if (tail.row.state !== "open" || !fits([...tail.entries, entry])) return stop("SEGMENT_CAPACITY");
    try {
      if (!await segmentCas(tail.row, [...tail.entries, entry])) return stop("CLAIM_NOT_CONFIRMED");
    } catch (e) {
      return stop(e.code || "CLAIM_UNCERTAIN");
    }
    let result;
    try {
      result = await perform(Object.freeze({ ...req, claim_id }));
    } catch {
      return stop("EFFECT_UNCERTAIN");
    }
    if (!key(result?.result_id)) return stop("EFFECT_RECEIPT_INVALID");
    try {
      const currentRoot = await root();
      if (!currentRoot.ids.includes(tail.row.id)) return stop("SEGMENT_UNREFERENCED");
      const latest = await segment(tail.row.id);
      const current = latest.entries.find((e) => e.request_id === req.request_id);
      if (!current || !same2(current, req) || current.claim_id !== claim_id || current.state !== "running") return stop("RESERVATION_CHANGED");
      if (!await segmentCas(latest.row, latest.entries.map((e) => e.request_id === req.request_id ? { ...e, state: "completed", result_id: result.result_id } : e))) return stop("RECEIPT_NOT_CONFIRMED");
      return { decision: "completed", result_id: result.result_id, requires_authorized_result_read: true, may_execute: false };
    } catch (e) {
      return stop(e.code || "RECEIPT_UNCERTAIN");
    }
  }
  async function migrateCompletedLegacy() {
    if (await authorize({ operation: "migrate_journal", root_id: rootId }) !== true) fail4("MIGRATION_AUTHORIZATION_REQUIRED");
    try {
      const old = await storage.get(rootId);
      if (!old || old.id !== rootId || old.state !== "ready") return stop("LEGACY_ROOT_REQUIRED");
      const a = entries(old);
      if (a.some((e) => e.state !== "completed")) return stop("LEGACY_UNRESOLVED");
      const archive = await newSegment("sealed", old.ledger);
      const active = await newSegment("open", "[]");
      if (archive === active) return stop("SEGMENT_ID_COLLISION");
      const segment_ids = JSON.stringify([archive, active]);
      const ok = confirmed(await storage.updateMany({ id: rootId, state: "ready", revision: old.revision, ledger: old.ledger }, { $set: { state: "segmented", journal_version: 2, revision: old.revision + 1, segment_ids } }));
      return ok ? { decision: "migrated", may_execute: false } : stop("MIGRATION_NOT_CONFIRMED");
    } catch (e) {
      return stop(e.code || "MIGRATION_UNCERTAIN");
    }
  }
  return Object.freeze({ inspect, execute, migrateCompletedLegacy });
}

// frozen:base44/shared/commerceJournal.js
function createCommerceSingletonJournal2(options) {
  const legacy = createCommerceSingletonJournal(options);
  const required = ["request_id", "actor_id", "scope_id", "operation", "payload_hash"];
  const fail5 = (code) => {
    throw Object.assign(new Error(code), { code });
  };
  async function run(action, request, perform) {
    if (!request || required.some((k) => typeof request[k] !== "string" || !request[k] || request[k].length > 200)) fail5("REQUEST_BINDING_INVALID");
    if (await options.authorize(request) !== true) fail5("AUTHORIZATION_REQUIRED");
    try {
      const root = await options.storage.get(options.singletonId);
      if (!root || root.id !== options.singletonId) fail5("JOURNAL_UNAVAILABLE");
      const journal = root.state === "ready" ? legacy : root.state === "segmented" ? createCommerceSegmentedJournal({ ...options, rootId: options.singletonId }) : null;
      if (!journal) fail5("JOURNAL_UNAVAILABLE");
      return action === "inspect" ? await journal.inspect(request) : await journal.execute(request, perform);
    } catch (error) {
      if (error?.code === "AUTHORIZATION_REQUIRED" || error?.code === "REQUEST_BINDING_CONFLICT") throw error;
      return { decision: "reconcile", reason: error?.code || "JOURNAL_READ_UNCERTAIN", may_execute: false };
    }
  }
  return Object.freeze({ inspect: (request) => run("inspect", request), execute: (request, perform) => run("execute", request, perform) });
}

// frozen:base44/shared/commerceAccess.js
function deny(code, status = 403) {
  throw Object.assign(new Error(code), { code, status });
}
function country(value) {
  if (!/^[A-Z]{2}$/.test(value || "")) deny("COUNTRY_REQUIRED");
  return value;
}
function adminFor(user, code, trustedScope = null) {
  if (user?.role !== "admin" || user.enterprise_id) deny("ADMIN_REQUIRED");
  if (!trustedScope || trustedScope.user_id !== user.id) deny("TRUSTED_ADMIN_SCOPE_REQUIRED");
  const untilRevoked = trustedScope.expires_at === null && trustedScope.until_revoked === true;
  const finiteExpiry = typeof trustedScope.expires_at === "string" && (trustedScope.until_revoked === void 0 || trustedScope.until_revoked === false) && Number.isFinite(Date.parse(trustedScope.expires_at)) && Date.parse(trustedScope.expires_at) > Date.now();
  if (!untilRevoked && !finiteExpiry) deny("TRUSTED_ADMIN_SCOPE_REQUIRED");
  if (trustedScope.scope === "global") return;
  if (trustedScope.scope === "pays" && country(trustedScope.country_code) === country(code)) return;
  deny("ADMIN_COUNTRY_FORBIDDEN");
}
function ownerProfile(user, profile) {
  if (!user?.id || !user?.email) deny("AUTH_REQUIRED", 401);
  if (!profile?.id) deny("OWNER_COUNTRY_REQUIRED");
  if (profile.user_email !== user.email || profile.actif === false || profile.enterprise_id || user.enterprise_id) deny("OWNER_PROFILE_REQUIRED");
  return country(profile.country_code);
}
function accessShop(user, shop, profile, { catalogue = false, adminScope = null } = {}) {
  if (!shop?.id) deny("ESTABLISHMENT_NOT_FOUND", 404);
  country(shop.pays_code);
  if (user?.role === "admin") {
    adminFor(user, shop.pays_code, adminScope);
    return "admin";
  }
  if (!user?.id || !user?.email || user.enterprise_id || shop.partenaire_id !== user.id) deny("OWNER_COUNTRY_FORBIDDEN");
  if (profile && ownerProfile(user, profile) !== shop.pays_code) deny("OWNER_COUNTRY_FORBIDDEN");
  if (["refuse", "suspendu"].includes(shop.validation)) deny("ESTABLISHMENT_SUSPENDED");
  return "owner";
}
var sharedShop = ["nom", "logo_url", "description", "ville", "quartier", "adresse", "latitude", "longitude", "telephone", "telephone_depot", "horaires", "ouvert"];
var productFields = ["nom", "description", "photo_url", "photos_urls", "video_url", "prix", "categorie", "disponible"];
function objectPatch(data, allowed) {
  if (!data || typeof data !== "object" || Array.isArray(data)) deny("INVALID_PATCH", 400);
  for (const k of Object.keys(data)) if (!allowed.includes(k)) deny("FORBIDDEN_FIELD", 400);
  return { ...data };
}
function url(v) {
  if (v === "") return;
  try {
    const u = new URL(v);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password) deny("INVALID_MEDIA_URL", 400);
  } catch {
    deny("INVALID_MEDIA_URL", 400);
  }
}
function validate(patch) {
  for (const [key2, value] of Object.entries(patch)) {
    if (["ouvert", "disponible"].includes(key2)) {
      if (typeof value !== "boolean") deny("INVALID_BOOLEAN", 400);
    } else if (["prix", "latitude", "longitude", "temps_preparation_min"].includes(key2)) {
      if (!Number.isFinite(value)) deny("INVALID_NUMBER", 400);
      if (key2 === "prix" && (value < 0 || value > Number.MAX_SAFE_INTEGER)) deny("INVALID_PRICE", 400);
      if (key2 === "latitude" && Math.abs(value) > 90 || key2 === "longitude" && Math.abs(value) > 180 || key2 === "temps_preparation_min" && value < 0) deny("INVALID_NUMBER", 400);
    } else if (typeof value !== "string" || value.length > 2e4) deny("INVALID_TEXT", 400);
    if (key2 === "nom") {
      if (!value.trim()) deny("NAME_REQUIRED", 400);
      patch.nom = value.trim();
    }
    if (["logo_url", "photo_url", "video_url"].includes(key2)) url(value);
    if (key2 === "photos_urls" && value) {
      let list;
      try {
        list = JSON.parse(value);
      } catch {
        deny("INVALID_PHOTOS", 400);
      }
      if (!Array.isArray(list) || list.some((v) => typeof v !== "string")) deny("INVALID_PHOTOS", 400);
      list.forEach(url);
    }
  }
  return patch;
}
function shopPatch(type, data, creating = false) {
  const patch = validate(objectPatch(data, [...sharedShop, ...type === "restaurant" ? ["specialite", "temps_preparation_min"] : ["categorie"]]));
  if (creating && !patch.nom) deny("NAME_REQUIRED", 400);
  return patch;
}
function productPatch(data, creating = false) {
  const patch = validate(objectPatch(data, productFields));
  if (creating && (!patch.nom || !Object.hasOwn(patch, "prix"))) deny("PRODUCT_FIELDS_REQUIRED", 400);
  return patch;
}
function creationFields(type, user, profile, data) {
  if (!user?.id || !user?.email || user.enterprise_id) deny("OWNER_REQUIRED");
  if (!data || typeof data !== "object" || Array.isArray(data)) deny("INVALID_PATCH", 400);
  const code = type === "boutique" ? country(data.pays_code) : ownerProfile(user, profile);
  const editable = type === "boutique" ? Object.fromEntries(Object.entries(data).filter(([key2]) => key2 !== "pays_code")) : data;
  if (user.role === "admin") deny("ADMIN_OWNER_CREATION_NOT_SUPPORTED", 400);
  return {
    ...shopPatch(type, editable, true),
    pays_code: code,
    partenaire_id: user.id,
    user_email: user.email,
    ouvert: data.ouvert ?? true,
    actif: type === "boutique",
    validation: type === "boutique" ? "valide" : "en_attente",
    statut_validation: type === "boutique" ? "valide" : "en_attente",
    commission_pct: null,
    ...type === "boutique" ? { creation_directe: true, creation_admin_notifiee: false } : {}
  };
}
function commissionPatch(user, shop, data, adminScope = null) {
  adminFor(user, shop.pays_code, adminScope);
  const p = objectPatch(data, ["commission_pct"]);
  if (!Object.hasOwn(p, "commission_pct") || p.commission_pct !== null && (!Number.isFinite(p.commission_pct) || p.commission_pct < 0 || p.commission_pct > 100)) deny("INVALID_COMMISSION", 400);
  return p;
}
function moderationPatch(user, shop, data, now, product = false, adminScope = null) {
  adminFor(user, shop.pays_code, adminScope);
  const p = objectPatch(data, ["action", "motif"]);
  const map = { valider: "valide", refuser: "refuse", suspendre: "suspendu", reactiver: "valide" };
  if (!Object.hasOwn(map, p.action) || product && p.action === "suspendre") deny("INVALID_MODERATION", 400);
  if (p.motif !== void 0 && (typeof p.motif !== "string" || p.motif.length > 2e4)) deny("INVALID_TEXT", 400);
  const validation = map[p.action];
  return { validation, actif: validation === "valide", motif_refus: validation === "valide" ? "" : p.motif || "", valide_par: user.email, valide_at: now, ...!product ? { statut_validation: validation === "suspendu" ? "refuse" : validation } : {} };
}
function countryChangeRequest(user, shop, type, data, adminScope = null) {
  if (type !== "boutique") deny("COUNTRY_CHANGE_NOT_SUPPORTED", 400);
  adminFor(user, shop.pays_code, adminScope);
  const p = objectPatch(data, ["pays_code"]);
  const next = country(p.pays_code);
  adminFor(user, next, adminScope);
  return next;
}

// frozen:base44/shared/commercePaymentProof.js
var kinds = { boutique: ["Boutique", "CommandeBoutique", "boutique_id"], restaurant: ["Restaurant", "CommandeRestaurant", "restaurant_id"] };
function proofFail(code, status = 403) {
  throw Object.assign(new Error(code), { code, status });
}
function proofId(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 200) proofFail("INVALID_ID", 400);
  return value;
}
function proofKind(type) {
  if (!Object.hasOwn(kinds, type)) proofFail("INVALID_TYPE", 400);
  return kinds[type];
}
function proofUser(user) {
  if (!user?.id || !user?.email) proofFail("AUTH_REQUIRED", 401);
  if (user.enterprise_id) proofFail("PROOF_FORBIDDEN");
}
function validCountry(value) {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value);
}
function privateProofUri(uri) {
  if (typeof uri !== "string" || uri.length > 2048 || !/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+$/.test(uri) || uri.split("/").some((p) => p === "." || p === "..")) proofFail("INVALID_PRIVATE_PROOF", 503);
  return uri;
}
async function proofClient(api, user) {
  proofUser(user);
  const rows = await api.entities.ClientExterne.filter({ user_email: user.email });
  const client = rows?.[0];
  if (!Array.isArray(rows) || rows.length !== 1 || !client?.id || client.user_email !== user.email || client.actif === false || client.enterprise_id || !validCountry(client.country_code)) proofFail("PROOF_FORBIDDEN");
  return client;
}
function assertProofBinding(proof, { proofId: expectedId, type, parent, clientId, actorId }) {
  if (!proof || proof.id !== expectedId || proof.provenance !== "server_private_upload_v1" || proof.state !== "ready" || proof.type !== type || proof.parent_id !== parent.id || proof.country_code !== parent.pays_code || !validCountry(proof.country_code) || !proof.actor_user_id || !proof.client_id || !proof.merchant_owner_id || proof.merchant_owner_id !== parent.partenaire_id || parent.enterprise_id || clientId !== void 0 && proof.client_id !== clientId || actorId !== void 0 && proof.actor_user_id !== actorId) proofFail("PROOF_FORBIDDEN");
  proofId(proof.upload_request_id);
  privateProofUri(proof.file_uri);
  return proof;
}
async function validateCommerceOrderProof({ api, user, client, type, parent, proofId: requestedId }) {
  proofUser(user);
  proofKind(type);
  proofId(requestedId);
  if (!client?.id || client.user_email !== user.email || client.actif === false || client.enterprise_id || !parent?.id || !validCountry(parent.pays_code) || parent.pays_code !== client.country_code || parent.enterprise_id) proofFail("PROOF_FORBIDDEN");
  const proof = await api.asServiceRole.entities.CommercePaymentProof.get(requestedId);
  assertProofBinding(proof, { proofId: requestedId, type, parent, clientId: client.id, actorId: user.id });
  return { commerce_payment_proof_id: proof.id };
}
async function authorizedCommerceProof({ api, user, type, orderId, adminScope }) {
  proofUser(user);
  proofId(orderId);
  const [parentEntity, orderEntity, parentKey] = proofKind(type);
  const client = user.role === "admin" ? null : await proofClient(api, user).catch(() => null);
  const sr = api.asServiceRole.entities;
  const order = await sr[orderEntity].get(orderId);
  if (!order || order.id !== orderId || order.enterprise_id || !validCountry(order.pays_code)) proofFail("PROOF_NOT_FOUND", 404);
  const parent = await sr[parentEntity].get(proofId(order[parentKey]));
  if (!parent || parent.id !== order[parentKey] || parent.enterprise_id || parent.pays_code !== order.pays_code) proofFail("PROOF_FORBIDDEN");
  if (user.role === "admin") adminFor(user, order.pays_code, adminScope);
  else if (parent.partenaire_id !== user.id && (!client || client.id !== order.client_id || client.country_code !== order.pays_code)) proofFail("PROOF_FORBIDDEN");
  if (!order.commerce_payment_proof_id) proofFail("PRIVATE_PROOF_UNAVAILABLE", 404);
  const proof = await sr.CommercePaymentProof.get(proofId(order.commerce_payment_proof_id));
  assertProofBinding(proof, { proofId: order.commerce_payment_proof_id, type, parent, clientId: order.client_id });
  if (user.role !== "admin") {
    const owner = parent.partenaire_id === user.id && proof.merchant_owner_id === user.id;
    const uploader = client && client.id === proof.client_id && client.country_code === proof.country_code && proof.actor_user_id === user.id;
    if (!owner && !uploader) proofFail("PROOF_FORBIDDEN");
  }
  return proof;
}

// frozen:base44/shared/commerceCreationHash.js
function canonicalCommercePayload(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalCommercePayload).join(",") + "]";
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonicalCommercePayload(value[k])).join(",") + "}";
  throw Object.assign(new Error("CANONICAL_PAYLOAD_INVALID"), { code: "CANONICAL_PAYLOAD_INVALID", status: 400 });
}
async function hashCommerceCreation(value) {
  const input = new TextEncoder().encode(canonicalCommercePayload(value));
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// frozen:base44/functions/creerCommandePartenaireV2/entry.ts
import { createClientFromRequest as createClientFromRequest2 } from "npm:@base44/sdk@0.8.57";
Deno.serve(async (req) => {
  let creationRecorded = false;
  try {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    const base44 = createClientFromRequest2(req);
    let user;
    try {
      user = await base44.auth.me();
    } catch (authError) {
      const status = authError && typeof authError === "object" ? "status" in authError ? authError.status : "response" in authError && authError.response && typeof authError.response === "object" && "status" in authError.response ? authError.response.status : void 0 : void 0;
      if (status === 401 || status === 403) return Response.json({ error: status === 401 ? "AUTH_REQUIRED" : "FORBIDDEN" }, { status });
      throw authError;
    }
    if (!user?.email || !user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = stripLoyaltyIdentity(await req.json());
    const capabilities = body?.action === "delivery_capabilities";
    const receiptOnly = body?.action === "reconcile_delivery";
    const receiptCapability = capabilities && body.read_only_reconciliation === true;
    const { request_id, type, boutique_id, restaurant_id, items, total, adresse_livraison, quartier_livraison, gps_lat, gps_lng, note_client, preuve_paiement_url, proof_id } = body;
    if (!type || !["boutique", "restaurant"].includes(type)) {
      return Response.json({ error: "type requis (boutique ou restaurant)" }, { status: 400 });
    }
    if (!capabilities && (typeof request_id !== "string" || !request_id.trim() || request_id.length > 200)) return Response.json({ error: "REQUEST_ID_REQUIRED", client_upgrade_required: true }, { status: 400 });
    const deliveryPriceRequested = Object.hasOwn(body, "prix_livraison_propose");
    if (deliveryPriceRequested && (!Number.isSafeInteger(body.prix_livraison_propose) || body.prix_livraison_propose <= 0)) {
      return Response.json({ error: "DELIVERY_PRICE_INVALID" }, { status: 400 });
    }
    const privateProofRequested = Object.hasOwn(body, "proof_id");
    if (deliveryPriceRequested && !privateProofRequested) return Response.json({ error: "PRIVATE_PROOF_REQUIRED" }, { status: 400 });
    if (privateProofRequested && !receiptOnly && Deno.env.get("COMMERCE_PRIVATE_PROOFS_ENABLED") !== "true") return Response.json({ error: "PRIVATE_PROOFS_NOT_ENABLED" }, { status: 503 });
    if (privateProofRequested && preuve_paiement_url) return Response.json({ error: "PROOF_PAYLOAD_CONFLICT" }, { status: 400 });
    const singletonId = Deno.env.get("COMMERCE_MUTATION_JOURNAL_ID");
    if (!capabilities && !singletonId) return Response.json({ error: "COMMERCE_JOURNAL_NOT_PROVISIONED" }, { status: 503 });
    const isRestaurant = type === "restaurant";
    const idField = isRestaurant ? "restaurant_id" : "boutique_id";
    const etablissementId = isRestaurant ? restaurant_id : boutique_id;
    if (!etablissementId) return Response.json({ error: "etablissementId requis" }, { status: 400 });
    const clients = await base44.entities.ClientExterne.filter({ user_email: user.email });
    if (!clients?.length) return Response.json({ error: "Profil client introuvable" }, { status: 404 });
    const client = clients[0];
    if (clients.length !== 1 || !client.id || client.user_email !== user.email || client.actif === false || user.enterprise_id || client.enterprise_id || !/^[A-Z]{2}$/.test(client.country_code || "")) return Response.json({ error: "Profil client non autorise" }, { status: 403 });
    if (capabilities && body.country_code !== client.country_code) return Response.json({ error: "Pays non autorise" }, { status: 403 });
    const sr = base44.asServiceRole.entities;
    const entityName = isRestaurant ? "Restaurant" : "Boutique";
    const etablissement = await sr[entityName].get(etablissementId);
    if (!etablissement || etablissement.id !== etablissementId) return Response.json({ error: "Etablissement introuvable" }, { status: 404 });
    if (client.country_code !== etablissement.pays_code || etablissement.enterprise_id) return Response.json({ error: "Pays non autorise" }, { status: 403 });
    if (receiptCapability) return Response.json({
      success: true,
      delivery_contract: "client_price_v1",
      reconciliation_contract: "receipt_read_only_v1",
      type,
      parent_id: etablissementId,
      country_code: client.country_code
    }, { headers: { "Cache-Control": "no-store" } });
    const deliveryExpected = deliveryPriceRequested && typeof body.devise === "string" && /^[A-Z]{3,4}$/.test(body.devise) ? {
      request_id,
      actor_id: user.id,
      scope_id: client.country_code + ":" + etablissementId,
      operation: "create_order:" + type,
      payload_hash: await hashCommerceCreation({ actor_id: user.id, type, parent_id: etablissementId, proposal: Object.fromEntries(
        ["type", "boutique_id", "restaurant_id", "items", "total", "adresse_livraison", "quartier_livraison", "gps_lat", "gps_lng", "note_client", "proof_id", "prix_livraison_propose", "devise"].filter((key2) => Object.hasOwn(body, key2)).map((key2) => [key2, body[key2]])
      ) })
    } : null;
    const makeJournal = (expected2) => createCommerceSingletonJournal2({
      storage: sr.CommerceMutationJournal,
      singletonId,
      authorize: async (candidate) => Object.keys(expected2).every((key2) => candidate[key2] === expected2[key2]),
      newClaimId: () => crypto.randomUUID()
    });
    if (receiptOnly) {
      if (!deliveryExpected || !privateProofRequested) return Response.json({ error: "ORDER_RECONCILIATION_REQUIRED", uncertain: true }, { status: 409 });
      const result2 = await makeJournal(deliveryExpected).inspect(deliveryExpected);
      if (!("result_id" in result2) || result2.decision !== "replay_receipt" || typeof result2.result_id !== "string" || !result2.result_id)
        return Response.json({ error: "ORDER_RECONCILIATION_REQUIRED", uncertain: true, request_id }, { status: 409 });
      const commande2 = await sr[isRestaurant ? "CommandeRestaurant" : "CommandeBoutique"].get(result2.result_id);
      const freshClients = await base44.entities.ClientExterne.filter({ user_email: user.email }), fresh = freshClients?.[0];
      const parent = await sr[entityName].get(etablissementId);
      if (freshClients?.length !== 1 || fresh?.id !== client.id || fresh.user_email !== user.email || fresh.actif === false || fresh.enterprise_id || fresh.country_code !== client.country_code || parent?.id !== etablissementId || parent.pays_code !== client.country_code || parent.enterprise_id || commande2?.id !== result2.result_id || commande2.enterprise_id || commande2.client_id !== client.id || commande2[idField] !== etablissementId || commande2.pays_code !== client.country_code || commande2.total !== total || commande2.devise !== body.devise || commande2.prix_livraison_propose !== body.prix_livraison_propose || commande2.workflow_livraison !== "client_price_v1" || commande2.commerce_payment_proof_id !== proof_id)
        return Response.json({ error: "ORDER_RECEIPT_NOT_AUTHORIZED", uncertain: true, request_id }, { status: 403 });
      return Response.json({ success: true, commande: commande2, numero_commande: commande2.id, replayed: true, read_only: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!etablissement.actif) return Response.json({ error: "Etablissement inactif" }, { status: 400 });
    if (!etablissement.ouvert) return Response.json({ error: "Etablissement ferme" }, { status: 400 });
    const readCurrency = async () => {
      const countries = await sr.Country.filter({ code: client.country_code, actif: true }, void 0, 2);
      if (!Array.isArray(countries) || countries.length !== 1 || countries[0].code !== client.country_code || countries[0].actif === false || typeof countries[0].devise !== "string" || !/^[A-Z]{3,4}$/.test(countries[0].devise)) {
        throw Object.assign(new Error("DELIVERY_CURRENCY_UNAVAILABLE"), { code: "DELIVERY_CURRENCY_UNAVAILABLE", status: 503 });
      }
      return countries[0].devise;
    };
    const currency = capabilities || deliveryPriceRequested ? await readCurrency() : null;
    if (capabilities) return Response.json({
      success: true,
      delivery_contract: "client_price_v1",
      currency_contract: "country_currency_v1",
      private_proofs_enabled: Deno.env.get("COMMERCE_PRIVATE_PROOFS_ENABLED") === "true",
      type,
      parent_id: etablissementId,
      country_code: client.country_code,
      devise: currency
    }, { headers: { "Cache-Control": "no-store" } });
    if (deliveryPriceRequested && body.devise !== currency) return Response.json({ error: "DELIVERY_CURRENCY_CHANGED", uncertain: false }, { status: 409 });
    if (!Array.isArray(items) || items.length === 0 || items.length > 200 || !Number.isFinite(total) || total < 0) {
      return Response.json({ error: "Panier ou montant invalide" }, { status: 400 });
    }
    if (gps_lat != null && (!Number.isFinite(gps_lat) || gps_lat < -90 || gps_lat > 90) || gps_lng != null && (!Number.isFinite(gps_lng) || gps_lng < -180 || gps_lng > 180)) {
      return Response.json({ error: "INVALID_GPS_COORDINATES" }, { status: 400 });
    }
    const productEntity = isRestaurant ? "PlatRestaurant" : "ProduitBoutique";
    const authoritativeItems = [];
    const seenProductIds = /* @__PURE__ */ new Set();
    let authoritativeTotal = 0;
    for (const item of items) {
      if (!item || typeof item.id !== "string" || !item.id.trim() || seenProductIds.has(item.id) || !Number.isSafeInteger(item.quantite) || item.quantite <= 0 || !Number.isFinite(item.prix) || item.prix < 0) {
        return Response.json({ error: "Article ou quantite invalide" }, { status: 400 });
      }
      seenProductIds.add(item.id);
      const product = await sr[productEntity].get(item.id);
      if (!product || product.id !== item.id || product[idField] !== etablissementId || product.actif !== true || product.disponible !== true) {
        return Response.json({ error: "Article indisponible pour cet etablissement" }, { status: 409 });
      }
      if (!Number.isFinite(product.prix) || product.prix < 0) {
        return Response.json({ error: "Prix catalogue invalide" }, { status: 409 });
      }
      if (deliveryPriceRequested && product.devise && product.devise !== currency) return Response.json({ error: "PRODUCT_CURRENCY_MISMATCH", uncertain: false }, { status: 409 });
      if (item.prix !== product.prix) {
        return Response.json({ error: "Le prix a change. Actualisez le panier et confirmez a nouveau." }, { status: 409 });
      }
      authoritativeTotal += product.prix * item.quantite;
      if (!Number.isFinite(authoritativeTotal) || authoritativeTotal > Number.MAX_SAFE_INTEGER) {
        return Response.json({ error: "Montant du panier invalide" }, { status: 400 });
      }
      authoritativeItems.push({ id: product.id, nom: product.nom, prix: product.prix, quantite: item.quantite, photo_url: product.photo_url || "" });
    }
    if (total !== authoritativeTotal) {
      return Response.json({ error: "Le montant a change. Actualisez le panier et confirmez a nouveau." }, { status: 409 });
    }
    let commissionPct = etablissement.commission_pct;
    if (commissionPct == null) {
      try {
        const configs = await base44.asServiceRole.entities.CommissionConfig.filter({ pays_code: etablissement.pays_code });
        commissionPct = configs?.[0]?.[`commission_${type}_defaut`] ?? null;
      } catch (_) {
        return Response.json({ error: "Configuration de commission temporairement indisponible. Reessayez plus tard." }, { status: 503 });
      }
    }
    if (commissionPct == null && !isRestaurant && etablissement.pays_code === "BF") {
      commissionPct = 10;
    }
    if (commissionPct == null) {
      try {
        const countries = await base44.asServiceRole.entities.Country.filter({ code: etablissement.pays_code, actif: true });
        commissionPct = countries?.[0]?.commission_pct ?? null;
      } catch (_) {
        return Response.json({ error: "Configuration de commission temporairement indisponible. Reessayez plus tard." }, { status: 503 });
      }
    }
    if (commissionPct == null) {
      return Response.json({ error: `Commission non configur\xE9e pour le pays ${etablissement.pays_code}` }, { status: 400 });
    }
    if (!Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 100) {
      return Response.json({ error: "Taux de commission invalide" }, { status: 400 });
    }
    const commissionMontant = Math.round(authoritativeTotal * (commissionPct / 100));
    const prefix = isRestaurant ? "RST" : "BTQ";
    const numeroCommande = `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const commandeEntity = isRestaurant ? "CommandeRestaurant" : "CommandeBoutique";
    const proofFields = privateProofRequested ? await validateCommerceOrderProof({ api: base44, user, client, type, parent: etablissement, proofId: proof_id }) : {};
    const payload = {
      ...proofFields,
      ...deliveryPriceRequested ? { prix_livraison_propose: body.prix_livraison_propose, workflow_livraison: "client_price_v1", devise: currency } : {},
      [idField]: etablissementId,
      boutique_nom: !isRestaurant ? etablissement.nom : void 0,
      restaurant_nom: isRestaurant ? etablissement.nom : void 0,
      client_id: client.id,
      client_nom: `${client.prenom || ""} ${client.nom || ""}`.trim(),
      client_telephone: client.telephone,
      pays_code: etablissement.pays_code,
      items: JSON.stringify(authoritativeItems),
      total: authoritativeTotal,
      adresse_livraison: adresse_livraison || "",
      quartier_livraison: quartier_livraison || "",
      gps_lat: gps_lat ?? null,
      gps_lng: gps_lng ?? null,
      note_client: note_client || "",
      preuve_paiement_url: privateProofRequested ? "" : preuve_paiement_url || "",
      statut: "commande_envoyee",
      partenaire_id: etablissement.partenaire_id,
      commission_pct: commissionPct,
      commission_montant: commissionMontant
    };
    const normalizedPayload = JSON.parse(JSON.stringify(payload));
    const expected = deliveryExpected || {
      request_id,
      actor_id: user.id,
      scope_id: client.country_code + ":" + etablissementId,
      operation: "create_order:" + type,
      payload_hash: await hashCommerceCreation({ actor_id: user.id, type, parent_id: etablissementId, payload: normalizedPayload })
    };
    const journal = makeJournal(expected);
    const result = await journal.execute(expected, async () => {
      const freshClients = await base44.entities.ClientExterne.filter({ user_email: user.email });
      const fresh = freshClients?.[0];
      const parent = await sr[entityName].get(etablissementId);
      if (freshClients?.length !== 1 || fresh?.id !== client.id || fresh.user_email !== user.email || fresh.actif === false || fresh.enterprise_id || fresh.country_code !== client.country_code || parent?.id !== etablissementId || parent.pays_code !== client.country_code || parent.enterprise_id || !parent.actif || !parent.ouvert) throw Error("AUTHORIZATION_CHANGED");
      if (privateProofRequested) await validateCommerceOrderProof({ api: base44, user, client: fresh, type, parent, proofId: proof_id });
      if (deliveryPriceRequested && await readCurrency() !== currency) throw Object.assign(new Error("DELIVERY_CURRENCY_CHANGED"), { code: "DELIVERY_CURRENCY_CHANGED", status: 409 });
      const created = await captureNativeCreate(req, fresh.id, commandeEntity, async () => await sr[commandeEntity].create({
        ...stripLoyaltyIdentity(normalizedPayload),
        ...attestLoyaltyIdentity({ user, client: fresh, country: fresh.country_code, kind: "order", parent })
      }));
      return { result_id: created?.id };
    });
    if (!("result_id" in result) || typeof result.result_id !== "string" || !result.result_id) return Response.json({
      error: "ORDER_RECONCILIATION_REQUIRED",
      uncertain: true,
      request_id,
      reason: "reason" in result ? result.reason : "RECEIPT_MISSING"
    }, { status: 503 });
    creationRecorded = true;
    const commande = await sr[commandeEntity].get(result.result_id);
    const currentClients = await base44.entities.ClientExterne.filter({ user_email: user.email });
    const current = currentClients?.[0];
    if (currentClients?.length !== 1 || current?.id !== client.id || current.user_email !== user.email || current.actif === false || current.enterprise_id || current.country_code !== client.country_code || commande?.id !== result.result_id || commande.client_id !== client.id || commande[idField] !== etablissementId || commande.pays_code !== client.country_code || privateProofRequested && commande.commerce_payment_proof_id !== proof_id || deliveryPriceRequested && (commande.prix_livraison_propose !== body.prix_livraison_propose || commande.workflow_livraison !== "client_price_v1" || commande.devise !== body.devise)) {
      return Response.json({ error: "ORDER_RECEIPT_NOT_AUTHORIZED", uncertain: true, creation_recorded: true, request_id }, { status: 403 });
    }
    console.log(`[creerCommandePartenaire]  Commande ${type} cr\xE9\xE9e: ${commande.id} (num: ${numeroCommande})`);
    try {
      if (result.decision === "completed") await base44.functions.invoke("envoiNotificationPush", {
        titre: "Nouvelle commande re\xE7ue",
        message: `Client: ${commande.client_nom} \u2014 Montant: ${(commande.total || 0).toLocaleString()} ${commande.devise || "(devise non attestee)"}`,
        type: "nouvelle_commande_partenaire",
        destinataire_email: etablissement.user_email,
        user_type: "partenaire"
      });
      console.log(`[creerCommandePartenaire]  Notification envoy\xE9e au partenaire: ${etablissement.user_email}`);
    } catch (notifErr) {
      console.error(`[creerCommandePartenaire]  Erreur notification partenaire: ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`);
    }
    return Response.json({ success: true, commande, numero_commande: commande.id, replayed: result.decision === "replay_receipt" });
  } catch (error) {
    const proofError = error && typeof error === "object" ? error : {};
    if (["DELIVERY_CURRENCY_UNAVAILABLE", "DELIVERY_CURRENCY_CHANGED"].includes(proofError.code || "")) return Response.json({ error: proofError.code, uncertain: creationRecorded }, { status: proofError.status || 503 });
    if (["PROOF_FORBIDDEN", "INVALID_ID", "INVALID_TYPE", "INVALID_PRIVATE_PROOF", "AUTH_REQUIRED"].includes(proofError.code || "")) return Response.json({ error: proofError.code }, { status: [400, 401, 403, 404, 503].includes(proofError.status || 0) ? proofError.status : 503 });
    console.error("[creerCommandePartenaire] Operation failed without confirmed receipt");
    const code = error instanceof Error && error.message === "REQUEST_BINDING_CONFLICT" ? "REQUEST_BINDING_CONFLICT" : "ORDER_FAILED";
    return Response.json({ error: code, ...creationRecorded ? { uncertain: true, creation_recorded: true } : {} }, { status: code === "REQUEST_BINDING_CONFLICT" ? 409 : 500 });
  }
});
