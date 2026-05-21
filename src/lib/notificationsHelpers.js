import { base44 } from "@/api/base44Client";

/**
 * Envoyer une notification push
 */
async function sendPushNotification(titre, message, type, destinataire_email, extras = {}) {
  try {
    const result = await base44.functions.invoke('envoiNotificationPush', {
      titre,
      message,
      type,
      destinataire_email,
      ...extras,
    });
    return result;
  } catch (error) {
    console.error('Erreur envoi notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Notification: Nouvelle course assignée (livreur)
 */
export async function notifyNouvelleCourse(livreur_email, course) {
  return sendPushNotification(
    '📦 Nouvelle course assignée',
    `Une nouvelle course vous a été assignée. ${course.adresse_depart} → ${course.adresse_arrivee}`,
    'nouvelle_course',
    livreur_email,
    { course_id: course.id, livreur_id: course.livreur_id }
  );
}

/**
 * Notification: Course acceptée (admin)
 */
export async function notifyCourseAcceptee(livreur_nom, course, admin_email) {
  return sendPushNotification(
    '✅ Course acceptée',
    `${livreur_nom} a accepté la course ${course.client_nom}`,
    'course_acceptee',
    admin_email,
    { course_id: course.id }
  );
}

/**
 * Notification: Course refusée (admin)
 */
export async function notifyCourseRefusee(livreur_nom, course, admin_email) {
  return sendPushNotification(
    '❌ Course refusée',
    `${livreur_nom} a refusé la course ${course.client_nom}`,
    'course_refusee',
    admin_email,
    { course_id: course.id }
  );
}

/**
 * Notification: Course livrée (admin)
 */
export async function notifyCourseLivree(livreur_nom, course, admin_email) {
  return sendPushNotification(
    '🎉 Course livrée',
    `${livreur_nom} a livré la course de ${course.client_nom}`,
    'course_livree',
    admin_email,
    { course_id: course.id }
  );
}

/**
 * Notification: Batterie faible (admin)
 */
export async function notifyBatterieFaible(alerte, admin_email) {
  return sendPushNotification(
    '🔋 Batterie faible',
    `${alerte.livreur_nom} a signalé une batterie faible (${alerte.quartier || 'position inconnue'})`,
    'batterie_faible',
    admin_email,
    { livreur_id: alerte.livreur_id }
  );
}

/**
 * Notification: Livreur hors ligne (admin)
 */
export async function notifyLivreurHorsLigne(livreur, admin_email) {
  return sendPushNotification(
    '📴 Livreur hors ligne',
    `${livreur.prenom} ${livreur.nom} est maintenant hors ligne`,
    'livreur_hors_ligne',
    admin_email,
    { livreur_id: livreur.id }
  );
}

/**
 * Notification: Paiement validé (livreur)
 */
export async function notifyPaiementValide(livreur_email, montant, admin_nom) {
  return sendPushNotification(
    '💰 Paiement validé',
    `Votre paiement de ${montant.toLocaleString()} FCFA a été validé par ${admin_nom}`,
    'paiement_valide',
    livreur_email
  );
}

/**
 * Notification: Course à proximité (livreur)
 */
export async function notifyCourseProximite(livreur_email, course, distance) {
  return sendPushNotification(
    '📍 Course à proximité',
    `Une course est disponible à ${distance}m de votre position`,
    'course_proximite',
    livreur_email,
    { course_id: course.id }
  );
}

/**
 * Notification: Rappel réponse (livreur)
 */
export async function notifyRappelReponse(livreur_email, course) {
  return sendPushNotification(
    '⏰ En attente de réponse',
    `Vous avez une course en attente de réponse: ${course.client_nom}`,
    'rappel_reponse',
    livreur_email,
    { course_id: course.id }
  );
}