import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Déclenché par automation quand une CourseExterne est créée.
 * Crée une Notification neutre (sans infos sensibles) pour l'expéditeur/destinataire.
 * La Notification déclenche ensuite envoyerAlerteWhatsApp si l'utilisateur est inactif.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Payload d'automation entity : { event: { entity_id, ... }, data: { ... } }
    const payload = await req.json();
    const courseId = payload.event?.entity_id || payload.course_id || payload.data?.id;
    
    if (!courseId) {
      console.error('[notifyClientSync] ❌ course_id manquant dans payload:', JSON.stringify(payload));
      return Response.json({ error: "course_id manquant" }, { status: 400 });
    }

    // Utiliser service role pour récupérer la course
    const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
    if (!course) {
      return Response.json({ error: "Course non trouvée" }, { status: 404 });
    }

    const notifications = [];

    // Helper : résoudre un client par id OU par téléphone normalisé
    const resolveClient = async (clientId, telephone) => {
      if (clientId) {
        try { return await base44.asServiceRole.entities.ClientExterne.get(clientId); } catch (_) {}
      }
      if (telephone) {
        const tel = telephone.replace(/\D/g, "");
        const telNorm = tel.startsWith("226") && tel.length === 11 ? "+" + tel : tel.length === 8 ? "+226" + tel : null;
        if (telNorm) {
          try {
            const found = await base44.asServiceRole.entities.ClientExterne.filter({ telephone: telNorm });
            if (found?.length > 0) return found[0];
          } catch (_) {}
        }
      }
      return null;
    };

    // Message neutre — pas d'infos sensibles (prix, adresse, GPS, détails course)
    const TITRE_NOTIFICATION = "📦 Nouvelle notification SILGAPP";
    const MESSAGE_NOTIFICATION = "Vous avez reçu une notification importante sur SILGAPP. Ouvrez l'application pour consulter les détails.";

    // 1. Notifier le destinataire (course type "expedier")
    if (course.type_course === "expedier") {
      const destinataireClient = await resolveClient(course.destinataire_client_id, course.destinataire_telephone);
      if (destinataireClient && destinataireClient.user_email) {
        // Lier automatiquement si pas encore lié
        if (!course.destinataire_client_id) {
          await base44.asServiceRole.entities.CourseExterne.update(course.id, {
            destinataire_client_id: destinataireClient.id,
            recipient_has_app: true,
          });
        }
        const notification = await base44.asServiceRole.entities.Notification.create({
          titre: TITRE_NOTIFICATION,
          message: MESSAGE_NOTIFICATION,
          type: "nouvelle_course",
          course_id: course.id,
          destinataire_email: destinataireClient.user_email,
          lue: false
        });
        notifications.push(notification);
        console.log(`[notifyClientSync] ✅ Notif destinataire (${destinataireClient.user_email})`);
      }
    }

    // 2. Notifier l'expéditeur (course type "recevoir")
    if (course.type_course === "recevoir") {
      const expediteurClient = await resolveClient(course.expediteur_client_id, course.expediteur_telephone);
      
      if (expediteurClient && expediteurClient.user_email) {
        // Lier automatiquement si pas encore lié
        if (!course.expediteur_client_id) {
          await base44.asServiceRole.entities.CourseExterne.update(course.id, {
            expediteur_client_id: expediteurClient.id,
          });
        }
        const notification = await base44.asServiceRole.entities.Notification.create({
          titre: TITRE_NOTIFICATION,
          message: MESSAGE_NOTIFICATION,
          type: "nouvelle_course",
          course_id: course.id,
          destinataire_email: expediteurClient.user_email,
          lue: false
        });
        notifications.push(notification);
        console.log(`[notifyClientSync] ✅ Notif expéditeur (${expediteurClient.user_email})`);
      } else {
        console.log(`[notifyClientSync] Expéditeur non trouvé dans la base: ${course.expediteur_telephone}`);
      }
    }

    return Response.json({ 
      success: true,
      notifications_created: notifications.length
    });
    
  } catch (error) {
    console.error('[notifyClientSync] ❌ Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});