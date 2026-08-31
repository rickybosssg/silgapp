import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

/**
 * auditCalibrationSeuils — Lecture seule, ne modifie rien.
 *
 * Simule sur les 7 derniers jours plusieurs seuils de fraîcheur (10, 30, 60,
 * 90, 120, 180, 360 min) pour identifier le seuil minimal qui n'aurait bloqué
 * aucune acceptation réelle tout en éliminant le maximum de fantômes.
 *
 * Sépare background_active=true et background_active=false.
 */
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const now = new Date();
    const SEVEN_DAYS_AGO = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const SEUILS = [10, 30, 60, 90, 120, 180, 360]; // minutes

    // 1. Charger tous les livreurs externes
    const livreurs = await base44.asServiceRole.entities.Livreur.filter(
      { type_livreur: 'externe' },
      '-last_seen_at',
      500
    );

    // 2. Charger les courses des 7 derniers jours
    const courses = await base44.asServiceRole.entities.CourseExterne.filter(
      {},
      '-created_date',
      1000
    );
    const courses7j = courses.filter(c => {
      const d = c.created_date ? new Date(c.created_date) : null;
      return d && d >= SEVEN_DAYS_AGO && d <= now;
    });

    // 3. Identifier les livreurs qui ont réellement travaillé (accepté/livré)
    const livreursAyantTravaille = new Set();
    for (const c of courses7j) {
      const lid = c.livreur_financier_id || c.livreur_id;
      if (lid && c.statut !== 'annulee') {
        livreursAyantTravaille.add(lid);
      }
    }

    // 4. Critères de Dispatch V2 actuels (sans activité technique)
    function estEligibleDispatchV2(l) {
      if (!l) return false;
      if (l.type_livreur !== 'externe') return false;
      if (l.validation !== 'valide') return false;
      if (l.actif === false) return false;
      if (l.statut !== 'disponible') return false;
      if (l.bloque_encours === true) return false;
      if (l.manual_hors_ligne === true) return false;
      if (l.admin_hors_ligne === true) return false;
      return true;
    }

    // 5. Pour un seuil donné, vérifier si un livreur est "réellement disponible"
    // heartbeat < seuil OU GPS < seuil (doublé car GPS est moins critique)
    function estReellementDisponibleAvecSeuil(l, seuilMin) {
      if (!estEligibleDispatchV2(l)) return false;
      const seuilMs = seuilMin * 60 * 1000;
      const gpsSeuilMs = seuilMin * 2 * 60 * 1000; // GPS = seuil * 2
      const t = Date.now();
      if (l.last_seen_at && (t - new Date(l.last_seen_at).getTime()) < seuilMs) return true;
      if (l.derniere_position_date && (t - new Date(l.derniere_position_date).getTime()) < gpsSeuilMs) return true;
      return false;
    }

    // 6. Simulation pour chaque seuil, séparée par background_active
    const resultats = {};

    for (const seuil of SEUILS) {
      const stats = {
        bg_active: {
          candidats_conserves: 0,
          fantomes_exclus: 0,
          acceptations_bloquees: 0,
          livreurs_actifs_exclus: 0,
          courses_zero_candidat: 0,
          courses_moins_de_3: 0,
        },
        bg_inactive: {
          candidats_conserves: 0,
          fantomes_exclus: 0,
          acceptations_bloquees: 0,
          livreurs_actifs_exclus: 0,
          courses_zero_candidat: 0,
          courses_moins_de_3: 0,
        },
      };

      // Compter les livreurs éligibles V2 qui seraient conservés/exclus
      for (const l of livreurs) {
        if (!estEligibleDispatchV2(l)) continue;
        const bg = l.background_active === true ? 'bg_active' : 'bg_inactive';
        const reellementDispo = estReellementDisponibleAvecSeuil(l, seuil);
        if (reellementDispo) {
          stats[bg].candidats_conserves++;
        } else {
          stats[bg].fantomes_exclus++;
          if (livreursAyantTravaille.has(l.id)) {
            stats[bg].livreurs_actifs_exclus++;
          }
        }
      }

      // Simuler l'impact sur les courses
      for (const c of courses7j) {
        const lid = c.livreur_financier_id || c.livreur_id;
        if (!lid) continue;
        const livreur = livreurs.find(l => l.id === lid);
        if (!livreur) continue;

        // Compter combien de candidats auraient été disponibles pour cette course
        // (approximation : on utilise l'état actuel des livreurs comme proxy)
        const candidatsV2 = livreurs.filter(l => {
          if (!estEligibleDispatchV2(l)) return false;
          if (l.country_code !== c.country_code) return false;
          return true;
        });

        const candidatsSimules = candidatsV2.filter(l =>
          estReellementDisponibleAvecSeuil(l, seuil)
        );

        const bg = livreur.background_active === true ? 'bg_active' : 'bg_inactive';

        if (candidatsSimules.length === 0) stats[bg].courses_zero_candidat++;
        if (candidatsSimules.length < 3) stats[bg].courses_moins_de_3++;

        // Vérifier si le livreur qui a accepté aurait été exclu
        if (estEligibleDispatchV2(livreur) && !estReellementDisponibleAvecSeuil(livreur, seuil)) {
          stats[bg].acceptations_bloquees++;
        }
      }

      resultats[`seuil_${seuil}_min`] = stats;
    }

    // 7. Identifier le seuil minimal sans faux négatif (0 acceptation bloquée)
    let seuilMinimalSansFauxNegatif = null;
    for (const seuil of SEUILS) {
      const r = resultats[`seuil_${seuil}_min`];
      const totalBloque = r.bg_active.acceptations_bloquees + r.bg_inactive.acceptations_bloquees;
      const totalExclus = r.bg_active.livreurs_actifs_exclus + r.bg_inactive.livreurs_actifs_exclus;
      if (totalBloque === 0 && totalExclus === 0) {
        seuilMinimalSansFauxNegatif = seuil;
        break;
      }
    }

    // 8. Pour le seuil minimal, calculer les fantômes éliminés
    let fantomesElimines = 0;
    if (seuilMinimalSansFauxNegatif) {
      const r = resultats[`seuil_${seuilMinimalSansFauxNegatif}_min`];
      fantomesElimines = r.bg_active.fantomes_exclus + r.bg_inactive.fantomes_exclus;
    }

    // 9. Formatage de la conclusion
    function formatSeuil(seuil) {
      const r = resultats[`seuil_${seuil}_min`];
      return {
        candidats_conserves_bg_active: r.bg_active.candidats_conserves,
        candidats_conserves_bg_inactive: r.bg_inactive.candidats_conserves,
        fantomes_exclus_bg_active: r.bg_active.fantomes_exclus,
        fantomes_exclus_bg_inactive: r.bg_inactive.fantomes_exclus,
        acceptations_bloquees_bg_active: r.bg_active.acceptations_bloquees,
        acceptations_bloquees_bg_inactive: r.bg_inactive.acceptations_bloquees,
        livreurs_actifs_exclus_bg_active: r.bg_active.livreurs_actifs_exclus,
        livreurs_actifs_exclus_bg_inactive: r.bg_inactive.livreurs_actifs_exclus,
        courses_zero_candidat_bg_active: r.bg_active.courses_zero_candidat,
        courses_zero_candidat_bg_inactive: r.bg_inactive.courses_zero_candidat,
        courses_moins_de_3_bg_active: r.bg_active.courses_moins_de_3,
        courses_moins_de_3_bg_inactive: r.bg_inactive.courses_moins_de_3,
      };
    }

    return Response.json({
      generated_at: now.toISOString(),
      periode: { debut: SEVEN_DAYS_AGO.toISOString(), fin: now.toISOString() },
      courses_analysees: courses7j.length,
      livreurs_ayant_travaille_7j: livreursAyantTravaille.size,
      resultats_par_seuil: {
        seuil_10_min: formatSeuil(10),
        seuil_30_min: formatSeuil(30),
        seuil_60_min: formatSeuil(60),
        seuil_90_min: formatSeuil(90),
        seuil_120_min: formatSeuil(120),
        seuil_180_min: formatSeuil(180),
        seuil_360_min: formatSeuil(360),
      },
      conclusion: {
        seuil_minimal_sans_faux_negatif: seuilMinimalSansFauxNegatif,
        fantomes_elimines_avec_ce_seuil: fantomesElimines,
        acceptations_reelles_bloquees: 0,
        recommandation: seuilMinimalSansFauxNegatif
          ? `Seuil ${seuilMinimalSansFauxNegatif}min (heartbeat) / ${seuilMinimalSansFauxNegatif * 2}min (GPS) — élimine ${fantomesElimines} fantômes sans bloquer aucun vrai livreur`
          : 'Aucun seuil testé ne garantit 0 faux négatif — assouplir davantage',
      },
      dispatch_v2_modifie: 'NON',
      rebuild_apk_necessaire: 'NON',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}