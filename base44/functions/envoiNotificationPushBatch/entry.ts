import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  getFirebaseConfig, getAccessToken, sendFcmMessage,
  selectLatestNativeTokens, normalizeCountryCode,
  ANDROID_CHANNEL_ID, ANDROID_CLICK_ACTION, APP_URL,
} from '../../shared/fcmUtils.ts';

const STATUTS_ACTIFS_COURSE = [
  'recherche_livreur', 'livreur_en_route', 'client_contacte', 'en_route_expediteur',
  'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque', 'pris_en_charge',
  'en_livraison', 'arrivee',
];

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
      course_id,
      livreur_ids,
      alert_duration_seconds,
      alert_interval_seconds,
      dispatch_version,
    } = body;

    if (!titre || !message || !Array.isArray(livreur_ids) || livreur_ids.length === 0) {
      return Response.json({ error: 'Missing required fields: titre, message, livreur_ids[]' }, { status: 400 });
    }

    // ── 1. Récupérer la course (pour country_code) ──
    let courseCountry = '';
    if (course_id) {
      const course = await base44.asServiceRole.entities.CourseExterne.get(course_id).catch(() => null);
      courseCountry = normalizeCountryCode(course?.country_code);
    }

    // ── 2. Récupérer tous les livreurs en une seule requête ──
    const uniqueIds = [...new Set(livreur_ids.map(String).filter(Boolean))];
    const livreurs = await base44.asServiceRole.entities.Livreur.filter(
      { id: { $in: uniqueIds }, actif: true }
    ).catch(() => []);

    if (!livreurs || livreurs.length === 0) {
      return Response.json({ success: false, error: 'Aucun livreur trouvé', destinataires: 0, succes: 0, echecs: 0 });
    }

    // ── 3. Exclure les livreurs déjà en course (vérification fraîche) ──
    let livreurIdsEligibles = livreurs.map((l: any) => l.id);
    let livreursEnCourseIds = new Set();

    if (courseCountry) {
      const coursesActives = await base44.asServiceRole.entities.CourseExterne.filter(
        { country_code: courseCountry }, '-created_date', 200
      ).catch(() => []);
      livreursEnCourseIds = new Set(
        (coursesActives || [])
          .filter((c: any) => STATUTS_ACTIFS_COURSE.includes(c.statut) && c.livreur_id)
          .map((c: any) => c.livreur_id)
      );
      livreurIdsEligibles = livreurIdsEligibles.filter((id: string) => !livreursEnCourseIds.has(id));
    }

    const livreursEligibles = livreurs.filter((l: any) => livreurIdsEligibles.includes(l.id));

    if (livreursEligibles.length === 0) {
      return Response.json({
        success: true,
        destinataires: 0,
        succes: 0,
        echecs: 0,
        reason: 'all_livreurs_in_course',
        excluded_in_course: livreurs.length,
      });
    }

    // ── 4. Récupérer tous les tokens FCM en une seule requête ──
    const allTokens = await base44.asServiceRole.entities.NotificationToken.filter(
      { livreur_id: { $in: livreurIdsEligibles }, actif: true }
    ).catch(() => []);

    // Grouper les tokens par livreur_id
    const tokensByLivreur = new Map();
    for (const token of allTokens || []) {
      const lid = String(token.livreur_id || '');
      if (!lid) continue;
      if (!tokensByLivreur.has(lid)) tokensByLivreur.set(lid, []);
      tokensByLivreur.get(lid).push(token);
    }

    // ── 5. Dédupliquer les tokens (1 token natif le plus récent par plateforme par livreur) ──
    const pushableTokensByLivreur = new Map();
    for (const [lid, tokens] of tokensByLivreur) {
      const nativeTokens = selectLatestNativeTokens(tokens);
      if (nativeTokens.length > 0) {
        pushableTokensByLivreur.set(lid, nativeTokens);
      }
    }

    // ── 6. Créer les notifications en BDD (bulk) ──
    const notifType = String(type || 'nouvelle_course');
    const notificationsToCreate = livreursEligibles.map((l: any) => ({
      titre,
      message,
      type: notifType,
      course_id: course_id || '',
      destinataire_email: String(l.user_email || '').trim().toLowerCase(),
      livreur_id: l.id,
      lue: false,
    }));

    const createdNotifications = await base44.asServiceRole.entities.Notification.bulkCreate(
      notificationsToCreate
    ).catch(() => []);

    // Map livreur_id → notification_id
    const notifIdByLivreur = new Map();
    if (Array.isArray(createdNotifications)) {
      createdNotifications.forEach((n: any, i: number) => {
        if (n?.id && notificationsToCreate[i]) {
          notifIdByLivreur.set(notificationsToCreate[i].livreur_id, n.id);
        }
      });
    }

    // ── 7. Préparer et envoyer les push FCM ──
    const { projectId, clientEmail, privateKey } = getFirebaseConfig();
    if (!projectId || !clientEmail || !privateKey) {
      console.warn('[envoiNotificationPushBatch] Firebase credentials missing');
      return Response.json({
        success: true,
        destinataires: livreursEligibles.length,
        succes: 0,
        echecs: 0,
        notifications_created: notifIdByLivreur.size,
        warning: 'Firebase credentials not configured — notifications saved but not sent',
      });
    }

    const accessToken = await getAccessToken(clientEmail, privateKey);
    const notificationTag = String(course_id || notifType).slice(0, 64);
    const isUrgentLivreurCourse = String(type || '') === 'nouvelle_course';

    const dataPayloadBase = {
      type: notifType,
      user_type: 'livreur',
      course_id: String(course_id || ''),
      click_action: ANDROID_CLICK_ACTION,
      alert_duration_seconds: String(alert_duration_seconds || 300),
      alert_interval_seconds: String(alert_interval_seconds || 5),
      dispatch_version: String(dispatch_version || '2'),
    };

    const sendResults = [];
    let succes = 0;
    let echecs = 0;
    const livreurIdsWithoutTokens = [];

    for (const livreur of livreursEligibles) {
      const tokens = pushableTokensByLivreur.get(livreur.id);
      if (!tokens || tokens.length === 0) {
        livreurIdsWithoutTokens.push(livreur.id);
        echecs++;
        continue;
      }

      const notifId = notifIdByLivreur.get(livreur.id) || '';
      const dataPayload = { ...dataPayloadBase, livreur_id: String(livreur.id), notification_id: String(notifId) };

      for (const tokenItem of tokens) {
        const platform = String(tokenItem.platform || '').toLowerCase();
        const isIOS = platform.includes('ios');
        const isAndroid = platform.includes('android');

        let payload;
        if (isUrgentLivreurCourse && isAndroid) {
          payload = {
            data: { ...dataPayload, title: String(titre), body: String(message) },
            android: { collapse_key: notificationTag, priority: 'HIGH', ttl: `${Math.max(60, Number(alert_duration_seconds || 60) + 30)}s` },
          };
        } else if (isUrgentLivreurCourse && isIOS) {
          payload = {
            notification: { title, body: message },
            data: { ...dataPayload, title: String(titre), body: String(message) },
            apns: {
              payload: { aps: { alert: { title, body: message }, sound: 'default', badge: 1, 'content-available': 1, 'mutable-content': 1, 'interruption-level': 'time-sensitive' }, ...dataPayload },
              headers: { 'apns-priority': '10', 'apns-collapse-id': notificationTag },
            },
          };
        } else {
          payload = {
            notification: { title, body: message },
            data: dataPayload,
            android: {
              collapse_key: notificationTag, priority: 'HIGH', ttl: '86400s',
              notification: { tag: notificationTag, channel_id: ANDROID_CHANNEL_ID, sound: 'default', visibility: 'PUBLIC', click_action: ANDROID_CLICK_ACTION, notification_priority: 'PRIORITY_HIGH' },
            },
            apns: {
              payload: { aps: { alert: { title, body: message }, sound: 'default', badge: 1, 'content-available': 1, 'mutable-content': 1, 'interruption-level': 'time-sensitive' }, ...dataPayload },
              headers: { 'apns-priority': '10', 'apns-collapse-id': notificationTag },
            },
            webpush: { fcm_options: { link: APP_URL } },
          };
        }

        try {
          const response = await sendFcmMessage(projectId, accessToken, tokenItem.token, payload);
          const nowIso = new Date().toISOString();
          if (!response.ok) {
            const errorCode = response.result?.error?.details?.[0]?.errorCode || response.result?.error?.status;
            const isInvalid = ['UNREGISTERED', 'INVALID_ARGUMENT'].includes(errorCode);
            base44.asServiceRole.entities.NotificationToken.update(tokenItem.id, {
              actif: isInvalid ? false : tokenItem.actif,
              derniere_notif_statut: 'failed',
              derniere_notif_titre: titre,
              derniere_notif_date: nowIso,
              fcm_error: JSON.stringify(response.result?.error || {}).slice(0, 300),
            }).catch(() => null);
            echecs++;
          } else {
            base44.asServiceRole.entities.NotificationToken.update(tokenItem.id, {
              derniere_utilisation: nowIso,
              derniere_notif_statut: 'success',
              derniere_notif_titre: titre,
              derniere_notif_date: nowIso,
              fcm_error: null,
            }).catch(() => null);
            succes++;
          }
          sendResults.push({ livreur_id: livreur.id, token_id: tokenItem.id, ok: response.ok, status: response.status });
        } catch (err) {
          echecs++;
          sendResults.push({ livreur_id: livreur.id, token_id: tokenItem.id, ok: false, error: err.message });
        }
      }
    }

    console.log('[envoiNotificationPushBatch] FCM batch completed', {
      course_id: course_id || '',
      destinataires: livreursEligibles.length,
      excluded_in_course: livreursEnCourseIds.size,
      tokens_sent: succes,
      tokens_failed: echecs,
      without_tokens: livreurIdsWithoutTokens.length,
    });

    return Response.json({
      success: succes > 0,
      destinataires: livreursEligibles.length,
      succes,
      echecs,
      excluded_in_course: livreursEnCourseIds.size,
      without_tokens: livreurIdsWithoutTokens.length,
      notifications_created: notifIdByLivreur.size,
      details: sendResults.slice(0, 50),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});