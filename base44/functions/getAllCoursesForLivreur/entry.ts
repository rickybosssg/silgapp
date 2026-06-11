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
    
    // Filtrer par pays
    const coursesByCountry = allCourses.filter(c => 
      c.country_code === (country_code || 'BF')
    );
    
    return Response.json({
      success: true,
      courses: coursesByCountry,
      total: coursesByCountry.length,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});