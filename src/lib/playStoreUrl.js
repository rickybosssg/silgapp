// ═══════════════════════════════════════════════════════════════════════════
// playStoreUrl.js — Utilitaire partagé pour l'URL Google Play + attribution
// ═══════════════════════════════════════════════════════════════════════════
// Construit l'URL Google Play avec referrer encodé contenant l'attribution
// publicitaire (UTM + fbclid + Meta IDs) pour que l'app native puisse
// récupérer l'attribution via Google Play Install Referrer.
// ═══════════════════════════════════════════════════════════════════════════

const GOOGLE_PLAY_PACKAGE = 'com.base6a0ec08f3af5e1d1284254c1.app';
const GOOGLE_PLAY_BASE_URL = `https://play.google.com/store/apps/details?id=${GOOGLE_PLAY_PACKAGE}`;

/**
 * Construit l'URL Google Play avec le paramètre referrer encodé.
 * @param {Object} attribution - Paramètres d'attribution (utm_source, fbclid, meta_campaign_id, etc.)
 * @returns {string} URL Google Play complète avec referrer si attribution présente
 */
export function buildGooglePlayUrl(attribution = {}) {
  const params = {};
  if (attribution.utm_source) params.utm_source = attribution.utm_source;
  if (attribution.utm_medium) params.utm_medium = attribution.utm_medium;
  if (attribution.utm_campaign) params.utm_campaign = attribution.utm_campaign;
  if (attribution.utm_content) params.utm_content = attribution.utm_content;
  if (attribution.utm_term) params.utm_term = attribution.utm_term;
  if (attribution.fbclid) params.fbclid = attribution.fbclid;
  if (attribution.meta_campaign_id) params.meta_campaign_id = attribution.meta_campaign_id;
  if (attribution.meta_adset_id) params.meta_adset_id = attribution.meta_adset_id;
  if (attribution.meta_ad_id) params.meta_ad_id = attribution.meta_ad_id;

  const referrerStr = new URLSearchParams(params).toString();
  if (!referrerStr) return GOOGLE_PLAY_BASE_URL;
  return `${GOOGLE_PLAY_BASE_URL}&referrer=${encodeURIComponent(referrerStr)}`;
}

/**
 * Capture l'attribution depuis l'URL courante + localStorage (première attribution gagne).
 * @returns {Object} Attribution avec utm_source, utm_medium, utm_campaign, utm_content,
 *                   utm_term, fbclid, meta_campaign_id, meta_adset_id, meta_ad_id
 */
export function captureAttribution() {
  const urlParams = new URLSearchParams(window.location.search);
  const attribution = {};

  attribution.utm_source = urlParams.get('utm_source');
  attribution.utm_medium = urlParams.get('utm_medium');
  attribution.utm_campaign = urlParams.get('utm_campaign');
  attribution.utm_content = urlParams.get('utm_content');
  attribution.utm_term = urlParams.get('utm_term');
  attribution.fbclid = urlParams.get('fbclid');
  attribution.meta_campaign_id = urlParams.get('meta_campaign_id');
  attribution.meta_adset_id = urlParams.get('meta_adset_id');
  attribution.meta_ad_id = urlParams.get('meta_ad_id');

  // Compléter depuis localStorage (première attribution préservée)
  try {
    const stored = localStorage.getItem('silgapp_attribution');
    if (stored) {
      const parsed = JSON.parse(stored);
      for (const key of Object.keys(parsed)) {
        if (!attribution[key] && parsed[key]) {
          attribution[key] = parsed[key];
        }
      }
    }
  } catch {}

  return attribution;
}

/**
 * Stocke l'attribution dans localStorage si au moins un paramètre est présent.
 * La première attribution n'est JAMAIS écrasée par une revisite sans UTM.
 */
export function storeAttribution(attribution) {
  try {
    const hasAttribution = attribution.utm_source || attribution.utm_campaign ||
      attribution.fbclid || attribution.meta_campaign_id;
    if (hasAttribution) {
      const existing = localStorage.getItem('silgapp_attribution');
      if (!existing) {
        localStorage.setItem('silgapp_attribution', JSON.stringify({
          ...attribution,
          captured_at: new Date().toISOString(),
        }));
      }
    }
  } catch {}
}

export { GOOGLE_PLAY_BASE_URL, GOOGLE_PLAY_PACKAGE };