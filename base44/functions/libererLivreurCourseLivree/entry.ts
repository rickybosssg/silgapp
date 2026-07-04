import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * LIBÉRER LIVREUR - COURSE LIVRÉE
 *
 * Quand une course est livrée (statut: 'livree'), cette fonction :
 * 1. Remet automatiquement le livreur en statut "disponible"
 * 2. Rend le livreur dispatchable immédiatement
 *
 * Peut être appelée par :
 * - Un admin (via dashboard)
 * - Une automation entity (sans user context)
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Vérifier que c'est un admin qui appelle (sauf si appelé par automation)
    // Les automations n'ont pas de user context, donc on skip la vérification
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { course_id } = await req.json();

    if (!course_id) {
      return Response.json({ error: 'course_id requis' }, { status: 400 });
    }

    // Récupérer la course
    const course = await base44.entities.CourseExterne.get(course_id);

    if (!course) {
      return Response.json({ error: 'Course non trouvée' }, { status: 404 });
    }

    // Vérifier que la course est livrée
    const statutsFin = ["livree", "terminee", "completed"];
    if (!statutsFin.includes(course.statut)) {
      return Response.json({
        success: true,
        message: `Course pas encore terminée (statut: ${course.statut})`,
        course_id: course_id,
        statut: course.statut
      });
    }

    // Si la course a un livreur assigné
    if (course.livreur_id) {
      console.log(`[libererLivreurCourseLivree] Course ${course_id} ${course.statut}, livreur: ${course.livreur_nom}`);

      // Récupérer le livreur pour vérifier le heartbeat
      const livreur = await base44.entities.Livreur.get(course.livreur_id).catch(() => null);
      if (livreur?.bloque_encours) {
        await base44.entities.Livreur.update(course.livreur_id, {
          statut: 'hors_ligne',
          admin_hors_ligne: true,
        });
        return Response.json({
          success: true,
          message: 'Livreur conserve hors ligne: encours bloque',
          course_id: course_id,
          livreur_id: course.livreur_id,
          livreur_nom: course.livreur_nom,
          bloque_encours: true,
        });
      }
      const heartbeatAge = livreur?.last_seen_at
        ? (Date.now() - new Date(livreur.last_seen_at).getTime()) / 60000
        : 999;
      // Heartbeat récent (< 10 min) → disponible, sinon → hors_ligne
      const nouveauStatut = livreur.manual_hors_ligne === true ? 'hors_ligne' : 'disponible';

      await base44.entities.Livreur.update(course.livreur_id, { statut: nouveauStatut });

      console.log(`[libererLivreurCourseLivree] Livreur ${course.livreur_nom} remis à "${nouveauStatut}" (heartbeat: ${Math.round(heartbeatAge)}min)`);

      return Response.json({
        success: true,
        message: 'Livreur libéré avec succès',
        course_id: course_id,
        livreur_id: course.livreur_id,
        livreur_nom: course.livreur_nom
      });
    }

    return Response.json({
      success: true,
      message: 'Aucun livreur assigné à cette course',
      course_id: course_id,
      statut: course.statut,
      livreur_id: course.livreur_id
    });

  } catch (error) {
    console.error('[libererLivreurCourseLivree] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
