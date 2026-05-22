import { createClient } from '@base44/sdk';
import { appParams, APP_PUBLIC_URL, BASE44_SERVER_URL } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl, isCapacitor } = appParams;

// Dans Capacitor (APK), les URLs relatives ne fonctionnent pas.
const serverUrl = isCapacitor ? BASE44_SERVER_URL : '';

// Garantir que appBaseUrl n'est jamais null/undefined
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
