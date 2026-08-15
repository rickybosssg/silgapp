import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * CORRECTION AUTOMATIQUE — Synchronisation statut livreurs ↔ courses
 *
 * Cette fonction est appelée :
 * - Manuellement par un admin (depuis le dashboard)
 * - Automatiquement par une automation programmée (toutes les 5 min)
 *
 * Trois corrections appliquées :
 * 1. Livreur "en_course" SANS course active → "disponible" (anti-blocage)
 * 2. Livreur "disponible" AVEC course active → "en_course" (anti-dispatch parasite)
 * 3. Course "livree" sans prix_final → prix par défaut (1500 F) + commission calculée
 *
 * Les vérifications admin sont ignorées quand la fonction est appelée par
 * une automation (pas de user context).
 */

const STATUTS_ACTIFS_LIVREUR = [
  'livreur_en_route', 'client_contacte', 'en_route_expediteur',
  'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque',
  'pris_en_charge', 'en_livraison', 'arrivee',
];

const PRIX_DEFAUT = 1500;
const COMMISSION_PCT_DEFAUT = 10;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Vérification admin uniquement si appel manuel (user context présent)
    const user = await base44.auth.me().catch(() => null);
    const isManualCall = !!user;
    if (isManualCall && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('[CORRECTION] Démarrage synchronisation livreurs ↔ courses');

    // ── Récupérer tous les livreurs actifs (en_course + disponible) ──
    const livreursEnCourse = await base44.asServiceRole.entities.Livreur.filter({
      statut: 'en_course',
    });
    const livreursDisponibles = await base44.asServiceRole.entities.Livreur.filter({
      statut: 'disponible',
    });

    // ── Récupérer toutes les courses avec un livreur assigné ──
    const allCourses = await base44.asServiceRole.entities.CourseExterne.filter({}, "-created_date", 500);
    const coursesActives = (allCourses || []).filter(c =>
      STATUTS_ACTIFS_LIVREUR.includes(c.statut) && c.livreur_id
    );
    const livreurIdsAvecCourseActive = new Set(coursesActives.map(c => c.livreur_id));

    // ── Correction 1 : en_course SANS course active → disponible ──
    let corrigesVersDisponible = 0;
    for (const livreur of livreursEnCourse) {
      if (!livreurIdsAvecCourseActive.has(livreur.id)) {
        // Vérifier bloque_encours → hors_ligne au lieu de disponible
        const nouveauStatut = livreur.bloque_encours ? 'hors_ligne' : 'disponible';
        try {
          await base44.asServiceRole.entities.Livreur.update(livreur.id, { statut: nouveauStatut });
          console.log(`[CORRECTION] ${livreur.prenom} ${livreur.nom} : en_course → ${nouveauStatut}`);
          corrigesVersDisponible++;
        } catch (err) {
          console.error(`[CORRECTION] Erreur ${livreur.nom}:`, err.message);
        }
      }
    }

    // ── Correction 2 : disponible AVEC course active → en_course ──
    let corrigesVersEnCourse = 0;
    for (const livreur of livreursDisponibles) {
      if (livreurIdsAvecCourseActive.has(livreur.id)) {
        try {
          await base44.asServiceRole.entities.Livreur.update(livreur.id, { statut: 'en_course' });
          console.log(`[CORRECTION] ${livreur.prenom} ${livreur.nom} : disponible → en_course`);
          corrigesVersEnCourse++;
        } catch (err) {
          console.error(`[CORRECTION] Erreur ${livreur.nom}:`, err.message);
        }
      }
    }

    // ── Correction 3 : courses "livree" sans prix_final → prix par défaut ──
    let coursesPrixCorigees = 0;
    const coursesSansPrix = (allCourses || []).filter(c =>
      c.statut === 'livree' && (!c.prix_final || Number(c.prix_final) <= 0)
    );
    const commissionSilga = Math.round(PRIX_DEFAUT * COMMISSION_PCT_DEFAUT / 100);
    const montantLivreur = PRIX_DEFAUT - commissionSilga;
    for (const course of coursesSansPrix) {
      try {
        await base44.asServiceRole.entities.CourseExterne.update(course.id, {
          prix_final: PRIX_DEFAUT,
          commission_silga: commissionSilga,
          montant_livreur: montantLivreur,
        });
        console.log(`[CORRECTION] Course ${course.id?.slice(-8)} (${course.livreur_nom}) : prix manquant → ${PRIX_DEFAUT} F`);
        coursesPrixCorigees++;
      } catch (err) {
        console.error(`[CORRECTION] Erreur prix course ${course.id?.slice(-8)}:`, err.message);
      }
    }

    const resultat = {
      livreurs_en_course: livreursEnCourse.length,
      livreurs_disponibles: livreursDisponibles.length,
      courses_actives: coursesActives.length,
      corriges_vers_disponible: corrigesVersDisponible,
      corriges_vers_en_course: corrigesVersEnCourse,
      courses_prix_corriges: coursesPrixCorigees,
    };

    console.log('[CORRECTION] Résumé:', resultat);

    return Response.json({
      success: true,
      message: `${corrigesVersDisponible + corrigesVersEnCourse + coursesPrixCorigees} correction(s) appliquée(s)`,
      ...resultat,
    });

  } catch (error) {
    console.error('[CORRECTION] Erreur fatale:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
