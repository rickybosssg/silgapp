import { appParams } from '@/lib/app-params';

/**
 * Détecte si l'app tourne dans un contexte Capacitor (APK Android/iOS).
 * Dans ce cas, window.location est "https://localhost" et les routes internes
 * comme "/login" n'existent pas — il faut utiliser l'URL externe Base44.
 */
export const isCapacitor = () => {
  if (typeof window === 'undefined') return false;
  return (
    window.Capacitor !== undefined ||
    window.location.hostname === 'localhost' && window.location.protocol === 'https:'
  );
};

/**
 * Construit l'URL de login Base44 externe.
 * Le SDK fait "window.location.href = '/login'" (route interne),
 * ce qui cause un 404 dans la WebView Capacitor.
 * On construit ici l'URL absolue correcte.
 */
const buildLoginUrl = (nextUrl) => {
  const appId = appParams.appId;
  const appBaseUrl = appParams.appBaseUrl || 'https://app.base44.com';
  // L'URL de login Base44 redirige vers l'app après auth avec access_token
  const returnUrl = nextUrl || (isCapacitor() ? 'https://localhost/' : window.location.href);
  return `${appBaseUrl}/login?app_id=${appId}&next=${encodeURIComponent(returnUrl)}`;
};

/**
 * Redirige vers la page de login Base44 de façon compatible
 * avec la WebView Capacitor Android ET le navigateur web.
 *
 * - Dans Capacitor : navigue directement vers l'URL absolue Base44
 * - Sur le web : même chose (évite la route "/login" interne du SDK)
 */
export const redirectToLogin = (nextUrl) => {
  const loginUrl = buildLoginUrl(nextUrl);
  window.location.href = loginUrl;
};