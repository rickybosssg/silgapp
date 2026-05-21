/**
 * Détecte si l'app tourne dans un contexte Capacitor (APK Android/iOS).
 */
export const isCapacitor = () => {
  try {
    if (typeof window === 'undefined') return false;
    // Capacitor injecte window.Capacitor avec isNativePlatform
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      return true;
    }
    // Fallback : dans Capacitor la WebView utilise https://localhost
    if (window.location.hostname === 'localhost') {
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
};

/**
 * Récupère l'appId de façon sûre, sans importer app-params
 * pour éviter les dépendances circulaires ou crashes au boot.
 */
const getAppId = () => {
  try {
    // Depuis localStorage (stocké par app-params au premier chargement web)
    const stored = localStorage.getItem('base44_app_id');
    if (stored) return stored;
  } catch (e) { /* ignore */ }

  // Fallback : variable d'environnement Vite
  return import.meta.env.VITE_BASE44_APP_ID || '';
};

/**
 * Récupère l'URL de base Base44.
 */
const getAppBaseUrl = () => {
  try {
    const stored = localStorage.getItem('base44_app_base_url');
    if (stored) return stored;
  } catch (e) { /* ignore */ }
  return import.meta.env.VITE_BASE44_APP_BASE_URL || 'https://app.base44.com';
};

/**
 * Construit l'URL de login Base44 externe.
 * Le SDK fait window.location.href = "/login" (route interne inexistante dans Capacitor).
 */
const buildLoginUrl = (nextUrl) => {
  const appId = getAppId();
  const appBaseUrl = getAppBaseUrl();
  const returnUrl = nextUrl || (isCapacitor() ? 'https://localhost/' : window.location.href);
  return `${appBaseUrl}/login?app_id=${appId}&next=${encodeURIComponent(returnUrl)}`;
};

/**
 * Redirige vers la page de login Base44, compatible Capacitor et navigateur web.
 */
export const redirectToLogin = (nextUrl) => {
  try {
    const loginUrl = buildLoginUrl(nextUrl);
    window.location.href = loginUrl;
  } catch (e) {
    console.error('[authRedirect] Erreur redirection login:', e);
  }
};