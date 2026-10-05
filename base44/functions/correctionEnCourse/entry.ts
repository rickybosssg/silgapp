import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { STATUTS_ACTIFS_COURSE } from '../../shared/dispatchConstants.ts';

/**
 * CORRECTION AUTOMATIQUE — Filet de sécurité statut livreurs ↔ courses
 *
 * Appelée automatiquement par le workflow "Correction Auto Statut Livreurs"
 * (toutes les 5 min). Peut aussi être appelée manuellement par un admin.
 *
 * Deux corrections de secours :
 * 1. Livreur "en_course" SANS course active → "disponible" (ou "hors_ligne" si bloque_encours)
 * 2. Livreur "disponible" AVEC course active → "en_course"
 *
 * Ces corrections ne remplacent JAMAIS les mécanismes temps réel :
 *   finaliserLivraisonLivreur, libererLivreurCourseLivree,
 *   syncStatutLivreurOnCourse, Dispatch V2.
 *
 * NE MODIFIE PAS : finance, prix, commissions, montant_du_silga, encours,
 * encours_comptabilise_at, livreur_financier_id, PaiementSilgapp,
 * GPS, heartbeat, FCM, QR/PIN, redispatch, messagerie, Growth, Meta.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    console.log('[CORRECTION] Démarrage filet de sécurité statut livreurs');

    // ── 1. Charger uniquement les courses réellement actives ──
    // (au lieu de charger 500 courses sans filtre statut — bug corrigé)
    const coursesActives = await base44.asServiceRole.entities.CourseExterne.filter({
      statut: { $in: STATUTS_ACTIFS_COURSE },
    }, '-created_date', 200);

    const livreurIdsAvecCourseActive = new Set(
      (coursesActives || [])
        .filter((c: any) => c.livreur_id)
        .map((c: any) => c.livreur_id)
    );

    // ── 2. Correction A : en_course SANS course active → disponible/hors_ligne ──
    let corrigesVersDisponible = 0;
    const livreursEnCourse = await base44.asServiceRole.entities.Livreur.filter({
      statut: 'en_course',
    });

    for (const livreur of livreursEnCourse) {
      if (!livreurIdsAvecCourseActive.has(livreur.id)) {
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

    // ── 3. Correction B : disponible AVEC course active → en_course ──
    // Ne charge que les livreurs réellement concernés (ceux avec une course active),
    // pas les 130 livreurs disponibles.
    let corrigesVersEnCourse = 0;
    for (const livreurId of livreurIdsAvecCourseActive) {
      try {
        const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId);
        if (livreur && livreur.statut === 'disponible') {
          await base44.asServiceRole.entities.Livreur.update(livreur.id, { statut: 'en_course' });
          console.log(`[CORRECTION] ${livreur.prenom} ${livreur.nom} : disponible → en_course`);
          corrigesVersEnCourse++;
        }
      } catch (err) {
        console.error(`[CORRECTION] Erreur livreur ${livreurId}:`, err.message);
      }
    }

    const resultat = {
      livreurs_en_course: livreursEnCourse.length,
      courses_actives: coursesActives.length,
      corriges_vers_disponible: corrigesVersDisponible,
      corriges_vers_en_course: corrigesVersEnCourse,
    };

    console.log('[CORRECTION] Résumé:', resultat);

    return Response.json({
      success: true,
      message: `${corrigesVersDisponible + corrigesVersEnCourse} correction(s) appliquée(s)`,
      ...resultat,
    });

  } catch (error) {
    console.error('[CORRECTION] Erreur fatale:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});