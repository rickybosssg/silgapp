// ═══════════════════════════════════════════════════════════════════════
// VENUS Admin Push Engine — Envoi de notifications push P0/P1
// Réutilise l'infrastructure FCM existante (même logique que fcmUtils.ts)
// Non-bloquant : un échec FCM n'impacte jamais SILGAPP
// ═══════════════════════════════════════════════════════════════════════

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_API_BASE = 'https://fcm.googleapis.com/v1/projects';
const APP_URL = 'https://silga-dispatch-go.base44.app';
const ANDROID_CHANNEL_ID = 'silgapp_default';
const ANDROID_CLICK_ACTION = 'OPEN_SILGAPP';

// ── FCM utilities (inline — mêmes fonctions que fcmUtils.ts) ──

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
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

async function signJwt(clientEmail: string, privateKey: string): Promise<string> {
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

function getFirebaseConfig() {
  const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (serviceAccountJson) {
    const sa = JSON.parse(serviceAccountJson);
    return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key };
  }
  return {
    projectId: Deno.env.get('FIREBASE_PROJECT_ID'),
    clientEmail: Deno.env.get('FIREBASE_CLIENT_EMAIL'),
    privateKey: Deno.env.get('FIREBASE_PRIVATE_KEY'),
  };
}

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
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

async function sendFcmMessage(projectId: string, accessToken: string, token: string, payload: any) {
  const response = await fetch(`${FCM_API_BASE}/${projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, ...payload } }),
  });
  const result = await response.json();
  return { ok: response.ok, status: response.status, result };
}

function tokenDateValue(item: any): number {
  const raw = item.derniere_utilisation || item.updated_date || item.created_date || '';
  const value = Date.parse(raw);
  return Number.isFinite(value) ? value : 0;
}

function selectLatestNativeTokens(tokens: any[]): any[] {
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

// ── Push Engine ──

export interface PushInsight {
  id: string;
  type: string;
  priority: 'haute' | 'moyenne' | 'basse';
  observation: string;
  course_ids?: string[];
  livreur_ids?: string[];
}

/**
 * Mappe un type d'insight vers une URL de deep link.
 */
function getActionUrl(insight: PushInsight): string {
  const courseRelatedTypes = [
    'annulation_hausse', 'volume_courses', 'courses_problematiques',
    'dispatch_retard', 'commission_anomalie',
  ];
  if (courseRelatedTypes.includes(insight.type)) return '/courses';
  if (insight.type === 'livreurs_dispo_baisse') return '/livreurs';
  return '/admin/venus';
}

/**
 * Règle : uniquement P0 (haute) et P1 (moyenne). P2/P3 → jamais de push.
 */
export function shouldPush(insight: PushInsight): boolean {
  return insight.priority === 'haute' || insight.priority === 'moyenne';
}

/**
 * Envoie un push VENUS Admin à un administrateur.
 * - Déduplication : un push par insight par jour
 * - Non-bloquant : catch toutes les erreurs
 * - Journalise les échecs
 */
export async function sendVenusAdminPush(
  base44: any,
  params: {
    adminEmail: string;
    insight: PushInsight;
  }
): Promise<{ sent: boolean; skipped: boolean; reason?: string }> {
  const { adminEmail, insight } = params;

  if (!shouldPush(insight)) {
    return { sent: false, skipped: true, reason: 'priority_not_eligible' };
  }

  const today = new Date().toISOString().split('T')[0];
  const deduplicationKey = `PUSH_${insight.id}_${today}`;

  try {
    const entities = base44.asServiceRole.entities;

    // 1. Déduplication
    const existing = await entities.VenusAdminEvent.filter(
      { deduplication_key: deduplicationKey },
      '-created_date',
      1
    ).catch(() => []);

    if (existing && existing.length > 0) {
      return { sent: false, skipped: true, reason: 'deduplication' };
    }

    // 2. Trouver les tokens FCM de l'admin
    const tokens = await entities.NotificationToken.filter({
      user_email: adminEmail,
      user_type: 'admin',
      actif: true,
    }).catch(() => []);

    const pushableTokens = selectLatestNativeTokens(tokens);
    if (pushableTokens.length === 0) {
      console.warn('[venusAdminPushEngine] Aucun token FCM natif pour admin', { adminEmail });
      return { sent: false, skipped: true, reason: 'no_native_token' };
    }

    // 3. Configuration Firebase
    const { projectId, clientEmail, privateKey } = getFirebaseConfig();
    if (!projectId || !clientEmail || !privateKey) {
      console.warn('[venusAdminPushEngine] Firebase non configuré');
      return { sent: false, skipped: true, reason: 'firebase_not_configured' };
    }

    const accessToken = await getAccessToken(clientEmail, privateKey);

    // 4. Payload FCM
    const pushTitle = 'VENUS • SILGAPP';
    const pushBody = insight.observation;
    const actionUrl = getActionUrl(insight);
    const isP0 = insight.priority === 'haute';

    const dataPayload = {
      type: 'venus_admin',
      priority: isP0 ? 'P0' : 'P1',
      insight_type: insight.type,
      click_action: ANDROID_CLICK_ACTION,
      action_url: actionUrl,
    };

    const fcmPayload = {
      notification: { title: pushTitle, body: pushBody },
      data: dataPayload,
      android: {
        collapse_key: `venus_admin_${insight.id}`,
        priority: isP0 ? 'HIGH' : 'NORMAL',
        ttl: '86400s',
        notification: {
          tag: `venus_admin_${insight.id}`,
          channel_id: ANDROID_CHANNEL_ID,
          sound: 'default',
          visibility: 'PUBLIC',
          click_action: ANDROID_CLICK_ACTION,
          notification_priority: isP0 ? 'PRIORITY_MAX' : 'PRIORITY_HIGH',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title: pushTitle, body: pushBody },
            sound: 'default',
            badge: 1,
            'content-available': 1,
            'mutable-content': 1,
            'interruption-level': isP0 ? 'critical' : 'time-sensitive',
          },
          ...dataPayload,
        },
        headers: {
          'apns-priority': '10',
          'apns-collapse-id': `venus_admin_${insight.id}`,
        },
      },
      webpush: {
        fcm_options: { link: actionUrl || APP_URL },
      },
    };

    // 5. Envoyer
    const results = await Promise.all(
      pushableTokens.map((item: any) =>
        sendFcmMessage(projectId, accessToken, item.token, fcmPayload)
          .then(async (r: any) => {
            try {
              if (r.ok) {
                await entities.NotificationToken.update(item.id, {
                  derniere_utilisation: new Date().toISOString(),
                  derniere_notif_statut: 'success',
                  derniere_notif_titre: pushTitle,
                  derniere_notif_date: new Date().toISOString(),
                  fcm_error: null,
                });
              } else {
                await entities.NotificationToken.update(item.id, {
                  derniere_notif_statut: 'failed',
                  derniere_notif_titre: pushTitle,
                  derniere_notif_date: new Date().toISOString(),
                  fcm_error: JSON.stringify(r.result?.error || {}).slice(0, 300),
                });
              }
            } catch (_) {}
            return r;
          })
      )
    );

    const sent = results.filter((r: any) => r.ok).length;

    // 6. Marquer comme notifié
    if (sent > 0) {
      await entities.VenusAdminEvent.create({
        event_type: 'VENUS_ADMIN_PUSH',
        priority: isP0 ? 'P0' : 'P1',
        country_code: 'ALL',
        title: pushTitle,
        summary: pushBody,
        deduplication_key: deduplicationKey,
        status: 'notified',
      }).catch(() => {});
    } else {
      console.warn('[venusAdminPushEngine] Échec FCM — aucun token réussi', {
        adminEmail, insight_id: insight.id, deduplicationKey,
      });
    }

    return { sent: sent > 0, skipped: false };
  } catch (error: any) {
    console.error('[venusAdminPushEngine] Erreur non-bloquante:', error?.message || String(error));
    return { sent: false, skipped: false, reason: error?.message || 'unknown_error' };
  }
}