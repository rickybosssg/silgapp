/**
 * Rétro-correction des courses livrées sans prix_final ni distance.
 * Applique le fallback : prix_estimate ou prix minimum 500F (5 km minimum).
 * À appeler manuellement depuis l'admin ou via une automatisation.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function haversine(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    // Récupérer toutes les courses livrées sans prix_final
    const courses = await base44.asServiceRole.entities.CourseExterne.filter(
      { statut: 'livree' }, '-created_date', 200
    );

    const aCorreger = courses.filter(c => !c.prix_final || c.prix_final <= 0);
    let corrigees = 0;
    let ignorees = 0;
    const details = [];

    for (const course of aCorreger) {
      let distanceKm = null;
      let source = null;

      // Règle métier : distance = GPS récupération → GPS livraison UNIQUEMENT
      if (course.latitude_recuperation && course.longitude_recuperation &&
          course.latitude_livraison && course.longitude_livraison) {
        distanceKm = haversine(
          course.latitude_recuperation, course.longitude_recuperation,
          course.latitude_livraison, course.longitude_livraison
        );
        source = 'gps_reel';
      }

      // Fallback anti-bug : GPS manquant → 1 km minimum
      if (!distanceKm || distanceKm <= 0) {
        distanceKm = 1.0;
        source = 'minimum_fallback';
      }

      const distSafe = distanceKm;
      let commissionPct = 30;
      try {
        const countries = await base44.asServiceRole.entities.Country.filter({ code: course.country_code, actif: true });
        if (countries?.[0]?.commission_pct) commissionPct = countries[0].commission_pct;
      } catch (_) {}
      const prixFinal = Math.round(distSafe * 100);
      const commission = Math.round(prixFinal * (commissionPct / 100));
      const montantLivreur = prixFinal - commission;

      await base44.asServiceRole.entities.CourseExterne.update(course.id, {
        distance_reelle_km: distSafe,
        prix_final: prixFinal,
        commission_silga: commission,
        montant_livreur: montantLivreur,
      });

      // Mettre à jour montant_du_silga du livreur
      if (course.livreur_id) {
        const livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id).catch(() => null);
        if (livreur) {
          await base44.asServiceRole.entities.Livreur.update(course.livreur_id, {
            montant_du_silga: (Number(livreur.montant_du_silga) || 0) + commission,
          }).catch(() => null);
        }
      }

      corrigees++;
      details.push({
        id: course.id.slice(-6),
        source,
        distance: distSafe.toFixed(1),
        prix: prixFinal,
        commission,
        gain: montantLivreur,
      });
    }

    return Response.json({
      success: true,
      total_livrees: courses.length,
      sans_prix: aCorreger.length,
      corrigees,
      ignorees,
      details,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});