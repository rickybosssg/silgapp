import { createClient } from '@base44/sdk';
import { appParams, APP_PUBLIC_URL } from '@/lib/app-params';

const { appId, functionsVersion, appBaseUrl, isCapacitor } = appParams;

// Lire le token DIRECTEMENT depuis localStorage pour éviter le bug du singleton :
// app-params est initialisé une fois — si access_token arrive dans l'URL après login,
// appParams.token peut être null alors que localStorage l'a déjà capturé.
const getToken = () => {
  try {
    const t = localStorage.getItem('base44_access_token');
    if (t && t !== 'null' && t !== 'undefined' && t.length > 10) return t;
  } catch(e) {}
  return appParams.token || null;
};

const serverUrl = isCapacitor ? APP_PUBLIC_URL : '';

const safeAppBaseUrl = (appBaseUrl && appBaseUrl !== 'null' && appBaseUrl !== 'undefined')
  ? appBaseUrl
  : APP_PUBLIC_URL;

export const base44 = createClient({
  appId,
  token: getToken(),
  functionsVersion,
  serverUrl,
  requiresAuth: false,
  appBaseUrl: safeAppBaseUrl,
});