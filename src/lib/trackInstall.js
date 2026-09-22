import { base44 } from "@/api/base44Client";

function getOrCreateDeviceId() {
  try {
    let deviceId = localStorage.getItem('silgapp_device_id');
    if (!deviceId) {
      deviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('silgapp_device_id', deviceId);
    }
    return deviceId;
  } catch {
    return 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

function detectPlatform() {
  const ua = (navigator.userAgent || '').toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  return 'web';
}

// ── Capture UTM depuis l'URL courante OU depuis le localStorage ──
// L'attribution initiale est stockée dans localStorage par la page /telecharger
// Lorsque l'app s'ouvre (PWA ou WebView), on récupère l'attribution stockée
function captureUtmAttribution() {
  const utm = {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    fbclid: null,
    meta_campaign_id: null,
    meta_adset_id: null,
    meta_ad_id: null,
  };

  // 1. D'abord, essayer l'URL courante (si l'app est ouverte via un lien avec UTM)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    utm.utm_source = urlParams.get('utm_source') || utm.utm_source;
    utm.utm_medium = urlParams.get('utm_medium') || utm.utm_medium;
    utm.utm_campaign = urlParams.get('utm_campaign') || utm.utm_campaign;
    utm.utm_content = urlParams.get('utm_content') || utm.utm_content;
    utm.utm_term = urlParams.get('utm_term') || utm.utm_term;
    utm.fbclid = urlParams.get('fbclid') || utm.fbclid;
    // Meta campaign ID peut être passé dans l'URL (deep link)
    utm.meta_campaign_id = urlParams.get('meta_campaign_id') || utm.meta_campaign_id;
    utm.meta_adset_id = urlParams.get('meta_adset_id') || utm.meta_adset_id;
    utm.meta_ad_id = urlParams.get('meta_ad_id') || utm.meta_ad_id;
  } catch {}

  // 2. Ensuite, essayer le localStorage (stocké par /telecharger)
  try {
    const stored = localStorage.getItem('silgapp_attribution');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Ne remplir que les champs non déjà présents dans l'URL
      utm.utm_source = utm.utm_source || parsed.utm_source || null;
      utm.utm_medium = utm.utm_medium || parsed.utm_medium || null;
      utm.utm_campaign = utm.utm_campaign || parsed.utm_campaign || null;
      utm.utm_content = utm.utm_content || parsed.utm_content || null;
      utm.utm_term = utm.utm_term || parsed.utm_term || null;
      utm.fbclid = utm.fbclid || parsed.fbclid || null;
      utm.meta_campaign_id = utm.meta_campaign_id || parsed.meta_campaign_id || null;
      utm.meta_adset_id = utm.meta_adset_id || parsed.meta_adset_id || null;
      utm.meta_ad_id = utm.meta_ad_id || parsed.meta_ad_id || null;
    }
  } catch {}

  // 3. Déterminer la source d'attribution
  const attribution_source =
    utm.utm_source === 'meta' || utm.utm_source === 'facebook' ? 'meta_ads' :
    utm.utm_source ? 'referral' :
    'direct';

  return { ...utm, attribution_source };
}

export async function trackAppInstall() {
  try {
    const deviceId = getOrCreateDeviceId();
    const platform = detectPlatform();
    let countryCode = '';
    try { countryCode = localStorage.getItem('silgapp_selected_country') || ''; } catch {}

    // Récupérer l'email utilisateur si authentifié (optionnel — ne bloque pas le tracking anonyme)
    let userEmail = null;
    try {
      const isAuth = await base44.auth.isAuthenticated();
      if (isAuth) {
        const user = await base44.auth.me();
        userEmail = user?.email || null;
      }
    } catch {
      // Non authentifié ou erreur — tracking anonyme continue
    }

    // Capturer l'attribution UTM/Meta
    const attribution = captureUtmAttribution();

    // Fire-and-forget avec timeout — un échec de tracking ne doit JAMAIS
    // bloquer l'ouverture de SILGAPP ni remonter comme erreur critique.
    const invokePromise = base44.functions.invoke('trackAppInstall', {
      device_id: deviceId,
      platform,
      country_code: countryCode,
      ...(userEmail ? { user_email: userEmail } : {}),
      ...attribution,
    });
    Promise.race([
      invokePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('trackAppInstall timeout')), 5000)),
    ]).catch(() => null);
  } catch {
    // Silencieux — le tracking d'installation n'est jamais bloquant
  }
}