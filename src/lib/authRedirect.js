/**
 * Détecte si l'app tourne dans un contexte Capacitor (APK Android/iOS).
 */
export const isCapacitor = () => {
  try {
    if (typeof window === 'undefined') return false;
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      return true;
    }
    // Capacitor sans plugin chargé : hostname = localhost
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
  return import.meta.env.VITE_BASE44_APP_BASE_URL || 'https://app.base44.com';
};

/**
 * Redirige vers la page de login Base44.
 * Dans Capacitor, le WebView charge directement l'URL Base44.
 * Après login, Base44 redirige via le paramètre `next`.
 * On utilise l'URL actuelle comme returnUrl (fonctionne sur localhost Capacitor).
 */
export const redirectToLogin = (nextUrl) => {
  try {
    const appId = getAppId();
    const appBaseUrl = getAppBaseUrl();
    const returnUrl = nextUrl || window.location.href;
    const loginUrl = `${appBaseUrl}/login?app_id=${appId}&next=${encodeURIComponent(returnUrl)}`;
    window.location.href = loginUrl;
  } catch (e) {
    console.error('[authRedirect] Erreur redirection login:', e);
  }
};