import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ═══════════════════════════════════════════════════════════════════════════
// sendPushCampagne — Campagne push manuelle du Centre de notifications
// ═══════════════════════════════════════════════════════════════════════════
//
// PROBLÈME CORRIGÉ (2026-10-02) :
//   La version précédente faisait 1 NotificationToken.update PAR TOKEN (via
//   Promise.all → 100 appels SDK concurrents par batch). Avec ~205 tokens, cela
//   générait ~208 appels SDK Base44, déclenchant le rate limiter de la plateforme
//   → HTTP 500 "Rate limit exceeded".
//
//   FCM lui-même (fetch direct, ligne 71) n'était PAS le problème.
//
// CORRECTION :
//   - Déduplication par token FCM (un token ne reçoit qu'une seule campagne)
//   - Les appels FCM restent individuels (fetch, pas SDK, pas rate-limited)
//   - Les updates NotificationToken sont regroupés en bulkUpdate (max 500 par appel)
//   - PushCampagne n'est mis à jour qu'une seule fois à la fin
//   - SDK calls: ~208 → ~3 (create campagne + bulkUpdate succès + bulkUpdate échecs + update final)
//
// NE MODIFIE PAS : Dispatch V2, notification "Nouvelle course", accepterCourseV2,
//   canal officiel des nouvelles courses, TTL, RLS, heartbeat/GPS, finance, messagerie.
// ═══════════════════════════════════════════════════════════════════════════

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
  if (!serviceAccountJson) return { projectId: null, clientEmail: null, privateKey: null };
  const sa = JSON.parse(serviceAccountJson);
  return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key };
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
    const allTokens = await base44.asServiceRole.entities.NotificationToken.filter({
      actif: true,
    }, '-derniere_utilisation', 10000);

    // Filtrer par type d'utilisateur
    let filteredTokens = allTokens;
    if (cible === 'tous_clients') {
      filteredTokens = allTokens.filter(t => t.user_type === 'client');
    } else if (cible === 'tous_livreurs') {
      filteredTokens = allTokens.filter(t => t.user_type === 'livreur');
    } else if (cible === 'livreurs_inactifs') {
      const tousLivreurs = await base44.asServiceRole.entities.Livreur.filter({
        type_livreur: 'externe', actif: true, validation: 'valide',
      });
      const now = Date.now();
      const inactifs = new Set();
      for (const l of tousLivreurs) {
        const hb = l.last_seen_at || l.derniere_position_date;
        if (!hb) {
          inactifs.add(l.user_email);
        } else {
          const ageMin = (now - new Date(hb).getTime()) / 60000;
          if (ageMin > 1440) inactifs.add(l.user_email);
        }
      }
      filteredTokens = allTokens.filter(t => t.user_type === 'livreur' && inactifs.has(t.user_email));
    }

    // Filtrer par pays (si spécifié)
    if (paysCible !== 'ALL') {
      const livreurIds = new Set();
      const clientIds = new Set();

      const livreursPays = await base44.asServiceRole.entities.Livreur.filter({
        country_code: paysCible,
        type_livreur: 'externe',
      });
      livreursPays.forEach(l => livreurIds.add(l.id));

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

    // ── DÉDUPLICATION PAR TOKEN FCM ─────────────────────────────────────
    // Un même token ne doit recevoir la campagne qu'une seule fois.
    const seenTokens = new Set();
    const dedupedTokens = [];
    let duplicatesRemoved = 0;
    for (const t of nativeTokens) {
      if (seenTokens.has(t.token)) {
        duplicatesRemoved++;
        continue;
      }
      seenTokens.add(t.token);
      dedupedTokens.push(t);
    }

    if (dedupedTokens.length === 0) {
      return Response.json({
        success: false,
        error: 'Aucun token push natif trouvé pour ces critères',
        total_tokens: filteredTokens.length,
        native_tokens: 0,
        duplicates_removed: duplicatesRemoved,
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
      nb_envoyes: dedupedTokens.length,
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

    if (image_url) {
      fcmPayload.android.notification.image = image_url;
    }

    // ── ÉTAPE 5: Envoi FCM par lots + collecte des résultats ────────────
    // FCM est appelé via fetch() direct (pas SDK → pas rate-limited par Base44).
    // Les updates NotificationToken sont DIFFÉRÉS et regroupés en bulkUpdate.
    let successCount = 0;
    let failCount = 0;
    const tokenUpdatesSuccess = []; // [{id, derniere_utilisation, ...}]
    const tokenUpdatesFailed = [];   // [{id, actif, ...}]
    const BATCH_SIZE = 100;
    const DELAY_MS = 200;
    const nowIso = new Date().toISOString();

    for (let i = 0; i < dedupedTokens.length; i += BATCH_SIZE) {
      const batch = dedupedTokens.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(async (item) => {
        const r = await sendOneFcm(projectId, accessToken, item.token, fcmPayload);
        if (!r.ok) {
          const errorCode = r.result?.error?.details?.[0]?.errorCode || r.result?.error?.status;
          const isInvalid = ['UNREGISTERED', 'INVALID_ARGUMENT'].includes(errorCode);
          // Collecter l'update (différé) au lieu d'appeler le SDK maintenant
          tokenUpdatesFailed.push({
            id: item.id,
            actif: isInvalid ? false : item.actif,
            derniere_notif_statut: 'failed',
            derniere_notif_titre: titre,
            derniere_notif_date: nowIso,
            fcm_error: JSON.stringify(r.result?.error || {}).slice(0, 300),
          });
          return false;
        }
        tokenUpdatesSuccess.push({
          id: item.id,
          derniere_utilisation: nowIso,
          derniere_notif_statut: 'success',
          derniere_notif_titre: titre,
          derniere_notif_date: nowIso,
          fcm_error: null,
        });
        return true;
      }));

      successCount += results.filter(Boolean).length;
      failCount += results.filter(r => !r).length;

      // Petit délai entre lots pour éviter de saturer FCM
      if (i + BATCH_SIZE < dedupedTokens.length) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    // ── ÉTAPE 6: bulkUpdate des tokens (1 appel SDK au lieu de N) ───────
    // bulkUpdate accepte jusqu'à 500 enregistrements par appel.
    // Avec ~205 tokens, cela fait 1 appel au lieu de 205.
    if (tokenUpdatesSuccess.length > 0) {
      try {
        for (let i = 0; i < tokenUpdatesSuccess.length; i += 500) {
          await base44.asServiceRole.entities.NotificationToken.bulkUpdate(
            tokenUpdatesSuccess.slice(i, i + 500)
          );
        }
      } catch (e) {
        console.error('[sendPushCampagne] bulkUpdate success error:', e?.message);
      }
    }

    if (tokenUpdatesFailed.length > 0) {
      try {
        for (let i = 0; i < tokenUpdatesFailed.length; i += 500) {
          await base44.asServiceRole.entities.NotificationToken.bulkUpdate(
            tokenUpdatesFailed.slice(i, i + 500)
          );
        }
      } catch (e) {
        console.error('[sendPushCampagne] bulkUpdate failed error:', e?.message);
      }
    }

    // ── ÉTAPE 7: Finaliser la campagne (1 seul update au lieu de N) ────
    await base44.asServiceRole.entities.PushCampagne.update(campagne.id, {
      statut: 'termine',
      nb_succes: successCount,
      nb_echecs: failCount,
    });

    return Response.json({
      success: true,
      campagne_id: campagne.id,
      total_tokens: dedupedTokens.length,
      duplicates_removed: duplicatesRemoved,
      succes: successCount,
      echecs: failCount,
    });
  } catch (error) {
    // Détecter spécifiquement les erreurs de rate limit pour un message clair
    const msg = error?.message || String(error);
    if (msg.toLowerCase().includes('rate limit')) {
      return Response.json({
        error: 'Limite temporaire d\'envoi atteinte. Réessayez dans 30 secondes.',
        detail: msg,
      }, { status: 429 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
});