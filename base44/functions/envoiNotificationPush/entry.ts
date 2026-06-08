import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const APP_URL = 'https://silga-dispatch-go.base44.app';
const ANDROID_CHANNEL_ID = 'silgapp_default';

function base64UrlEncode(input) {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem) {
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

async function signJwt(clientEmail, privateKey) {
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

async function getAccessToken(clientEmail, privateKey) {
  const assertion = await signJwt(clientEmail, privateKey);
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error_description || result.error || 'Unable to get Firebase access token');
  return result.access_token;
}

async function sendFcmMessage(projectId, accessToken, token, payload) {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, ...payload } }),
  });
  const result = await response.json();
  return { ok: response.ok, status: response.status, result };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json();
    const { titre, message, type, destinataire_email, livreur_id, client_id, course_id } = body;
    const targetEmail = String(destinataire_email || '').trim().toLowerCase();

    if (!titre || !message || !targetEmail) {
      return Response.json({ error: 'Missing required fields: titre, message, destinataire_email' }, { status: 400 });
    }

    // Chercher les tokens par email (livreurs + clients)
    const [emailTokens, livreurTokens, clientTokens] = await Promise.all([
      base44.asServiceRole.entities.NotificationToken.filter({ user_email: targetEmail, actif: true }),
      livreur_id
        ? base44.asServiceRole.entities.NotificationToken.filter({ livreur_id, actif: true })
        : Promise.resolve([]),
      client_id
        ? base44.asServiceRole.entities.NotificationToken.filter({ client_id, actif: true })
        : Promise.resolve([]),
    ]);

    const tokenMap = new Map();
    for (const item of [...emailTokens, ...livreurTokens, ...clientTokens]) {
      tokenMap.set(item.token, item);
    }
    const tokens = [...tokenMap.values()];

    // Créer la notification en BDD
    const notification = await base44.asServiceRole.entities.Notification.create({
      titre,
      message,
      type: type || 'generic',
      course_id: course_id || '',
      destinataire_email: targetEmail,
      lue: false,
    });

    if (tokens.length === 0) {
      return Response.json({
        success: false,
        notification_id: notification.id,
        error: 'Aucun token de notification trouvé pour cet utilisateur',
      }, { status: 404 });
    }

    // Tokens web (notifications via subscription temps réel) + tokens natifs (FCM)
    const webTokens = tokens.filter(item => String(item.token).startsWith('web_'));
    const nativeTokens = tokens.filter(item => !String(item.token).startsWith('web_'));
    
    // Si uniquement des tokens web → notification enregistrée, sera affichée via subscription
    if (nativeTokens.length === 0 && webTokens.length > 0) {
      return Response.json({
        success: true,
        notification_id: notification.id,
        tokens_found: tokens.length,
        web_tokens: webTokens.length,
        message: 'Notification enregistree en base de donnees. Elle sera affichee via la subscription temps reel sur l\'application web.',
      });
    }
    
    const pushableTokens = nativeTokens;

    const { projectId, clientEmail, privateKey } = getFirebaseConfig();
    if (!projectId || !clientEmail || !privateKey) {
      return Response.json({
        success: true,
        notification_id: notification.id,
        warning: 'Firebase credentials not configured — notification saved but not sent',
      });
    }

    const accessToken = await getAccessToken(clientEmail, privateKey);

    // Payload FCM — notification visible écran verrouillé + son + vibration
    const fcmPayload = {
      notification: { title: titre, body: message },
      data: {
        type: String(type || 'generic'),
        livreur_id: String(livreur_id || ''),
        client_id: String(client_id || ''),
        course_id: String(course_id || ''),
        notification_id: String(notification.id),
        click_action: APP_URL,
      },
      android: {
        priority: 'HIGH',
        ttl: '86400s',
        notification: {
          channel_id: ANDROID_CHANNEL_ID,
          sound: 'default',
          vibrate_timings: ['0s', '0.2s', '0.1s', '0.2s', '0.1s', '0.4s'],
          default_sound: true,
          default_vibrate_timings: false,
          notification_priority: 'PRIORITY_HIGH',
          visibility: 'PUBLIC',
          click_action: APP_URL,
        },
      },
      webpush: {
        fcm_options: { link: APP_URL },
      },
    };

    const sendResults = await Promise.all(pushableTokens.map(async (item) => {
      const response = await sendFcmMessage(projectId, accessToken, item.token, fcmPayload);
      const nowIso = new Date().toISOString();

      if (!response.ok) {
        const errorCode = response.result?.error?.details?.[0]?.errorCode || response.result?.error?.status;
        const isInvalid = ['UNREGISTERED', 'INVALID_ARGUMENT'].includes(errorCode);
        try {
          await base44.asServiceRole.entities.NotificationToken.update(item.id, {
            actif: isInvalid ? false : item.actif,
            derniere_notif_statut: 'failed',
            derniere_notif_titre: titre,
            derniere_notif_date: nowIso,
            fcm_error: JSON.stringify(response.result?.error || {}).slice(0, 300),
          });
        } catch (_) {}
      } else {
        try {
          await base44.asServiceRole.entities.NotificationToken.update(item.id, {
            derniere_utilisation: nowIso,
            derniere_notif_statut: 'success',
            derniere_notif_titre: titre,
            derniere_notif_date: nowIso,
            fcm_error: null,
          });
        } catch (_) {}
      }

      return {
        token_id: item.id,
        platform: item.platform,
        user_type: item.user_type,
        ok: response.ok,
        status: response.status,
        result: response.result,
      };
    }));

    const sent = sendResults.filter(r => r.ok).length;

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