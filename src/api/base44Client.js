import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl, isCapacitor } = appParams;

// Dans Capacitor (APK), les URLs relatives ne fonctionnent pas.
// Il faut pointer vers le serveur Base44 explicitement.
const BASE44_SERVER = 'https://app.base44.com';
const serverUrl = isCapacitor ? BASE44_SERVER : '';

export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl,
  requiresAuth: false,
  appBaseUrl: appBaseUrl || BASE44_SERVER,
});