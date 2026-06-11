import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * ANNULATION DE COURSE - SILGAPP EXTERNE
 * 
 * Gère l'annulation d'une course par le client ou l'admin.
 * 
 * WORKFLOW COMPLET :
 * 1. Vérifie que la course existe et peut être annulée
 * 2. Si un livreur est assigné :
 *    - Libère immédiatement le livreur (statut → 'disponible')
 *    - Supprime toutes les références de mission
 * 3. Met à jour la course (statut → 'annulee')
 * 4. Archive les notifications liées
 * 5. Met à jour la carte dispatch en temps réel
 * 
 * CAS GÉRÉS :
 * - Annulation par le client (avant acceptation livreur)
 * - Annulation par le client (après acceptation livreur)
 * - Annulation par l'admin
 * - Annulation automatique (timeout, bug détecté)
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { course_id, admin_email, motif } = body;

    console.log(`[ANNULATION] 📋 Annulation demandée pour course ${course_id}`);

    if (!course_id) {
      return Response.json({ error: 'course_id requis' }, { status: 400 });
    }

    // ─── 1. Récupérer la course ─────────────────────────────────────────────
    const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
    if (!course) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }
    const user = await base44.auth.me().catch(() => null);
    if (user?.admin_type === 'pays' && user.country_code && course.country_code !== user.country_code) {
      console.error('[ANNULATION][CRITICAL_COUNTRY_BLOCK]', {
        course_id,
        course_country_code: course.country_code || 'ABSENT',
        admin_email: user.email,
        admin_country_code: user.country_code,
      });
      return Response.json({
        success: false,
        error: 'Action interdite : course hors pays admin',
        blocked_reason: 'country_mismatch',
        course_country_code: course.country_code || '',
        admin_country_code: user.country_code,
      }, { status: 403 });
    }

    console.log(`[ANNULATION] Course trouvée:`, {
      id: course.id,
      statut: course.statut,
      livreur_id: course.livreur_id || 'AUCUN',
      livreur_nom: course.livreur_nom || 'AUCUN',
      dispatch_status: course.dispatch_status
    });

    // Vérifier si la course est déjà annulée ou livrée
    if (course.statut === 'annulee') {
      return Response.json({ 
        success: false, 
        error: 'Course déjà annulée',
        already_cancelled: true 
      });
    }

    if (course.statut === 'livree') {
      return Response.json({ 
        success: false, 
        error: 'Course déjà livrée - impossible d\'annuler' 
      });
    }

    // ─── 2. Si livreur assigné → LIBÉRATION IMMÉDIATE ─────────────────────
    let livreurLibere = false;
    let livreurDetails = null;

    if (course.livreur_id) {
      console.log(`[ANNULATION] 🚚 Livreur assigné détecté: ${course.livreur_id} (${course.livreur_nom})`);

      try {
        // Récupérer le livreur pour vérifier son statut actuel
        const livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id);
        
        if (livreur) {
          livreurDetails = {
            id: livreur.id,
            nom: `${livreur.prenom || ''} ${livreur.nom}`.trim(),
            statut_avant: livreur.statut,
            user_email: livreur.user_email
          };

          console.log(`[ANNULATION] Statut actuel du livreur: ${livreur.statut}`);

          // ⚠️ CRITIQUE: Remettre le livreur en statut approprié
          // Si heartbeat récent (< 10 min) → disponible, sinon → hors_ligne
          const heartbeatAge = livreur.last_seen_at
            ? (Date.now() - new Date(livreur.last_seen_at).getTime()) / 60000
            : 999;
          const nouveauStatut = heartbeatAge < 10 ? 'disponible' : 'hors_ligne';

          await base44.asServiceRole.entities.Livreur.update(course.livreur_id, {
            statut: nouveauStatut
          });

          livreurLibere = true;
          console.log(`[ANNULATION] ✅ Livreur ${livreurDetails.nom} libéré (statut → ${nouveauStatut}, heartbeat_age: ${Math.round(heartbeatAge)}min)`);

          // Nettoyer toutes les références de mission sur le livreur
          // (au cas où il y aurait d'autres champs custom)
          const cleanUpdates = {};
          
          // Si le livreur a un champ currentCourseId ou assignedCourse, le nettoyer
          // Note: Ces champs n'existent pas dans le schema Livreur actuel, mais on anticipe
          if (livreur.currentCourseId || livreur.assignedCourse) {
            cleanUpdates.currentCourseId = null;
            cleanUpdates.assignedCourse = null;
            await base44.asServiceRole.entities.Livreur.update(course.livreur_id, cleanUpdates);
            console.log(`[ANNULATION] 🧹 Références de mission nettoyées sur le livreur`);
          }

          // Notification au livreur (optionnel - pour information)
          if (livreur.user_email) {
            try {
              await base44.asServiceRole.entities.Notification.create({
                titre: 'ℹ️ Course annulée',
                message: `La course ${course.id.substr(-8)} a été annulée. Vous êtes maintenant disponible.`,
                type: 'course_annulee',
                course_id: course_id,
                destinataire_email: livreur.user_email,
                lue: false,
              });
              console.log(`[ANNULATION] 📧 Notification envoyée au livreur ${livreur.user_email}`);
            } catch (err) {
              console.warn('[ANNULATION] Erreur notification livreur:', err.message);
            }
          }
        } else {
          console.warn(`[ANNULATION] ⚠️ Livreur ${course.livreur_id} introuvable en BDD`);
        }
      } catch (err) {
        console.error(`[ANNULATION] ❌ Erreur libération livreur:`, err.message);
        // On continue l'annulation même si la libération échoue
      }
    } else {
      console.log(`[ANNULATION] ℹ️ Aucun livreur assigné à cette course`);
    }

    // ─── 3. Mettre à jour la course (statut → 'annulee') ───────────────────
    const updateData = {
      statut: 'annulee',
      // ⚠️ CRITIQUE : Forcer dispatch_status='expire' pour TOUTE course annulée en dispatch
      // Cela empêche le modal de s'afficher chez les livreurs
      ...(course.dispatch_status === 'propose' || course.dispatch_status === 'en_attente' || course.dispatch_status === 'redispatch'
        ? { dispatch_status: 'expire' }
        : {}),
      // Garder les infos du livreur pour l'historique (mais course annulée)
      // Ne pas effacer livreur_id/livreur_nom pour tracer qui était assigné
    };

    // Ajouter le motif si fourni
    if (motif) {
      updateData.notes = motif;
    }

    // Timestamp d'annulation (champ dédié via notes, pas colis_livre_at)
    updateData.date_annulation = new Date().toISOString();

    await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);

    console.log(`[ANNULATION] ✅ Course ${course_id} marquée comme annulée`);

    // ─── 4. Archiver les notifications liées à cette course ────────────────
    try {
      const notifs = await base44.asServiceRole.entities.Notification.filter({
        course_id: course_id,
        lue: false,
      });

      for (const notif of notifs) {
        await base44.asServiceRole.entities.Notification.update(notif.id, { lue: true });
      }

      if (notifs.length > 0) {
        console.log(`[ANNULATION] 🧹 ${notifs.length} notification(s) archivée(s)`);
      }
    } catch (err) {
      console.warn('[ANNULATION] Erreur archivage notifications:', err.message);
    }

    // ─── 5. Résultat ───────────────────────────────────────────────────────
    return Response.json({
      success: true,
      message: 'Course annulée avec succès',
      course_id: course_id,
      livreur_libere: livreurLibere,
      livreur_details: livreurDetails,
      statut_final: 'annulee',
    });

  } catch (error) {
    console.error('[ANNULATION] Erreur fatale:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});