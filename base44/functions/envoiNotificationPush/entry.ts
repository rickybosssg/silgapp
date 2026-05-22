import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const APP_NOTIFICATIONS_URL = 'https://silga-dispatch-go.base44.app/notifications';

function base64UrlEncode(input: string | ArrayBuffer): string {
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
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwt(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: FCM_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );

  return `${unsigned}.${base64UrlEncode(signature)}`;
}

function getFirebaseConfig() {
  const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    return {
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
    };
  }

  return {
    projectId: Deno.env.get('FIREBASE_PROJECT_ID'),
    clientEmail: Deno.env.get('FIREBASE_CLIENT_EMAIL'),
    privateKey: Deno.env.get('FIREBASE_PRIVATE_KEY'),
  };
}

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const assertion = await signJwt(clientEmail, privateKey);
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error_description || result.error || 'Unable to get Firebase access token');
  }
  return result.access_token;
}

async function sendFcmMessage(projectId: string, accessToken: string, token: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: { token, ...payload } }),
  });

  const result = await response.json();
  return { ok: response.ok, status: response.status, result };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json();
    const { titre, message, type, destinataire_email, livreur_id, course_id } = body;

    if (!titre || !message || !destinataire_email) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const tokens = await base44.entities.NotificationToken.filter({
      user_email: destinataire_email,
      actif: true,
    });

    const notification = await base44.entities.Notification.create({
      titre,
      message,
      type: type || 'generic',
      course_id: course_id || '',
      destinataire_email,
      lue: false,
    });

    if (tokens.length === 0) {
      return Response.json({
        success: false,
        notification_id: notification.id,
        error: 'Aucun token de notification trouve pour cet utilisateur',
      }, { status: 404 });
    }

    const pushableTokens = tokens.filter((item) => !String(item.token).startsWith('web_'));
    if (pushableTokens.length === 0) {
      return Response.json({
        success: true,
        notification_id: notification.id,
        warning: 'Only web fallback tokens found, notification saved but no native FCM push was sent',
      });
    }

    const { projectId, clientEmail, privateKey } = getFirebaseConfig();
    if (!projectId || !clientEmail || !privateKey) {
      return Response.json({
        success: true,
        notification_id: notification.id,
        warning: 'Firebase HTTP v1 credentials not configured, notification saved but not sent',
        required_env: ['FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY'],
      });
    }

    const accessToken = await getAccessToken(clientEmail, privateKey);
    const fcmPayload = {
      notification: {
        title: titre,
        body: message,
      },
      data: {
        type: String(type || 'generic'),
        livreur_id: String(livreur_id || ''),
        course_id: String(course_id || ''),
        notification_id: String(notification.id),
        click_action: APP_NOTIFICATIONS_URL,
      },
      android: {
        priority: 'HIGH',
        notification: {
          click_action: APP_NOTIFICATIONS_URL,
          channel_id: 'default',
        },
      },
      webpush: {
        fcm_options: {
          link: APP_NOTIFICATIONS_URL,
        },
      },
    };

    const sendResults = await Promise.all(pushableTokens.map(async (item) => {
      const response = await sendFcmMessage(projectId, accessToken, item.token, fcmPayload);
      if (!response.ok) {
        const errorCode = response.result?.error?.details?.[0]?.errorCode || response.result?.error?.status;
        if (['UNREGISTERED', 'INVALID_ARGUMENT'].includes(errorCode)) {
          try {
            await base44.entities.NotificationToken.update(item.id, { actif: false });
          } catch (_) {}
        }
      }
      return {
        token_id: item.id,
        platform: item.platform,
        ok: response.ok,
        status: response.status,
        result: response.result,
      };
    }));

    const sent = sendResults.filter((result) => result.ok).length;

    return Response.json({
      success: sent > 0,
      notification_id: notification.id,
      tokens_found: tokens.length,
      pushable_tokens: pushableTokens.length,
      tokens_sent: sent,
      fcm_response: sendResults,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
