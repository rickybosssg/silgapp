import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const APP_URL = 'https://silga-dispatch-go.base44.app';
const ANDROID_CHANNEL_ID = 'silgapp_default';
const ANDROID_URGENT_CHANNEL_ID = 'silgapp_urgent_courses';
const ANDROID_CLICK_ACTION = 'OPEN_SILGAPP';

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
    console.log('[envoiNotificationPush] Firebase config: FIREBASE_SERVICE_ACCOUNT_JSON present', {
      projectId: sa.project_id,
      clientEmailPresent: !!sa.client_email,
      privateKeyPresent: !!sa.private_key,
    });
    return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key };
  }
  console.log('[envoiNotificationPush] Firebase config: using split env vars', {
    projectIdPresent: !!Deno.env.get('FIREBASE_PROJECT_ID'),
    clientEmailPresent: !!Deno.env.get('FIREBASE_CLIENT_EMAIL'),
    privateKeyPresent: !!Deno.env.get('FIREBASE_PRIVATE_KEY'),
  });
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

function tokenDateValue(item) {
  const raw = item.derniere_utilisation || item.updated_date || item.created_date || '';
  const value = Date.parse(raw);
  return Number.isFinite(value) ? value : 0;
}

function selectLatestNativeTokens(tokens) {
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

function normalizeCountryCode(value) {
  return String(value || '').trim().toUpperCase();
}

function countryMismatchPayload(course, target, context) {
  const courseCountry = normalizeCountryCode(course?.country_code);
  const targetCountry = normalizeCountryCode(target?.country_code);
  console.error('[envoiNotificationPush][CRITICAL_COUNTRY_BLOCK]', {
    context,
    course_id: course?.id || '',
    course_country_code: courseCountry || 'ABSENT',
    target_id: target?.id || '',
    target_email: target?.user_email || '',
    target_country_code: targetCountry || 'ABSENT',
  });
  return {
    success: false,
    error: 'Notification inter-pays interdite',
    blocked_reason: 'country_mismatch',
    course_country_code: courseCountry || '',
    target_country_code: targetCountry || '',
  };
}

async function assertNotificationCountry(base44, { course_id, livreur_id, client_id, targetEmail, type }) {
  if (!course_id) return { ok: true };

  const course = await base44.asServiceRole.entities.CourseExterne.get(course_id).catch(() => null);
  if (!course) return { ok: true };

  const courseCountry = normalizeCountryCode(course.country_code);
  if (!courseCountry) {
    console.error('[envoiNotificationPush][CRITICAL_COUNTRY_MISSING]', {
      course_id,
      targetEmail,
      type,
    });
    return {
      ok: false,
      status: 400,
      payload: {
        success: false,
        error: 'country_code obligatoire absent sur la course',
        blocked_reason: 'missing_course_country_code',
      },
    };
  }

  const targets = [];
  if (livreur_id) {
    const livreur = await base44.asServiceRole.entities.Livreur.get(livreur_id).catch(() => null);
    if (livreur) targets.push({ entity: livreur, context: 'livreur_id' });
  }
  if (client_id) {
    const client = await base44.asServiceRole.entities.ClientExterne.get(client_id).catch(() => null);
    if (client) targets.push({ entity: client, context: 'client_id' });
  }

  if (targetEmail && String(type || '') === 'nouvelle_course') {
    const livreurs = await base44.asServiceRole.entities.Livreur.filter({
      user_email: targetEmail,
      actif: true,
    }).catch(() => []);
    for (const livreur of livreurs || []) {
      targets.push({ entity: livreur, context: 'destinataire_email_livreur' });
    }
  }

  for (const target of targets) {
    const targetCountry = normalizeCountryCode(target.entity?.country_code);
    if (!targetCountry || targetCountry !== courseCountry) {
      return {
        ok: false,
        status: 403,
        payload: countryMismatchPayload(course, target.entity, target.context),
      };
    }
  }

  return { ok: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json();
    const {
      titre,
      message,
      type,
      destinataire_email,
      livreur_id,
      client_id,
      course_id,
      user_type,
      alert_duration_seconds,
      alert_interval_seconds,
      category,
    } = body;
    const targetEmail = String(destinataire_email || '').trim().toLowerCase();

    if (!titre || !message || !targetEmail) {
      return Response.json({ error: 'Missing required fields: titre, message, destinataire_email' }, { status: 400 });
    }

    // Catégories critiques — toujours envoyées, non désactivables par l'utilisateur
    const CATEGORIES_CRITIQUES = ['course', 'dispatch', 'securite', 'paiement', 'nouvelle_course', 'livreur_en_route', 'colis_recupere', 'livraison', 'annulation'];
    const notifCategory = String(category || type || 'generic').toLowerCase();
    const isCritique = CATEGORIES_CRITIQUES.some(c => notifCategory.includes(c));

    const countryGuard = await assertNotificationCountry(base44, {
      course_id,
      livreur_id,
      client_id,
      targetEmail,
      type,
    });
    if (!countryGuard.ok) {
      return Response.json(countryGuard.payload, { status: countryGuard.status });
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
    const nativeTokens = tokens.filter(item => !String(item.token).startsWith('web_'));
    const pushableTokensPreview = selectLatestNativeTokens(tokens);
    console.log('[envoiNotificationPush] Tokens resolved', {
      targetEmail,
      livreur_id: livreur_id || '',
      client_id: client_id || '',
      tokensFound: tokens.length,
      pushableTokens: pushableTokensPreview.length,
      nativeTokens: nativeTokens.length,
      dedupedNativeTokens: nativeTokens.length - pushableTokensPreview.length,
      webTokens: tokens.length - nativeTokens.length,
      platforms: [...new Set(tokens.map(t => t.platform || 'unknown'))],
    });

    // ── Vérifier les préférences de notification (catégories non critiques) ──
    if (!isCritique && tokens.length > 0) {
      const userPrefs = tokens[0]?.preferences_categories;
      if (userPrefs) {
        let desactivees = [];
        try { desactivees = JSON.parse(userPrefs); } catch (_) {}
        if (Array.isArray(desactivees) && desactivees.some(c => notifCategory.includes(c.toLowerCase()))) {
          const skippedNotif = await base44.asServiceRole.entities.Notification.create({
            titre, message, type: type || 'generic', course_id: course_id || '',
            destinataire_email: targetEmail, lue: false,
          });
          return Response.json({
            success: true,
            notification_id: skippedNotif.id,
            skipped_push: true,
            reason: 'user_preference_opt_out',
            category: notifCategory,
          });
        }
      }
    }

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

    // Exclure les tokens web (pas de FCM natif)
    const webTokens = tokens.filter(item => String(item.token).startsWith('web_'));
    const nativeTokensForStats = tokens.filter(item => !String(item.token).startsWith('web_'));
    const pushableTokens = pushableTokensPreview;
    if (pushableTokens.length === 0) {
      console.warn('[envoiNotificationPush] No native FCM token available', {
        targetEmail,
        tokensFound: tokens.length,
        nativeTokens: nativeTokensForStats.length,
        webTokens: webTokens.length,
      });
      return Response.json({
        success: true,
        notification_id: notification.id,
        warning: 'Only web fallback tokens found — notification saved but no native FCM push sent',
      });
    }

    const { projectId, clientEmail, privateKey } = getFirebaseConfig();
    if (!projectId || !clientEmail || !privateKey) {
      console.warn('[envoiNotificationPush] Firebase credentials missing', {
        projectIdPresent: !!projectId,
        clientEmailPresent: !!clientEmail,
        privateKeyPresent: !!privateKey,
      });
      return Response.json({
        success: true,
        notification_id: notification.id,
        warning: 'Firebase credentials not configured — notification saved but not sent',
      });
    }

    const accessToken = await getAccessToken(clientEmail, privateKey);
    const notificationTag = String(course_id || notification.id || `${type || 'generic'}-${targetEmail}`).slice(0, 64);
    const isUrgentLivreurCourse = String(type || '') === 'nouvelle_course' && !!livreur_id;
    const dataPayload = {
      type: String(type || 'generic'),
      user_type: String(user_type || (livreur_id ? 'livreur' : client_id ? 'client' : '')),
      livreur_id: String(livreur_id || ''),
      client_id: String(client_id || ''),
      course_id: String(course_id || ''),
      notification_id: String(notification.id),
      click_action: ANDROID_CLICK_ACTION,
      alert_duration_seconds: String(alert_duration_seconds || 60),
      alert_interval_seconds: String(alert_interval_seconds || 5),
    };

    // Payload FCM — notification visible écran verrouillé + son + vibration
    const fcmPayload = {
      notification: { title: titre, body: message },
      data: dataPayload,
      android: {
        collapse_key: notificationTag,
        priority: 'HIGH',
        ttl: '86400s',
        notification: {
          tag: notificationTag,
          channel_id: ANDROID_CHANNEL_ID,
          sound: 'default',
          vibrate_timings: ['0s', '0.2s', '0.1s', '0.2s', '0.1s', '0.4s'],
          default_sound: true,
          default_vibrate_timings: false,
          notification_priority: 'PRIORITY_HIGH',
          visibility: 'PUBLIC',
          click_action: ANDROID_CLICK_ACTION,
        },
      },
      webpush: {
        fcm_options: { link: APP_URL },
      },
    };

    // ── PAYLOAD DATA-ONLY pour courses urgentes livreur ──
    // PAS de champ "notification" au top level → FCM délivre TOUJOURS à
    // onMessageReceived() même si l'app est en arrière-plan, fermée ou écran verrouillé.
    // Le code natif (SilgappFirebaseMessagingService) gère ensuite :
    //   - sonnerie persistante (TYPE_ALARM)
    //   - vibration longue
    //   - réveil écran (WakeLock)
    //   - notification plein écran (fullScreenIntent)
    //   - canal IMPORTANCE_HIGH "SILGAPP Courses"
    const urgentAndroidPayload = {
      data: {
        ...dataPayload,
        title: String(titre),
        body: String(message),
      },
      android: {
        collapse_key: notificationTag,
        priority: 'HIGH',
        ttl: `${Math.max(60, Number(alert_duration_seconds || 60) + 30)}s`,
        // Pas de bloc "notification" → data-only message → onMessageReceived toujours appelé
      },
    };

    const sendResults = await Promise.all(pushableTokens.map(async (item) => {
      const platform = String(item.platform || '').toLowerCase();
      const payload = isUrgentLivreurCourse && platform.includes('android')
        ? urgentAndroidPayload
        : fcmPayload;
      const response = await sendFcmMessage(projectId, accessToken, item.token, payload);
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
    console.log('[envoiNotificationPush] FCM send completed', {
      targetEmail,
      projectId,
      sent,
      attempted: pushableTokens.length,
      failed: sendResults.filter(r => !r.ok).length,
    });

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