/**
 * authRedirect.js — redirection login Base44
 * RÈGLE ABSOLUE : ne jamais construire une URL avec localhost, null, undefined.
 * Toutes les URLs sont hardcodées ou validées avant utilisation.
 */

const BASE44_LOGIN_URL = "https://app.base44.com/login";
const APP_PUBLIC_URL = "https://silgapp.base44.app";
const INVALID_PATTERNS = ["localhost", "null", "undefined", "silgaapp"];

const isUrlSafe = (url) => {
  if (!url || typeof url !== "string") return false;
  return !INVALID_PATTERNS.some((p) => url.includes(p));
};

export const isCapacitor = () => {
  try {
    if (typeof window === "undefined") return false;
    if (window.Capacitor?.isNativePlatform?.()) return true;
    if (window.location.hostname === "localhost") return true;
    return false;
  } catch (e) {
    return false;
  }
};

/**
 * Construit et retourne l'URL de login Base44.
 * Dans Capacitor : returnUrl = APP_PUBLIC_URL (jamais localhost).
 * En web : returnUrl = window.location.href si valide, sinon APP_PUBLIC_URL.
 */
export const getLoginUrl = () => {
  const appId = import.meta.env.VITE_BASE44_APP_ID || "silgapp";

  if (!appId || !isUrlSafe(appId)) {
    console.error("[authRedirect] VITE_BASE44_APP_ID invalide:", appId);
    return null;
  }

  let returnUrl;
  if (isCapacitor()) {
    returnUrl = APP_PUBLIC_URL;
  } else {
    const href = typeof window !== "undefined" ? window.location.href : APP_PUBLIC_URL;
    returnUrl = isUrlSafe(href) ? href : APP_PUBLIC_URL;
  }

  return `${BASE44_LOGIN_URL}?app_id=${encodeURIComponent(appId)}&next=${encodeURIComponent(returnUrl)}`;
};

export const redirectToLogin = () => {
  const url = getLoginUrl();
  if (!url) {
    console.error("[authRedirect] URL de login invalide — redirection annulée");
    return;
  }
  console.log("[authRedirect] Redirection vers:", url);
  window.location.href = url;
};