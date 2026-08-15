// ── Utilitaires FCM partagés entre les backend functions ──
// Extrait de diagnosticFirebasePush et envoiNotificationPushBatch pour éviter la duplication.

export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const FCM_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const FCM_API_BASE = 'https://fcm.googleapis.com/v1/projects';
export const APP_URL = 'https://silga-dispatch-go.base44.app';
export const ANDROID_CHANNEL_ID = 'silgapp_default';
export const ANDROID_CLICK_ACTION = 'OPEN_SILGAPP';

export function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, '\n');
  const base64 = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function signJwt(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iss: clientEmail, scope: FCM_SCOPE, aud: FCM_TOKEN_URL, iat: now, exp: now + 3600 };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToArrayBuffer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

export interface FirebaseConfig {
  source: string;
  projectId: string | undefined;
  clientEmail: string | undefined;
  privateKey: string | undefined;
}

export function getFirebaseConfig(): FirebaseConfig {
  const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (serviceAccountJson) {
    const sa = JSON.parse(serviceAccountJson);
    return {
      source: 'FIREBASE_SERVICE_ACCOUNT_JSON',
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    };
  }
  return {
    source: 'split-env-vars',
    projectId: Deno.env.get('FIREBASE_PROJECT_ID'),
    clientEmail: Deno.env.get('FIREBASE_CLIENT_EMAIL'),
    privateKey: Deno.env.get('FIREBASE_PRIVATE_KEY'),
  };
}

export async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const assertion = await signJwt(clientEmail, privateKey);
  const response = await fetch(FCM_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error_description || result.error || 'Unable to get Firebase access token');
  return result.access_token;
}

export async function sendFcmMessage(projectId: string, accessToken: string, token: string, payload: any) {
  const response = await fetch(`${FCM_API_BASE}/${projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, ...payload } }),
  });
  const result = await response.json();
  return { ok: response.ok, status: response.status, result };
}

export function tokenDateValue(item: any): number {
  const raw = item.derniere_utilisation || item.updated_date || item.created_date || '';
  const value = Date.parse(raw);
  return Number.isFinite(value) ? value : 0;
}

export function selectLatestNativeTokens(tokens: any[]): any[] {
  const latestByPlatform = new Map();
  for (const item of tokens) {
    const token = String(item.token || '');
    if (!token || token.startsWith('web_')) continue;
    const platform = String(item.platform || 'native').toLowerCase();
    const current = latestByPlatform.get(platform);
    if (!current || tokenDateValue(item) >= tokenDateValue(current)) {
      latestByPlatform.set(platform, item);
    }
  }
  return [...latestByPlatform.values()];
}

export function normalizeCountryCode(value: string): string {
  return String(value || '').trim().toUpperCase();
}
