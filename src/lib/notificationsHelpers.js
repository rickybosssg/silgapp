import { base44 } from "@/api/base44Client";

async function saveNotificationFallback(payload) {
  const notification = await base44.entities.Notification.create({
    titre: payload.titre,
    message: payload.message,
    type: payload.type || "generic",
    course_id: payload.course_id || "",
    destinataire_email: payload.destinataire_email,
    lue: false,
  });

  return {
    success: true,
    notification_id: notification.id,
    warning: "Notification interne enregistree, push FCM non envoye",
  };
}

async function sendPushNotification(titre, message, type, destinataire_email, extras = {}) {
  const payload = {
    titre,
    message,
    type,
    destinataire_email,
    ...extras,
  };

  try {
    const result = await base44.functions.invoke("envoiNotificationPush", payload);
    if (result?.error) throw new Error(result.error);
    return result;
  } catch (error) {
    console.error("Erreur envoi notification:", error);
    return saveNotificationFallback(payload);
  }
}

export async function notifyNouvelleCourse(livreur_email, course) {
  return sendPushNotification(
    "Nouvelle course assignee",
    `Une nouvelle course vous a ete assignee. ${course.adresse_depart} -> ${course.adresse_arrivee}`,
    "nouvelle_course",
    livreur_email,
    { course_id: course.id, livreur_id: course.livreur_id }
  );
}

export async function notifyCourseAcceptee(livreur_nom, course, admin_email) {
  return sendPushNotification(
    "Course acceptee",
    `${livreur_nom} a accepte la course ${course.client_nom}`,
    "course_acceptee",
    admin_email,
    { course_id: course.id }
  );
}

export async function notifyCourseRefusee(livreur_nom, course, admin_email) {
  return sendPushNotification(
    "Course refusee",
    `${livreur_nom} a refuse la course ${course.client_nom}`,
    "course_refusee",
    admin_email,
    { course_id: course.id }
  );
}

export async function notifyCourseLivree(livreur_nom, course, admin_email) {
  return sendPushNotification(
    "Course livree",
    `${livreur_nom} a livre la course de ${course.client_nom}`,
    "course_livree",
    admin_email,
    { course_id: course.id }
  );
}

export async function notifyBatterieFaible(alerte, admin_email) {
  return sendPushNotification(
    "Batterie faible",
    `${alerte.livreur_nom} a signale une batterie faible (${alerte.quartier || "position inconnue"})`,
    "batterie_faible",
    admin_email,
    { livreur_id: alerte.livreur_id }
  );
}

export async function notifyLivreurHorsLigne(livreur, admin_email) {
  return sendPushNotification(
    "Livreur hors ligne",
    `${livreur.prenom} ${livreur.nom} est maintenant hors ligne`,
    "livreur_hors_ligne",
    admin_email,
    { livreur_id: livreur.id }
  );
}

export async function notifyPaiementValide(livreur_email, montant, admin_nom) {
  return sendPushNotification(
    "Paiement valide",
    `Votre paiement de ${montant.toLocaleString()} FCFA a ete valide par ${admin_nom}`,
    "paiement_valide",
    livreur_email
  );
}

export async function notifyCourseProximite(livreur_email, course, distance) {
  return sendPushNotification(
    "Course a proximite",
    `Une course est disponible a ${distance}m de votre position`,
    "course_proximite",
    livreur_email,
    { course_id: course.id }
  );
}

export async function notifyRappelReponse(livreur_email, course) {
  return sendPushNotification(
    "En attente de reponse",
    `Vous avez une course en attente de reponse: ${course.client_nom}`,
    "rappel_reponse",
    livreur_email,
    { course_id: course.id }
  );
}
