import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * NETTOYAGE COURSE ANNULÉE
 * 
 * Quand une course est annulée, cette fonction :
 * 1. Nettoie les champs livreur de la course
 * 2. Remet le livreur en statut "disponible"
 * 
 * Peut être appelée par :
 * - Un admin (via dashboard)
 * - Une automation entity (sans user context)
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Vérifier que c'est un admin qui appelle (sauf si appelé par automation)
    // Les automations n'ont pas de user context, donc on skip la vérification
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { course_id } = await req.json();
    
    if (!course_id) {
      return Response.json({ error: 'course_id requis' }, { status: 400 });
    }

    // Récupérer la course
    const course = await base44.entities.CourseExterne.get(course_id);
    
    if (!course) {
      return Response.json({ error: 'Course non trouvée' }, { status: 404 });
    }

    // Si la course est annulée et a un livreur assigné
    if (course.statut === 'annulee' && course.livreur_id) {
      console.log(`[nettoyerCourseAnnulee] Course ${course_id} annulée, livreur: ${course.livreur_nom}`);
      
      // 1. Nettoyer les champs livreur de la course
      await base44.entities.CourseExterne.update(course_id, {
        dispatch_status: 'expire',
        livreur_id: '',
        livreur_nom: '',
        livreur_telephone: '',
        livreur_photo_url: '',
        livreur_vehicule: '',
        livreur_note_moyenne: 0,
        livreur_nombre_avis: 0,
        heure_acceptation: null,
        heure_sollicitation: null,
        timeout_expires_at: null,
      });

      const livreur = await base44.entities.Livreur.get(course.livreur_id).catch(() => null);
      await base44.entities.Livreur.update(course.livreur_id, {
        statut: livreur?.bloque_encours ? 'hors_ligne' : 'disponible',
        ...(livreur?.bloque_encours ? { admin_hors_ligne: true } : {}),
      });

      console.log(`[nettoyerCourseAnnulee] Livreur ${course.livreur_nom} réinitialisé selon encours`);
      
      return Response.json({ 
        success: true, 
        message: 'Course et livreur nettoyés avec succès',
        course_id: course_id,
        livreur_id: course.livreur_id
      });
    }

    return Response.json({ 
      success: true, 
      message: 'Aucune action nécessaire (course sans livreur ou non annulée)',
      course_id: course_id,
      statut: course.statut,
      livreur_id: course.livreur_id
    });

  } catch (error) {
    console.error('[nettoyerCourseAnnulee] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
