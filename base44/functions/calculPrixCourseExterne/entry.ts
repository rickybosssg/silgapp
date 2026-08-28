import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { haversineKm } from '../../shared/geoUtils.ts';
import { normalizeCommissionPct, chargerConfigPays, chargerTarifZone } from '../../shared/dispatchConstants.ts';

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
    //
    // EXCEPTION : une course source=client ne doit JAMAIS être verrouillée par
    // pricing_mode=admin_manuel suite à une anomalie de données (ex: ancien bug Venus).
    // On corrige le pricing_mode vers 'automatic' et on procède au calcul normal.
    // MAIS on préserve les overrides admin légitimes (prix_propose_admin set par modifierPrixCourseAdmin
    // sur une course non-Venus). Les courses Venus avec prix_propose_admin sont corrigées (bug).
    if (course.source === 'client' && course.pricing_mode === 'admin_manuel' &&
        (!course.prix_propose_admin || course.created_by_venus)) {
      console.warn('[calculPrixCourseExterne] Course source=client avec pricing_mode=admin_manuel (anomalie) — correction vers automatic');
      await base44.asServiceRole.entities.CourseExterne.update(course_id, { pricing_mode: 'automatic' }).catch(() => {});
      course.pricing_mode = 'automatic';
    }

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
      // ── Prix à confirmer : commission non configurée ──
      // La course continue (dispatch, livraison) mais le prix reste à confirmer par l'admin.
      const tarifZoneForSuggestion = await chargerTarifZone(base44, countryCode, course.ville_arrivee || course.ville_depart);
      const prixSuggere = tarifZoneForSuggestion?.palier_1_prix || tarif?.prix_minimum || null;
      await base44.asServiceRole.entities.CourseExterne.update(course_id, {
        prix_a_confirmer: true,
        raison_prix_a_confirmer: 'commission_pct_manquant',
        prix_suggere_admin: prixSuggere,
      }).catch(() => {});
      return Response.json({
        success: false,
        prix_a_confirmer: true,
        reason: 'commission_pct_manquant',
        message: `Commission non configurée pour le pays ${countryCode} — prix à confirmer par l'admin.`,
        prix_suggere_admin: prixSuggere,
      });
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
        // ⚠️ livreur_financier_id N'EST PAS fixé ici — calculPrixCourseExterne peut être
        // appelée avant la livraison définitive (re-finalisation). Fixé uniquement dans
        // finaliserLivraisonLivreur quand la livraison est confirmée.
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

    // ── DISTANCE TARIFAIRE : utiliser la distance de référence persistée ──
    // RÈGLE ABSOLUE : la distance tarifaire est calculée à la création et figée.
    // Le scan du colis ou la position du livreur NE DOIT PAS la modifier rétroactivement.
    // Si non persistée (course legacy), calculer depuis les coordonnées de CRÉATION.
    let distanceReelle = 0;

    if (course.distance_tarifaire_km && Number(course.distance_tarifaire_km) > 0) {
      // Distance de référence déjà persistée — l'utiliser telle quelle
      distanceReelle = Number(course.distance_tarifaire_km);
    } else {
      // Course legacy sans distance persistée — calculer depuis les coordonnées de CRÉATION
      // (gps_depart_lat/lng, gps_arrivee_lat/lng), PAS depuis les positions de scan
      const lat1 = course.gps_depart_lat;
      const lng1 = course.gps_depart_lng;
      const lat2 = course.gps_arrivee_lat;
      const lng2 = course.gps_arrivee_lng;

      if (!lat1 || !lng1 || !lat2 || !lng2) {
        // ── Prix à confirmer : GPS manquant ──
        // La course continue (dispatch, livraison) mais le prix reste à confirmer par l'admin.
        const raisonGps = !lat1 ? 'gps_depart_manquant' : !lat2 ? 'gps_arrivee_manquant' : 'distance_tarifaire_impossible';
        const tarifZoneForSuggestion = await chargerTarifZone(base44, countryCode, course.ville_arrivee || course.ville_depart);
        const prixSuggere = tarifZoneForSuggestion?.palier_1_prix || tarif?.prix_minimum || null;
        await base44.asServiceRole.entities.CourseExterne.update(course_id, {
          prix_a_confirmer: true,
          raison_prix_a_confirmer: raisonGps,
          prix_suggere_admin: prixSuggere,
        }).catch(() => {});
        return Response.json({
          success: false,
          prix_a_confirmer: true,
          reason: raisonGps,
          message: 'Coordonnées GPS de création manquantes — prix à confirmer par l\'admin.',
          prix_suggere_admin: prixSuggere,
        });
      }

      distanceReelle = haversineKm(lat1, lng1, lat2, lng2) ?? 0;
    }

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
      // 1. TarifZone (paliers) si le pays a une zone tarifaire configurée
      // 2. Sinon : distance × prix_par_km (formule générique Country)
      const tarifZone = await chargerTarifZone(base44, countryCode, course.ville_arrivee || course.ville_depart);
      if (tarifZone) {
        const distTarif = course.distance_tarifaire_km || distanceReelle;
        const sourcesApprox = ['quartier', 'geocodage'];
        const approx = sourcesApprox.includes(course.gps_depart_source) || sourcesApprox.includes(course.gps_arrivee_source);
        const palier1KmMax = tarifZone.palier_1_km_max;
        const palier2KmMax = tarifZone.palier_2_km_max;
        const tolMin = tarifZone.tolerance_min_km;
        const tolMax = tarifZone.tolerance_max_km;
        const seuilStrict = tarifZone.seuil_strict_km;

        if (distTarif > palier2KmMax) {
          // ── Prix à confirmer : distance hors palier ──
          await base44.asServiceRole.entities.CourseExterne.update(course_id, {
            prix_a_confirmer: true,
            raison_prix_a_confirmer: 'distance_exceeds_tarif_zone',
            prix_suggere_admin: tarifZone.palier_2_prix,
          }).catch(() => {});
          return Response.json({
            success: false,
            prix_a_confirmer: true,
            reason: 'distance_exceeds_tarif_zone',
            message: `Distance (${distTarif.toFixed(2)} km) supérieure à ${palier2KmMax} km — prix à confirmer par l'admin.`,
            prix_suggere_admin: tarifZone.palier_2_prix,
          });
        }

        if (approx && distTarif >= tolMin && distTarif <= tolMax) {
          prixRetenu = tarifZone.palier_1_prix;
          prixSource = 'tarif_zone_palier_1_tolerance';
        } else if (distTarif <= seuilStrict) {
          prixRetenu = tarifZone.palier_1_prix;
          prixSource = 'tarif_zone_palier_1';
        } else {
          prixRetenu = tarifZone.palier_2_prix;
          prixSource = 'tarif_zone_palier_2';
        }
      } else {
        const prixBrut = distanceReelle * tarif.prix_par_km;
        prixRetenu = Math.max(Math.round(prixBrut), tarif.prix_minimum);
        prixSource = 'calcul_automatique';
      }
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
      // ⚠️ livreur_financier_id N'EST PAS fixé ici — voir finaliserLivraisonLivreur.
    });

    // ── Comptabiliser la commission dans le solde du livreur ──
    // La projection montant_du_silga est gérée UNIQUEMENT par verifierEncoursLivreur
    // (source unique de la comptabilisation financière, idempotente).
    // ⚠️ NE JAMAIS incrémenter montant_du_silga/encours directement ici —
    //    c'était la cause racine du double comptage des commissions.
    if (course.livreur_id) {
      try {
        await base44.asServiceRole.functions.invoke('verifierEncoursLivreur', { course_id });
      } catch (encoursErr) {
        console.error('[calculPrixCourseExterne] verifierEncoursLivreur error:', encoursErr?.message || encoursErr);
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