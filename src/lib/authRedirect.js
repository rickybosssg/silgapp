/**
 * URL publique de l'app Base44 publiée.
 * Utilisée comme returnUrl dans Capacitor car "localhost" n'est
 * pas résolvable depuis Chrome Android après une auth externe (Google).
 */
const APP_PUBLIC_URL = "https://silgapp.base44.app";
const BASE44_LOGIN_BASE = "https://app.base44.com";

/**
 * Détecte si l'app tourne dans un contexte Capacitor (APK Android/iOS).
 */
export const isCapacitor = () => {
  try {
    if (typeof window === 'undefined') return false;
    if (window.Capacitor?.isNativePlatform?.()) return true;
    if (window.location.hostname === 'localhost') return true;
    return false;
  } catch (e) {
    return false;
  }
};

const getAppId = () => {
  try {
    const stored = localStorage.getItem('base44_app_id');
    if (stored) return stored;
  } catch (e) { /* ignore */ }
  return import.meta.env.VITE_BASE44_APP_ID || '';
};

const getAppBaseUrl = () => {
  try {
    const stored = localStorage.getItem('base44_app_base_url');
    if (stored) return stored;
  } catch (e) { /* ignore */ }
  return import.meta.env.VITE_BASE44_APP_BASE_URL || BASE44_LOGIN_BASE;
};

/**
 * Redirige vers la page de login Base44.
 * - Capacitor : returnUrl = APP_PUBLIC_URL (URL résolvable depuis Chrome Android)
 * - Web       : returnUrl = window.location.href
 */
export const redirectToLogin = (nextUrl) => {
  try {
    const appId = getAppId();
    const appBaseUrl = getAppBaseUrl();

    if (!appId) {
      console.error('[authRedirect] appId manquant — redirection annulée');
      return;
    }

    // Dans Capacitor, ne jamais utiliser localhost ni window.location.href
    const returnUrl = nextUrl && !nextUrl.includes('localhost')
      ? nextUrl
      : (isCapacitor() ? APP_PUBLIC_URL : window.location.href);

    const loginUrl = `${appBaseUrl}/login?app_id=${encodeURIComponent(appId)}&next=${encodeURIComponent(returnUrl)}`;
    window.location.href = loginUrl;
  } catch (e) {
    console.error('[authRedirect] Erreur redirection login:', e);
  }
};