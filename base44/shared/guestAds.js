/** Public-only projection. No client/profile/course access belongs in this module. */
const fail = (code, status = 400) => { throw Object.assign(new Error(code), { code, status, guestAdPublic: true }); };
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
export function guestAdHttps(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020]/.test(value)) return '';
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !host.includes('.') || host.endsWith('.') || host.endsWith('.internal') || host.endsWith('.home.arpa') || host.endsWith('.local') || host.endsWith('.localhost') || /^[\d.]+$/.test(host) || host.includes(':')) return '';
    return url.href;
  } catch { return ''; }
}
const phone = value => typeof value === 'string' && /^\+?[1-9]\d{6,14}$/.test(value) ? value : '';
export function guestAdEligible(ad, country, now = Date.now()) {
  if (!ad || ad.visible_invites !== true || ad.actif !== true || !['clients', 'tous'].includes(ad.cible) || ad.format !== 'carrousel' || ad.enterprise_id) return false;
  if (!['image', 'video', 'texte'].includes(ad.type_media)) return false;
  const moment = ad.moment_affichage || 'ouverture_app';
  if (!['ouverture_app', 'ouverture_et_recherche'].includes(moment)) {
    if (moment !== 'personnalise') return false;
    try { const values = JSON.parse(ad.moments_personnalises); if (!Array.isArray(values) || !values.includes('ouverture_app')) return false; } catch { return false; }
  }
  for (const key of ['date_debut', 'date_fin']) {
    if (ad[key] !== undefined && ad[key] !== null && ad[key] !== '') {
      if (typeof ad[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(ad[key]) || !Number.isFinite(Date.parse(ad[key]))) return false;
      const time = ad[key].slice(11, 19).split(':').map(Number);
      if (time[0] > 23 || time[1] > 59 || (Number.isFinite(time[2]) && time[2] > 59)) return false;
      const [year, month, day] = ad[key].slice(0, 10).split('-').map(Number);
      if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return false;
    }
  }
  if (ad.date_debut && Date.parse(ad.date_debut) > now) return false;
  if (ad.date_fin && Date.parse(ad.date_fin) <= now) return false;
  if (ad.date_debut && ad.date_fin && Date.parse(ad.date_debut) >= Date.parse(ad.date_fin)) return false;
  // Only the explicit global marker is global. Missing/malformed targeting is not permission.
  if (ad.pays_cibles !== 'tous') {
    if (!country) return false;
    try {
      const codes = JSON.parse(ad.pays_cibles);
      if (!Array.isArray(codes) || !codes.length || !codes.every(c => typeof c === 'string' && /^[A-Z]{2}$/.test(c)) || !codes.includes(country)) return false;
    } catch { return false; }
  }
  if (typeof ad.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(ad.id) || !text(ad.titre, 160).trim()) return false;
  if (ad.type_media !== 'texte' && !guestAdHttps(ad.media_url)) return false;
  return true;
}
export function guestAdView(ad) {
  return { id: ad.id, titre: text(ad.titre, 160), description: text(ad.description, 800), type_media: ad.type_media,
    media_url: ad.type_media === 'texte' ? '' : guestAdHttps(ad.media_url), lien_url: guestAdHttps(ad.lien_url),
    lien_telephone: phone(ad.lien_telephone), lien_whatsapp: phone(ad.lien_whatsapp), annonceur_nom: text(ad.annonceur_nom, 120) };
}
function input(body, event = false) {
  const keys = event ? ['action', 'country_code', 'publicite_id', 'event_id', 'kind'] : ['action', 'country_code'];
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => !keys.includes(k))) fail('INPUT_INVALID');
  const country = body.country_code === undefined ? '' : body.country_code;
  if (typeof country !== 'string' || (country !== '' && !/^[A-Z]{2}$/.test(country))) fail('COUNTRY_INVALID');
  return country;
}
/** recordEventAtomic must atomically enforce durable global/ad budgets AND event-id uniqueness,
 * then append an anonymous event, across all instances. No read-then-write implementation.
 * Production adapter deliberately absent until its store/rules/atomicity are verified. */
export function createGuestAdsService({ listAds, getAd, recordEventAtomic = null, metricsSafetyReviewed = false, now = () => Date.now() }) {
  const tracking = metricsSafetyReviewed === true && typeof recordEventAtomic === 'function';
  return async body => {
    if (body?.action === 'event') {
      const country = input(body, true);
      if (!['affichage', 'clic'].includes(body.kind) || typeof body.publicite_id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.publicite_id) || typeof body.event_id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.event_id)) fail('EVENT_INVALID');
      if (!tracking) fail('TRACKING_DISABLED', 503);
      const ad = await getAd(body.publicite_id);
      if (!ad || ad.id !== body.publicite_id || !guestAdEligible(ad, country, now())) fail('AD_UNAVAILABLE', 404);
      const outcome = await recordEventAtomic({ publicite_id: ad.id, event_id: body.event_id, kind: body.kind, country_code: country, at: new Date(now()).toISOString() });
      if (outcome !== 'recorded' && outcome !== 'duplicate') fail('RATE_LIMITED', 429);
      return { success: true, recorded: outcome === 'recorded' };
    }
    if (body?.action !== 'list') fail('ACTION_INVALID');
    const country = input(body);
    const rows = await listAds();
    if (!Array.isArray(rows)) fail('TEMPORARILY_UNAVAILABLE', 503);
    const ads = rows.filter(ad => guestAdEligible(ad, country, now()))
      .sort((a, b) => (Number.isFinite(a.ordre) ? a.ordre : 0) - (Number.isFinite(b.ordre) ? b.ordre : 0)).slice(0, 12).map(guestAdView);
    return { success: true, ads, tracking_enabled: tracking };
  };
}


