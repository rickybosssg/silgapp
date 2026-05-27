import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { course_id } = await req.json();

    // Récupérer la course
    const course = await base44.entities.CourseExterne.get(course_id);
    if (!course) {
      return Response.json({ error: "Course non trouvée" }, { status: 404 });
    }

    const notifications = [];

    // Helper : résoudre un client par id OU par téléphone normalisé
    const resolveClient = async (clientId, telephone) => {
      if (clientId) {
        try { return await base44.entities.ClientExterne.get(clientId); } catch (_) {}
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
          titre: "📦 Vous allez recevoir un colis",
          message: `${course.expediteur_nom || "Un expéditeur"} vous envoie un colis${course.type_colis ? " (" + course.type_colis.replace(/_/g, " ") + ")" : ""}. ${course.adresse_depart ? "Récupération depuis : " + course.adresse_depart : ""}`,
          type: "nouvelle_course",
          course_id: course.id,
          destinataire_email: destinataireClient.user_email,
          lue: false
        });
        notifications.push(notification);
      }
    }

    // 2. Notifier l'expéditeur s'il a l'application (course type "recevoir")
    if (course.type_course === "recevoir") {
      const expediteurClient = await resolveClient(course.expediteur_client_id, course.expediteur_telephone);
      if (expediteurClient && expediteurClient.user_email) {
        // Lier automatiquement si pas encore lié
        if (!course.expediteur_client_id) {
          await base44.asServiceRole.entities.CourseExterne.update(course.id, {
            expediteur_client_id: expediteurClient.id,
            expediteur_has_app: true,
          });
        }
        const notification = await base44.asServiceRole.entities.Notification.create({
          titre: "📦 Colis à récupérer chez vous",
          message: `${course.destinataire_nom || "Un client"} veut récupérer un colis chez vous. Un livreur viendra le chercher. ${course.adresse_depart ? "Récupération : " + course.adresse_depart : ""}`,
          type: "nouvelle_course",
          course_id: course.id,
          destinataire_email: expediteurClient.user_email,
          lue: false
        });
        notifications.push(notification);
      }
    }

    return Response.json({ 
      success: true,
      notifications_created: notifications.length
    });
    
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});