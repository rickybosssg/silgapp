// Public advertising only. Never include guest order capabilities or contact details.
export function safeAdHttps(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function publicGuestAd(row) {
  if (!row || typeof row.id !== 'string' || typeof row.titre !== 'string') return null;
  const text = (key, max) => typeof row[key] === 'string' ? row[key].slice(0, max) : '';
  const phone = key => /^\+?[0-9]{6,15}$/.test(row[key] || '') ? row[key] : '';
  return { id: text('id', 100), titre: text('titre', 160), description: text('description', 500),
    annonceur_nom: text('annonceur_nom', 100), type_media: ['image','video','texte'].includes(row.type_media) ? row.type_media : 'texte',
    media_url: safeAdHttps(row.media_url), lien_url: safeAdHttps(row.lien_url), lien_whatsapp: phone('lien_whatsapp'), lien_telephone: phone('lien_telephone') };
}
export async function loadGuestAdFeed(api, country = '') {
  if (country !== '' && !/^[A-Z]{2}$/.test(country)) throw Error('Pays invalide.');
  const response = await api.functions.invoke('guestAds', { action: 'list', country_code: country });
  const data = response?.data ?? response;
  if (data?.success !== true || !Array.isArray(data.ads)) throw Error('Publicités indisponibles.');
  return { ads: data.ads.slice(0, 12).map(publicGuestAd).filter(Boolean), trackingEnabled: data.tracking_enabled === true };
}
export function guestAdLink(ad) {
  if (ad.lien_whatsapp) return 'https://wa.me/' + ad.lien_whatsapp.replace(/\D/g, '');
  if (ad.lien_telephone) return 'tel:' + ad.lien_telephone;
  return safeAdHttps(ad.lien_url);
}

export async function loadGuestAds(api, country = '') { return (await loadGuestAdFeed(api, country)).ads; }
// One request only. No persistent identity, local storage, phone or private course token.
export async function sendGuestAdEvent(api, enabled, adId, country, kind, eventId) {
  if (enabled !== true) return false;
  if (!['affichage', 'clic'].includes(kind) || !/^[a-zA-Z0-9_-]{1,100}$/.test(adId) || !/^(?:[A-Z]{2})?$/.test(country) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(eventId)) return false;
  try { const result = await api.functions.invoke('guestAds', { action: 'event', publicite_id: adId, country_code: country, kind, event_id: eventId }); return (result?.data ?? result)?.success === true; } catch { return false; }
}
