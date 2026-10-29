export const GUEST_PREFIX = 'guest-v1:';
export const GUEST_CONTROL_KEY = 'GUEST_ORDERS_V1';
export const GUEST_CAPACITY = 200;
export const GUEST_ACCESS_MS = 7 * 24 * 60 * 60 * 1000;
export const isGuestCourse = course => typeof course?.request_id === 'string' && course.request_id.startsWith(GUEST_PREFIX);
export function guestError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status, guest_public: true });
}
export const failGuest = (code, message, status = 400) => { throw guestError(code, message, status); };
export const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(v => v.toString(16).padStart(2, '0')).join('');
export const validSecret = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const validRequest = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);

export function parseGuestLedger(control) {
  try {
    const ledger = JSON.parse(control?.ledger || '[]');
    if (!Array.isArray(ledger) || ledger.length > GUEST_CAPACITY || ledger.some(v => !validRequest(v?.request_id) || !validSecret(v.read_hash) || !validSecret(v.action_hash) || !validSecret(v.device_hash) || !Number.isFinite(Date.parse(v.expires_at)))) throw Error();
    return ledger;
  } catch { return failGuest('CONFIG_INVALID', 'Configuration des commandes sans compte indisponible.', 503); }
}

export function guestCreationEnabled(control) {
  if (control?.enabled !== true || control?.safety_reviewed !== true) return false;
  try { return Array.isArray(JSON.parse(control.audit)) && Array.isArray(JSON.parse(control.grants)); }
  catch { return false; }
}

// Only operational, public-network admins may read this module. Never trust a UI country.
export function guestAdminScope(user, requestedCountry = '') {
  if (!user?.id || user.role !== 'admin' || user.enterprise_id || user.data?.enterprise_id || user.silgapp_role === 'admin_entreprise') failGuest('FORBIDDEN', 'Accès administrateur public requis.', 403);
  if (user.admin_type === 'pays' || (!user.admin_type && user.country_code)) {
    if (!user.country_code || (requestedCountry && requestedCountry !== user.country_code)) failGuest('COUNTRY_SCOPE', 'Pays non autorisé.', 403);
    return user.country_code;
  }
  return requestedCountry;
}

export function guestSuperAdmin(user) {
  guestAdminScope(user);
  if (!(user.admin_type === 'global' || (!user.admin_type && !user.country_code)) || (user.silgapp_role && !['super_admin', 'superadmin'].includes(user.silgapp_role))) failGuest('FORBIDDEN', 'Super Admin requis.', 403);
}

export function normalizeGuestPhone(phone, country) {
  if (typeof phone !== 'string' || phone.length > 40 || !/^[+\d\s().-]+$/.test(phone)) failGuest('PHONE_INVALID', 'Numéro de téléphone invalide.');
  const dial = String(country.indicatif || '').replace(/^\+/, '');
  const min = Number(country.phone_min_length), max = Number(country.phone_max_length);
  if (!/^\d{1,4}$/.test(dial) || !Number.isInteger(min) || !Number.isInteger(max) || min <= 0 || max < min) failGuest('COUNTRY_CONFIG', 'Configuration du téléphone indisponible.', 503);
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if ((phone.trim().startsWith('+') || digits.length > max) && digits.startsWith(dial)) digits = digits.slice(dial.length);
  if (digits.length < min || digits.length > max || (country.phone_pattern && !new RegExp(country.phone_pattern).test(digits))) failGuest('PHONE_INVALID', 'Vérifiez le numéro et le pays.');
  return dial + digits;
}

export function validateGuestDraft(draft, country, depart, arrivee, phoneCountry = country) {
  const allowed = ['country_code', 'phone_country_code', 'depart_id', 'arrivee_id', 'prix', 'telephone', 'invitation_consent', 'confirmed'];
  if (!draft || Object.keys(draft).some(key => !allowed.includes(key))) failGuest('INVALID_FIELDS', 'Informations non autorisées.');
  if (draft.confirmed !== true) failGuest('CONFIRMATION_REQUIRED', 'Confirmez le récapitulatif.');
  if (country?.actif !== true || country.code !== draft.country_code || !/^[A-Z]{2}$/.test(country.code)) failGuest('COUNTRY_INVALID', 'Pays indisponible.');
  if (draft.invitation_consent !== false) failGuest('CONSENT_INVALID', 'Les invitations promotionnelles ne sont pas proposées.');
  if (!phoneCountry || phoneCountry.actif !== true || phoneCountry.code !== (draft.phone_country_code || country.code)) failGuest('PHONE_INVALID', 'Sélectionnez le pays du téléphone.');
  for (const q of [depart, arrivee]) {
    if (!q?.id || q.actif !== true || q.country_code !== country.code || !q.nom || !q.ville ||
        !Number.isFinite(q.latitude) || !Number.isFinite(q.longitude) || Math.abs(q.latitude) > 90 || Math.abs(q.longitude) > 180) failGuest('QUARTIER_INVALID', 'Sélectionnez un quartier valide dans ce pays.');
  }
  if (depart.id !== draft.depart_id || arrivee.id !== draft.arrivee_id) failGuest('QUARTIER_INVALID', 'Quartier incompatible.');
  const minimum = Number(country.prix_minimum);
  if (country.prix_minimum == null || !Number.isFinite(minimum) || minimum < 0 || !country.devise) failGuest('TARIFF_CONFIG', 'Configuration tarifaire indisponible.', 503);
  if (!Number.isSafeInteger(draft.prix) || draft.prix <= 0 || draft.prix < minimum) failGuest('PRICE_INVALID', 'Le prix proposé ne respecte pas le minimum configuré.');
  return { telephone: normalizeGuestPhone(draft.telephone, phoneCountry), prix: draft.prix };
}

export function guestCourseData(draft, country, depart, arrivee, phone, requestId) {
  return {
    request_id: GUEST_PREFIX + requestId, source: 'client', commande_vocale_express: true,
    country_code: country.code, enterprise_id: null, client_user_email: null,
    expediteur_client_id: null, destinataire_client_id: null, tracking_token: null, tracking_link: null,
    type_course: 'expedier', type_colis: 'petit_colis', delivery_mode: 'standard',
    client_nom: 'Client invité', expediteur_nom: 'Client invité', client_telephone: phone,
    contact_createur_course: phone, expediteur_telephone: phone,
    destinataire_nom: '', destinataire_telephone: '',
    adresse_depart: `${depart.nom} (${depart.ville}) — position approximative du quartier`,
    adresse_arrivee: `${arrivee.nom} (${arrivee.ville}) — position approximative du quartier`,
    quartier_depart: depart.nom, quartier_arrivee: arrivee.nom,
    ville_depart: depart.ville_operationnelle || depart.ville,
    ville_arrivee: arrivee.ville_operationnelle || arrivee.ville,
    gps_depart_lat: depart.latitude, gps_depart_lng: depart.longitude, gps_depart_source: 'quartier',
    gps_arrivee_lat: arrivee.latitude, gps_arrivee_lng: arrivee.longitude, gps_arrivee_source: 'quartier',
    prix_propose_client: draft.prix, pricing_mode: 'manual',
    statut: 'nouvelle', dispatch_status: 'en_attente', destination_inconnue: false,
  };
}

export function guestCanCancel(course) {
  return !course.livreur_id && !course.annulation_user_id && !course.heure_recuperation && !course.pickup_confirmed_at &&
    (['nouvelle', 'recherche_livreur', 'en_attente_decision_client'].includes(course.statut) ||
      (course.statut === 'en_attente' && course.client_decision_attendue === true));
}

// Never return course IDs, contact/account/financial internals, dispatch IDs or access hashes.
export function guestCourseView(course, currency) {
  const point = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  return {
    reference: course.reference || course.reference_course || null,
    statut: course.statut, dispatch_status: course.dispatch_status,
    assigned: !!course.livreur_id,
    depart: course.adresse_depart, arrivee: course.adresse_arrivee,
    depart_position: point(course.gps_depart_lat, course.gps_depart_lng),
    arrivee_position: point(course.gps_arrivee_lat, course.gps_arrivee_lng),
    prix: Number.isFinite(course.prix_final) ? course.prix_final : course.prix_propose_client,
    devise: currency, created_at: course.created_date || null,
    pickup_at: course.heure_recuperation || course.pickup_confirmed_at || null,
    delivered_at: course.heure_livraison || course.delivery_confirmed_at || null,
    decision_required: course.client_decision_attendue === true,
    price_decision_required: course.manual_price_status === 'pending_client_validation',
    can_cancel: guestCanCancel(course),
    delivered: course.statut === 'livree',
  };
}

export function guestDriverPosition(driver, course, now) {
  const date = Date.parse(driver?.derniere_position_date);
  if (!driver || driver.country_code !== course.country_code || driver.enterprise_id || driver.data?.enterprise_id || !Number.isFinite(date) || now - date > 120000 || date > now ||
      !Number.isFinite(driver.latitude) || !Number.isFinite(driver.longitude) || Math.abs(driver.latitude) > 90 || Math.abs(driver.longitude) > 180 ||
      !Number.isFinite(driver.gps_accuracy) || driver.gps_accuracy <= 0 || driver.gps_accuracy > 100) return null;
  return { lat: driver.latitude, lng: driver.longitude, acquired_at: driver.derniere_position_date };
}

export function invitationEligibility(entries, now) {
  const latest = [...entries].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  const last = entries.map(e => e.last_invitation_at).filter(Boolean).sort().at(-1) || null;
  const opposed = entries.some(e => e.opposed === true);
  return { eligible: !!latest?.invitation_consent && !opposed && (!last || now - Date.parse(last) >= 7 * 86400000),
    consent: latest?.invitation_consent === true, opposed, last_invitation_at: last, channel: 'whatsapp', result: latest?.invitation_result || 'not_sent', availability: 'Non disponible' };
}
