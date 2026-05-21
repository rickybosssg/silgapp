/**
 * Détecte si l'app tourne dans un contexte Capacitor (APK Android/iOS).
 * Avec capacitor.config.json hostname="silgaapp", l'URL WebView sera
 * https://silgaapp/ au lieu de https://localhost/
 */
export const isCapacitor = () => {
  try {
    if (typeof window === 'undefined') return false;
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      return true;
    }
    // hostname "silgaapp" (notre config) ou "localhost" (fallback Capacitor)
    const host = window.location.hostname;
    if (host === 'localhost' || host === 'silgaapp') return true;
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
  return import.meta.env.VITE_BASE44_APP_BASE_URL || 'https://app.base44.com';
};

/**
 * Redirige vers la page de login Base44.
 * Compatible Capacitor (URL absolue) et navigateur web.
 * Le SDK base44 fait window.location.href = "/login" (route interne inexistante dans l'APK).
 */
export const redirectToLogin = (nextUrl) => {
  try {
    const appId = getAppId();
    const appBaseUrl = getAppBaseUrl();
    // Dans l'APK, retourner sur l'app après login via le hostname configuré
    const returnUrl = nextUrl || (isCapacitor() ? 'https://silgaapp/' : window.location.href);
    const loginUrl = `${appBaseUrl}/login?app_id=${appId}&next=${encodeURIComponent(returnUrl)}`;
    window.location.href = loginUrl;
  } catch (e) {
    console.error('[authRedirect] Erreur redirection login:', e);
  }
};