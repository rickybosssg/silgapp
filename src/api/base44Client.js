import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl, isCapacitor } = appParams;

// Dans Capacitor (APK), les URLs relatives ne fonctionnent pas.
const BASE44_SERVER = 'https://app.base44.com';
const serverUrl = isCapacitor ? BASE44_SERVER : '';

// Garantir que appBaseUrl n'est jamais null/undefined
const safeAppBaseUrl = (appBaseUrl && appBaseUrl !== 'null' && appBaseUrl !== 'undefined')
  ? appBaseUrl
  : BASE44_SERVER;

export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl,
  requiresAuth: false,
  appBaseUrl: safeAppBaseUrl,
});