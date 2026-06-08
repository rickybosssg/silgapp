import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
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

    const diagnostics = {
      course_id: course.id,
      statut: course.statut,
      delivery_confirmed_by: course.delivery_confirmed_by,
      delivery_confirmed_at: course.delivery_confirmed_at,
      delivery_qr_token: course.delivery_qr_token ? 'EXISTS' : 'MISSING',
      delivery_code_4_digits: course.delivery_code_4_digits || 'MISSING',
      heure_livraison: course.heure_livraison,
      latitude_livraison: course.latitude_livraison,
      longitude_livraison: course.longitude_livraison,
      latitude_arrivee_livraison: course.latitude_arrivee_livraison,
      longitude_arrivee_livraison: course.longitude_arrivee_livraison,
      prix_final: course.prix_final,
      distance_reelle_km: course.distance_reelle_km,
      livreur_id: course.livreur_id,
      livreur_nom: course.livreur_nom,
    };

    // Vérifications
    const checks = {
      statut_is_livree: course.statut === 'livree',
      delivery_confirmed: !!course.delivery_confirmed_at,
      delivery_token_exists: !!course.delivery_qr_token,
      delivery_code_exists: !!course.delivery_code_4_digits,
      has_livraison_coords: !!(course.latitude_livraison && course.longitude_livraison),
      has_prix_final: !!course.prix_final,
      has_distance_reelle: !!course.distance_reelle_km,
      has_livreur: !!course.livreur_id,
    };

    // Calculer la distance réelle si coordonnées disponibles
    let distance_calculated = null;
    if (course.latitude_recuperation && course.longitude_recuperation && 
        course.latitude_livraison && course.longitude_livraison) {
      const lat1 = course.latitude_recuperation;
      const lon1 = course.longitude_recuperation;
      const lat2 = course.latitude_livraison;
      const lon2 = course.longitude_livraison;
      
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      distance_calculated = R * c;
    }

    // Vérifier si le livreur existe
    let livreur_info = null;
    if (course.livreur_id) {
      const livreurs = await base44.entities.Livreur.filter({});
      livreur_info = livreurs.find(l => l.id === course.livreur_id);
    }

    return Response.json({
      success: true,
      diagnostics,
      checks,
      distance_calculated,
      livreur_info: livreur_info ? {
        id: livreur_info.id,
        nom: livreur_info.nom,
        prenom: livreur_info.prenom,
        type_livreur: livreur_info.type_livreur,
        actif: livreur_info.actif,
      } : null,
      recommendations: [
        !checks.delivery_token_exists && "❌ Token QR de livraison manquant - régénérer via admin",
        !checks.delivery_code_exists && "❌ Code 4 chiffres manquant - régénérer via admin",
        !checks.has_livraison_coords && "❌ Coordonnées de livraison manquantes - le livreur n'a pas scanné",
        !checks.has_prix_final && "⚠️ Prix final non calculé",
        !checks.has_distance_reelle && "⚠️ Distance réelle non enregistrée",
        checks.statut_is_livree && !checks.delivery_confirmed && "⚠️ Statut 'livree' mais non confirmé par QR/code",
      ].filter(Boolean),
    });
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});