import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Calcule la distance entre 2 points GPS (formule Haversine)
 */
function calculerDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { course_id } = body;

    if (!course_id) {
      return Response.json({ error: 'course_id requis' }, { status: 400 });
    }

    const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
    if (!course) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }

    // Vérifier que la course a les positions GPS de récupération et livraison
    if (!course.latitude_recuperation || !course.longitude_recuperation ||
        !course.latitude_livraison || !course.longitude_livraison) {
      return Response.json({ 
        error: 'Positions GPS de récupération ou livraison manquantes' 
      }, { status: 400 });
    }

    // Calculer la distance réelle parcourue
    const distanceReelle = calculerDistance(
      course.latitude_recuperation, course.longitude_recuperation,
      course.latitude_livraison, course.longitude_livraison
    );

    // Calculer le prix final (100 F/km)
    const prixFinal = Math.round(distanceReelle * 100);

    // Calculer commission Silga (30%) et montant livreur (70%)
    const commissionSilga = Math.round(prixFinal * 0.30);
    const montantLivreur = prixFinal - commissionSilga;

    // Mettre à jour la course
    const courseUpdated = await base44.asServiceRole.entities.CourseExterne.update(course_id, {
      distance_reelle_km: distanceReelle,
      prix_final: prixFinal,
      commission_silga: commissionSilga,
      montant_livreur: montantLivreur,
      statut: 'livree',
      heure_livraison: new Date().toISOString(),
    });

    // Mettre à jour le montant dû par le livreur à Silga
    if (course.livreur_id) {
      const livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id);
      if (livreur) {
        const nouveauMontantDu = (livreur.montant_du_silga || 0) + commissionSilga;
        await base44.asServiceRole.entities.Livreur.update(course.livreur_id, {
          montant_du_silga: nouveauMontantDu,
          statut_paiement: 'non_paye',
        });
      }
    }

    return Response.json({
      success: true,
      course: courseUpdated,
      distance_km: distanceReelle.toFixed(2),
      prix_final: prixFinal,
      commission_silga: commissionSilga,
      montant_livreur: montantLivreur,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});