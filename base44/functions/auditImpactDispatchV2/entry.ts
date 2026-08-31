import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

/**
 * auditImpactDispatchV2 — Lecture seule, ne modifie rien.
 *
 * Simule rétrospectivement l'effet de estReellementDisponible() sur les courses
 * des 7 derniers jours. Compare :
 *   A — comportement réel actuel de Dispatch V2 (statut métier disponible)
 *   B — comportement simulé si estReellementDisponible() avait été appliqué
 *
 * Ne modifie aucun fichier, aucun statut, aucun dispatch.
 */
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const now = new Date();
    const SEVEN_DAYS_AGO = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const TEN_MIN = 10 * 60 * 1000;
    const THIRTY_MIN = 30 * 60 * 1000;

    // ── Helper : estReellementDisponible (réplique du module livreurReachability.ts) ──
    // On ne peut pas importer le module partagé directement, donc on réplique la logique.
    function aActiviteRecente(l) {
      if (!l) return false;
      const t = Date.now();
      if (l.last_seen_at) {
        if (t - new Date(l.last_seen_at).getTime() < TEN_MIN) return true;
      }
      if (l.derniere_position_date) {
        if (t - new Date(l.derniere_position_date).getTime() < THIRTY_MIN) return true;
      }
      return false;
    }

    function estReellementDisponible(l) {
      if (!l) return false;
      if (l.statut !== 'disponible') return false;
      if (l.actif === false) return false;
      if (l.validation !== 'valide') return false;
      if (l.bloque_encours === true) return false;
      if (l.manual_hors_ligne === true) return false;
      if (l.admin_hors_ligne === true) return false;
      return aActiviteRecente(l);
    }

    // ── Critères de Dispatch V2 actuels (sans activité technique) ──
    function estEligibleDispatchV2Actuel(l) {
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

    // 1. Charger tous les livreurs externes
    const livreurs = await base44.asServiceRole.entities.Livreur.filter(
      { type_livreur: 'externe' },
      '-last_seen_at',
      500
    );

    // 2. Charger les courses des 7 derniers jours qui ont été dispatchées/acceptées
    const courses = await base44.asServiceRole.entities.CourseExterne.filter(
      {},
      '-created_date',
      1000
    );

    const courses7j = courses.filter(c => {
      const d = c.created_date ? new Date(c.created_date) : null;
      return d && d >= SEVEN_DAYS_AGO && d <= now;
    });

    // 3. Pour chaque course, simuler les deux scénarios
    let coursesAnalysees = 0;
    let coursesAvecMoinsDeCandidats = 0;
    let coursesAvecZeroCandidat = 0;
    let acceptationsReellesBloquees = 0;
    let livreursActifsFaussementExclus = 0;

    // Tracker les livreurs qui ont réellement accepté/livré une course
    const livreursAyantTravaille = new Set();
    const livreursAyantAccepte = new Set();
    for (const c of courses7j) {
      const lid = c.livreur_financier_id || c.livreur_id;
      if (lid && c.statut !== 'annulee') {
        livreursAyantTravaille.add(lid);
        if (c.heure_acceptation) livreursAyantAccepte.add(lid);
      }
    }

    // Pour chaque course, on ne peut pas rejouer l'historique exact des statuts
    // (les statuts livreur changent dans le temps), mais on peut estimer l'impact
    // en utilisant l'état actuel des livreurs comme proxy.

    // Pour chaque livreur qui a travaillé, vérifier s'il serait exclu par estReellementDisponible
    const livreursTravailleursExclus = [];
    for (const lid of livreursAyantTravaille) {
      const livreur = livreurs.find(l => l.id === lid);
      if (!livreur) continue;
      const eligibleV2 = estEligibleDispatchV2Actuel(livreur);
      const reellementDispo = estReellementDisponible(livreur);
      if (eligibleV2 && !reellementDispo) {
        livreursActifsFaussementExclus++;
        livreursTravailleursExclus.push({
          id: livreur.id,
          nom: (livreur.prenom || '') + ' ' + (livreur.nom || ''),
          telephone: livreur.telephone,
          statut_metier: livreur.statut,
          last_seen_at: livreur.last_seen_at,
          derniere_position_date: livreur.derniere_position_date,
          heartbeat_age_min: livreur.last_seen_at
            ? Math.round((Date.now() - new Date(livreur.last_seen_at).getTime()) / 60000)
            : null,
          gps_age_min: livreur.derniere_position_date
            ? Math.round((Date.now() - new Date(livreur.derniere_position_date).getTime()) / 60000)
            : null,
          background_active: livreur.background_active,
          app_active: livreur.app_active,
        });
      }
    }

    // 4. Compter les livreurs exclus par estReellementDisponible
    let livreursExcludes = 0;
    const detailsExclus = [];
    for (const l of livreurs) {
      const eligibleV2 = estEligibleDispatchV2Actuel(l);
      const reellementDispo = estReellementDisponible(l);
      if (eligibleV2 && !reellementDispo) {
        livreursExcludes++;
        detailsExclus.push({
          id: l.id,
          nom: (l.prenom || '') + ' ' + (l.nom || ''),
          statut: l.statut,
          last_seen_at: l.last_seen_at,
          derniere_position_date: l.derniere_position_date,
          heartbeat_age_min: l.last_seen_at
            ? Math.round((Date.now() - new Date(l.last_seen_at).getTime()) / 60000)
            : null,
          gps_age_min: l.derniere_position_date
            ? Math.round((Date.now() - new Date(l.derniere_position_date).getTime()) / 60000)
            : null,
          background_active: l.background_active,
          a_travaille_7j: livreursAyantTravaille.has(l.id),
        });
      }
    }

    // 5. Simuler l'impact sur les courses (approximation : état actuel comme proxy)
    for (const c of courses7j) {
      const lid = c.livreur_financier_id || c.livreur_id;
      if (!lid) continue;
      const livreur = livreurs.find(l => l.id === lid);
      if (!livreur) continue;

      coursesAnalysees++;

      const eligibleV2 = estEligibleDispatchV2Actuel(livreur);
      const reellementDispo = estReellementDisponible(livreur);

      if (eligibleV2 && !reellementDispo) {
        coursesAvecMoinsDeCandidats++;
        if (c.heure_acceptation) {
          acceptationsReellesBloquees++;
        }
      }
    }

    // 6. Vérifier si les seuils sont trop stricts
    // Un livreur qui a travaillé mais a un heartbeat/GPS ancien maintenant
    // n'aurait pas été exclu au moment de la course (son heartbeat était récent alors)
    const seuilsTropStricts = livreursTravailleursExclus.filter(l =>
      l.a_travaille_7j && (l.heartbeat_age_min === null || l.heartbeat_age_min > 60)
    );

    // Déterminer si la règle est sûre
    const regleSure = livreursActifsFaussementExclus === 0;

    return Response.json({
      generated_at: now.toISOString(),
      periode: {
        debut: SEVEN_DAYS_AGO.toISOString(),
        fin: now.toISOString(),
      },
      summary: {
        courses_analysees: coursesAnalysees,
        courses_avec_moins_de_candidats: coursesAvecMoinsDeCandidats,
        courses_avec_zero_candidat: 0, // Ne peut pas être déterminé sans rejouer l'historique exact
        acceptations_reelles_bloquees: acceptationsReellesBloquees,
        livreurs_actifs_faussement_exclus: livreursActifsFaussementExclus,
        livreurs_exclus_total: livreursExcludes,
        livreurs_ayant_travaille_7j: livreursAyantTravaille.size,
        regle_sure_pour_dispatch: regleSure ? 'OUI' : 'À AJUSTER',
        seuils_a_ajuster: seuilsTropStricts.length > 0
          ? 'Considérer assouplissement (heartbeat 10min → 30min) car ' + seuilsTropStricts.length + ' livreurs actifs ont un heartbeat ancien maintenant'
          : 'Aucun ajustement nécessaire',
      },
      details_livreurs_actifs_exclus: livreursTravailleursExclus,
      details_livreurs_exclus: detailsExclus.slice(0, 20),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}