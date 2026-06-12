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

async function sendOneFcm(projectId, accessToken, token, payload) {
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

    // ── AUTH ADMIN OBLIGATOIRE ──────────────────────────────────────────
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Authentification requise' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
    }

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json();
    const { titre, message, image_url, pays, cible } = body;

    if (!titre || !message || !cible) {
      return Response.json({ error: 'Champs requis: titre, message, cible' }, { status: 400 });
    }

    const paysCible = pays || 'ALL';

    // ── ÉTAPE 1: Récupérer les tokens selon les filtres ─────────────────
    // Tous les tokens actifs (sans filtre pays d'abord)
    const allTokens = await base44.asServiceRole.entities.NotificationToken.filter({
      actif: true,
    }, '-derniere_utilisation', 10000);

    // Filtrer par type d'utilisateur
    let filteredTokens = allTokens;
    if (cible === 'tous_clients') {
      filteredTokens = allTokens.filter(t => t.user_type === 'client');
    } else if (cible === 'tous_livreurs') {
      filteredTokens = allTokens.filter(t => t.user_type === 'livreur');
    }
    // tous_utilisateurs: pas de filtre user_type

    // Filtrer par pays (si spécifié)
    if (paysCible !== 'ALL') {
      // Pour les livreurs: filtrer via Livreur entity
      const livreurIds = new Set();
      const clientIds = new Set();

      // Récupérer les livreurs du pays
      const livreursPays = await base44.asServiceRole.entities.Livreur.filter({
        country_code: paysCible,
        type_livreur: 'externe',
      });
      livreursPays.forEach(l => livreurIds.add(l.id));

      // Récupérer les clients du pays
      const clientsPays = await base44.asServiceRole.entities.ClientExterne.filter({
        country_code: paysCible,
      });
      clientsPays.forEach(c => clientIds.add(c.id));

      filteredTokens = filteredTokens.filter(t => {
        if (t.user_type === 'livreur' && t.livreur_id) {
          return livreurIds.has(t.livreur_id);
        }
        if (t.user_type === 'client' && t.client_id) {
          return clientIds.has(t.client_id);
        }
        return false;
      });
    }

    // Ne garder que les tokens natifs (pas les web_ tokens)
    const nativeTokens = filteredTokens.filter(t => !String(t.token).startsWith('web_'));

    if (nativeTokens.length === 0) {
      return Response.json({
        success: false,
        error: 'Aucun token push natif trouvé pour ces critères',
        total_tokens: filteredTokens.length,
        native_tokens: 0,
      });
    }

    // ── ÉTAPE 2: Créer la campagne en BDD ───────────────────────────────
    const campagne = await base44.asServiceRole.entities.PushCampagne.create({
      titre,
      message,
      image_url: image_url || '',
      pays_cible: paysCible,
      type_destinataires: cible,
      admin_email: user.email,
      admin_nom: user.full_name,
      nb_envoyes: nativeTokens.length,
      nb_succes: 0,
      nb_echecs: 0,
      statut: 'en_cours',
      date_envoi: new Date().toISOString(),
    });

    // ── ÉTAPE 3: Configurer Firebase ────────────────────────────────────
    const { projectId, clientEmail, privateKey } = getFirebaseConfig();
    if (!projectId || !clientEmail || !privateKey) {
      await base44.asServiceRole.entities.PushCampagne.update(campagne.id, {
        statut: 'echoue',
      });
      return Response.json({
        success: false,
        campagne_id: campagne.id,
        error: 'Firebase non configuré',
      });
    }

    const accessToken = await getAccessToken(clientEmail, privateKey);

    // ── ÉTAPE 4: Payload FCM ────────────────────────────────────────────
    const fcmPayload = {
      notification: { title: titre, body: message },
      data: {
        type: 'campagne_push',
        campagne_id: String(campagne.id),
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

    // Ajouter l'image si fournie (Android seulement)
    if (image_url) {
      fcmPayload.android.notification.image = image_url;
    }

    // ── ÉTAPE 5: Envoi par lots (batch de 100, délai entre lots) ────────
    let successCount = 0;
    let failCount = 0;
    const BATCH_SIZE = 100;
    const DELAY_MS = 200;

    for (let i = 0; i < nativeTokens.length; i += BATCH_SIZE) {
      const batch = nativeTokens.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(async (item) => {
        const r = await sendOneFcm(projectId, accessToken, item.token, fcmPayload);
        const nowIso = new Date().toISOString();
        if (!r.ok) {
          const errorCode = r.result?.error?.details?.[0]?.errorCode || r.result?.error?.status;
          const isInvalid = ['UNREGISTERED', 'INVALID_ARGUMENT'].includes(errorCode);
          try {
            await base44.asServiceRole.entities.NotificationToken.update(item.id, {
              actif: isInvalid ? false : item.actif,
              derniere_notif_statut: 'failed',
              derniere_notif_titre: titre,
              derniere_notif_date: nowIso,
              fcm_error: JSON.stringify(r.result?.error || {}).slice(0, 300),
            });
          } catch (_) {}
          return false;
        }
        try {
          await base44.asServiceRole.entities.NotificationToken.update(item.id, {
            derniere_utilisation: nowIso,
            derniere_notif_statut: 'success',
            derniere_notif_titre: titre,
            derniere_notif_date: nowIso,
            fcm_error: null,
          });
        } catch (_) {}
        return true;
      }));

      successCount += results.filter(Boolean).length;
      failCount += results.filter(r => !r).length;

      // Mettre à jour la progression en temps réel
      await base44.asServiceRole.entities.PushCampagne.update(campagne.id, {
        nb_succes: successCount,
        nb_echecs: failCount,
      });

      // Petit délai entre lots pour éviter de saturer FCM
      if (i + BATCH_SIZE < nativeTokens.length) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    // ── ÉTAPE 6: Finaliser la campagne ──────────────────────────────────
    await base44.asServiceRole.entities.PushCampagne.update(campagne.id, {
      statut: 'termine',
      nb_succes: successCount,
      nb_echecs: failCount,
    });

    return Response.json({
      success: true,
      campagne_id: campagne.id,
      total_tokens: nativeTokens.length,
      succes: successCount,
      echecs: failCount,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});