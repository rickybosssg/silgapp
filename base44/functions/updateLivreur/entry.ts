// frozen:base44/shared/admissionCausality.js
function resolveAdmissionHead(rows) {
  const fail4 = () => {
    throw Object.assign(new Error("LOYALTY_ADMISSION_BRANCH_AMBIGUOUS"), { code: "LOYALTY_ADMISSION_BRANCH_AMBIGUOUS", status: 503 });
  };
  if (!rows.length) return null;
  const by = new Map(rows.map((r) => [r.proof_id, r]));
  if (by.size !== rows.length) fail4();
  const ancestors = /* @__PURE__ */ new Map();
  function lineage(r, visiting = /* @__PURE__ */ new Set()) {
    if (ancestors.has(r.proof_id)) return ancestors.get(r.proof_id);
    if (visiting.has(r.proof_id)) fail4();
    visiting.add(r.proof_id);
    const ids = /* @__PURE__ */ new Set([r.proof_id]), parent = r.payload.basis_proof_id;
    if (parent !== null) {
      const p = by.get(parent);
      if (!p || p.subject_id !== r.subject_id || p.kind !== "admission" || Date.parse(p.issued_at) > Date.parse(r.issued_at)) fail4();
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
  if (heads.length !== 1) fail4();
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
var exact = (x, keys2) => x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length === keys2.length && keys2.every((k) => Object.hasOwn(x, k));
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
      const keys2 = ["course:" + r.subject_id, "operation:" + r.payload.operation_id];
      if (r.payload.request_id) keys2.push("request:" + r.payload.request_id);
      if (orderAliases.has(r.proof_id)) keys2.push("order:" + orderAliases.get(r.proof_id));
      for (const k of keys2) if (!aliases.has(k)) aliases.set(k, k);
      const root = find(keys2[0]);
      for (const k of keys2) aliases.set(find(k), root);
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
    clients: { get: (id2) => one(ordinary.ClientExterne, { id: id2 }, CLIENT) },
    delegatedProfiles: { get: (id2) => one(service.ClientExterne, { id: id2 }, [...CLIENT, "updated_date"]) },
    drivers: { get: (id2) => one(service.Livreur, { id: id2 }, DRIVER) },
    nativeUsers: { get: async (id2) => {
      const rows = await service.User.filter({ id: id2 }, "id", 2, 0, ["id", "email", "country_code", "enterprise_id"]);
      if (!Array.isArray(rows) || rows.length > 1) fail2();
      projected(rows, ["id", "email", "country_code", "enterprise_id"]);
      if (rows[0] && rows[0].id !== id2) fail2();
      return rows[0] ?? null;
    } },
    countries: { get: (code) => one(service.Country, { code }, ["id", "code", "actif"]) },
    sources: { get: (type, id2) => {
      if (!["CommandeBoutique", "CommandeRestaurant", "Conversation"].includes(type)) fail2();
      return one((type === "Conversation" ? ordinary : service)[type], { id: id2 }, type === "Conversation" ? [...SOURCE, "participants", "participant_user_ids"] : SOURCE);
    } },
    pharmacies: { get: (id2) => one(service.Pharmacie, { id: id2 }, ["id", "user_email", "pays_code", "enterprise_id", "actif"]) },
    courses: {
      get: (id2) => one(service.CourseExterne, { id: id2 }, COURSE),
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

// frozen:base44/shared/negativeAdmissionAuthority.js
var canon = (v) => typeof v === "string" && v.length > 0 && v.length <= 200 && v === v.trim();
var tenant = (v) => v == null || v === "" ? null : v;
var fail3 = () => {
  throw Error("LOYALTY_NEGATIVE_AUTHORITY_REQUIRED");
};
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function createNegativeAuthorityIssuer(nativeActor, lookupEnterprise) {
  const pins = /* @__PURE__ */ new WeakMap();
  return Object.freeze({
    isPinnedNegativeDecision: (authority, bound) => !!authority && pins.has(authority) && same(pins.get(authority), bound),
    async issue({ actor, source, profile, mutation, target = null }) {
      if (!canon(nativeActor?.id) || !canon(nativeActor.email) || actor?.id !== nativeActor.id || actor?.email !== nativeActor.email || !canon(profile?.id) || !canon(profile.updated_date) || !/^[A-Z]{2}$/.test(profile.country_code)) fail3();
      const enterprise = tenant(profile.enterprise_id);
      let kind;
      if (nativeActor.role === "admin" && ["updateLivreur:admin_decision", "manageEnterprise:toggle_livreur"].includes(source)) kind = "general_admin";
      else if (nativeActor.silgapp_role === "admin_entreprise" && ["manageDriverInvitation:refuse_driver", "manageDriverInvitation:suspend_driver"].includes(source)) {
        if (!canon(enterprise) || tenant(nativeActor.enterprise_id) !== enterprise || !["refuse", "suspend", "deactivate", "admin_offline"].includes(mutation) || target !== null) fail3();
        const company = await lookupEnterprise(enterprise);
        if (company?.enterprise_financier_id !== enterprise || company.country_code !== profile.country_code) fail3();
        kind = "enterprise_agent";
      } else if (source === "updateLivreur:self_identity" && mutation === "identity" && target !== null && typeof profile.user_email === "string" && profile.user_email.trim().toLowerCase() === nativeActor.email.trim().toLowerCase()) kind = "self_owner";
      else fail3();
      const bound = Object.freeze({ actor_user_id: nativeActor.id, source, profile_id: profile.id, expected_updated_date: profile.updated_date, mutation, country_code: profile.country_code, enterprise_id: enterprise, target: target ? Object.freeze({ ...target }) : null });
      const authority = Object.freeze({ kind, country_code: profile.country_code, enterprise_id: enterprise });
      pins.set(authority, bound);
      return authority;
    }
  });
}

// frozen:base44/shared/admissionContextFactory.js
function makeAdmissionContextFactory(getApi, config = LEDGER_CONFIG) {
  return async (req) => {
    const disabled = () => ({ runtime: createLedgerRuntime({}, { captureEnabled: false, readerEnabled: false, policy: null }), resolveNativeUserByEmail: async () => null, issueNegativeAuthority: async () => {
      throw Error("LOYALTY_NEGATIVE_BARRIER_UNAVAILABLE");
    } });
    if (config.captureEnabled !== true) return disabled();
    try {
      const policy = parseLedgerPolicy(config.policy), api = await getApi(req), user = await api.auth.me();
      if (!user?.id || !user?.email) return disabled();
      const fields = ["id", "email", "country_code", "enterprise_id"];
      const exactUser = async (email) => {
        if (typeof email !== "string" || !email || email.trim() !== email) return null;
        try {
          const rows = await api.asServiceRole.entities.User.filter({ email }, "id", 2, 0, fields);
          return Array.isArray(rows) && rows.length === 1 && rows[0]?.id && rows[0].email === email ? Object.fromEntries(fields.filter((k) => Object.hasOwn(rows[0], k)).map((k) => [k, rows[0][k]])) : null;
        } catch {
          return null;
        }
      };
      const lookupEnterprise = async (id2) => {
        const rows = await api.asServiceRole.entities.Enterprise.filter({ enterprise_financier_id: id2 }, "id", 2, 0, ["id", "enterprise_financier_id", "country_code"]);
        return Array.isArray(rows) && rows.length === 1 && rows[0]?.enterprise_financier_id === id2 ? rows[0] : null;
      };
      const issuer = createNegativeAuthorityIssuer(user, lookupEnterprise), ports = createBase44LedgerPorts(api);
      ports.auth = { me: async () => user };
      ports.approvals = { ...ports.approvals || {}, isPinnedNegativeDecision: issuer.isPinnedNegativeDecision };
      return { runtime: createLedgerRuntime(ports, { captureEnabled: true, readerEnabled: false, policy }), resolveNativeUserByEmail: exactUser, issueNegativeAuthority: issuer.issue };
    } catch {
      return disabled();
    }
  };
}

// frozen:base44/shared/loyaltyAdmissionContext.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.57";
var createLoyaltyAdmissionContext = makeAdmissionContextFactory(createClientFromRequest);

// frozen:base44/shared/nativeDriverAdmissionAdapter.js
var CREATE = /* @__PURE__ */ new Set(["createLivreur:new", "initLivreurAuto:new", "migrerClientVersLivreur:new", "manageDriverInvitation:new", "manageEnterprise:new"]);
var DECIDE = /* @__PURE__ */ new Set(["updateLivreur:admin_decision", "updateLivreur:self_revoke", "manageDriverInvitation:validate_driver", "manageDriverInvitation:reactivate_driver", "manageDriverInvitation:refuse_driver", "manageDriverInvitation:suspend_driver", "manageEnterprise:toggle_livreur"]);
var text = (v) => typeof v === "string" && v.length > 0 && v.length <= 200 && v === v.trim();
var own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
var identityUnchanged = (before, patch) => ["user_email", "country_code", "enterprise_id"].every((k) => !own(patch, k) || (patch[k] ?? null) === (before[k] ?? null));
function explicitDecision(source, patch, decision) {
  if (!DECIDE.has(source) || !["admitted", "revoked"].includes(decision)) return false;
  if (source === "updateLivreur:admin_decision" || source === "updateLivreur:self_revoke") {
    const revoke = patch.validation === "refuse" || patch.actif === false || patch.admin_hors_ligne === true;
    const admit = patch.validation === "valide" || patch.actif === true;
    return decision === "revoked" ? revoke : !revoke && admit;
  }
  return source === "manageEnterprise:toggle_livreur" ? decision === "admitted" ? patch.actif === true : patch.actif === false : ["manageDriverInvitation:validate_driver", "manageDriverInvitation:reactivate_driver"].includes(source) ? decision === "admitted" : decision === "revoked";
}
function observedAPI(api, observe) {
  const bound = (object, key) => {
    const value = Reflect.get(object, key, object);
    return typeof value === "function" ? value.bind(object) : value;
  };
  const driver = new Proxy(api.asServiceRole.entities.Livreur, { get(target, key) {
    if (key === "create") return async (...args) => {
      const result = await target.create(...args);
      observe("create", args, result);
      return result;
    };
    if (key === "updateMany") return async (...args) => {
      const result = await target.updateMany(...args);
      observe("updateMany", args, result);
      return result;
    };
    return bound(target, key);
  } });
  const entities = new Proxy(api.asServiceRole.entities, { get(target, key) {
    return key === "Livreur" ? driver : bound(target, key);
  } });
  const service = new Proxy(api.asServiceRole, { get(target, key) {
    return key === "entities" ? entities : bound(target, key);
  } });
  return new Proxy(api, { get(target, key) {
    return key === "asServiceRole" ? service : bound(target, key);
  } });
}
function identityBoundAPI(api, profile) {
  const driver = api.asServiceRole.entities.Livreur;
  const proxy = new Proxy(driver, { get(target, key) {
    if (key === "updateMany") return (filter, patch) => {
      if (filter?.id !== profile.id || filter.updated_date !== profile.updated_date) throw Error("LOYALTY_IDENTITY_CAS_REQUIRED");
      const exact2 = { ...filter };
      for (const k of ["user_email", "country_code", "enterprise_id"]) exact2[k] = profile[k] === void 0 || profile[k] === null || profile[k] === "" ? { $in: [null, ""] } : profile[k];
      return target.updateMany(exact2, patch);
    };
    const v = target[key];
    return typeof v === "function" ? v.bind(target) : v;
  } });
  const entities = new Proxy(api.asServiceRole.entities, { get(t, k) {
    return k === "Livreur" ? proxy : t[k];
  } });
  const service = new Proxy(api.asServiceRole, { get(t, k) {
    return k === "entities" ? entities : t[k];
  } });
  return new Proxy(api, { get(t, k) {
    return k === "asServiceRole" ? service : t[k];
  } });
}
function bindNativeDriverAdmission(req, legacy, contextProvider, mode = "preactivation") {
  let contextPromise, identityPermit = null;
  const identityTarget = (profile, patch) => Object.fromEntries(["user_email", "country_code", "enterprise_id"].map((k) => [k, k === "enterprise_id" ? (own(patch, k) ? patch[k] : profile[k]) || null : own(patch, k) ? patch[k] : profile[k] ?? null]));
  function consumeIdentityPermit(profile, patch) {
    if (!identityPermit) return false;
    if (identityPermit.used || identityPermit.id !== profile.id || identityPermit.revision !== profile.updated_date || JSON.stringify(identityPermit.target) !== JSON.stringify(identityTarget(profile, patch))) throw Error("LOYALTY_IDENTITY_PERMIT_MISMATCH");
    identityPermit.used = true;
    return true;
  }
  async function directIdentityCAS(api, profile, patch) {
    const guarded = identityBoundAPI(api, profile), ack = await guarded.asServiceRole.entities.Livreur.updateMany({ id: profile.id, updated_date: profile.updated_date }, { $set: patch });
    if (ack?.success !== true || ack.updated !== 1 || ack.has_more === true) throw Error("DRIVER_WRITE_UNCERTAIN");
    return api.asServiceRole.entities.Livreur.get(profile.id);
  }
  async function context() {
    if (!contextPromise) contextPromise = Promise.resolve().then(() => contextProvider(req)).catch(() => null);
    return contextPromise;
  }
  async function native(context2, email) {
    if (!context2?.runtime || typeof context2.resolveNativeUserByEmail !== "function" || !text(email)) return null;
    try {
      const user = await context2.resolveNativeUserByEmail(email);
      return text(user?.id) && user.email === email ? user : null;
    } catch {
      return null;
    }
  }
  async function once(run, capture) {
    let started = false, completed = false, result;
    const business = async () => {
      if (started) throw Error("LOYALTY_BUSINESS_REPLAY_FORBIDDEN");
      started = true;
      result = await run();
      completed = true;
      return result;
    };
    try {
      return await capture(business);
    } catch (error) {
      if (completed) return result;
      if (started) throw error;
      return business();
    }
  }
  const wrappers = {};
  if (legacy.createDriverWithIntegrity) wrappers.createDriverWithIntegrity = async (api, payload, source, authenticatedTarget = null) => {
    if (mode !== "enforced") return legacy.createDriverWithIntegrity(api, payload, source, authenticatedTarget);
    const ctx = CREATE.has(source) ? await context() : null;
    const target = await native(ctx, payload?.user_email);
    if (!target) return legacy.createDriverWithIntegrity(api, payload, source, authenticatedTarget);
    let createdId = null;
    const observed = observedAPI(api, (method, args, result) => {
      if (method === "create" && text(result?.id) && args[0]?.user_email === target.email) createdId = result.id;
    });
    return once(() => legacy.createDriverWithIntegrity(observed, payload, source, authenticatedTarget), async (business) => {
      const envelope = await ctx.runtime.createNativeDriverBinding({ source, native_user_id: target.id }, async () => {
        const row = await business();
        return { created: row?.id === createdId && createdId !== null, row };
      });
      return envelope.result.row;
    });
  };
  if (legacy.decideDriverAdmission) wrappers.decideDriverAdmission = async (api, profile, patch, decision, source, actor, explicitRef = null) => {
    const business = () => legacy.decideDriverAdmission(api, profile, patch, decision, source, actor, explicitRef);
    if (mode === "preactivation") return business();
    const identityChanged = !identityUnchanged(profile, patch), negative = decision === "revoked" || own(patch, "validation") && patch.validation !== "valide" || patch.actif === false || patch.admin_hors_ligne === true;
    if (mode !== "enforced") {
      if (identityChanged) throw Error("LOYALTY_ENFORCEMENT_CONFIG_INVALID");
      return business();
    }
    if (identityChanged && consumeIdentityPermit(profile, patch)) return legacy.decideDriverAdmission(identityBoundAPI(api, profile), profile, patch, decision, source, actor, explicitRef);
    if (!identityChanged && (negative || patch.validation !== "valide")) return business();
    const ctx = await context();
    if (identityChanged) {
      if (!ctx?.runtime?.guardDriverIdentityMutation) throw Error("LOYALTY_IDENTITY_BARRIER_UNAVAILABLE");
      const target2 = Object.fromEntries(["user_email", "country_code", "enterprise_id"].map((k) => [k, own(patch, k) ? patch[k] : profile[k] ?? null]));
      if (target2.enterprise_id === "") target2.enterprise_id = null;
      const identityAPI = identityBoundAPI(api, profile);
      if (typeof ctx.issueNegativeAuthority !== "function") throw Error("LOYALTY_NEGATIVE_AUTHORITY_REQUIRED");
      const authority = await ctx.issueNegativeAuthority({ actor, source, profile, mutation: "identity", target: target2 });
      const result = await ctx.runtime.guardDriverIdentityMutation({ source, profile_id: profile.id, expected_updated_date: profile.updated_date, target: target2, authority }, () => legacy.decideDriverAdmission(identityAPI, profile, patch, decision, source, actor, explicitRef));
      return result.result;
    }
    const candidate = !negative && patch.validation === "valide" && ["updateLivreur:admin_decision", "manageDriverInvitation:validate_driver"].includes(source);
    if (negative || !candidate) return business();
    const target = await native(ctx, profile?.user_email);
    if (!candidate || !target) return business();
    let acknowledged = false;
    const observed = observedAPI(api, (method, args, result) => {
      if (method === "updateMany" && args[0]?.id === profile.id && args[0]?.updated_date === profile.updated_date && result?.success === true && result.updated === 1 && result.has_more !== true && Object.entries(patch).every(([k, v]) => JSON.stringify(args[1]?.$set?.[k]) === JSON.stringify(v))) acknowledged = true;
    });
    return once(() => legacy.decideDriverAdmission(observed, profile, patch, decision, source, actor, explicitRef), async (business2) => {
      const envelope = await ctx.runtime.establishNativeDriverBinding({ source, profile_id: profile.id, native_user_id: target.id, decision }, async () => {
        const row = await business2();
        return { updated: acknowledged, row };
      });
      return envelope.result.row;
    });
  };
  wrappers.updateDriverWithoutDecision = async (api, profile, patch, actor) => {
    if (mode === "preactivation" || identityUnchanged(profile, patch)) return api.asServiceRole.entities.Livreur.update(profile.id, patch);
    if (mode !== "enforced") throw Error("LOYALTY_ENFORCEMENT_CONFIG_INVALID");
    if (consumeIdentityPermit(profile, patch)) return directIdentityCAS(api, profile, patch);
    const ctx = await context();
    if (!ctx?.runtime?.guardNegativeDriverMutation || typeof ctx.issueNegativeAuthority !== "function") throw Error("LOYALTY_IDENTITY_BARRIER_UNAVAILABLE");
    const source = actor?.role === "admin" ? "updateLivreur:admin_decision" : "updateLivreur:self_identity";
    const target = Object.fromEntries(["user_email", "country_code", "enterprise_id"].map((k) => [k, own(patch, k) ? patch[k] : profile[k] ?? null]));
    if (target.enterprise_id === "") target.enterprise_id = null;
    const authority = await ctx.issueNegativeAuthority({ actor, source, profile, mutation: "identity", target });
    const result = await ctx.runtime.guardNegativeDriverMutation({ source, profile_id: profile.id, expected_updated_date: profile.updated_date, mutation: "identity", target, authority }, async () => {
      const guarded = identityBoundAPI(api, profile);
      const ack = await guarded.asServiceRole.entities.Livreur.updateMany({ id: profile.id, updated_date: profile.updated_date }, { $set: patch });
      if (ack?.success !== true || ack.updated !== 1 || ack.has_more === true) throw Error("DRIVER_WRITE_UNCERTAIN");
      return api.asServiceRole.entities.Livreur.get(profile.id);
    });
    return result.result;
  };
  wrappers.withDriverIdentityPrecondition = async (api, profile, patch, actor, work) => {
    if (mode === "preactivation" || identityUnchanged(profile, patch)) return work();
    if (mode !== "enforced") throw Error("LOYALTY_ENFORCEMENT_CONFIG_INVALID");
    const ctx = await context();
    if (!ctx?.runtime?.guardDriverIdentityMutation || typeof ctx.issueNegativeAuthority !== "function") throw Error("LOYALTY_IDENTITY_BARRIER_UNAVAILABLE");
    const source = actor?.role === "admin" ? "updateLivreur:admin_decision" : "updateLivreur:self_identity", target = identityTarget(profile, patch);
    const authority = await ctx.issueNegativeAuthority({ actor, source, profile, mutation: "identity", target });
    const result = await ctx.runtime.guardDriverIdentityMutation({ source, profile_id: profile.id, expected_updated_date: profile.updated_date, target, authority }, async () => {
      if (identityPermit) throw Error("LOYALTY_IDENTITY_PERMIT_REENTRANT");
      identityPermit = { id: profile.id, revision: profile.updated_date, target, used: false };
      try {
        return await work();
      } finally {
        identityPermit = null;
      }
    });
    return result.result;
  };
  return Object.freeze(wrappers);
}

// frozen:base44/shared/admissionEnforcement.js
var ADMISSION_ENFORCEMENT = Object.freeze({ phase: "preactivation", enforcement: false, ever_activated: false, epoch_id: null });
var uuid2 = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function admissionMode(state, proof) {
  if (state?.phase === "preactivation" && state.enforcement === false && state.ever_activated === false && state.epoch_id === null && proof?.captureEnabled === false && proof?.readerEnabled === false && proof?.policy === null) return "preactivation";
  if (["active", "suspended"].includes(state?.phase) && state.enforcement === true && state.ever_activated === true && uuid2(state.epoch_id) && (!proof?.policy || proof.policy.epoch_id === state.epoch_id)) return "enforced";
  return "invalid";
}
function assertAdmissionTransition(previous, next) {
  if (previous?.ever_activated === true && (!next?.enforcement || next.ever_activated !== true || next.epoch_id !== previous.epoch_id || !["active", "suspended"].includes(next.phase))) throw Error("LOYALTY_EPOCH_REOPEN_FORBIDDEN");
  return true;
}

// frozen:base44/shared/loyaltyDriverAdmission.ts
function bindDriverAdmission(req, legacy) {
  return bindNativeDriverAdmission(req, legacy, createLoyaltyAdmissionContext, admissionMode(ADMISSION_ENFORCEMENT, LEDGER_CONFIG));
}

// frozen:base44/shared/driverAdmissionIntegrity.js
var DRIVER_PREFIX = "driver_integrity_";
var DRIVER_VERSION = "driver-admission-v1";
var SOURCES = /* @__PURE__ */ new Set(["initLivreurAuto:new", "createLivreur:new", "migrerClientVersLivreur:new", "manageDriverInvitation:new", "manageDriverInvitation:validate_driver", "manageDriverInvitation:refuse_driver", "manageDriverInvitation:suspend_driver", "manageDriverInvitation:reactivate_driver", "manageEnterprise:new", "manageEnterprise:toggle_livreur", "updateLivreur:admin_decision", "updateLivreur:self_revoke", "cutover:explicit_reference"]);
var uuidV4 = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
var canonicalTime = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
var text2 = (value) => typeof value === "string" && value !== "" && value === value.trim();
var tenantKey = (value) => value == null || value === "" ? "public" : text2(value) ? `enterprise:${value}` : null;
function rejectDriverIntegrity(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw Error("INVALID_DRIVER_DATA");
  if (Object.keys(data).some((key) => key.startsWith(DRIVER_PREFIX))) throw Error("DRIVER_INTEGRITY_SERVER_ONLY");
}
function stripDriverIntegrity(data) {
  rejectObject(data);
  return Object.fromEntries(Object.entries(data).filter(([key]) => !key.startsWith(DRIVER_PREFIX)));
}
function rejectObject(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw Error("INVALID_DRIVER_DATA");
}
async function resolveDriverUser(api, email) {
  if (!text2(email)) return null;
  const rows = await api.asServiceRole.entities.User.filter({ email });
  return Array.isArray(rows) && rows.length === 1 && rows[0].email === email && text2(rows[0].id) ? rows[0] : null;
}
async function contextValid(api, country, tenant2, nativeUser = null) {
  if (!text2(country) || !/^[A-Z]{2}$/.test(country) || !tenant2) return false;
  const countries = await api.asServiceRole.entities.Country.filter({ code: country });
  if (!Array.isArray(countries) || countries.length !== 1 || countries[0].code !== country || countries[0].actif !== true) return false;
  if (nativeUser && (tenantKey(nativeUser.enterprise_id) !== tenant2 || nativeUser.country_code && nativeUser.country_code !== country)) return false;
  if (tenant2 !== "public") {
    const id2 = tenant2.slice(11);
    const rows = await api.asServiceRole.entities.Enterprise.filter({ enterprise_financier_id: id2 });
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0].enterprise_financier_id !== id2 || rows[0].country_code !== country || rows[0].actif !== true || rows[0].statut !== "actif") return false;
  }
  return true;
}
var keys = ["version", "profile_id", "native_user_id", "subject_email", "country_code", "tenant_key", "admission", "revision", "attested_at", "source"];
var driverFields = keys.map((k) => DRIVER_PREFIX + k);
function hasSealedReference(profile) {
  return profile?.driver_integrity_version === DRIVER_VERSION && profile.driver_integrity_profile_id === profile.id && uuidV4(profile.driver_integrity_revision) && text2(profile.driver_integrity_country_code) && text2(profile.driver_integrity_tenant_key) && SOURCES.has(profile.driver_integrity_source) && canonicalTime(profile.driver_integrity_attested_at) && ["admitted", "pending", "revoked"].includes(profile.driver_integrity_admission);
}
function stamp(profile, ref, admission, source) {
  return {
    driver_integrity_version: DRIVER_VERSION,
    driver_integrity_profile_id: profile.id,
    driver_integrity_native_user_id: ref.nativeId || "",
    driver_integrity_subject_email: ref.email || "",
    driver_integrity_country_code: ref.country,
    driver_integrity_tenant_key: ref.tenant,
    driver_integrity_admission: admission,
    driver_integrity_revision: crypto.randomUUID(),
    driver_integrity_attested_at: (/* @__PURE__ */ new Date()).toISOString(),
    driver_integrity_source: source
  };
}
function refFrom(profile) {
  return {
    nativeId: profile.driver_integrity_native_user_id,
    email: profile.driver_integrity_subject_email,
    country: profile.driver_integrity_country_code,
    tenant: profile.driver_integrity_tenant_key
  };
}
async function writeDriverCAS(api, profile, data) {
  if (!text2(profile?.id) || !text2(profile.updated_date)) throw Error("DRIVER_REVISION_REQUIRED");
  const filter = { id: profile.id, updated_date: profile.updated_date };
  if (profile.driver_integrity_revision) filter.driver_integrity_revision = profile.driver_integrity_revision;
  let uncertain = false, receipt;
  try {
    receipt = await api.asServiceRole.entities.Livreur.updateMany(filter, { $set: data });
  } catch {
    uncertain = true;
  }
  const current = await api.asServiceRole.entities.Livreur.get(profile.id);
  if (!uncertain && (receipt?.success !== true || receipt.updated !== 1 || receipt.has_more === true) || !current || Object.entries(data).some(([k, v]) => JSON.stringify(current[k]) !== JSON.stringify(v))) {
    throw Error(uncertain ? "DRIVER_WRITE_UNCERTAIN" : "DRIVER_WRITE_CONFLICT");
  }
  return current;
}
async function createDriverWithIntegrity(api, payload, source, authenticatedTarget = null) {
  const data = stripDriverIntegrity(payload);
  const tenant2 = tenantKey(data.enterprise_id);
  const target = authenticatedTarget || await resolveDriverUser(api, data.user_email);
  const valid2 = await contextValid(api, data.country_code, tenant2, target);
  const created = await api.asServiceRole.entities.Livreur.create(data);
  if (!valid2) return created;
  const native = target && target.email === data.user_email ? target.id : "";
  const admission = data.validation === "valide" && data.actif === true ? "admitted" : "pending";
  const evidence = stamp(created, { nativeId: native, email: data.user_email || "", country: data.country_code, tenant: tenant2 }, admission, source);
  return await writeDriverCAS(api, created, evidence);
}
async function decideDriverAdmission(api, profile, businessData, decision, source, actor, explicitRef = null) {
  rejectDriverIntegrity(businessData);
  const superAdmin = actor?.role === "admin";
  const enterpriseAdmin = actor?.silgapp_role === "admin_entreprise";
  const selfRevoke = decision === "revoked" && (hasSealedReference(profile) && profile.driver_integrity_native_user_id === actor?.id || !hasSealedReference(profile) && text2(actor?.email) && profile.user_email === actor.email);
  if (!superAdmin && !enterpriseAdmin && !selfRevoke) throw Error("DRIVER_DECISION_FORBIDDEN");
  let ref = hasSealedReference(profile) ? refFrom(profile) : null;
  if (!ref && superAdmin && explicitRef) ref = { nativeId: "", email: explicitRef.user_email, country: explicitRef.country_code, tenant: tenantKey(explicitRef.enterprise_id) };
  if (enterpriseAdmin && (!ref || ref.tenant !== tenantKey(actor.enterprise_id))) {
    if (ref) throw Error("DRIVER_ADMIN_TENANT_MISMATCH");
    return await writeDriverCAS(api, profile, businessData);
  }
  if (!ref) return await writeDriverCAS(api, profile, businessData);
  if (Object.hasOwn(businessData, "user_email") && businessData.user_email !== ref.email || Object.hasOwn(businessData, "country_code") && businessData.country_code !== ref.country || Object.hasOwn(businessData, "enterprise_id") && tenantKey(businessData.enterprise_id) !== ref.tenant) decision = "revoked";
  if (decision !== "revoked") {
    const target = ref.nativeId ? await api.asServiceRole.entities.User.get(ref.nativeId) : await resolveDriverUser(api, ref.email);
    if (target && (!ref.nativeId || target.id === ref.nativeId) && await contextValid(api, ref.country, ref.tenant, target)) ref.nativeId = target.id;
    else {
      decision = "pending";
      ref.nativeId = "";
    }
  }
  return await writeDriverCAS(api, profile, { ...businessData, ...stamp(profile, ref, decision, source) });
}
async function readDriverAdmission(api, actor, course) {
  try {
    const profile = await api.asServiceRole.entities.Livreur.get(course.livreur_id);
    if (!hasSealedReference(profile)) return { state: "unattested", reason: "missing_reference" };
    if (profile.driver_integrity_admission !== "admitted") return { state: "unattested", reason: "not_admitted" };
    if (profile.driver_integrity_native_user_id !== actor?.id || !text2(actor?.id)) return { state: "unattested", reason: "native_identity_mismatch" };
    if (profile.driver_integrity_country_code !== course.country_code || profile.driver_integrity_tenant_key !== tenantKey(course.enterprise_id)) return { state: "unattested", reason: "scope_mismatch" };
    if (!await contextValid(api, profile.driver_integrity_country_code, profile.driver_integrity_tenant_key)) return { state: "unattested", reason: "context_inactive" };
    return { state: "attested", profile_id: profile.id, native_user_id: actor.id, country_code: profile.driver_integrity_country_code, tenant_key: profile.driver_integrity_tenant_key, revision: profile.driver_integrity_revision, attested_at: profile.driver_integrity_attested_at, source: profile.driver_integrity_source, version: DRIVER_VERSION };
  } catch {
    return { state: "unattested", reason: "evidence_unavailable" };
  }
}
async function driverDeliverySnapshot(api, actor, course) {
  const evidence = await readDriverAdmission(api, actor, course);
  return { delivery_integrity_driver_state: evidence.state, delivery_integrity_driver_evidence_json: JSON.stringify(evidence) };
}

// frozen:base44/functions/updateLivreur/entry.ts
import { createClientFromRequest as createClientFromRequest2 } from "npm:@base44/sdk@0.8.25";
Deno.serve(async (req) => {
  const { decideDriverAdmission: decideDriverAdmission2, updateDriverWithoutDecision, withDriverIdentityPrecondition } = bindDriverAdmission(req, { decideDriverAdmission });
  try {
    const base44 = createClientFromRequest2(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ success: false, error: "Authentification requise" }, { status: 401 });
    }
    const { id: id2, data, mark_courses_paid } = await req.json();
    if (!id2) return Response.json({ success: false, error: "id requis" }, { status: 400 });
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return Response.json({ success: false, error: "data invalide" }, { status: 400 });
    }
    rejectDriverIntegrity(data);
    const livreur = await base44.asServiceRole.entities.Livreur.get(id2).catch(() => null);
    if (!livreur) {
      return Response.json({ success: false, error: "Livreur introuvable" }, { status: 404 });
    }
    const isAdmin = user.role === "admin";
    const isOwner = String(livreur.user_email || "").trim().toLowerCase() === String(user.email || "").trim().toLowerCase();
    if (!isAdmin && !isOwner) {
      return Response.json({ success: false, error: "Non autoris\xE9" }, { status: 403 });
    }
    if (!isAdmin) {
      const adminOnlyFields = [
        "encours",
        "montant_du_silga",
        "statut_paiement",
        "dernier_paiement_date",
        "bloque_encours",
        "date_blocage_encours",
        "commission_pct",
        "note_moyenne",
        "nombre_avis",
        "admin_hors_ligne"
      ];
      const forbiddenField = adminOnlyFields.find((field) => Object.prototype.hasOwnProperty.call(data, field));
      const requestsValidationChange = Object.prototype.hasOwnProperty.call(data, "validation");
      const validSelfDeactivation = data.validation === "refuse" && data.actif === false;
      const requestsReactivation = data.actif === true;
      if (forbiddenField || requestsValidationChange && !validSelfDeactivation || requestsReactivation || mark_courses_paid) {
        return Response.json({
          success: false,
          error: "Modification r\xE9serv\xE9e aux administrateurs",
          field: forbiddenField || (mark_courses_paid ? "mark_courses_paid" : requestsValidationChange ? "validation" : "actif")
        }, { status: 403 });
      }
    }
    return await withDriverIdentityPrecondition(base44, livreur, data, user, async () => {
      if (Array.isArray(mark_courses_paid) && mark_courses_paid.length > 0) {
        await Promise.all(mark_courses_paid.map(
          (cid) => base44.asServiceRole.entities.CourseExterne.update(cid, { statut_paiement_livreur: "paye" })
        ));
      }
      if (data.montant_du_silga !== void 0) {
        data.dernier_paiement_date = (/* @__PURE__ */ new Date()).toISOString();
      }
      const decisionRequested = Object.hasOwn(data, "validation") || Object.hasOwn(data, "actif") || Object.hasOwn(data, "admin_hors_ligne") || ["user_email", "country_code", "enterprise_id"].some((k) => Object.hasOwn(data, k));
      let updated;
      if (decisionRequested && (isAdmin || data.actif === false)) {
        const revoked = data.validation === "refuse" || data.actif === false || data.admin_hors_ligne === true;
        const admitted = data.validation === "valide" || data.actif === true;
        const decision = revoked ? "revoked" : admitted ? "admitted" : livreur.driver_integrity_admission || "pending";
        const explicitRef = isAdmin && ["user_email", "country_code", "enterprise_id"].every((k) => Object.hasOwn(data, k)) ? data : null;
        updated = await decideDriverAdmission2(base44, livreur, data, decision, isAdmin ? "updateLivreur:admin_decision" : "updateLivreur:self_revoke", user, explicitRef);
      } else {
        updated = await updateDriverWithoutDecision(base44, livreur, data, user);
      }
      return Response.json({ success: true, livreur: updated });
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
