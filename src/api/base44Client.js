import { createClient } from '@base44/sdk';
import { APP_PUBLIC_URL, BASE44_APP_ID } from '@/lib/app-params';

// Lire les paramètres nécessaires sans importer appParams (singleton problématique)
const getAppId = () => {
  try {
    const stored = localStorage.getItem('base44_app_id');
    if (stored && stored !== 'null' && stored.length > 5) return stored;
  } catch(e) {}
  return import.meta.env.VITE_BASE44_APP_ID || BASE44_APP_ID;
};

const getFunctionsVersion = () => {
  try {
    const stored = localStorage.getItem('base44_functions_version');
    if (stored && stored !== 'null') return stored;
  } catch(e) {}
  return import.meta.env.VITE_BASE44_FUNCTIONS_VERSION || 'prod';
};

// Lire le token — chercher dans TOUTES les clés possibles que Base44 SDK pourrait utiliser
const getToken = () => {
  const keys = ['base44_access_token', 'access_token', 'base44_token', 'token'];
  for (const key of keys) {
    try {
      const t = localStorage.getItem(key);
      if (t && t !== 'null' && t !== 'undefined' && t.length > 10) {
        return t;
      }
    } catch(e) {}
  }
  // Fallback : lire depuis URL actuelle (si main.jsx n'a pas encore nettoyé)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const t = urlParams.get('access_token');
    if (t && t.length > 10) return t;
  } catch(e) {}
  return null;
};

const isCapacitor = () => {
  try {
    console.log('[base44Client] Check Capacitor:', !!(window.Capacitor));
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch(e) { 
    console.error('[base44Client] Erreur Capacitor:', e);
    return false; 
  }
};

console.log('[base44Client] === DÉBUT INITIALISATION ===');
let token = null;
let cap = false;
try {
  console.log('[base44Client] Appel getToken()...');
  token = getToken();
  console.log('[base44Client] Token trouvé:', token ? 'oui' : 'non', 'longueur:', token?.length);
  console.log('[base44Client] Appel isCapacitor()...');
  cap = isCapacitor();
  console.log('[base44Client] Mode Capacitor:', cap);
  console.log('[base44Client] === FIN INITIALISATION ===');
} catch (err) {
  console.error('[base44Client] ERREUR CRITIQUE INITIALISATION:', err);
  console.error('[base44Client] Stack:', err.stack);
  throw err;
}

// Sur Capacitor, pointer vers le domaine public pour que les appels API fonctionnent
const serverUrl = cap ? APP_PUBLIC_URL : '';
const appBaseUrl = APP_PUBLIC_URL;

export const base44 = createClient({
  appId: getAppId(),
  token,
  functionsVersion: getFunctionsVersion(),
  serverUrl,
  requiresAuth: false,
  appBaseUrl,
});

// Exposer le token détecté pour diagnostic
export const detectedToken = token;