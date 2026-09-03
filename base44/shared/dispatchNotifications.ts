/**
 * ── Gestionnaire de notifications de dispatch ──────────────────────────
 * Remplace les JSON strings (dispatch_notified_ids, dispatch_refused_ids)
 * par des enregistrements individuels dans l'entité DispatchNotification.
 *
 * Avantages :
 * - Pas de parsing JSON fragile
 * - Requêtes directes par course_id / livreur_id / statut
 * - Traçabilité complète (distance, GPS, priorité, temps de réponse)
 * - Évolution facile (ajout de champs sans casser le parsing)
 */

/**
 * Récupère les IDs des livreurs déjà notifiés pour une course
 * (statut: notifie, accepte, expire — tous ceux qui ont été sollicités)
 *
 * ⚠️ Le statut 'refuse' est EXCLU du résultat : un refus est une exclusion
 * permanente scopée à la course (gérée par getLivreursRefuses), pas une
 * preuve qu'une vague de diffusion a déjà été créée. L'anti-race check
 * de publierCourseDansFil (dispatchV2.ts) s'appuie sur cette fonction
 * pour détecter les doublons de publication — un refus seul ne doit pas
 * bloquer le redispatch.
 *
 * Correctif validé le 2026-08-31 (SG-20260831-544795) :
 *   - Sépare « déjà publié » (sollicitations) de « livreurs exclus » (refus).
 *   - getLivreursRefuses() continue de retourner les refus pour l'exclusion.
 *   - Aucun impact sur Livreur.statut ni sur les règles d'éligibilité.
 */
export async function getLivreursNotifies(base44, courseId) {
  try {
    const notifs = await base44.asServiceRole.entities.DispatchNotification.filter(
      { course_id: courseId }, '-date_notification', 500
    );
    return (notifs || [])
      .filter(n => n.statut !== 'refuse')
      .map(n => n.livreur_id);
  } catch (err) {
    console.error('[DispatchNotif] Erreur getLivreursNotifies:', err.message);
    return [];
  }
}

/**
 * Récupère les IDs des livreurs ayant REFUSÉ une course
 * (exclusion permanente — survit au reset de cycle)
 */
export async function getLivreursRefuses(base44, courseId) {
  try {
    const notifs = await base44.asServiceRole.entities.DispatchNotification.filter(
      { course_id: courseId, statut: 'refuse' }, '-date_notification', 500
    );
    return (notifs || []).map(n => n.livreur_id);
  } catch (err) {
    console.error('[DispatchNotif] Erreur getLivreursRefuses:', err.message);
    return [];
  }
}

/**
 * Récupère les IDs des livreurs notifiés MAIS pas encore refusés
 * (notifié seulement — encore en attente de réponse)
 */
export async function getLivreursEnAttente(base44, courseId) {
  try {
    const notifs = await base44.asServiceRole.entities.DispatchNotification.filter(
      { course_id: courseId, statut: 'notifie' }, '-date_notification', 500
    );
    return (notifs || []).map(n => n.livreur_id);
  } catch (err) {
    console.error('[DispatchNotif] Erreur getLivreursEnAttente:', err.message);
    return [];
  }
}

/**
 * Vérifie si un livreur possède au moins un token FCM natif exploitable.
 * Un livreur sans token ne peut pas recevoir de push FCM.
 */
async function livreurATokenFCM(base44, livreurId) {
  if (!livreurId) return false;
  try {
    const tokens = await base44.asServiceRole.entities.NotificationToken.filter(
      { livreur_id: livreurId, actif: true }, undefined, 10
    );
    // Un token natif = un token qui ne commence pas par "web_"
    return (tokens || []).some(t => t.token && !String(t.token).startsWith('web_'));
  } catch {
    return false;
  }
}

/**
 * Met à jour le statut d'une DispatchNotification existante.
 * Utilisé par envoiNotificationPushBatch pour tracer le résultat FCM réel.
 *
 * Ne modifie PAS les notifications déjà en statut terminal (accepte, refuse, expire).
 */
export async function mettreAJourStatutPush(base44, courseId, livreurId, nouveauStatut) {
  try {
    await base44.asServiceRole.entities.DispatchNotification.updateMany(
      { course_id: courseId, livreur_id: livreurId, statut: { $in: ['notifie', 'push_tente', 'sans_token'] } },
      { $set: { statut: nouveauStatut } }
    );
  } catch (err) {
    console.error('[DispatchNotif] Erreur mettreAJourStatutPush:', err.message);
  }
}

/**
 * Enregistre une notification de dispatch pour un livreur.
 *
 * FIX TÉLÉMÉTRIE (2026-08-29) :
 * - Vérifie si le livreur a un token FCM natif exploitable.
 * - Si aucun token → statut = 'sans_token' (aucun push possible).
 * - Si token présent → statut = 'notifie' (push sera tenté par envoiNotificationPushBatch).
 *
 * Un livreur sans token ne doit JAMAIS être enregistré comme 'notifie'.
 */
export async function enregistrerNotification(base44, courseId, livreur, vague, options = {}) {
  try {
    // Vérifier si une notification existe déjà pour ce couple course/livreur
    const existing = await base44.asServiceRole.entities.DispatchNotification.filter(
      { course_id: courseId, livreur_id: livreur.id }, '-date_notification', 1
    );

    if (existing && existing.length > 0) {
      // Déjà notifié — ne pas dupliquer
      return existing[0];
    }

    // Vérifier la présence d'un token FCM natif exploitable
    const hasToken = await livreurATokenFCM(base44, livreur.id);
    const statut = hasToken ? 'notifie' : 'sans_token';

    return await base44.asServiceRole.entities.DispatchNotification.create({
      course_id: courseId,
      livreur_id: livreur.id,
      livreur_user_email: livreur.user_email || null,
      country_code: livreur.country_code || options.country_code || '',
      vague: vague || 1,
      statut,
      distance_km: livreur.distance != null ? Number(livreur.distance.toFixed(2)) : null,
      gps_age_min: livreur.gpsAgeMin != null ? Number(livreur.gpsAgeMin.toFixed(1)) : null,
      priorite_dispatch: livreur.priorite_dispatch || 0,
      date_notification: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[DispatchNotif] Erreur enregistrerNotification:', err.message);
    return null;
  }
}

/**
 * Marque une notification comme refusée
 */
export async function marquerRefuse(base44, courseId, livreurId, raison = '') {
  try {
    await base44.asServiceRole.entities.DispatchNotification.updateMany(
      { course_id: courseId, livreur_id: livreurId, statut: 'notifie' },
      { $set: { statut: 'refuse', date_reponse: new Date().toISOString(), raison_refus: raison } }
    );
  } catch (err) {
    console.error('[DispatchNotif] Erreur marquerRefuse:', err.message);
  }
}

/**
 * Marque une notification comme acceptée
 */
export async function marquerAccepte(base44, courseId, livreurId, tempsReponseSec = null) {
  try {
    const updateData = {
      $set: {
        statut: 'accepte',
        date_reponse: new Date().toISOString(),
      }
    };
    if (tempsReponseSec != null) {
      updateData.$set.temps_reponse_sec = tempsReponseSec;
    }
    await base44.asServiceRole.entities.DispatchNotification.updateMany(
      { course_id: courseId, livreur_id: livreurId, statut: 'notifie' },
      updateData
    );
  } catch (err) {
    console.error('[DispatchNotif] Erreur marquerAccepte:', err.message);
  }
}

/**
 * Marque toutes les notifications "notifie" d'une course comme expirées
 */
export async function marquerExpirees(base44, courseId) {
  try {
    await base44.asServiceRole.entities.DispatchNotification.updateMany(
      { course_id: courseId, statut: 'notifie' },
      { $set: { statut: 'expire', date_reponse: new Date().toISOString() } }
    );
  } catch (err) {
    console.error('[DispatchNotif] Erreur marquerExpirees:', err.message);
  }
}

/**
 * Réinitialise les notifications d'une course (lors d'un reset de cycle)
 * Garde les refusés (exclusion permanente), supprime les notifiés/expirés
 */
export async function resetNotifications(base44, courseId) {
  try {
    await base44.asServiceRole.entities.DispatchNotification.deleteMany(
      { course_id: courseId, statut: { $in: ['notifie', 'expire', 'accepte'] } }
    );
  } catch (err) {
    console.error('[DispatchNotif] Erreur resetNotifications:', err.message);
  }
}

/**
 * Compte les notifications par statut pour une course
 */
export async function compterNotifications(base44, courseId) {
  try {
    const notifs = await base44.asServiceRole.entities.DispatchNotification.filter(
      { course_id: courseId }, '-date_notification', 500
    );
    const stats = { total: notifs.length, notifie: 0, refuse: 0, expire: 0, accepte: 0 };
    for (const n of notifs || []) {
      if (stats[n.statut] != null) stats[n.statut]++;
    }
    return stats;
  } catch (err) {
    console.error('[DispatchNotif] Erreur compterNotifications:', err.message);
    return { total: 0, notifie: 0, refuse: 0, expire: 0, accepte: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📦 BULK OPERATIONS — Éliminent les N+1 lors du dispatch
// ═══════════════════════════════════════════════════════════════════════════
// Ces fonctions remplacent les Promise.allSettled(candidats.map(...)) qui
// généraient 3 appels API par livreur (filter + filter + create).
// Chaque fonction bulk fait au maximum 2 requêtes API quelle que soit la
// taille de la liste de candidats.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enregistre les DispatchNotifications pour TOUS les candidats en bulk.
 *
 * AVANT (N+1) : pour chaque candidat → filter + livreurATokenFCM + create = 3N appels
 * APRÈS (bulk) : 1 filter (DispatchNotification existantes)
 *              + 1 filter (NotificationToken avec $in)
 *              + 1 bulkCreate (DispatchNotification manquantes)
 *              = 3 appels fixes, quelle que soit la taille de candidats.
 *
 * Préserve EXACTEMENT : course_id, livreur_id, statuts, priorité, timestamps,
 * informations push, refus existants, idempotence.
 *
 * @param {object} base44 - client Base44
 * @param {string} courseId - ID de la course
 * @param {Array} candidats - liste des livreurs candidats ({id, user_email, country_code, distance, gpsAgeMin, priorite_dispatch})
 * @param {number} vague - numéro de vague (0 pour T=0)
 * @param {object} options - options ({ country_code })
 * @returns {{ created: number, notifs: Array }}
 */
export async function enregistrerNotificationsBulk(base44, courseId, candidats, vague = 0, options = {}) {
  if (!candidats || candidats.length === 0) return { created: 0, notifs: [] };
  try {
    const livreurIds = candidats.map(l => l.id);

    // 1. UNE seule requête : toutes les DispatchNotification existantes pour cette course
    const existing = await base44.asServiceRole.entities.DispatchNotification.filter(
      { course_id: courseId }, '-date_notification', 500
    );
    const existingIds = new Set((existing || []).map(n => n.livreur_id));

    // 2. UNE seule requête : tous les tokens FCM actifs pour les candidats
    const tokens = await base44.asServiceRole.entities.NotificationToken.filter(
      { livreur_id: { $in: livreurIds }, actif: true }, undefined, livreurIds.length * 3
    ).catch(() => []);

    // Construire l'ensemble des livreur_ids qui ont au moins un token natif
    const livreursWithToken = new Set();
    for (const t of (tokens || [])) {
      if (t.token && !String(t.token).startsWith('web_')) {
        livreursWithToken.add(t.livreur_id);
      }
    }

    // 3. Déterminer en mémoire les candidats manquants (idempotence)
    const toCreate = [];
    for (const livreur of candidats) {
      if (existingIds.has(livreur.id)) continue; // déjà notifié — pas de doublon

      const hasToken = livreursWithToken.has(livreur.id);
      const statut = hasToken ? 'notifie' : 'sans_token';

      toCreate.push({
        course_id: courseId,
        livreur_id: livreur.id,
        livreur_user_email: livreur.user_email || null,
        country_code: livreur.country_code || options.country_code || '',
        vague: vague || 1,
        statut,
        distance_km: livreur.distance != null ? Number(livreur.distance.toFixed(2)) : null,
        gps_age_min: livreur.gpsAgeMin != null ? Number(livreur.gpsAgeMin.toFixed(1)) : null,
        priorite_dispatch: livreur.priorite_dispatch || 0,
        date_notification: new Date().toISOString(),
      });
    }

    // 4. UNE seule requête : bulkCreate pour toutes les notifications manquantes
    let created = [];
    if (toCreate.length > 0) {
      created = await base44.asServiceRole.entities.DispatchNotification.bulkCreate(toCreate);
    }

    return { created: Array.isArray(created) ? created.length : 0, notifs: created || [] };
  } catch (err) {
    console.error('[DispatchNotif] Erreur enregistrerNotificationsBulk:', err.message);
    return { created: 0, notifs: [] };
  }
}

/**
 * Enregistre les notifications inbox (Notification) pour TOUS les candidats en bulk.
 *
 * AVANT (N+1) : pour chaque candidat → filter (dedup key) + create = 2N appels
 * APRÈS (bulk) : 1 filter (toutes les dedup keys avec $in)
 *              + 1 bulkCreate (notifications manquantes)
 *              = 2 appels fixes.
 *
 * Idempotence : aucun doublon lors d'un retry (comparaison des deduplication_key en mémoire).
 *
 * @param {object} base44 - client Base44
 * @param {object} course - la course ({id, quartier_depart, adresse_depart, quartier_arrivee, adresse_arrivee})
 * @param {Array} candidats - liste des livreurs candidats ({id, user_email})
 * @returns {{ created: number }}
 */
export async function enregistrerInboxNotificationsBulk(base44, course, candidats) {
  if (!candidats || candidats.length === 0) return { created: 0 };
  try {
    const dedupKeys = candidats.map(l => `COURSE_DISPATCH_${course.id}_${l.id}`);

    // 1. UNE seule requête : toutes les notifications existantes avec ces dedup keys
    const existing = await base44.asServiceRole.entities.Notification.filter(
      { deduplication_key: { $in: dedupKeys } }, undefined, dedupKeys.length
    ).catch(() => []);

    const existingKeys = new Set((existing || []).map(n => n.deduplication_key));

    // 2. Construire en mémoire la liste des notifications à créer (idempotence)
    const toCreate = [];
    for (const livreur of candidats) {
      if (!livreur.user_email) continue;
      const dedupKey = `COURSE_DISPATCH_${course.id}_${livreur.id}`;
      if (existingKeys.has(dedupKey)) continue; // déjà existant — pas de doublon

      toCreate.push({
        titre: 'Nouvelle course SILGAPP',
        message: `${course.quartier_depart || course.adresse_depart || 'Départ'} → ${course.quartier_arrivee || course.adresse_arrivee || 'destination'}`,
        type: 'nouvelle_course',
        course_id: course.id,
        destinataire_email: livreur.user_email,
        deduplication_key: dedupKey,
        lue: false,
      });
    }

    // 3. UNE seule requête : bulkCreate
    if (toCreate.length > 0) {
      await base44.asServiceRole.entities.Notification.bulkCreate(toCreate);
    }

    return { created: toCreate.length };
  } catch (err) {
    console.error('[DispatchNotif] Erreur enregistrerInboxNotificationsBulk:', err.message);
    return { created: 0 };
  }
}

/**
 * Met à jour les statuts push de plusieurs DispatchNotifications en bulk.
 *
 * AVANT (N+1) : mettreAJourStatutPush × N (un updateMany par livreur)
 * APRÈS (bulk) : regroupe par statut → 1 updateMany par groupe de statut
 *              (maximum 3 appels : push_succes, push_echec, sans_token)
 *
 * @param {object} base44 - client Base44
 * @param {string} courseId - ID de la course
 * @param {Array} updates - [{ livreur_id, statut }, ...]
 */
export async function mettreAJourStatutPushBulk(base44, courseId, updates) {
  if (!updates || updates.length === 0) return;
  try {
    // Regrouper par statut pour utiliser updateMany (même changement par groupe)
    const byStatut = {};
    for (const u of updates) {
      if (!byStatut[u.statut]) byStatut[u.statut] = [];
      byStatut[u.statut].push(u.livreur_id);
    }

    // Un updateMany par groupe de statut (maximum 3 groupes)
    const promises = [];
    for (const [statut, livreurIds] of Object.entries(byStatut)) {
      promises.push(
        base44.asServiceRole.entities.DispatchNotification.updateMany(
          { course_id: courseId, livreur_id: { $in: livreurIds }, statut: { $in: ['notifie', 'push_tente', 'sans_token'] } },
          { $set: { statut } }
        ).catch(() => null)
      );
    }
    await Promise.allSettled(promises);
  } catch (err) {
    console.error('[DispatchNotif] Erreur mettreAJourStatutPushBulk:', err.message);
  }
}