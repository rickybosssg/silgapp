import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Auth non requise — utilisé en frontend polling
    const { livreur_id, country_code } = await req.json();
    
    if (!livreur_id) {
      return Response.json({ error: 'livreur_id requis' }, { status: 400 });
    }
    
    // Récupérer TOUTES les courses du pays
    const allCourses = await base44.asServiceRole.entities.CourseExterne.list('-created_date', 100);
    
    // Filtrer par pays ET par livreur
    const coursesPourLivreur = allCourses.filter(c => {
      // 1. Courses déjà acceptées (livreur_id = ce livreur)
      if (c.livreur_id === livreur_id) return true;
      
      // 2. Courses en dispatch multi-livreur (dispatch_notified_ids contient ce livreur)
      if (c.dispatch_status === 'propose' && !c.livreur_id && c.dispatch_notified_ids) {
        try {
          const notifiedIds = JSON.parse(c.dispatch_notified_ids);
          if (notifiedIds.includes(livreur_id)) return true;
        } catch (_) {}
      }
      
      return false;
    });
    
    return Response.json({
      success: true,
      courses: coursesPourLivreur,
      total: coursesPourLivreur.length,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});