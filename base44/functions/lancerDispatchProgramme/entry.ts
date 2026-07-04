import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const now = new Date().toISOString();
    
    // Trouver toutes les courses programmées dont la date est passée
    const coursesProgrammees = await base44.asServiceRole.entities.CourseExterne.filter(
      { statut: "programmee" },
      "created_date",
      50
    );
    
    const aLancer = (coursesProgrammees || []).filter(c => 
      c.date_souhaitee && c.date_souhaitee <= now
    );
    
    const resultats = [];
    for (const course of aLancer) {
      try {
        // Passer en recherche_livreur — l'automation entity sur CourseExterne
        // déclenchera dispatchExterneAuto automatiquement (action lancer_recherche_auto)
        await base44.asServiceRole.entities.CourseExterne.update(course.id, {
          statut: "recherche_livreur",
          dispatch_status: "en_attente",
        });
        
        resultats.push({ id: course.id, success: true });
      } catch (err) {
        resultats.push({ id: course.id, success: false, error: err?.message });
      }
    }
    
    return Response.json({ 
      total: aLancer.length, 
      resultats,
      timestamp: now 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});