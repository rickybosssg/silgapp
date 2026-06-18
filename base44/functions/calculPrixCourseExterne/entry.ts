import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Tarifs par pays (fallback si pas de config en DB)
const TARIFS_PAYS = {
  BF: { prix_par_km: 100, prix_minimum: 500, devise: "FCFA" },
  CI: { prix_par_km: 120, prix_minimum: 600, devise: "FCFA" },
  TG: { prix_par_km: 100, prix_minimum: 500, devise: "FCFA" },
  BJ: { prix_par_km: 100, prix_minimum: 500, devise: "FCFA" },
  SN: { prix_par_km: 150, prix_minimum: 750, devise: "FCFA" },
  ML: { prix_par_km: 100, prix_minimum: 500, devise: "FCFA" },
  GN: { prix_par_km: 800, prix_minimum: 4000, devise: "GNF" },
  NE: { prix_par_km: 100, prix_minimum: 500, devise: "FCFA" },
  GH: { prix_par_km: 2, prix_minimum: 10, devise: "GHS" },
};

function normalizeCommissionPct(value) {
  const pct = Number(value);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return pct;
}

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

    // Vérification minimale : au moins une source de coordonnées de départ ET d'arrivée
    const hasDepart = course.latitude_recuperation || course.gps_depart_lat;
    const hasArrivee = course.latitude_livraison || course.latitude_arrivee_livraison || course.gps_arrivee_lat;
    if (!hasDepart || !hasArrivee) {
      return Response.json({
        error: 'Positions GPS départ/arrivée de la course manquantes'
      }, { status: 400 });
    }

    // Déterminer le pays de la course — PAS de fallback BF arbitraire
    const countryCode = course.country_code;
    if (!countryCode) {
      return Response.json({ error: 'country_code manquant sur la course — impossible de calculer le prix' }, { status: 400 });
    }

    // Essayer de récupérer la config depuis la DB
    let tarif = TARIFS_PAYS[countryCode] || TARIFS_PAYS["BF"];
    let commissionPct = null;
    try {
      const countriesDB = await base44.asServiceRole.entities.Country.filter({ code: countryCode, actif: true });
      if (countriesDB?.[0]) {
        const c = countriesDB[0];
        tarif = {
          prix_par_km:    c.prix_par_km    || tarif.prix_par_km,
          prix_minimum:   c.prix_minimum   || tarif.prix_minimum,
          devise:         c.devise         || tarif.devise,
        };
        commissionPct = normalizeCommissionPct(c.commission_pct);
      }
    } catch (_) {
      // Fallback silencieux sur le tarif statique
    }

    if (commissionPct === null) {
      return Response.json({
        error: `Commission non configuree pour le pays ${countryCode}`,
        blocked_reason: 'missing_country_commission_pct',
      }, { status: 400 });
    }

    // Calculer la distance tarifaire avec les positions GPS réelles si disponibles
    // Priorité : GPS réel récupération → GPS réel livraison (positions au moment du scan)
    // Fallback : coordonnées fixes enregistrées à la création de la course
    const lat1 = course.latitude_recuperation || course.gps_depart_lat;
    const lng1 = course.longitude_recuperation || course.gps_depart_lng;
    const lat2 = course.latitude_livraison || course.latitude_arrivee_livraison || course.gps_arrivee_lat;
    const lng2 = course.longitude_livraison || course.longitude_arrivee_livraison || course.gps_arrivee_lng;

    if (!lat1 || !lng1 || !lat2 || !lng2) {
      return Response.json({
        error: 'Positions GPS récupération/livraison manquantes'
      }, { status: 400 });
    }

    const distanceReelle = calculerDistance(lat1, lng1, lat2, lng2);

    // Calculer le prix final selon les tarifs du pays
    // Règle : prix minimum global SILGAPP = 1 000 F CFA (s'applique dans tous les pays FCFA)
    const PRIX_MINIMUM_GLOBAL = tarif.devise === "FCFA" ? 1000 : tarif.prix_minimum;
    const prixBrut = distanceReelle * tarif.prix_par_km;
    const prixFinal = Math.max(Math.round(prixBrut), tarif.prix_minimum, PRIX_MINIMUM_GLOBAL);

    // Commission Silga et montant livreur
    const commissionSilga = Math.round(prixFinal * (commissionPct / 100));
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
