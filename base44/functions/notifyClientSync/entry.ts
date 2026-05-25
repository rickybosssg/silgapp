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

    // 1. Notifier le destinataire s'il a l'application (course type "expedier")
    if (course.type_course === "expedier" && course.destinataire_client_id) {
      // Trouver le client destinataire
      const destinataireClient = await base44.entities.ClientExterne.get(course.destinataire_client_id);
      
      if (destinataireClient && destinataireClient.user_email) {
        const notification = await base44.entities.Notification.create({
          titre: "Colis en route",
          message: `Vous allez bientôt recevoir un colis de ${course.expediteur_nom || "un expéditeur"}.`,
          type: "nouvelle_course",
          course_id: course.id,
          destinataire_email: destinataireClient.user_email,
          lue: false
        });
        
        notifications.push(notification);
      }
    }

    // 2. Notifier l'expéditeur s'il a l'application (course type "recevoir")
    if (course.type_course === "recevoir" && course.expediteur_client_id) {
      // Trouver le client expéditeur
      const expediteurClient = await base44.entities.ClientExterne.get(course.expediteur_client_id);
      
      if (expediteurClient && expediteurClient.user_email) {
        const notification = await base44.entities.Notification.create({
          titre: "Demande de récupération",
          message: `${course.destinataire_nom || "Un client"} a demandé la récupération d'un colis chez vous.`,
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