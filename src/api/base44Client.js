import { createClient } from '@base44/sdk';
import { appParams, APP_PUBLIC_URL } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl, isCapacitor } = appParams;

// En mode Capacitor avec server.url, la WebView tourne sur le domaine public.
// Le SDK doit pointer vers ce même domaine pour les appels API/auth.
// En web normal (preview/prod), serverUrl vide = même origine.
const serverUrl = isCapacitor ? APP_PUBLIC_URL : '';

const safeAppBaseUrl = (appBaseUrl && appBaseUrl !== 'null' && appBaseUrl !== 'undefined')
  ? appBaseUrl
  : APP_PUBLIC_URL;

export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl,
  requiresAuth: false,
  appBaseUrl: safeAppBaseUrl,
});