import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { haversineKm } from '../../shared/geoUtils.ts';

function normalizeCommissionPct(value) {
  const pct = Number(value);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return pct;
}

async function chargerCommissionPays(base44, countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (!code) throw new Error('country_code manquant pour calculer la commission');
  const countries = await base44.asServiceRole.entities.Country.filter({ code, actif: true });
  const pct = normalizeCommissionPct(countries?.[0]?.commission_pct);
  if (pct === null) throw new Error(`Commission non configuree pour le pays ${code}`);
  return pct;
}

async function chargerTarifPays(base44, countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (!code) throw new Error('country_code manquant pour calculer le tarif');
  const countries = await base44.asServiceRole.entities.Country.filter({ code, actif: true });
  const country = countries?.[0];
  const prixParKm = Number(country?.prix_par_km);
  const prixMinimum = Number(country?.prix_minimum);
  if (!Number.isFinite(prixParKm) || prixParKm <= 0 || !Number.isFinite(prixMinimum) || prixMinimum < 0) {
    throw new Error(`Tarification non configuree pour le pays ${code}`);
  }
  return { prixParKm, prixMinimum };
}

/**
 * CORRECTION GLOBALE DES FALLBACKS ERRONÉS
 * Supprime TOUS les fallbacks parasites : prix=0, distance=0, ETA=null, NaN
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    console.log("[CORRECTION] Démarrage correction globale...");

    // CORRECTION 1 : Courses avec prix_estimate=0 → recalculer
    const coursesWithZeroPrice = await base44.entities.CourseExterne.filter({
      prix_estimate: 0
    });

    let correctedCount = 0;
    for (const course of coursesWithZeroPrice) {
      try {
        // Calculer distance estimée
        const dist = haversineKm(
          course.gps_depart_lat, course.gps_depart_lng,
          course.gps_arrivee_lat, course.gps_arrivee_lng
        );

        if (dist && dist > 0) {
          const tarif = await chargerTarifPays(base44, course.country_code);
          const prixEstimate = Math.max(Math.round(dist * tarif.prixParKm), tarif.prixMinimum);
          await base44.entities.CourseExterne.update(course.id, {
            prix_estimate: prixEstimate,
            distance_reelle_km: dist
          });
          correctedCount++;
          console.log(`[CORRECTION] Course ${course.id.slice(-6)}: prix_estimate=${prixEstimate}F, distance=${dist.toFixed(2)}km`);
        }
      } catch (err) {
        console.error(`[CORRECTION] Erreur course ${course.id}:`, err.message);
      }
    }

    // CORRECTION 2 : Courses livrées sans prix_final → calculer
    const coursesLivreesSansPrix = await base44.entities.CourseExterne.filter({
      statut: "livree",
      prix_final: null
    });

    let prixCorrected = 0;
    for (const course of coursesLivreesSansPrix) {
      try {
        if (course.distance_reelle_km && course.distance_reelle_km > 0) {
          const tarif = await chargerTarifPays(base44, course.country_code);
          const prixFinal = Math.max(
            Math.round(course.distance_reelle_km * tarif.prixParKm),
            tarif.prixMinimum,
          );
          const commissionPct = await chargerCommissionPays(base44, course.country_code);
          const commissionSilga = Math.round(prixFinal * (commissionPct / 100));
          const montantLivreur = prixFinal - commissionSilga;

          await base44.entities.CourseExterne.update(course.id, {
            prix_final: prixFinal,
            commission_silga: commissionSilga,
            montant_livreur: montantLivreur
          });
          prixCorrected++;
          console.log(`[CORRECTION] Course ${course.id.slice(-6)}: prixFinal=${prixFinal}F`);
        }
      } catch (err) {
        console.error(`[CORRECTION] Erreur course ${course.id}:`, err.message);
      }
    }

    // CORRECTION 3 : Nettoyer les NaN et null parasites
    const allCourses = await base44.entities.CourseExterne.list();
    let nanCorrected = 0;

    for (const course of allCourses) {
      try {
        const updates = {};

        // Nettoyer NaN
        if (isNaN(course.prix_estimate)) updates.prix_estimate = null;
        if (isNaN(course.prix_final)) updates.prix_final = null;
        if (isNaN(course.distance_reelle_km)) updates.distance_reelle_km = null;
        if (isNaN(course.gps_depart_lat)) updates.gps_depart_lat = null;
        if (isNaN(course.gps_depart_lng)) updates.gps_depart_lng = null;
        if (isNaN(course.gps_arrivee_lat)) updates.gps_arrivee_lat = null;
        if (isNaN(course.gps_arrivee_lng)) updates.gps_arrivee_lng = null;

        // Nettoyer 0 erronés
        if (course.distance_reelle_km === 0 && course.statut !== "livree") {
          updates.distance_reelle_km = null;
        }

        if (Object.keys(updates).length > 0) {
          await base44.entities.CourseExterne.update(course.id, updates);
          nanCorrected++;
        }
      } catch (err) {
        console.error(`[CORRECTION] Erreur course ${course.id}:`, err.message);
      }
    }

    console.log("[CORRECTION] Terminé");
    console.log(`- Prix corrigés: ${correctedCount}`);
    console.log(`- Prix finaux calculés: ${prixCorrected}`);
    console.log(`- NaN/null nettoyés: ${nanCorrected}`);

    return Response.json({
      success: true,
      corrected: correctedCount,
      prixCorrected,
      nanCorrected
    });

  } catch (error) {
    console.error("[CORRECTION] Erreur globale:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
