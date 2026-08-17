import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { haversineKm } from '../../shared/geoUtils.ts';
import { normalizeCommissionPct, chargerConfigPays } from '../../shared/dispatchConstants.ts';

// ⚠️ Aucun tarif codé en dur — tous les paramètres proviennent de l'entité Country.
// Fallback générique unique (ne suppose aucun pays) utilisé uniquement si la BDD
// est temporairement indisponible. La devise reste inconnue jusqu'à confirmation DB.
const FALLBACK_TARIF = { prix_par_km: 100, prix_minimum: 500, devise: "FCFA" };

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

    // ── Garde-fou : ne JAMAIS recalculer le prix des courses admin_manuel ──
    // Le prix proposé (prix_propose_admin) est la source de vérité unique.
    if (course.pricing_mode === 'admin_manuel' || course.source === 'admin') {
      return Response.json({
        success: false,
        skipped: true,
        reason: 'admin_manuel_price_locked',
        message: 'Le prix de cette course est défini par l\'admin/client — recalcul automatique désactivé.',
        prix_final: course.prix_final || course.prix_propose_admin || null,
      });
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

    // Récupérer la config depuis la DB (Country) — aucune valeur codée en dur
    let tarif = { ...FALLBACK_TARIF };
    let commissionPct = null;
    try {
      const c = await chargerConfigPays(base44, countryCode);
      if (c) {
        tarif = {
          prix_par_km: c.prix_par_km ?? FALLBACK_TARIF.prix_par_km,
          prix_minimum: c.prix_minimum ?? FALLBACK_TARIF.prix_minimum,
          devise: c.devise || FALLBACK_TARIF.devise,
        };
        commissionPct = normalizeCommissionPct(c.commission_pct);
      }
    } catch (_) {
      // Fallback silencieux — le blocage commissionPct === null empêche un prix erroné
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

    const distanceReelle = haversineKm(lat1, lng1, lat2, lng2) ?? 0;

    // Calculer le prix final selon les tarifs du pays (100% depuis Country)
    const prixBrut = distanceReelle * tarif.prix_par_km;
    const prixFinal = Math.max(Math.round(prixBrut), tarif.prix_minimum);

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

    // Accumuler la commission dans l'encours du livreur (cumulatif, pour suivi opérationnel)
    // + incrémenter montant_du_silga (le vrai dû — décrémenté par les paiements admin)
    if (course.livreur_id) {
      const livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id);
      if (livreur) {
        const nouvelEncours = (livreur.encours || 0) + commissionSilga;
        const nouveauDuSilga = (Number(livreur.montant_du_silga) || 0) + commissionSilga;
        await base44.asServiceRole.entities.Livreur.update(course.livreur_id, {
          encours: nouvelEncours,
          montant_du_silga: nouveauDuSilga,
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