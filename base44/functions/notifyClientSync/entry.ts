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

// frozen:base44/shared/adminNotificationLink.js
async function resolveScopedNotificationClient(api, course, clientId, phone) {
  try {
    if (!course || !/^[A-Z]{2}$/.test(course.country_code)) return null;
    const enterprise = course.enterprise_id ?? null;
    if (clientId) {
      const p = await api.asServiceRole.entities.ClientExterne.get(clientId);
      if (p?.id !== clientId || p.actif !== true || p.country_code !== course.country_code || (p.enterprise_id ?? null) !== enterprise || !p.user_email) return null;
      const users = await api.asServiceRole.entities.User.filter({ email: p.user_email }, "id", 2, 0, ["id", "email", "country_code", "enterprise_id"]);
      if (!Array.isArray(users) || users.length !== 1 || !users[0]?.id || users[0].email !== p.user_email || (users[0].enterprise_id ?? null) !== enterprise || users[0].country_code != null && users[0].country_code !== course.country_code) return null;
      return p;
    }
    if (!phone) return null;
    const preview = await previewAdminClientAccount(api, { country_codes: [course.country_code], enterprise_id: enterprise }, { country_code: course.country_code, enterprise_id: enterprise, client_telephone: phone });
    return preview.status === "linked" ? preview._resolved.profile : null;
  } catch {
    return null;
  }
}
async function claimScopedCounterpartyLink(api, course, field, profileId) {
  if (!["destinataire_client_id", "expediteur_client_id"].includes(field) || !course?.id || !course.updated_date || course[field]) return false;
  try {
    const result2 = await api.asServiceRole.entities.CourseExterne.updateMany({ id: course.id, updated_date: course.updated_date, country_code: course.country_code, $or: [{ [field]: null }, { [field]: "" }, { [field]: { $exists: false } }] }, { $set: { [field]: profileId, ...field === "destinataire_client_id" ? { recipient_has_app: true } : {} } });
    return result2?.updated === 1 && result2?.has_more !== true;
  } catch {
    return false;
  }
}

// frozen:base44/shared/guestOrderPolicy.js
var GUEST_PREFIX = "guest-v1:";
var GUEST_CONTROL_KEY = "GUEST_ORDERS_V1";
var GUEST_CAPACITY = 200;
var GUEST_ACCESS_MS = 7 * 24 * 60 * 60 * 1e3;
var isGuestCourse = (course) => typeof course?.request_id === "string" && course.request_id.startsWith(GUEST_PREFIX);
function guestError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status, guest_public: true });
}
var failGuest = (code, message, status = 400) => {
  throw guestError(code, message, status);
};
var sha256 = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((v) => v.toString(16).padStart(2, "0")).join("");
var validSecret = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
var validRequest = (value) => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
function parseGuestLedger(control) {
  try {
    const ledger = JSON.parse(control?.ledger || "[]");
    if (!Array.isArray(ledger) || ledger.length > GUEST_CAPACITY || ledger.some((v) => !validRequest(v?.request_id) || !validSecret(v.read_hash) || !validSecret(v.action_hash) || !validSecret(v.device_hash) || !Number.isFinite(Date.parse(v.expires_at)))) throw Error();
    return ledger;
  } catch {
    return failGuest("CONFIG_INVALID", "Configuration des commandes sans compte indisponible.", 503);
  }
}
function guestCreationEnabled(control) {
  if (control?.enabled !== true || control?.safety_reviewed !== true) return false;
  try {
    return Array.isArray(JSON.parse(control.audit)) && Array.isArray(JSON.parse(control.grants));
  } catch {
    return false;
  }
}
function guestAdminScope(user, requestedCountry = "") {
  if (!user?.id || user.role !== "admin" || user.enterprise_id || user.data?.enterprise_id || user.silgapp_role === "admin_entreprise") failGuest("FORBIDDEN", "Acc\xE8s administrateur public requis.", 403);
  if (user.admin_type === "pays" || !user.admin_type && user.country_code) {
    if (!user.country_code || requestedCountry && requestedCountry !== user.country_code) failGuest("COUNTRY_SCOPE", "Pays non autoris\xE9.", 403);
    return user.country_code;
  }
  return requestedCountry;
}
function guestSuperAdmin(user) {
  guestAdminScope(user);
  if (!(user.admin_type === "global" || !user.admin_type && !user.country_code) || user.silgapp_role && !["super_admin", "superadmin"].includes(user.silgapp_role)) failGuest("FORBIDDEN", "Super Admin requis.", 403);
}
function normalizeGuestPhone(phone, country) {
  if (typeof phone !== "string" || phone.length > 40 || !/^[+\d\s().-]+$/.test(phone)) failGuest("PHONE_INVALID", "Num\xE9ro de t\xE9l\xE9phone invalide.");
  const dial = String(country.indicatif || "").replace(/^\+/, "");
  const min = Number(country.phone_min_length), max = Number(country.phone_max_length);
  if (!/^\d{1,4}$/.test(dial) || !Number.isInteger(min) || !Number.isInteger(max) || min <= 0 || max < min) failGuest("COUNTRY_CONFIG", "Configuration du t\xE9l\xE9phone indisponible.", 503);
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if ((phone.trim().startsWith("+") || digits.length > max) && digits.startsWith(dial)) digits = digits.slice(dial.length);
  if (digits.length < min || digits.length > max || country.phone_pattern && !new RegExp(country.phone_pattern).test(digits)) failGuest("PHONE_INVALID", "V\xE9rifiez le num\xE9ro et le pays.");
  return dial + digits;
}
function validateGuestDraft(draft, country, depart, arrivee, phoneCountry = country) {
  const allowed = ["country_code", "phone_country_code", "depart_id", "arrivee_id", "prix", "telephone", "invitation_consent", "confirmed"];
  if (!draft || Object.keys(draft).some((key) => !allowed.includes(key))) failGuest("INVALID_FIELDS", "Informations non autoris\xE9es.");
  if (draft.confirmed !== true) failGuest("CONFIRMATION_REQUIRED", "Confirmez le r\xE9capitulatif.");
  if (country?.actif !== true || country.code !== draft.country_code || !/^[A-Z]{2}$/.test(country.code)) failGuest("COUNTRY_INVALID", "Pays indisponible.");
  if (draft.invitation_consent !== false) failGuest("CONSENT_INVALID", "Les invitations promotionnelles ne sont pas propos\xE9es.");
  if (!phoneCountry || phoneCountry.actif !== true || phoneCountry.code !== (draft.phone_country_code || country.code)) failGuest("PHONE_INVALID", "S\xE9lectionnez le pays du t\xE9l\xE9phone.");
  for (const q of [depart, arrivee]) {
    if (!q?.id || q.actif !== true || q.country_code !== country.code || !q.nom || !q.ville || !Number.isFinite(q.latitude) || !Number.isFinite(q.longitude) || Math.abs(q.latitude) > 90 || Math.abs(q.longitude) > 180) failGuest("QUARTIER_INVALID", "S\xE9lectionnez un quartier valide dans ce pays.");
  }
  if (depart.id !== draft.depart_id || arrivee.id !== draft.arrivee_id) failGuest("QUARTIER_INVALID", "Quartier incompatible.");
  const minimum = Number(country.prix_minimum);
  if (country.prix_minimum == null || !Number.isFinite(minimum) || minimum < 0 || !country.devise) failGuest("TARIFF_CONFIG", "Configuration tarifaire indisponible.", 503);
  if (!Number.isSafeInteger(draft.prix) || draft.prix <= 0 || draft.prix < minimum) failGuest("PRICE_INVALID", "Le prix propos\xE9 ne respecte pas le minimum configur\xE9.");
  return { telephone: normalizeGuestPhone(draft.telephone, phoneCountry), prix: draft.prix };
}
function guestCourseData(draft, country, depart, arrivee, phone, requestId) {
  return {
    request_id: GUEST_PREFIX + requestId,
    source: "client",
    commande_vocale_express: true,
    country_code: country.code,
    enterprise_id: null,
    client_user_email: null,
    expediteur_client_id: null,
    destinataire_client_id: null,
    tracking_token: null,
    tracking_link: null,
    type_course: "expedier",
    type_colis: "petit_colis",
    delivery_mode: "standard",
    client_nom: "Client invit\xE9",
    expediteur_nom: "Client invit\xE9",
    client_telephone: phone,
    contact_createur_course: phone,
    expediteur_telephone: phone,
    destinataire_nom: "",
    destinataire_telephone: "",
    adresse_depart: `${depart.nom} (${depart.ville}) \u2014 position approximative du quartier`,
    adresse_arrivee: `${arrivee.nom} (${arrivee.ville}) \u2014 position approximative du quartier`,
    quartier_depart: depart.nom,
    quartier_arrivee: arrivee.nom,
    ville_depart: depart.ville_operationnelle || depart.ville,
    ville_arrivee: arrivee.ville_operationnelle || arrivee.ville,
    gps_depart_lat: depart.latitude,
    gps_depart_lng: depart.longitude,
    gps_depart_source: "quartier",
    gps_arrivee_lat: arrivee.latitude,
    gps_arrivee_lng: arrivee.longitude,
    gps_arrivee_source: "quartier",
    prix_propose_client: draft.prix,
    pricing_mode: "manual",
    statut: "nouvelle",
    dispatch_status: "en_attente",
    destination_inconnue: false
  };
}
function guestCanCancel(course) {
  return !course.livreur_id && !course.annulation_user_id && !course.heure_recuperation && !course.pickup_confirmed_at && (["nouvelle", "recherche_livreur", "en_attente_decision_client"].includes(course.statut) || course.statut === "en_attente" && course.client_decision_attendue === true);
}
function guestCourseView(course, currency) {
  const point = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  return {
    reference: course.reference || course.reference_course || null,
    statut: course.statut,
    dispatch_status: course.dispatch_status,
    assigned: !!course.livreur_id,
    depart: course.adresse_depart,
    arrivee: course.adresse_arrivee,
    depart_position: point(course.gps_depart_lat, course.gps_depart_lng),
    arrivee_position: point(course.gps_arrivee_lat, course.gps_arrivee_lng),
    prix: Number.isFinite(course.prix_final) ? course.prix_final : course.prix_propose_client,
    devise: currency,
    created_at: course.created_date || null,
    pickup_at: course.heure_recuperation || course.pickup_confirmed_at || null,
    delivered_at: course.heure_livraison || course.delivery_confirmed_at || null,
    decision_required: course.client_decision_attendue === true,
    price_decision_required: course.manual_price_status === "pending_client_validation",
    can_cancel: guestCanCancel(course),
    delivered: course.statut === "livree"
  };
}
function guestDriverPosition(driver, course, now) {
  const date = Date.parse(driver?.derniere_position_date);
  if (!driver || driver.country_code !== course.country_code || driver.enterprise_id || driver.data?.enterprise_id || !Number.isFinite(date) || now - date > 12e4 || date > now || !Number.isFinite(driver.latitude) || !Number.isFinite(driver.longitude) || Math.abs(driver.latitude) > 90 || Math.abs(driver.longitude) > 180 || !Number.isFinite(driver.gps_accuracy) || driver.gps_accuracy <= 0 || driver.gps_accuracy > 100) return null;
  return { lat: driver.latitude, lng: driver.longitude, acquired_at: driver.derniere_position_date };
}
function invitationEligibility(entries, now) {
  const latest = [...entries].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  const last = entries.map((e) => e.last_invitation_at).filter(Boolean).sort().at(-1) || null;
  const opposed = entries.some((e) => e.opposed === true);
  return {
    eligible: !!latest?.invitation_consent && !opposed && (!last || now - Date.parse(last) >= 7 * 864e5),
    consent: latest?.invitation_consent === true,
    opposed,
    last_invitation_at: last,
    channel: "whatsapp",
    result: latest?.invitation_result || "not_sent",
    availability: "Non disponible"
  };
}

// frozen:base44/functions/notifyClientSync/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
function buildNotificationContent(course, recipientRole) {
  const expediteurNom = course.expediteur_nom || "Quelqu'un";
  const destinataireNom = course.destinataire_nom || "votre destinataire";
  const livreurNom = course.livreur_nom || "Le livreur";
  const statut = course.statut;
  if (recipientRole === "destinataire" && statut === "recherche_livreur") {
    return {
      titre: `Colis de ${expediteurNom}`,
      message: `Appuyez pour voir les details de la livraison.`,
      type: "nouvelle_course"
    };
  }
  if (recipientRole === "expediteur" && statut === "recherche_livreur") {
    return {
      titre: `Demande de recuperation`,
      message: `${destinataireNom} attend un colis de votre part via SILGAPP.`,
      type: "nouvelle_course"
    };
  }
  if (statut === "livreur_en_route") {
    return {
      titre: `Livreur trouve`,
      message: `${livreurNom} est en route pour recuperer le colis.`,
      type: "course_assignee"
    };
  }
  if (statut === "colis_recupere" || statut === "en_livraison") {
    return {
      titre: `Colis recupere`,
      message: `${livreurNom} a recupere le colis. La livraison est en cours.`,
      type: "colis_recupere"
    };
  }
  if (statut === "livree") {
    return {
      titre: `Colis livre avec succes`,
      message: `${livreurNom} a livre votre colis. Appuyez pour voir le recapitulatif.`,
      type: "course_livree"
    };
  }
  if (statut === "annulee") {
    return {
      titre: `Course annulee`,
      message: `La course a ete annulee. Appuyez pour voir les details.`,
      type: "course_annulee"
    };
  }
  return null;
}
Deno.serve(async (req) => {
  try {
    let phoneVariants = function(num) {
      const n = (num || "").replace(/\D/g, "");
      if (!n) return [n];
      const variants = /* @__PURE__ */ new Set([n]);
      for (const { code, len } of COUNTRY_DIALCODES) {
        if (n.startsWith(code) && n.length === code.length + len) {
          variants.add(n.slice(code.length));
        }
        if (n.length === len && !n.startsWith("0")) {
          variants.add(code + n);
        }
        if (n.startsWith("0") && n.length === len + 1) {
          variants.add(n.slice(1));
          variants.add(code + n.slice(1));
        }
      }
      return [...variants];
    };
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const courseId = payload.event?.entity_id || payload.course_id || payload.data?.id;
    if (!courseId) {
      console.error("[notifyClientSync] course_id manquant");
      return Response.json({ error: "course_id manquant" }, { status: 400 });
    }
    const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
    if (isGuestCourse(course)) return Response.json({ success: true, skipped: true, reason: "guest_private_tracking" });
    if (!course) {
      return Response.json({ error: "Course non trouv\xE9e" }, { status: 404 });
    }
    const countryList = await base44.asServiceRole.entities.Country.filter({ actif: true }).catch(() => []);
    const COUNTRY_DIALCODES = (countryList || []).map((c) => ({
      code: String(c.indicatif || "").replace(/^\+/, "").replace(/\s/g, ""),
      len: c.format_numero ? parseInt(c.format_numero.replace(/\D/g, "").length) || 8 : 8
    })).filter((c) => c.code);
    const resolveClient = (clientId, telephone) => resolveScopedNotificationClient(base44, course, clientId, telephone);
    const createNotifIfNotExists = async (userEmail, recipientRole) => {
      const content = buildNotificationContent(course, recipientRole);
      if (!content) {
        console.log(`[notifyClientSync] Statut ignore pour ${userEmail} (statut=${course.statut}, course=${course.id})`);
        return null;
      }
      const existing = await base44.asServiceRole.entities.Notification.filter({
        course_id: course.id,
        destinataire_email: userEmail,
        type: content.type
      });
      if (existing?.length > 0) {
        console.log(`[notifyClientSync] \u23ED Doublon \xE9vit\xE9 pour ${userEmail} (type=${content.type}, course=${course.id})`);
        if (existing.length > 1) {
          const sorted = existing.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
          for (let i = 1; i < sorted.length; i++) {
            await base44.asServiceRole.entities.Notification.delete(sorted[i].id);
            console.log(`[notifyClientSync] Doublon supprim\xE9: ${sorted[i].id}`);
          }
        }
        return null;
      }
      const notif = await base44.asServiceRole.entities.Notification.create({
        titre: content.titre,
        message: content.message,
        type: content.type,
        course_id: course.id,
        destinataire_email: userEmail,
        lue: false
      });
      console.log(`[notifyClientSync] Notif cr\xE9\xE9e pour ${userEmail}: "${content.titre}"`);
      try {
        await base44.functions.invoke("envoiNotificationPush", {
          destinataire_email: userEmail,
          titre: content.titre,
          message: content.message,
          type: content.type,
          course_id: course.id
        });
        console.log(`[notifyClientSync] Push FCM envoy\xE9 \xE0 ${userEmail}`);
      } catch (pushErr) {
        console.warn(`[notifyClientSync] Push FCM \xE9chou\xE9 (non bloquant): ${pushErr.message}`);
      }
      return notif;
    };
    const notifications = [];
    if (course.type_course === "expedier") {
      const dest = await resolveClient(course.destinataire_client_id, course.destinataire_telephone);
      if (dest?.user_email) {
        if (!course.destinataire_client_id) {
          if (!await claimScopedCounterpartyLink(base44, course, "destinataire_client_id", dest.id)) return Response.json({ success: true, notifications_created: notifications.length, skipped: "counterparty_link_changed" });
        }
        const notif = await createNotifIfNotExists(dest.user_email, "destinataire");
        if (notif) notifications.push(notif);
      }
    }
    if (course.type_course === "recevoir") {
      const exped = await resolveClient(course.expediteur_client_id, course.expediteur_telephone);
      if (exped?.user_email) {
        if (!course.expediteur_client_id) {
          if (!await claimScopedCounterpartyLink(base44, course, "expediteur_client_id", exped.id)) return Response.json({ success: true, notifications_created: notifications.length, skipped: "counterparty_link_changed" });
        }
        const notif = await createNotifIfNotExists(exped.user_email, "expediteur");
        if (notif) notifications.push(notif);
      }
    }
    return Response.json({ success: true, notifications_created: notifications.length });
  } catch (error) {
    console.error("[notifyClientSync] Erreur:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
