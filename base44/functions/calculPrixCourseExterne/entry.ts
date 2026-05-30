import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Tarifs par pays (fallback si pas de config en DB)
const TARIFS_PAYS = {
  BF: { prix_par_km: 100, prix_minimum: 500,  commission_pct: 30, devise: "FCFA" },
  CI: { prix_par_km: 120, prix_minimum: 600,  commission_pct: 30, devise: "FCFA" },
  TG: { prix_par_km: 100, prix_minimum: 500,  commission_pct: 30, devise: "FCFA" },
  BJ: { prix_par_km: 100, prix_minimum: 500,  commission_pct: 30, devise: "FCFA" },
  SN: { prix_par_km: 150, prix_minimum: 750,  commission_pct: 30, devise: "FCFA" },
  ML: { prix_par_km: 100, prix_minimum: 500,  commission_pct: 30, devise: "FCFA" },
  GN: { prix_par_km: 800, prix_minimum: 4000, commission_pct: 30, devise: "GNF"  },
  NE: { prix_par_km: 100, prix_minimum: 500,  commission_pct: 30, devise: "FCFA" },
};

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

    if (!course.latitude_recuperation || !course.longitude_recuperation ||
        !course.latitude_livraison || !course.longitude_livraison) {
      return Response.json({
        error: 'Positions GPS de récupération ou livraison manquantes'
      }, { status: 400 });
    }

    // Déterminer le pays de la course
    const countryCode = course.country_code || "BF";

    // Essayer de récupérer la config depuis la DB
    let tarif = TARIFS_PAYS[countryCode] || TARIFS_PAYS["BF"];
    try {
      const countriesDB = await base44.asServiceRole.entities.Country.filter({ code: countryCode, actif: true });
      if (countriesDB?.[0]) {
        const c = countriesDB[0];
        tarif = {
          prix_par_km:    c.prix_par_km    || tarif.prix_par_km,
          prix_minimum:   c.prix_minimum   || tarif.prix_minimum,
          commission_pct: c.commission_pct || tarif.commission_pct,
          devise:         c.devise         || tarif.devise,
        };
      }
    } catch (_) {
      // Fallback silencieux sur le tarif statique
    }

    // Calculer la distance réelle
    const distanceReelle = calculerDistance(
      course.latitude_recuperation, course.longitude_recuperation,
      course.latitude_livraison, course.longitude_livraison
    );

    // Calculer le prix final selon les tarifs du pays
    const prixBrut = distanceReelle * tarif.prix_par_km;
    const prixFinal = Math.max(Math.round(prixBrut), tarif.prix_minimum);

    // Commission Silga et montant livreur
    const commissionRate = (tarif.commission_pct || 30) / 100;
    const commissionSilga = Math.round(prixFinal * commissionRate);
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
      country_code: countryCode,
      devise: tarif.devise,
      distance_km: distanceReelle.toFixed(2),
      prix_par_km: tarif.prix_par_km,
      prix_final: prixFinal,
      commission_silga: commissionSilga,
      montant_livreur: montantLivreur,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});