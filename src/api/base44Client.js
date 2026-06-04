import { createClient } from '@base44/sdk';
import { APP_PUBLIC_URL, BASE44_APP_ID } from '@/lib/app-params';

// Sur Capacitor, écouter les deep links entrants (retour OAuth après login)
// Base44 redirige vers https://silga-dispatch-go.base44.app/?access_token=XXX
// Le plugin @capacitor/app intercepte cette URL et la passe ici
(async () => {
  try {
    if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
      const { App } = await import('@capacitor/app');
      App.addListener('appUrlOpen', (data) => {
        console.log('[DeepLink] URL reçue:', data.url);
        try {
          const url = new URL(data.url);
          const token = url.searchParams.get('access_token');
          if (token && token.length > 10 && token !== 'null') {
            console.log('[DeepLink] Token capturé, stockage...');
            localStorage.setItem('base44_access_token', token);
            localStorage.setItem('access_token', token);
            // Recharger l'app pour que createClient() récupère le token
            window.location.href = '/';
          }
        } catch (e) {
          console.error('[DeepLink] Erreur parsing URL:', e);
        }
      });
      console.log('[DeepLink] Listener appUrlOpen installé');
    }
  } catch (e) {
    console.warn('[DeepLink] Impossible d\'installer le listener:', e);
  }
})();

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
  // Fallback : lire depuis URL actuelle
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

const clientConfig = {
  appId: getAppId(),
  functionsVersion: getFunctionsVersion(),
  serverUrl,
  requiresAuth: false,
  appBaseUrl,
};

export const base44 = createClient({
  ...clientConfig,
  token,
});

// Exposer le token détecté pour diagnostic
export const detectedToken = token;

/**
 * Réinitialise le client Base44 avec le token présent dans localStorage.
 * Utilisé par AuthGate pour éviter un window.location.reload() après login.
 * Retourne le token trouvé, ou null si aucun token disponible.
 */
export const reinitClientWithStoredToken = () => {
  const freshToken = getToken();
  console.log('[base44Client] reinitClientWithStoredToken — token:', freshToken ? 'trouvé' : 'absent');
  if (freshToken) {
    try {
      // Le SDK Base44 expose setToken() pour mettre à jour le token sans recréer le client
      if (typeof base44.auth?.setToken === 'function') {
        base44.auth.setToken(freshToken);
        console.log('[base44Client] setToken() appelé avec succès');
      } else {
        // Fallback : écrire directement sur l'objet interne si setToken n'existe pas
        base44._token = freshToken;
        console.log('[base44Client] _token mis à jour directement');
      }
    } catch(e) {
      console.error('[base44Client] Erreur reinit:', e);
    }
  }
  return freshToken;
};