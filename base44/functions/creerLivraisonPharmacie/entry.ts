// frozen:base44/shared/admissionCausality.js
function resolveAdmissionHead(rows) {
  const fail3 = () => {
    throw Object.assign(new Error("LOYALTY_ADMISSION_BRANCH_AMBIGUOUS"), { code: "LOYALTY_ADMISSION_BRANCH_AMBIGUOUS", status: 503 });
  };
  if (!rows.length) return null;
  const by = new Map(rows.map((r) => [r.proof_id, r]));
  if (by.size !== rows.length) fail3();
  const ancestors = /* @__PURE__ */ new Map();
  function lineage(r, visiting = /* @__PURE__ */ new Set()) {
    if (ancestors.has(r.proof_id)) return ancestors.get(r.proof_id);
    if (visiting.has(r.proof_id)) fail3();
    visiting.add(r.proof_id);
    const ids = /* @__PURE__ */ new Set([r.proof_id]), parent = r.payload.basis_proof_id;
    if (parent !== null) {
      const p = by.get(parent);
      if (!p || p.subject_id !== r.subject_id || p.kind !== "admission" || Date.parse(p.issued_at) > Date.parse(r.issued_at)) fail3();
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
  if (heads.length !== 1) fail3();
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
      for (const key of ["beneficiary_user_id", "client_profile_id", "driver_profile_id"]) if (q[key] !== null && !id(q[key])) f();
      for (const key of ["origin_proof_id", "admission_proof_id", "operation_id"]) if (q[key] !== null && !uuid(q[key])) f();
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
  const get = async (proofId) => {
    if (!uuid(proofId)) f();
    const r = await ports.evidence.get(proofId);
    if (!r || r.proof_id !== proofId) f();
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
  const make = (kind, type, subject, country, u, payload) => ({ version: VERSION, epoch_id: policy.epoch_id, proof_id: randomUUID(), kind, subject_type: type, subject_id: subject, country_code: country, issued_at: now(), actor_user_id: u.id, beneficiary_user_id: payload.beneficiary_user_id || null, payload: kind === "admission" ? { evidence_semantics: DRIVER_EVIDENCE_SEMANTICS, ...payload } : payload });
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
  const currentDriverAllows = async (admission, u, country) => {
    const d = await ports.drivers.get(admission.subject_id);
    if (!d || d.id !== admission.subject_id || d.enterprise_id || d.country_code !== country || d.user_email !== u.email) f();
    const countryRow = await ports.countries.get(country);
    if (countryRow?.code !== country || countryRow.actif !== true) f();
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
      const country = await ports.countries.get(d.country_code);
      if (country?.code !== d.country_code || country.actif !== true) f();
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
      const { u, origin } = context, row = result.row, key = { CommandeBoutique: "commande_boutique_id", CommandeRestaurant: "commande_restaurant_id", Conversation: "conversation_id" }[source_type];
      if (result.entity !== "CourseExterne" || !id(row?.id) || row[key] !== source_id || row.country_code !== origin.country_code || !publicRow(row)) f();
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
    const country = await ports.countries.get(reference.country_code);
    if (country?.code !== reference.country_code || country.actif !== true) f();
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
    const country = await ports.countries.get(row.country_code);
    if (country?.code !== row.country_code || country.actif !== true) f();
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
      for (const key of ["user_email", "country_code", "enterprise_id"]) if ((context.before[key] ?? null) !== (result.row[key] ?? null)) f("LOYALTY_ADMISSION_REFERENCE_CHANGED");
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
      const confirmed = receipts.filter((r2) => r2.payload.state === "confirmed");
      if (!confirmed.length) {
        const origin2 = await authoritativeOrigin(course);
        if (origin2 && !belongsToViewer(origin2, course)) continue;
        const dates = ["delivery_confirmed_at", "heure_livraison", "colis_livre_at"].map((k) => course[k]).filter((x) => !empty(x));
        if (course.statut !== "livree") continue;
        if (dates.length && dates.every((t) => Number.isFinite(deliveryTime(t)) && deliveryTime(t) < Date.parse(START))) continue;
        if (origin2) f("LOYALTY_PROOF_PENDING");
        f();
      }
      const r = confirmed[0], q = r.payload;
      if (confirmed.some((x) => x.payload.operation_id !== q.operation_id || stable(x.payload) !== stable(q) || x.actor_user_id !== r.actor_user_id || x.country_code !== r.country_code)) f();
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
var projected = (rows, fields) => {
  if (rows.some((r) => Object.keys(r).some((k) => !fields.includes(k) && !META.includes(k)))) fail2();
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
  async function one(entity, q, fields) {
    const page = await entity.filter(q, { limit: 2, sort: "id", fields });
    if (!page || !Array.isArray(page.items) || page.items.length > 1 || page.has_more === true) fail2();
    projected(page.items, fields);
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
          const fields = ["id", "email", "country_code", "enterprise_id"];
          const rows = await api.asServiceRole.entities.User.filter({ email }, "id", 2, 0, fields);
          if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.id || rows[0].email !== email) return null;
          return Object.fromEntries(fields.filter((k) => Object.hasOwn(rows[0], k)).map((k) => [k, rows[0][k]]));
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
  for (const [key, item] of Object.entries(value)) {
    if (!key.toLowerCase().startsWith(LOYALTY_IDENTITY_PREFIX)) {
      Object.defineProperty(result, key, { value: stripLoyaltyIdentity(item, seen), enumerable: true, writable: true, configurable: true });
    }
  }
  return result;
}
function validateLoyaltyIdentity(source, { kind, country, clientId, now } = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source) || !publicRow2(source)) return null;
  const keys = Object.keys(source).filter((key) => key.toLowerCase().startsWith(LOYALTY_IDENTITY_PREFIX));
  if (keys.length !== LOYALTY_IDENTITY_FIELDS.length || keys.some((key) => !LOYALTY_IDENTITY_FIELDS.includes(key))) return null;
  if (LOYALTY_IDENTITY_FIELDS.some((key) => !Object.hasOwn(source, key))) return null;
  const v = Object.fromEntries(LOYALTY_IDENTITY_FIELDS.map((key) => [key.slice(LOYALTY_IDENTITY_PREFIX.length), source[key]]));
  const at = millis(now);
  if (v.version !== 1 || !id2(v.beneficiary_user_id) || !id2(v.client_profile_id) || !countryOk(v.country_code) || !KINDS.has(v.source_kind) || !iso2(v.attested_at) || !Number.isFinite(at) || Date.parse(v.attested_at) > at || !(v.source_id === "" || id2(v.source_id)) || (v.source_kind === "pharmacy" ? !id2(v.pharmacy_id) : v.pharmacy_id !== "") || kind !== void 0 && v.source_kind !== kind || country !== void 0 && v.country_code !== country || clientId !== void 0 && v.client_profile_id !== clientId) return null;
  return Object.fromEntries(LOYALTY_IDENTITY_FIELDS.map((key) => [key, source[key]]));
}
function attestLoyaltyIdentity({ user, client, country, kind, parent, now } = {}) {
  const at = millis(now);
  if (!publicRow2(user) || !publicRow2(client) || !id2(user.id) || !id2(client.id) || !countryOk(country) || client.country_code !== country || !KINDS.has(kind) || !Number.isFinite(at) || client.actif === false || user.country_code && user.country_code !== country) return {};
  if (kind !== "direct" && (!publicRow2(parent) || !id2(parent.id) || parent.pays_code !== country || parent.actif === false)) return {};
  return {
    loyalty_identity_version: 1,
    loyalty_identity_beneficiary_user_id: user.id,
    loyalty_identity_client_profile_id: client.id,
    loyalty_identity_country_code: country,
    loyalty_identity_attested_at: new Date(at).toISOString(),
    loyalty_identity_source_kind: kind,
    loyalty_identity_source_id: "",
    loyalty_identity_pharmacy_id: kind === "pharmacy" ? parent.id : ""
  };
}
function copyLoyaltyIdentity({ source, kind, clientId, country, parentId, pharmacyId, now } = {}) {
  if (!source || !id2(source.id) || !id2(clientId) || !countryOk(country) || !["order", "pharmacy"].includes(kind)) return {};
  const tuple = validateLoyaltyIdentity(source, { kind, country, clientId, now });
  if (!tuple || tuple.loyalty_identity_source_id !== "") return {};
  if (kind === "order") {
    if (!id2(parentId) || source.client_id !== clientId || source.pays_code !== country) return {};
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

// frozen:base44/functions/creerLivraisonPharmacie/entry.ts
import { createClientFromRequest as createClientFromRequest2 } from "npm:@base44/sdk@0.8.31";
var CREATION_MUTEX_KEY = "COURSE_CREATION_MUTEX";
var LOCK_TTL_MS = 6e4;
var LOCK_WAIT_MS = 12e3;
var MAX_RECENT_RECEIPTS = 100;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function receiptKey(requestId) {
  return `pharmacy:${requestId}`;
}
function parseReceipts(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim().startsWith("[")) return [];
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed.filter((item) => item?.key && item?.course_id) : [];
  } catch {
    return [];
  }
}
async function findReceiptCourse(base44, mutex, requestId, pharmacyId) {
  const receipt = parseReceipts(mutex?.valeur).find((item) => item.key === receiptKey(requestId));
  if (!receipt) return null;
  const course = await base44.asServiceRole.entities.CourseExterne.get(receipt.course_id);
  if (course?.request_id === requestId && course?.pharmacie_id === pharmacyId) return course;
  throw new Error("PHARMACY_CREATION_RECEIPT_UNRESOLVED");
}
async function findExistingCourse(base44, requestId, pharmacyId) {
  const existing = await base44.asServiceRole.entities.CourseExterne.filter(
    { request_id: requestId, pharmacie_id: pharmacyId },
    "created_date",
    2
  );
  return existing?.[0] || null;
}
async function acquireCreationMutex(base44, requestId, pharmacyId) {
  const configs = await base44.asServiceRole.entities.AppConfig.filter(
    { cle: CREATION_MUTEX_KEY },
    "created_date",
    2
  );
  if (!configs || configs.length !== 1) {
    throw new Error("COURSE_CREATION_MUTEX_NOT_PROVISIONED");
  }
  const mutex = configs[0];
  const owner = crypto.randomUUID();
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    const currentMutex = await base44.asServiceRole.entities.AppConfig.get(mutex.id);
    const receiptCourse = await findReceiptCourse(base44, currentMutex, requestId, pharmacyId);
    if (receiptCourse) return { existing: receiptCourse, mutex, owner: null };
    const existing2 = await findExistingCourse(base44, requestId, pharmacyId);
    if (existing2) return { existing: existing2, mutex, owner: null };
    const now = /* @__PURE__ */ new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS).toISOString();
    const claimResult = await base44.asServiceRole.entities.AppConfig.updateMany(
      {
        id: mutex.id,
        $or: [
          { lock_owner: "" },
          { lock_owner: null },
          { lock_owner: { $exists: false } },
          { lock_expires_at: { $lt: now.toISOString() } }
        ]
      },
      {
        $set: {
          lock_owner: owner,
          lock_request_id: requestId,
          lock_expires_at: expiresAt
        }
      }
    );
    if (Number(claimResult?.updated || 0) === 1) {
      const claimedMutex = await base44.asServiceRole.entities.AppConfig.get(mutex.id);
      if (claimedMutex?.lock_owner !== owner) {
        throw new Error("COURSE_CREATION_MUTEX_OWNERSHIP_LOST");
      }
      const completedCourse = await findReceiptCourse(base44, claimedMutex, requestId, pharmacyId);
      if (completedCourse) return { existing: completedCourse, mutex, owner };
      return { existing: null, mutex, owner };
    }
    await sleep(75 + Math.floor(Math.random() * 75));
  }
  const existing = await findExistingCourse(base44, requestId, pharmacyId);
  if (existing) return { existing, mutex, owner: null };
  throw new Error("COURSE_CREATION_MUTEX_TIMEOUT");
}
async function persistCreationReceipt(base44, mutexId, owner, requestId, courseId) {
  const mutex = await base44.asServiceRole.entities.AppConfig.get(mutexId);
  if (mutex?.lock_owner !== owner) throw new Error("COURSE_CREATION_MUTEX_OWNERSHIP_LOST");
  const key = receiptKey(requestId);
  const receipt = {
    key,
    request_id: requestId,
    course_id: courseId,
    completed_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const receipts = [receipt, ...parseReceipts(mutex.valeur).filter((item) => item.key !== key)].slice(0, MAX_RECENT_RECEIPTS);
  const result = await base44.asServiceRole.entities.AppConfig.updateMany(
    { id: mutexId, lock_owner: owner },
    { $set: { valeur: JSON.stringify(receipts) } }
  );
  if (Number(result?.updated || 0) !== 1) {
    throw new Error("COURSE_CREATION_RECEIPT_NOT_PERSISTED");
  }
}
async function releaseCreationMutex(base44, mutexId, owner) {
  await base44.asServiceRole.entities.AppConfig.updateMany(
    { id: mutexId, lock_owner: owner },
    {
      $set: {
        lock_owner: "",
        lock_request_id: "",
        lock_expires_at: (/* @__PURE__ */ new Date(0)).toISOString()
      }
    }
  );
}
var PRICE_CONTRACT = "pharmacy-delivery-price-v1";
function validGps(row) {
  return typeof row?.latitude === "number" && Number.isFinite(row.latitude) && Math.abs(row.latitude) <= 90 && typeof row?.longitude === "number" && Number.isFinite(row.longitude) && Math.abs(row.longitude) <= 180;
}
async function pharmacyCurrency(api, pharmacy) {
  const country = String(pharmacy.pays_code || "").trim().toUpperCase();
  if (!country) throw new Error("Pays pharmacie manquant.");
  const rows = await api.entities.Country.filter({ code: country }, "created_date", 2);
  if (rows?.length !== 1 || !rows[0].devise) throw new Error("Devise du pays indisponible.");
  return { country_code: country, devise: rows[0].devise };
}
function samePriceRequest(course, body) {
  return course?.pharmacie_id === body.pharmacie_id && course.destinataire_client_id === body.client_id && course.conversation_id === body.conversation_id && course.prix_propose_client === body.prix_livraison && course.devise === body.devise;
}
async function sendPush(base44, payload) {
  try {
    await base44.functions.invoke("envoiNotificationPush", payload);
    console.log(`[creerLivraisonPharmacie] push envoye: ${payload.type} -> ${payload.destinataire_email}`);
  } catch (error) {
    console.error(`[creerLivraisonPharmacie] erreur push: ${error?.message || error}`);
  }
}
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest2(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = stripLoyaltyIdentity(await req.json());
    const { pharmacie_id, client_id, conversation_id } = body;
    const priced = Object.hasOwn(body, "prix_livraison") || body.price_contract === PRICE_CONTRACT;
    const capability = body.action === "capabilities";
    const reconcile = body.action === "reconcile";
    if (!pharmacie_id || !capability && !client_id) {
      return Response.json({ error: "pharmacie_id et client_id requis" }, { status: 400 });
    }
    const asService = base44.asServiceRole;
    const pharmacie = await asService.entities.Pharmacie.get(pharmacie_id);
    if (!pharmacie) return Response.json({ error: "Pharmacie introuvable" }, { status: 404 });
    if (pharmacie.user_email !== user.email && pharmacie.partenaire_id !== user.id) {
      return Response.json({ error: "Vous n'etes pas proprietaire de cette pharmacie" }, { status: 403 });
    }
    if (capability) {
      let config = {};
      try {
        config = await pharmacyCurrency(asService, pharmacie);
      } catch {
      }
      return Response.json({ success: true, price_contract: PRICE_CONTRACT, ...config });
    }
    if (body.action && !reconcile) return Response.json({ error: "Action inconnue" }, { status: 400 });
    let priceFields = {};
    if (priced || reconcile) {
      if (body.price_contract !== PRICE_CONTRACT || typeof body.request_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id) || !conversation_id || typeof body.prix_livraison !== "number" || !Number.isSafeInteger(body.prix_livraison) || body.prix_livraison <= 0) {
        return Response.json({ error: "Prix entier positif, conversation et identifiant de demande requis." }, { status: 400 });
      }
      const conversation = await base44.entities.Conversation.get(conversation_id);
      let parts = [];
      try {
        parts = JSON.parse(conversation?.participants || "[]");
      } catch {
      }
      if (!Array.isArray(parts) || !parts.some((p) => p?.type === "partenaire" && p.id === pharmacie_id) || !parts.some((p) => p?.type === "client" && p.id === client_id)) {
        return Response.json({ error: "Conversation pharmacie/client invalide." }, { status: 403 });
      }
      if (reconcile) {
        const existing = await findExistingCourse(base44, body.request_id, pharmacie_id);
        if (!existing) return Response.json({ success: false, uncertain: true, error: "Resultat non confirme. Verifiez les courses avant toute nouvelle demande." }, { status: 409 });
        if (!samePriceRequest(existing, body)) return Response.json({ error: "Cette demande correspond a un autre montant ou destinataire." }, { status: 409 });
        return Response.json({ success: true, price_contract: PRICE_CONTRACT, course: existing, idempotent: true });
      }
      const config = await pharmacyCurrency(asService, pharmacie);
      if (body.devise !== config.devise) return Response.json({ error: "La devise a change. Actualisez avant de confirmer.", not_created: true }, { status: 409 });
      priceFields = { prix_propose_client: body.prix_livraison, request_id: body.request_id, devise: config.devise };
    }
    if (priced ? !validGps(pharmacie) : !pharmacie.latitude || !pharmacie.longitude) {
      return Response.json({ error: "La pharmacie n'a pas de position GPS enregistree" }, { status: 400 });
    }
    const client = await asService.entities.ClientExterne.get(client_id);
    if (!client) return Response.json({ error: "Client introuvable" }, { status: 404 });
    if (priced && (String(client.country_code || "").trim().toUpperCase() !== String(pharmacie.pays_code || "").trim().toUpperCase() || client.enterprise_id || pharmacie.enterprise_id || user.enterprise_id || client.actif === false || client.bloque_frais_annulation || pharmacie.actif === false)) {
      return Response.json({ error: "Client et pharmacie doivent etre actifs dans le meme pays et le reseau public." }, { status: 403 });
    }
    if (priced ? !validGps(client) : !client.latitude || !client.longitude) {
      return Response.json({ error: "Le client n'a pas de position GPS. Demandez-lui d'ouvrir l'application." }, { status: 400 });
    }
    let mutex = null;
    if (priced) {
      mutex = await acquireCreationMutex(base44, body.request_id, pharmacie_id);
      if (mutex.existing) {
        if (mutex.owner) await releaseCreationMutex(base44, mutex.mutex.id, mutex.owner);
        if (!samePriceRequest(mutex.existing, body)) return Response.json({ error: "Cette demande correspond a un autre montant ou destinataire." }, { status: 409 });
        return Response.json({ success: true, price_contract: PRICE_CONTRACT, course: mutex.existing, idempotent: true });
      }
    }
    try {
      const clientName = `${client.prenom || ""} ${client.nom || ""}`.trim() || client.telephone || "Client";
      let identity = {};
      if (conversation_id && !user.enterprise_id && !pharmacie.enterprise_id && !client.enterprise_id && client.country_code === pharmacie.pays_code) {
        try {
          const source = await base44.entities.Conversation.get(conversation_id);
          if (source?.id === conversation_id) identity = copyLoyaltyIdentity({ source, kind: "pharmacy", clientId: client.id, country: pharmacie.pays_code, pharmacyId: pharmacie_id });
        } catch {
        }
      }
      const course = await captureLinkedCreate(req, "Conversation", conversation_id, async () => await asService.entities.CourseExterne.create({
        ...identity,
        country_code: pharmacie.pays_code,
        source: "client",
        type_course: "expedier",
        client_nom: clientName,
        client_telephone: client.telephone || "",
        expediteur_nom: pharmacie.nom,
        expediteur_telephone: pharmacie.telephone || "",
        destinataire_nom: clientName,
        destinataire_telephone: client.telephone || "",
        destinataire_client_id: client.id,
        recipient_has_app: true,
        adresse_depart: pharmacie.adresse || pharmacie.quartier || pharmacie.nom,
        adresse_arrivee: client.quartier || client.ville || "Position client",
        quartier_depart: pharmacie.quartier || "",
        quartier_arrivee: client.quartier || "",
        ville_depart: pharmacie.ville || "",
        ville_arrivee: client.ville || "",
        gps_depart_lat: pharmacie.latitude,
        gps_depart_lng: pharmacie.longitude,
        gps_arrivee_lat: client.latitude,
        gps_arrivee_lng: client.longitude,
        latitude_livraison: client.latitude,
        longitude_livraison: client.longitude,
        type_colis: "autre",
        notes: `Livraison pharmacie ${pharmacie.nom || ""} vers ${clientName}${conversation_id ? ` - conversation ${conversation_id}` : ""}${priced ? ` - Livraison seule: ${body.prix_livraison} ${body.devise}, hors produits. A payer par le client au livreur a la reception.` : ""}`,
        devise: "FCFA",
        ...priceFields,
        statut: "nouvelle",
        dispatch_status: "en_attente",
        pricing_mode: "manual",
        pharmacie_id,
        conversation_id: conversation_id || "",
        pickup_confirmed_at: null,
        delivery_confirmed_at: null
      }));
      let receiptError = null;
      if (priced) {
        try {
          await persistCreationReceipt(base44, mutex.mutex.id, mutex.owner, body.request_id, course.id);
          await releaseCreationMutex(base44, mutex.mutex.id, mutex.owner);
          mutex.owner = null;
        } catch (error) {
          receiptError = error;
          console.error("[creerLivraisonPharmacie] creation receipt unavailable");
        }
      }
      await sendPush(base44, {
        titre: "Livraison pharmacie creee",
        message: `${pharmacie.nom} a cree une livraison pour vous. Recherche d'un livreur en cours.`,
        type: "livraison_pharmacie_creee",
        destinataire_email: client.user_email,
        user_type: "client",
        client_id: client.id,
        course_id: course.id
      });
      await sendPush(base44, {
        titre: "Livraison creee",
        message: `La livraison vers ${clientName} est creee. Suivez son avancement dans les livraisons.`,
        type: "livraison_pharmacie_creee",
        destinataire_email: pharmacie.user_email,
        user_type: "partenaire",
        course_id: course.id
      });
      try {
        await base44.functions.invoke("dispatchExterneAuto", {
          action: "lancer_recherche_auto",
          course_id: course.id
        });
        console.log(`[creerLivraisonPharmacie] dispatch lance pour course ${course.id}`);
      } catch (dispatchError) {
        console.error(`[creerLivraisonPharmacie] erreur dispatch: ${dispatchError?.message || dispatchError}`);
      }
      if (receiptError) return Response.json({ success: false, uncertain: true, error: "Livraison enregistree, confirmation a verifier sans nouvelle creation." }, { status: 503 });
      return Response.json({ success: true, course, ...priced ? { price_contract: PRICE_CONTRACT } : {} });
    } finally {
      if (mutex?.owner) await releaseCreationMutex(base44, mutex.mutex.id, mutex.owner).catch(() => {
      });
    }
  } catch (error) {
    console.error("[creerLivraisonPharmacie] erreur:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
