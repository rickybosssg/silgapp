import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * GESTION DES COURSES EN PAUSE - SILGA INTERNE
 * 
 * Permet au livreur de mettre une course en pause temporairement
 * et de la reprendre plus tard.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, course_id, livreur_id, motif } = body;

    // ─── 1. Mettre la course en pause ───────────────────────────────────────
    if (action === 'mettre_pause') {
      console.log(`[PAUSE COURSE] 📋 Livreur ${livreur_id} met en pause la course ${course_id}`);

      if (!course_id || !livreur_id) {
        return Response.json({ error: 'course_id et livreur_id requis' }, { status: 400 });
      }

      if (!motif) {
        return Response.json({ error: 'Motif de pause requis' }, { status: 400 });
      }

      const course = await base44.asServiceRole.entities.Course.get(course_id);
      if (!course) {
        return Response.json({ error: 'Course introuvable' }, { status: 404 });
      }

      // Vérifier que la course est assignée à ce livreur
      if (course.livreur_id !== livreur_id) {
        return Response.json({ error: 'Cette course ne vous est pas assignée' }, { status: 403 });
      }

      // Vérifier que la course est dans un statut acceptable pour pause
      const statutsAcceptes = ['acceptee', 'en_route_recuperation', 'colis_recupere', 'en_livraison'];
      if (!statutsAcceptes.includes(course.statut)) {
        return Response.json({ 
          error: `Impossible de mettre en pause une course avec le statut "${course.statut}"` 
        }, { status: 400 });
      }

      // Mettre à jour la course
      await base44.asServiceRole.entities.Course.update(course_id, {
        statut: 'pause',
        pause_motif: motif,
        pause_started_at: new Date().toISOString(),
        pause_livreur_id: livreur_id,
        pause_livreur_nom: course.livreur_nom,
      });

      // Livreur redevient disponible
      await base44.asServiceRole.entities.Livreur.update(livreur_id, {
        statut: 'disponible'
      });

      console.log(`[PAUSE COURSE] ✅ Course ${course_id} en pause (motif: ${motif})`);
      return Response.json({ 
        success: true, 
        message: 'Course mise en pause avec succès',
        course_id: course_id
      });
    }

    // ─── 2. Reprendre la course ───────────────────────────────────────────────
    if (action === 'reprendre_course') {
      console.log(`[PAUSE COURSE] ▶️ Livreur ${livreur_id} reprend la course ${course_id}`);

      if (!course_id || !livreur_id) {
        return Response.json({ error: 'course_id et livreur_id requis' }, { status: 400 });
      }

      const course = await base44.asServiceRole.entities.Course.get(course_id);
      if (!course) {
        return Response.json({ error: 'Course introuvable' }, { status: 404 });
      }

      // Vérifier que la course est assignée à ce livreur
      if (course.livreur_id !== livreur_id) {
        return Response.json({ error: 'Cette course ne vous est pas assignée' }, { status: 403 });
      }

      // Vérifier que la course est bien en pause
      if (course.statut !== 'pause') {
        return Response.json({ 
          error: `Cette course n'est pas en pause (statut: ${course.statut})` 
        }, { status: 400 });
      }

      // Calculer la durée de pause
      const pauseStartedAt = new Date(course.pause_started_at);
      const pauseDurationMinutes = Math.round((Date.now() - pauseStartedAt.getTime()) / 60000);

      // Reprendre la course - retour au statut précédent
      const statutPrecedent = course.statut_pre_pause || 'acceptee';
      
      await base44.asServiceRole.entities.Course.update(course_id, {
        statut: statutPrecedent,
        pause_motif: null,
        pause_started_at: null,
        pause_livreur_id: null,
        pause_livreur_nom: null,
        statut_pre_pause: null,
        pause_duree_minutes: pauseDurationMinutes,
      });

      // Livreur repasse en course
      await base44.asServiceRole.entities.Livreur.update(livreur_id, {
        statut: 'en_course'
      });

      console.log(`[PAUSE COURSE] ✅ Course ${course_id} reprise (pause: ${pauseDurationMinutes} min)`);
      return Response.json({ 
        success: true, 
        message: 'Course reprise avec succès',
        course_id: course_id,
        pause_duree_minutes: pauseDurationMinutes
      });
    }

    // ─── 3. Lister les courses en pause d'un livreur ─────────────────────────
    if (action === 'lister_pause_livreur') {
      if (!livreur_id) {
        return Response.json({ error: 'livreur_id requis' }, { status: 400 });
      }

      const coursesEnPause = await base44.asServiceRole.entities.Course.filter({
        statut: 'pause',
        livreur_id: livreur_id,
      });

      // Calculer la durée de pause pour chaque course
      const coursesAvecDuree = coursesEnPause.map(course => {
        const pauseStartedAt = new Date(course.pause_started_at);
        const dureeMinutes = Math.round((Date.now() - pauseStartedAt.getTime()) / 60000);
        return {
          ...course,
          pause_duree_minutes: dureeMinutes,
          pause_duree_secondes: Math.round((Date.now() - pauseStartedAt.getTime()) / 1000)
        };
      });

      return Response.json({ 
        success: true,
        courses: coursesAvecDuree,
        count: coursesAvecDuree.length
      });
    }

    // ─── 4. Lister toutes les courses en pause (admin) ───────────────────────
    if (action === 'lister_pause_admin') {
      const coursesEnPause = await base44.asServiceRole.entities.Course.filter({
        statut: 'pause',
      });

      // Calculer la durée de pause pour chaque course
      const coursesAvecDuree = coursesEnPause.map(course => {
        const pauseStartedAt = new Date(course.pause_started_at);
        const dureeMinutes = Math.round((Date.now() - pauseStartedAt.getTime()) / 60000);
        return {
          ...course,
          pause_duree_minutes: dureeMinutes,
          pause_duree_secondes: Math.round((Date.now() - pauseStartedAt.getTime()) / 1000),
          alerte_30min: dureeMinutes >= 30
        };
      });

      // Trier par durée de pause (les plus anciennes en premier)
      coursesAvecDuree.sort((a, b) => b.pause_duree_secondes - a.pause_duree_secondes);

      return Response.json({ 
        success: true,
        courses: coursesAvecDuree,
        count: coursesAvecDuree.length,
        alerte_count: coursesAvecDuree.filter(c => c.alerte_30min).length
      });
    }

    return Response.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (error) {
    console.error('[PAUSE COURSE] Erreur fatale:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});