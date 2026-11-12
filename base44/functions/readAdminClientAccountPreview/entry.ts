// frozen:base44/shared/adminPhoneCandidate.js
var scope = (x) => x?.enterprise_id ?? null;
var unlinked = (reason) => ({ state: "unlinked", reason, courseFields: {}, originEvidence: null });
function strictPhoneInCountry(phone, country) {
  if (typeof phone !== "string" || phone.length > 80 || !/^\+?[0-9 ()-]+$/.test(phone) || !country || country.actif !== true || !/^[A-Z]{2}$/.test(country.code)) return null;
  const dial = String(country.indicatif ?? "").replace(/^\+/, "");
  const length = country.phone_max_length;
  if (!/^[1-9][0-9]{0,3}$/.test(dial) || !Number.isInteger(length) || length < 6 || length > 12) return null;
  let digits = phone.replace(/[ ()-]/g, "");
  const explicit = digits.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  if (explicit) return digits.startsWith(dial) && digits.length === dial.length + length ? digits : null;
  if (digits.startsWith(dial) && digits.length === dial.length + length) return digits;
  return digits.length === length ? dial + digits : null;
}
async function resolveAdminPhoneCandidate(data, ports) {
  try {
    if (!data || !/^[A-Z]{2}$/.test(data.country_code)) return unlinked("COUNTRY_UNVERIFIED");
    const countries = await ports.countries(data.country_code);
    if (!Array.isArray(countries) || countries.length !== 1 || countries[0].code !== data.country_code) return unlinked("COUNTRY_AMBIGUOUS");
    const phone = strictPhoneInCountry(data.client_telephone, countries[0]);
    if (!phone) return unlinked("PHONE_INVALID_OR_COUNTRY_MISMATCH");
    const page = await ports.phoneProfiles({ country_code: data.country_code, enterprise_id: scope(data), telephone_normalized: phone, limit: 2 });
    if (page?.complete !== true || !Array.isArray(page.items)) return unlinked("LOOKUP_INCOMPLETE");
    if (page.items.length === 0) return unlinked("NO_REGISTERED_ACCOUNT");
    if (page.items.length !== 1) return unlinked("PROFILE_AMBIGUOUS");
    const p = page.items[0];
    if (!p?.id || p.actif !== true || p.country_code !== data.country_code || scope(p) !== scope(data) || typeof p.user_email !== "string" || !p.user_email || p.user_email.trim() !== p.user_email) return unlinked("PROFILE_UNREGISTERED_OR_SCOPE_MISMATCH");
    if (strictPhoneInCountry(p.telephone, countries[0]) !== phone || p.telephone_normalized !== phone) return unlinked("PROFILE_PHONE_CONTRADICTORY");
    const sameEmail = await ports.profilesByEmail(p.user_email, 2);
    if (!Array.isArray(sameEmail) || sameEmail.length !== 1 || sameEmail[0].id !== p.id) return unlinked("PROFILE_IDENTITY_AMBIGUOUS");
    const users = await ports.nativeUsersByEmail(p.user_email, 2);
    if (!Array.isArray(users) || users.length !== 1 || !users[0]?.id || users[0].email !== p.user_email || scope(users[0]) !== scope(data) || users[0].country_code !== data.country_code) return unlinked("NATIVE_ACCOUNT_AMBIGUOUS_OR_SCOPE_MISMATCH");
    return unlinked("NATIVE_PROFILE_PHONE_PROVENANCE_REQUIRED");
  } catch {
    return unlinked("LOOKUP_UNAVAILABLE");
  }
}

// frozen:base44/shared/adminClientLink.js
function normalizeAdminPhone(phone, country) {
  if (typeof phone !== "string" || phone.length > 80 || !/^\+?[0-9 ()-]+$/.test(phone)) return null;
  let n = phone.replace(/[ ()-]/g, "");
  if (n.startsWith("+") || n.startsWith("00")) {
    n = n.startsWith("+") ? n.slice(1) : n.slice(2);
    return /^[1-9][0-9]{6,14}$/.test(n) ? n : null;
  }
  return strictPhoneInCountry(phone, country);
}
var storedPhone = (p, country) => normalizeAdminPhone(p.telephone, country) || (/^[1-9][0-9]{6,14}$/.test(p.telephone_normalized || "") && typeof p.telephone === "string" && p.telephone.replace(/[ ()-]/g, "") === p.telephone_normalized ? p.telephone_normalized : null);
var PROFILE_FIELDS = ["id", "updated_date", "user_email", "telephone", "telephone_normalized", "country_code", "enterprise_id", "actif"];
var USER_FIELDS = ["id", "email", "full_name", "country_code", "enterprise_id"];
var tenant = (x) => x?.enterprise_id ?? null;
var exact = (o, keys) => o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));
var validId = (x) => typeof x === "string" && x.length > 0 && x.length <= 200 && x.trim() === x;
var CANDIDATE = ["version", "profile_id", "profile_updated_date", "native_user_id", "native_user_snapshot_sha256", "country_code", "enterprise_id", "normalized_phone"];
var result = (status, reason) => ({ status, reason, can_create_unlinked: true });
var hash = async (text) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), (x) => x.toString(16).padStart(2, "0")).join("");
var ClientLinkReviewError = class extends Error {
  constructor() {
    super("Le compte client doit \xEAtre v\xE9rifi\xE9 \xE0 nouveau avant de cr\xE9er la course.");
    this.code = "CLIENT_LINK_REVIEW_REQUIRED";
    this.status = 409;
  }
};
var decisions = /* @__PURE__ */ new WeakMap();
var readPinnedAdminDecisionMode = (decision) => decisions.get(decision)?.mode ?? null;
var isPinnedAdminDecision = (decision, actorId) => decisions.get(decision)?.actor_user_id === actorId;
function readPinnedAdminDecision(decision, actorId) {
  const d = decisions.get(decision);
  if (!d || d.actor_user_id !== actorId) throw new ClientLinkReviewError();
  return d;
}
async function boundedProfiles(api, scope2) {
  const rows = [], seen = /* @__PURE__ */ new Set();
  for (let offset = 0; offset < 2e3; offset += 100) {
    const page = await api.asServiceRole.entities.ClientExterne.filter(scope2, "id", 100, offset, PROFILE_FIELDS);
    if (!Array.isArray(page) || page.length > 100) throw Error("PROFILE_SCAN_INCOMPLETE");
    for (const p of page) {
      if (!p?.id || seen.has(p.id) || p.country_code !== scope2.country_code || tenant(p) !== (scope2.enterprise_id ?? null)) throw Error("PROFILE_SCAN_CHANGED");
      seen.add(p.id);
      rows.push(p);
    }
    if (page.length < 100) return rows;
  }
  throw Error("PROFILE_SCAN_LIMIT");
}
async function previewAdminClientAccount(api, grant, data) {
  try {
    if (!grant.country_codes.includes(data.country_code) || tenant(data) !== grant.enterprise_id) return result("unverified", "SCOPE_MISMATCH");
    const countries = await api.asServiceRole.entities.Country.filter({ code: data.country_code, actif: true }, "id", 2, 0, ["id", "code", "actif", "indicatif", "phone_max_length"]);
    if (!Array.isArray(countries) || countries.length !== 1 || countries[0].code !== data.country_code) return result("unverified", "COUNTRY_UNVERIFIED");
    const phone = normalizeAdminPhone(data.client_telephone, countries[0]);
    if (!phone) return result("unverified", "PHONE_INVALID_OR_COUNTRY_MISMATCH");
    const profiles = await boundedProfiles(api, { country_code: data.country_code, enterprise_id: grant.enterprise_id });
    const matches = profiles.filter((p2) => storedPhone(p2, countries[0]) === phone || p2.telephone_normalized === phone);
    if (matches.length === 0) return result("none", "NO_ACCOUNT");
    if (matches.length !== 1) return result("ambiguous", "PHONE_MULTIPLE_PROFILES");
    const p = matches[0];
    if (p.actif !== true || !validId(p.updated_date) || !validId(p.user_email)) return result("unverified", "PROFILE_NOT_REGISTERED_OR_CURRENT");
    if (storedPhone(p, countries[0]) !== phone || p.telephone_normalized != null && p.telephone_normalized !== "" && p.telephone_normalized !== phone) return result("unverified", "PHONE_FIELDS_CONTRADICTORY");
    if (profiles.filter((x) => x.user_email === p.user_email).length !== 1) return result("ambiguous", "ACCOUNT_MULTIPLE_PROFILES");
    const users = await api.asServiceRole.entities.User.filter({ email: p.user_email }, "id", 2, 0, USER_FIELDS);
    if (!Array.isArray(users) || users.length !== 1) return result(users?.length > 1 ? "ambiguous" : "unverified", "NATIVE_USER_NOT_UNIQUE");
    const u = users[0];
    if (!validId(u?.id) || u.email !== p.user_email || tenant(u) !== grant.enterprise_id || u.country_code != null && u.country_code !== data.country_code) return result("unverified", "NATIVE_SCOPE_MISMATCH");
    const snapshot = Object.fromEntries(USER_FIELDS.map((k) => [k, Object.hasOwn(u, k) ? { present: true, value: u[k] } : { present: false }]));
    const digest = await hash(JSON.stringify(snapshot));
    const candidate = { version: 1, profile_id: p.id, profile_updated_date: p.updated_date, native_user_id: u.id, native_user_snapshot_sha256: digest, country_code: data.country_code, enterprise_id: grant.enterprise_id, normalized_phone: phone };
    const [local, domain] = u.email.split("@");
    const display = { name: typeof u.full_name === "string" && u.full_name.trim() ? u.full_name.trim() : "Compte inscrit", masked_email: domain ? local.slice(0, 2) + "***@" + domain : "Compte inscrit" };
    return { ...result("linked"), display, candidate, _resolved: { profile: p, user: u, phone } };
  } catch {
    return result("unverified", "LOOKUP_UNAVAILABLE_OR_INCOMPLETE");
  }
}
var publicAdminPreview = (p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== "_resolved"));
async function confirmAdminClientAccount(api, actor, grant, data, selection) {
  if (selection === void 0 || exact(selection, ["mode"]) && selection.mode === "unlinked") {
    const decision2 = Object.freeze({});
    decisions.set(decision2, Object.freeze({ mode: "unlinked", reason: selection === void 0 ? "legacy_no_tuple" : "explicit_unlinked", actor_user_id: actor.id, actor_email: actor.email, grant_action: grant.action, country_code: data.country_code, enterprise_id: grant.enterprise_id }));
    return decision2;
  }
  if (!exact(selection, ["mode", "candidate"]) || selection.mode !== "confirmed" || !exact(selection.candidate, CANDIDATE)) throw new ClientLinkReviewError();
  const fresh = await previewAdminClientAccount(api, grant, data);
  if (fresh.status !== "linked" || CANDIDATE.some((k) => fresh.candidate[k] !== selection.candidate[k])) throw new ClientLinkReviewError();
  const decision = Object.freeze({});
  decisions.set(decision, Object.freeze({ mode: "linked", actor_user_id: actor.id, actor_email: actor.email, grant_action: grant.action, country_code: data.country_code, enterprise_id: grant.enterprise_id, candidate: Object.freeze({ ...fresh.candidate }), beneficiary_user_id: fresh._resolved.user.id, beneficiary_email: fresh._resolved.user.email, profile_id: fresh._resolved.profile.id, profile_updated_date: fresh._resolved.profile.updated_date }));
  return decision;
}
function adminAccountCourseFields(decision, actorId, type) {
  if (!decision) return {};
  const d = readPinnedAdminDecision(decision, actorId);
  if (d.mode === "unlinked") return {};
  return { client_user_email: d.beneficiary_email, ...type === "expedier" ? { expediteur_client_id: d.profile_id } : type === "recevoir" ? { destinataire_client_id: d.profile_id } : {} };
}

// frozen:base44/shared/adminClientLinkConfig.js
var ADMIN_CLIENT_LINK_CONFIG = Object.freeze({ previewEnabled: false, creationEnabled: false, creationContractReady: false, protocol: "admin-client-link-v1" });

// frozen:base44/shared/adminCourseCreationIntegrity.js
var CourseCreationError = class extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
};
var fail = (code, message, status = 400) => {
  throw new CourseCreationError(code, message, status);
};
var record = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
var own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
var ADMIN_COURSE_ACTIONS = Object.freeze(["creerCourseAdmin", "creerCourseEnterprise"]);
function resolveCourseCreationGrant(user, action, raw, now = Date.now()) {
  if (!user?.id) fail("UNAUTHENTICATED", "Non autoris\xE9.", 401);
  if (!ADMIN_COURSE_ACTIONS.includes(action)) fail("FORBIDDEN_NO_ADMIN_COURSE_PERMISSION", "Action non autoris\xE9e.", 403);
  let config;
  try {
    config = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
  }
  if (!record(config) || config.version !== 1 || !Array.isArray(config.grants)) fail("ADMIN_COURSE_GRANTS_UNAVAILABLE", "Autorisations indisponibles. Contactez SILGAPP.", 503);
  const matches = config.grants.filter((g2) => record(g2) && g2.user_id === user.id && g2.action === action);
  if (matches.length !== 1) fail("FORBIDDEN_NO_ADMIN_COURSE_PERMISSION", "Administrateur ou agent non autoris\xE9.", 403);
  const g = matches[0];
  const validKind = g.kind === "admin" ? user.role === "admin" : g.kind === "agent" && ["admin", "user"].includes(user.role);
  const countries = g.country_codes;
  const expiry = typeof g.expires_at === "string" ? Date.parse(g.expires_at) : NaN;
  const validExpiry = g.until_revoked === true ? g.expires_at == null : Number.isFinite(expiry) && expiry > now;
  if (!validKind || !validExpiry || !Array.isArray(countries) || !countries.length || countries.some((c) => typeof c !== "string" || !/^[A-Z]{2}$/.test(c)) || new Set(countries).size !== countries.length) fail("FORBIDDEN_NO_ADMIN_COURSE_PERMISSION", "Autorisation invalide ou expir\xE9e.", 403);
  if (!(g.enterprise_id === null || typeof g.enterprise_id === "string" && g.enterprise_id.trim() === g.enterprise_id && g.enterprise_id.length > 0)) fail("FORBIDDEN_NO_ADMIN_COURSE_PERMISSION", "P\xE9rim\xE8tre entreprise invalide.", 403);
  if (action === "creerCourseEnterprise" && !g.enterprise_id) fail("FORBIDDEN_NO_ADMIN_COURSE_PERMISSION", "P\xE9rim\xE8tre entreprise requis.", 403);
  return Object.freeze({ user_id: user.id, action, country_codes: Object.freeze([...countries]), enterprise_id: g.enterprise_id });
}
var STRINGS = Object.freeze({
  client_nom: 300,
  client_telephone: 80,
  contact_createur_course: 80,
  expediteur_nom: 300,
  expediteur_telephone: 80,
  destinataire_nom: 300,
  destinataire_telephone: 80,
  client_phone_normalized: 80,
  expediteur_phone_normalized: 80,
  destinataire_phone_normalized: 80,
  adresse_depart: 2e3,
  adresse_arrivee: 2e3,
  quartier_depart: 300,
  quartier_arrivee: 300,
  ville_depart: 300,
  ville_arrivee: 300,
  notes: 1e4,
  passager_nom: 300,
  passager_telephone: 80,
  tracking_token: 500,
  tracking_link: 2e3,
  devise: 20,
  request_id: 200
});
var NUMBERS = Object.freeze({ prix_estimate: [0, 1e12], prix_propose_admin: [0, 1e12], distance_tarifaire_km: [0, 1e5], gps_depart_lat: [-90, 90], gps_arrivee_lat: [-90, 90], gps_depart_lng: [-180, 180], gps_arrivee_lng: [-180, 180], nb_passagers: [1, 1e3] });
var ENUMS = Object.freeze({ type_course: ["expedier", "recevoir", "deplacement"], type_colis: ["petit_colis", "moyen_colis", "gros_colis", "document", "nourriture", "autre"], gps_depart_source: ["exact", "quartier", "geocodage"], gps_arrivee_source: ["exact", "quartier", "geocodage"], distance_tarifaire_source: ["ors", "haversine_fallback"], delivery_mode: ["standard", "eco"], pricing_mode: ["automatic", "manual", "admin_manuel"] });
function sanitizeAdminCourse(body, grant) {
  if (!record(body)) fail("INVALID_BODY", "Donn\xE9es de course invalides.");
  if (own(body, "statut") && body.statut != null && !["nouvelle", "en_attente", "programmee", "recherche_livreur"].includes(body.statut)) fail("INVALID_INITIAL_STATE", "Une nouvelle course ne peut pas \xEAtre d\xE9j\xE0 prise en charge ou termin\xE9e.");
  if (own(body, "dispatch_status") && body.dispatch_status != null && body.dispatch_status !== "en_attente") fail("INVALID_INITIAL_STATE", "\xC9tat de dispatch initial invalide.");
  const country = typeof body.country_code === "string" ? body.country_code.trim().toUpperCase() : grant.country_codes.length === 1 && body.country_code == null ? grant.country_codes[0] : "";
  if (!grant.country_codes.includes(country)) fail("COUNTRY_FORBIDDEN", "Pays non autoris\xE9.", 403);
  const data = {};
  for (const [key, max] of Object.entries(STRINGS)) {
    if (!own(body, key)) continue;
    const value = body[key];
    if (value === null) {
      data[key] = null;
      continue;
    }
    if (typeof value !== "string" || value.length > max) fail("INVALID_FIELD", "Champ invalide : " + key);
    data[key] = value.trim();
  }
  for (const [key, bounds] of Object.entries(NUMBERS)) {
    if (!own(body, key)) continue;
    const value = body[key];
    if (value === null) {
      data[key] = null;
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < bounds[0] || value > bounds[1] || key === "nb_passagers" && !Number.isInteger(value)) fail("INVALID_FIELD", "Champ num\xE9rique invalide : " + key);
    data[key] = value;
  }
  for (const [key, values] of Object.entries(ENUMS)) {
    if (!own(body, key) || body[key] == null) continue;
    if (!values.includes(body[key])) fail("INVALID_FIELD", "Choix invalide : " + key);
    data[key] = body[key];
  }
  if (own(body, "date_souhaitee") && body.date_souhaitee != null && body.date_souhaitee !== "") {
    if (typeof body.date_souhaitee !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(body.date_souhaitee) || !Number.isFinite(Date.parse(body.date_souhaitee))) fail("INVALID_FIELD", "Date invalide.");
    data.date_souhaitee = body.date_souhaitee;
  }
  if (!data.client_telephone) fail("CLIENT_PHONE_REQUIRED", "Le num\xE9ro du client est obligatoire pour cr\xE9er une course administrative.");
  if (!data.type_course || !data.adresse_depart) fail("REQUIRED_FIELD", "Type de course et adresse de d\xE9part obligatoires.");
  if (body.statut === "programmee" && !data.date_souhaitee) fail("INVALID_INITIAL_STATE", "Date obligatoire pour une course programm\xE9e.");
  if (body.dispatch_status === "en_attente") data.dispatch_status = "en_attente";
  return { ...data, source: "admin", country_code: country, enterprise_id: grant.enterprise_id, statut: body.statut || "nouvelle", pricing_mode: data.pricing_mode || "automatic" };
}
async function requireActiveCourseEnterprise(api, grant, countryCode) {
  if (!grant.enterprise_id) return null;
  let rows;
  try {
    rows = await api.asServiceRole.entities.Enterprise.filter({ enterprise_financier_id: grant.enterprise_id });
  } catch {
    fail("ENTERPRISE_VERIFICATION_UNAVAILABLE", "V\xE9rification entreprise indisponible.", 503);
  }
  if (!Array.isArray(rows) || rows.length !== 1) fail("ENTERPRISE_NOT_FOUND", "Entreprise non v\xE9rifi\xE9e.", 403);
  const ent = rows[0];
  if (ent.enterprise_financier_id !== grant.enterprise_id || ent.country_code !== countryCode || ent.actif !== true || ent.statut !== "actif") fail("ENTERPRISE_SUSPENDED_OR_SCOPE", "Entreprise inactive ou pays non autoris\xE9.", 403);
  return ent;
}
async function resolveNativeAdminCourseGrant(api, user, body) {
  if (!user?.id) fail("UNAUTHENTICATED", "Non autoris\xE9.", 401);
  if (user.role !== "admin") fail("FORBIDDEN_NO_ADMIN_COURSE_PERMISSION", "Administrateur non autoris\xE9.", 403);
  if (!record(body)) fail("INVALID_BODY", "Donn\xE9es de course invalides.");
  const country = typeof body.country_code === "string" ? body.country_code.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(country)) fail("COUNTRY_REQUIRED", "S\xE9lectionnez le pays de la course.");
  let rows;
  try {
    rows = await api.asServiceRole.entities.Country.filter({ code: country }, "created_date", 2);
  } catch {
    fail("COUNTRY_VERIFICATION_UNAVAILABLE", "V\xE9rification du pays indisponible.", 503);
  }
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.code !== country || rows[0]?.actif !== true) fail("COUNTRY_FORBIDDEN", "Pays inactif ou non v\xE9rifi\xE9.", 403);
  return Object.freeze({ user_id: user.id, action: "creerCourseAdmin", country_codes: Object.freeze([country]), enterprise_id: null });
}
async function createGuardedAdminCourse(api, user, body, rawGrants, prepareEco, captureOrigin = async (_decision, create) => create()) {
  const grant = user?.role === "admin" ? await resolveNativeAdminCourseGrant(api, user, body) : resolveCourseCreationGrant(user, "creerCourseAdmin", rawGrants);
  const data = sanitizeAdminCourse(body, grant);
  await requireActiveCourseEnterprise(api, grant, data.country_code);
  if (body.client_account_link?.mode === "confirmed" && ADMIN_CLIENT_LINK_CONFIG.creationEnabled !== true) throw new ClientLinkReviewError();
  const decision = await confirmAdminClientAccount(api, user, grant, data, body.client_account_link);
  const accountFields = adminAccountCourseFields(decision, user.id, data.type_course);
  const requested = data.delivery_mode;
  delete data.delivery_mode;
  const eco = await prepareEco(api, { ...data, delivery_mode: requested });
  const course = await captureOrigin(decision, () => api.asServiceRole.entities.CourseExterne.create({ ...data, ...eco, ...accountFields }));
  const linkedDecision = decision ? readPinnedAdminDecision(decision, user.id) : null;
  const client_account_link_result = linkedDecision?.mode === "linked" ? { mode: "linked", candidate: linkedDecision.candidate } : { mode: "unlinked" };
  return { success: true, course, client_account_link_result };
}
function courseCreationErrorResponse(error) {
  if (error instanceof ClientLinkReviewError) return Response.json({ error: error.message, code: error.code }, { status: 409 });
  if (error instanceof CourseCreationError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof SyntaxError) return Response.json({ error: "Corps JSON invalide.", code: "INVALID_BODY" }, { status: 400 });
  return Response.json({ error: "Cr\xE9ation non confirm\xE9e. V\xE9rifiez les courses avant de r\xE9essayer.", code: "CREATION_UNCERTAIN" }, { status: 500 });
}

// frozen:base44/functions/readAdminClientAccountPreview/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.57";
async function entry_default(req) {
  try {
    const api = createClientFromRequest(req), user = await api.auth.me();
    if (!user?.id) return Response.json({ error: "Non autoris\xE9", code: "UNAUTHENTICATED" }, { status: 401 });
    const body = await req.json();
    if (!body || Object.keys(body).some((k) => !["country_code", "client_telephone"].includes(k))) return Response.json({ error: "Donn\xE9es invalides" }, { status: 400 });
    const grant = user.role === "admin" ? await resolveNativeAdminCourseGrant(api, user, body) : resolveCourseCreationGrant(user, "creerCourseAdmin", Deno.env.get("ADMIN_COURSE_GRANTS_JSON"));
    const country = typeof body.country_code === "string" ? body.country_code.trim().toUpperCase() : "";
    if (!grant.country_codes.includes(country)) return Response.json({ code: "COUNTRY_FORBIDDEN" }, { status: 403 });
    await requireActiveCourseEnterprise(api, grant, country);
    if (!ADMIN_CLIENT_LINK_CONFIG.previewEnabled || !ADMIN_CLIENT_LINK_CONFIG.creationEnabled || !ADMIN_CLIENT_LINK_CONFIG.creationContractReady) return Response.json({ code: "CLIENT_LINK_PREVIEW_UNAVAILABLE" }, { status: 503 });
    const preview = await previewAdminClientAccount(api, grant, { country_code: country, enterprise_id: grant.enterprise_id, client_telephone: body.client_telephone });
    return Response.json({ success: true, protocol: ADMIN_CLIENT_LINK_CONFIG.protocol, creation_contract_ready: true, client_account_preview: publicAdminPreview(preview) });
  } catch (error) {
    return courseCreationErrorResponse(error);
  }
}
export {
  entry_default as default
};
