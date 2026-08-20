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

    // ── Garde-fou : ne JAMAIS recalculer le prix si un humain l'a déjà défini ──
    // Protège : admin_manuel (admin), prix_propose_client (client), prix_final (confirmé)
    // Le PRIX est verrouillé, mais la COMMISSION doit quand même être comptabilisée
    // dans la dette du livreur via verifierEncoursLivreur (qui utilise encours_comptabilise_at
    // comme garde d'idempotence dédiée — ne pas confondre avec crm_stats_synced).
    if (course.pricing_mode === 'admin_manuel' || course.source === 'admin') {
      // Prix verrouillé — ne pas recalculer. Mais s'assurer que la commission
      // est comptabilisée dans l'encours du livreur (idempotent via encours_comptabilise_at).
      try {
        await base44.asServiceRole.functions.invoke('verifierEncoursLivreur', { course_id });
      } catch (encoursErr) {
        console.error('[calculPrixCourseExterne] verifierEncoursLivreur error:', encoursErr?.message || encoursErr);
      }
      return Response.json({
        success: false,
        skipped: true,
        reason: 'admin_manuel_price_locked',
        message: 'Le prix de cette course est défini par l\'admin — recalcul automatique désactivé. Commission comptabilisée via verifierEncoursLivreur.',
        prix_final: course.prix_final || course.prix_propose_admin || null,
      });
    }

    // Déterminer le pays de la course — PAS de fallback BF arbitraire
    const countryCode = course.country_code;
    if (!countryCode) {
      return Response.json({ error: 'country_code manquant sur la course — impossible de calculer le prix' }, { status: 400 });
    }

    // ── Charger la commission du pays AVANT tout garde-fou qui l'utilise ──
    // (Correction TDZ : commissionPct était utilisé avant sa déclaration)
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

    // ── Garde-fou Client : prix_propose_client est la source de vérité si défini ──
    // Le prix Client/Admin retenu reste intact ; seule la commission 20 % et le
    // montant livreur sont calculés dessus.
    if (course.pricing_mode === 'manual' && course.prix_propose_client && course.prix_propose_client > 0) {
      const prixRetenu = course.prix_final || course.prix_propose_client;
      const commissionSilga = Math.round(prixRetenu * (commissionPct / 100));
      const montantLivreur = prixRetenu - commissionSilga;
      const courseUpdated = await base44.asServiceRole.entities.CourseExterne.update(course_id, {
        prix_final: prixRetenu,
        commission_silga: commissionSilga,
        montant_livreur: montantLivreur,
        statut: 'livree',
        heure_livraison: new Date().toISOString(),
      });
      return Response.json({
        success: true,
        course: courseUpdated,
        prix_final: prixRetenu,
        commission_silga: commissionSilga,
        montant_livreur: montantLivreur,
        prix_source: 'prix_propose_client_locked',
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

    // ── Déterminer le prix finalement retenu ──────────────────────────────
    // Règle : ne JAMAIS écraser un prix déjà modifié par le client ou l'admin.
    //   1. prix_final (déjà confirmé) → source de vérité
    //   2. prix_propose_client (client a modifié) → utiliser tel quel
    //   3. Sinon → calcul automatique (distance × prix_par_km, min prix_minimum)
    let prixRetenu;
    let prixSource;

    if (course.prix_final && course.prix_final > 0) {
      prixRetenu = course.prix_final;
      prixSource = 'prix_final_existant';
    } else if (course.prix_propose_client && course.prix_propose_client > 0) {
      prixRetenu = course.prix_propose_client;
      prixSource = 'prix_propose_client';
    } else {
      // Calcul automatique uniquement si aucun prix humain n'a été défini
      const prixBrut = distanceReelle * tarif.prix_par_km;
      prixRetenu = Math.max(Math.round(prixBrut), tarif.prix_minimum);
      prixSource = 'calcul_automatique';
    }

    // Commission Silga et montant livreur — calculés sur le prix finalement retenu
    const commissionSilga = Math.round(prixRetenu * (commissionPct / 100));
    const montantLivreur = prixRetenu - commissionSilga;

    // Mettre à jour la course
    const courseUpdated = await base44.asServiceRole.entities.CourseExterne.update(course_id, {
      distance_reelle_km: distanceReelle,
      prix_final: prixRetenu,
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
      prix_final: prixRetenu,
      commission_silga: commissionSilga,
      montant_livreur: montantLivreur,
      prix_source: prixSource,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});