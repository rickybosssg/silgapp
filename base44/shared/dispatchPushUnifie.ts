// ═══════════════════════════════════════════════════════════════════════════
// 📤 NOTIFICATION PUSH UNIFIÉE — Dispatch V2
// ═══════════════════════════════════════════════════════════════════════════
// Remplace 3 appels séparés :
//   1. enregistrerNotificationsBulk (DispatchNotification.bulkCreate)
//   2. enregistrerInboxNotificationsBulk (Notification.bulkCreate avec dedup_key)
//   3. envoiNotificationPushBatch (function invocation → FCM + bulkUpdate)
//
// Économies :
//   - 1 function invocation supprimée (envoiNotificationPushBatch)
//   - 4 reads redondants supprimés (CourseExterne.get, Livreur.filter,
//     CourseExterne.filter, NotificationToken.filter — déjà faits par l'appelant)
//   - 1 Notification.bulkCreate dupliquée supprimée (le doublon sans dedup_key)
//   - 1 DispatchNotification.filter supprimée (existingDnRecords passé en paramètre)
//
// Conserve :
//   - DispatchNotification tracking (statut, vue_at, refus, acceptation, temps_reponse)
//   - Inbox Notification officielle (avec deduplication_key)
//   - FCM envoi parallèle par chunks de 25 (Promise.allSettled)
//   - accepterCourseV2 strictement inchangé
// ═══════════════════════════════════════════════════════════════════════════

import {
  getFirebaseConfig, getAccessToken, sendFcmMessage,
  selectLatestNativeTokens,
  ANDROID_CHANNEL_ID, ANDROID_CLICK_ACTION, APP_URL,
} from './fcmUtils.ts';

const CHUNK_SIZE = 25;

/**
 * Notifie une liste de livreurs candidats en une seule passe unifiée.
 *
 * @param base44 - client Base44 (service role)
 * @param course - la course publiée ({ id, country_code, quartier_depart, adresse_depart, quartier_arrivee, adresse_arrivee, prix_propose_admin, prix_estimate, prix_final, devise })
 * @param candidats - liste des livreurs déjà filtrés ({ id, user_email, country_code, priorite_dispatch, prenom, nom })
 * @param existingDnRecords - DispatchNotification records déjà fetchées pour cette course (évite 1 re-read)
 * @returns {{ notified, push_sent, push_failed }}
 */
export async function notifierLivreursUnifie(base44: any, course: any, candidats: any[], existingDnRecords?: any[]) {
  if (!candidats || candidats.length === 0) {
    console.log('[PushUnifie] ⚠️ 0 candidat — course ' + course?.id);
    return { notified: 0, push_sent: 0, push_failed: 0, reason: 'no_candidates' };
  }

  const livreurIds = candidats.map((l: any) => l.id);
  console.log('[PushUnifie] 📊 candidats=' + candidats.length + ' course=' + course?.id);

  // ── 1. UN SEUL READ : tous les tokens FCM actifs pour les candidats ──
  // ❌ PAS DE .catch(() => []) — si la lecture échoue, on doit le savoir
  let allTokens: any[];
  try {
    allTokens = await base44.asServiceRole.entities.NotificationToken.filter(
      { livreur_id: { $in: livreurIds }, actif: true }, undefined, livreurIds.length * 3
    );
  } catch (err: any) {
    console.error('[PushUnifie] ❌ ERREUR LECTURE TOKENS: ' + (err?.message || String(err)));
    // FALLBACK EXPLICITE — ne jamais retourner silencieusement 0
    // On journalise l'erreur et on retourne un statut d'échec clair
    return {
      notified: 0, push_sent: 0, push_failed: 0,
      error: 'token_read_failed: ' + (err?.message || String(err)),
      silent_fallback: false,
    };
  }

  console.log('[PushUnifie] 📊 tokens trouvés=' + (allTokens?.length || 0));

  // ── 2. Calcul en mémoire : candidats à notifier (avec token, pas déjà notifiés) ──
  const existingIds = new Set((existingDnRecords || []).map((n: any) => n.livreur_id));

  const tokensByLivreur = new Map();
  for (const token of allTokens || []) {
    const lid = String(token.livreur_id || '');
    if (!lid) continue;
    if (!tokensByLivreur.has(lid)) tokensByLivreur.set(lid, []);
    tokensByLivreur.get(lid).push(token);
  }

  const toNotify: { livreur: any; tokens: any[] }[] = [];
  const skippedNoToken: string[] = [];
  for (const livreur of candidats) {
    if (existingIds.has(livreur.id)) continue;
    const tokens = tokensByLivreur.get(livreur.id) || [];
    const nativeTokens = selectLatestNativeTokens(tokens);
    if (nativeTokens.length === 0) {
      skippedNoToken.push(livreur.id);
      continue;
    }
    toNotify.push({ livreur, tokens: nativeTokens });
  }

  console.log('[PushUnifie] 📊 toNotify=' + toNotify.length + ' skippedNoToken=' + skippedNoToken.length + ' alreadyNotified=' + existingIds.size);

  if (toNotify.length === 0) {
    console.warn('[PushUnifie] ⚠️ 0 livreur avec token FCM natif — ' + skippedNoToken.length + ' sans token, course ' + course?.id);
    return { notified: 0, push_sent: 0, push_failed: 0, reason: 'no_native_tokens', candidates: candidats.length, skipped_no_token: skippedNoToken.length };
  }

  // ── 3. Bulk create DispatchNotifications (statut='notifie') — 1 appel ──
  const nowIso = new Date().toISOString();
  const dnRecords = toNotify.map(({ livreur }) => ({
    course_id: course.id,
    livreur_id: livreur.id,
    livreur_user_email: livreur.user_email || null,
    country_code: livreur.country_code || course.country_code || '',
    vague: 0,
    statut: 'notifie',
    priorite_dispatch: livreur.priorite_dispatch || 0,
    date_notification: nowIso,
  }));
  let dnCreated: any[] = [];
  try {
    dnCreated = await base44.asServiceRole.entities.DispatchNotification.bulkCreate(dnRecords);
  } catch (err: any) {
    console.error('[PushUnifie] ❌ ERREUR BULK CREATE DN: ' + (err?.message || String(err)));
    return {
      notified: 0, push_sent: 0, push_failed: 0,
      error: 'dn_bulk_create_failed: ' + (err?.message || String(err)),
      silent_fallback: false,
    };
  }
  console.log('[PushUnifie] ✅ DispatchNotification créées=' + (Array.isArray(dnCreated) ? dnCreated.length : 0));

  // ── 4. Bulk create inbox Notifications (avec dedup_key — l'inbox officielle) ──
  // 1 filter (dedup keys existantes) + 1 bulkCreate = 2 appels
  const notifRecords = toNotify
    .filter(({ livreur }) => livreur.user_email)
    .map(({ livreur }) => ({
      titre: 'Nouvelle course SILGAPP',
      message: `${course.quartier_depart || course.adresse_depart || 'Départ'} → ${course.quartier_arrivee || course.adresse_arrivee || 'destination'}`,
      type: 'nouvelle_course',
      course_id: course.id,
      destinataire_email: livreur.user_email,
      deduplication_key: `COURSE_DISPATCH_${course.id}_${livreur.id}`,
      lue: false,
    }));

  if (notifRecords.length > 0) {
    const dedupKeys = notifRecords.map(n => n.deduplication_key);
    try {
      const existingInbox = await base44.asServiceRole.entities.Notification.filter(
        { deduplication_key: { $in: dedupKeys } }, undefined, dedupKeys.length
      );
      const existingKeys = new Set((existingInbox || []).map((n: any) => n.deduplication_key));
      const toCreate = notifRecords.filter(n => !existingKeys.has(n.deduplication_key));
      if (toCreate.length > 0) {
        await base44.asServiceRole.entities.Notification.bulkCreate(toCreate);
        console.log('[PushUnifie] ✅ Inbox Notifications créées=' + toCreate.length);
      }
    } catch (err: any) {
      console.error('[PushUnifie] ⚠️ Erreur inbox (non bloquant): ' + (err?.message || String(err)));
    }
  }

  // ── 5. Envoi FCM parallèle par chunks de 25 — 0 appel Base44 ──
  const { projectId, clientEmail, privateKey } = getFirebaseConfig();
  if (!projectId || !clientEmail || !privateKey) {
    return { notified: toNotify.length, push_sent: 0, push_failed: 0, warning: 'Firebase credentials missing' };
  }

  const accessToken = await getAccessToken(clientEmail, privateKey);
  const notificationTag = String(course.id).slice(0, 64);

  // Contenu du message enrichi (prix + quartiers si disponibles)
  const depart = course.quartier_depart || course.adresse_depart || 'Départ';
  const arrivee = course.quartier_arrivee || course.adresse_arrivee || 'destination';
  const prix = course.prix_propose_admin || course.prix_estimate || course.prix_final;
  const devise = course.devise || 'FCFA';
  const msgContent = (prix && Number(prix) > 0)
    ? `${depart} → ${arrivee} — ${Number(prix).toLocaleString()} ${devise}`
    : `${depart} → ${arrivee}`;
  const titreContent = 'Nouvelle course SILGAPP';

  const dataPayloadBase = {
    type: 'nouvelle_course',
    user_type: 'livreur',
    course_id: String(course.id),
    click_action: ANDROID_CLICK_ACTION,
    dispatch_version: '2',
  };

  const tokenUpdates: any[] = [];
  const dispatchStatutUpdates: { livreur_id: string; statut: string }[] = [];
  let succes = 0;
  let echecs = 0;

  // Parallélisation : chunks de 25 envois FCM simultanés via Promise.allSettled
  for (let i = 0; i < toNotify.length; i += CHUNK_SIZE) {
    const chunk = toNotify.slice(i, i + CHUNK_SIZE);
    await Promise.allSettled(chunk.map(async ({ livreur, tokens }) => {
      const dataPayload = { ...dataPayloadBase, livreur_id: String(livreur.id) };
      let pushSuccess = false;
      let pushFailed = false;

      for (const tokenItem of tokens) {
        const platform = String(tokenItem.platform || '').toLowerCase();
        const isIOS = platform.includes('ios');
        const isAndroid = platform.includes('android');

        let payload: any;
        if (isAndroid) {
          payload = {
            data: { ...dataPayload, title: titreContent, body: msgContent },
            android: { collapse_key: notificationTag, priority: 'HIGH', ttl: '90s' },
          };
        } else if (isIOS) {
          payload = {
            notification: { title: titreContent, body: msgContent },
            data: { ...dataPayload, title: titreContent, body: msgContent },
            apns: {
              payload: { aps: { alert: { title: titreContent, body: msgContent }, sound: 'default', badge: 1, 'content-available': 1, 'mutable-content': 1, 'interruption-level': 'time-sensitive' }, ...dataPayload },
              headers: { 'apns-priority': '10', 'apns-collapse-id': notificationTag },
            },
          };
        } else {
          payload = {
            notification: { title: titreContent, body: msgContent },
            data: dataPayload,
            android: { collapse_key: notificationTag, priority: 'HIGH', ttl: '86400s', notification: { tag: notificationTag, channel_id: ANDROID_CHANNEL_ID, sound: 'default', visibility: 'PUBLIC', click_action: ANDROID_CLICK_ACTION, notification_priority: 'PRIORITY_HIGH' } },
            apns: {
              payload: { aps: { alert: { title: titreContent, body: msgContent }, sound: 'default', badge: 1, 'content-available': 1, 'mutable-content': 1, 'interruption-level': 'time-sensitive' } },
              headers: { 'apns-priority': '10', 'apns-collapse-id': notificationTag },
            },
            webpush: { fcm_options: { link: APP_URL } },
          };
        }

        try {
          const response = await sendFcmMessage(projectId, accessToken, tokenItem.token, payload);
          const nowIsoInner = new Date().toISOString();
          if (!response.ok) {
            const errorCode = response.result?.error?.details?.[0]?.errorCode || response.result?.error?.status;
            const isInvalid = ['UNREGISTERED', 'INVALID_ARGUMENT'].includes(errorCode);
            tokenUpdates.push({
              id: tokenItem.id,
              actif: isInvalid ? false : tokenItem.actif,
              derniere_notif_statut: 'failed',
              derniere_notif_titre: titreContent,
              derniere_notif_date: nowIsoInner,
              fcm_error: JSON.stringify(response.result?.error || {}).slice(0, 300),
            });
            echecs++;
            pushFailed = true;
          } else {
            tokenUpdates.push({
              id: tokenItem.id,
              derniere_utilisation: nowIsoInner,
              derniere_notif_statut: 'success',
              derniere_notif_titre: titreContent,
              derniere_notif_date: nowIsoInner,
              fcm_error: null,
            });
            succes++;
            pushSuccess = true;
          }
        } catch (err) {
          echecs++;
          pushFailed = true;
        }
      }

      const finalStatut = pushSuccess ? 'push_succes' : (pushFailed ? 'push_echec' : 'sans_token');
      dispatchStatutUpdates.push({ livreur_id: livreur.id, statut: finalStatut });
    }));
  }

  // ── 6. Bulk update DispatchNotification statuts — max 3 updateMany (groupés par statut) ──
  if (dispatchStatutUpdates.length > 0) {
    const byStatut: Record<string, string[]> = {};
    for (const u of dispatchStatutUpdates) {
      if (!byStatut[u.statut]) byStatut[u.statut] = [];
      byStatut[u.statut].push(u.livreur_id);
    }
    const promises = [];
    for (const [statut, ids] of Object.entries(byStatut)) {
      promises.push(
        base44.asServiceRole.entities.DispatchNotification.updateMany(
          { course_id: course.id, livreur_id: { $in: ids }, statut: { $in: ['notifie', 'push_tente', 'sans_token'] } },
          { $set: { statut } }
        )
      );
    }
    const results = await Promise.allSettled(promises);
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) console.warn('[PushUnifie] ⚠️ ' + failed + ' updateMany DN ont échoué (non bloquant)');
  }

  // ── 7. Bulk update NotificationToken statuts — 1 appel ──
  if (tokenUpdates.length > 0) {
    try {
      await base44.asServiceRole.entities.NotificationToken.bulkUpdate(tokenUpdates);
    } catch (err: any) {
      console.warn('[PushUnifie] ⚠️ Erreur bulkUpdate tokens (non bloquant): ' + (err?.message || String(err)));
    }
  }

  console.log('[PushUnifie] ✅ RÉSULTAT notified=' + toNotify.length + ' push_sent=' + succes + ' push_failed=' + echecs);
  return { notified: toNotify.length, push_sent: succes, push_failed: echecs };
}