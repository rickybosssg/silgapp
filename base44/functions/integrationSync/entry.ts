import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * SCRIPT D'INTÉGRATION GLOBAL
 * Synchronise TOUTES les données temps réel :
 * - GPS livreur
 * - ETA courses
 * - Prix final
 * - Statuts
 * - Multi-appareils
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action } = await req.json();

    // ACTION 1 : Vérifier synchronisation globale
    if (action === "check_sync") {
      const courses = await base44.entities.CourseExterne.filter({}, "-updated_date", 10);
      const livreurs = await base44.entities.Livreur.filter({ type_livreur: "externe" });
      
      const syncStats = {
        courses_total: courses.length,
        livreurs_en_ligne: livreurs.filter(l => l.app_active && l.statut !== "hors_ligne").length,
        courses_avec_gps: courses.filter(c => c.latitude_recuperation && c.longitude_recuperation).length,
        courses_avec_eta: courses.filter(c => c.livreur_id && c.gps_arrivee_lat && c.gps_arrivee_lng).length,
        courses_avec_prix_final: courses.filter(c => c.prix_final > 0).length,
        fallbacks_zero: courses.filter(c => c.prix_estimate === 0 || c.distance_reelle_km === 0).length,
        derniere_maj: courses[0]?.updated_date,
      };

      return Response.json({ 
        success: true,
        stats: syncStats,
        timestamp: new Date().toISOString()
      });
    }

    // ACTION 2 : Forcer refresh toutes les courses actives
    if (action === "refresh_active_courses") {
      const activeCourses = await base44.entities.CourseExterne.filter({
        statut: { $nin: ["livree", "annulee"] }
      });

      // Mettre à jour chaque course avec un timestamp pour forcer refresh
      let refreshed = 0;
      for (const course of activeCourses) {
        try {
          // Ajouter un refresh timestamp pour trigger le cache
          await base44.entities.CourseExterne.update(course.id, {
            _refresh_timestamp: new Date().toISOString()
          }).catch(() => null);
          refreshed++;
        } catch (_) {}
      }

      return Response.json({ 
        success: true,
        refreshed,
        timestamp: new Date().toISOString()
      });
    }

    // ACTION 3 : Valider intégrité des données
    if (action === "validate_integrity") {
      const courses = await base44.entities.CourseExterne.list();
      const issues = {
        prix_zero: 0,
        distance_zero: 0,
        sans_gps_depart: 0,
        sans_gps_arrivee: 0,
        prix_nan: 0,
        distance_nan: 0,
        sans_livreur_en_route: 0
      };

      for (const c of courses) {
        if (c.prix_estimate === 0) issues.prix_zero++;
        if (c.distance_reelle_km === 0 && c.statut === "livree") issues.distance_zero++;
        if (!c.gps_depart_lat || !c.gps_depart_lng) issues.sans_gps_depart++;
        if (!c.gps_arrivee_lat || !c.gps_arrivee_lng) issues.sans_gps_arrivee++;
        if (isNaN(c.prix_estimate)) issues.prix_nan++;
        if (isNaN(c.distance_reelle_km)) issues.distance_nan++;
        if (["livreur_en_route", "colis_recupere", "en_livraison"].includes(c.statut) && !c.livreur_id) {
          issues.sans_livreur_en_route++;
        }
      }

      const totalIssues = Object.values(issues).reduce((a, b) => a + b, 0);

      return Response.json({
        success: true,
        total_courses: courses.length,
        issues,
        total_issues: totalIssues,
        health: totalIssues === 0 ? "✅ OK" : `⚠️ ${totalIssues} problèmes`
      });
    }

    return Response.json({ error: "Action non reconnue" }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});