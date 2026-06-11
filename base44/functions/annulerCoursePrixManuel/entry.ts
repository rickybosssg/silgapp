import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { course_id } = await req.json();
    
    if (!course_id) {
      return Response.json({ error: 'course_id requis' }, { status: 400 });
    }

    // Récupérer la course
    const courses = await base44.entities.CourseExterne.filter({ id: course_id });
    const course = courses[0];
    
    if (!course) {
      return Response.json({ error: 'Course non trouvée' }, { status: 404 });
    }

    // Vérifier que la course est en attente de validation de prix manuel
    if (course.pricing_mode !== 'manual' || course.manual_price_status !== 'pending_client_validation') {
      return Response.json({ 
        error: 'La course n\'est pas en attente de validation de prix manuel' 
      }, { status: 400 });
    }

    // Annuler la course
    await base44.entities.CourseExterne.update(course_id, {
      statut: 'annulee',
      dispatch_status: 'expire',
      manual_price_status: 'refused',
    });

    // Libérer le livreur
    if (course.livreur_id) {
      const livreurs = await base44.entities.Livreur.filter({ id: course.livreur_id });
      const livreur = livreurs[0];
      
      if (livreur && livreur.statut === 'en_course') {
        await base44.entities.Livreur.update(course.livreur_id, {
          statut: 'disponible',
        });
      }
    }

    // Archiver les notifications liées
    try {
      const notifications = await base44.entities.Notification.filter({
        course_id: course_id,
        lue: false,
      });
      
      for (const notif of notifications) {
        await base44.entities.Notification.update(notif.id, { lue: true });
      }
    } catch (_) {}

    return Response.json({ 
      success: true, 
      message: 'Course annulée avec succès' 
    });
    
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});