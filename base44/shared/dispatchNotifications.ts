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
 * (statut: notifie, accepte, refuse, expire — tous ceux qui ont été sollicités)
 */
export async function getLivreursNotifies(base44, courseId) {
  try {
    const notifs = await base44.asServiceRole.entities.DispatchNotification.filter(
      { course_id: courseId }, '-date_notification', 500
    );
    return (notifs || []).map(n => n.livreur_id);
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