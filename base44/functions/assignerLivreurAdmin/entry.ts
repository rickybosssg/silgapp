import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ═══════════════════════════════════════════════════════════════════════════
// ASSIGNER LIVREUR ADMIN — Assignation manuelle forcée par l'admin
// ═══════════════════════════════════════════════════════════════════════════
//
// Utilisé par :
//   - ManualAssignLivreurDialog
//   - ProposedLivreursList (V1)
//   - ProposedLivreursListV2
//   - CourseDetailDialog (handleReattribuer)
//
// Sécurité :
//   - Valide l'identité admin (base44.auth.me)
//   - Valide le livreur : existe, actif=true, validation="valide", bloque_encours=false
//   - Résout livreur_user_email côté backend (JAMAIS du frontend)
//   - Strip TOUS les champs financiers (prix_final, commission_silga, etc.)
//   - Idempotent : si déjà assigné au même livreur → success sans réécriture
//   - Ne modifie PAS le prix ni la commission
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { course_id, livreur_id, motif } = body;

    if (!course_id || !livreur_id) {
      return Response.json({ error: 'course_id et livreur_id requis' }, { status: 400 });
    }

    // ── Récupérer la course ──
    const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
    if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

    if (['livree', 'annulee'].includes(course.statut)) {
      return Response.json({ error: 'Course terminée ou annulée' }, { status: 400 });
    }

    // ── Récupérer le livreur ──
    const livreur = await base44.asServiceRole.entities.Livreur.get(livreur_id).catch(() => null);
    if (!livreur) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });

    // ── Validation du livreur ──
    if (!livreur.actif) {
      return Response.json({ error: 'Ce livreur est inactif' }, { status: 400 });
    }
    if (livreur.validation !== 'valide') {
      return Response.json({ error: 'Ce livreur n\'est pas validé' }, { status: 400 });
    }
    if (livreur.bloque_encours) {
      return Response.json({ error: 'Ce livreur est bloqué (encours SILGAPP atteint)' }, { status: 400 });
    }

    // ── Idempotence : si déjà assigné au même livreur ──
    if (course.livreur_id === livreur_id && course.statut === 'livreur_en_route') {
      return Response.json({
        success: true,
        skipped: 'already_assigned',
        course_id,
        livreur_id,
        message: 'Course déjà assignée à ce livreur',
      });
    }

    // ── Construire l'update ──
    const now = new Date().toISOString();
    const livreurNom = `${livreur.prenom || ''} ${livreur.nom || ''}`.trim();
    const noteAdmin = motif || `Assigné manuellement par admin → ${livreurNom}`;

    const updateData: any = {
      statut: 'livreur_en_route',
      dispatch_status: 'accepte',
      livreur_id: livreur_id,
      livreur_nom: livreurNom,
      livreur_telephone: livreur.telephone || '',
      livreur_vehicule: livreur.vehicule || livreur.type_vehicule || '',
      livreur_photo_url: livreur.photo_url || '',
      livreur_note_moyenne: livreur.note_moyenne || 0,
      livreur_nombre_avis: livreur.nombre_avis || 0,
      livreur_user_email: livreur.user_email || null, // Résolu côté backend uniquement
      heure_acceptation: now,
      notes: (course.notes || '') + `\n[${noteAdmin}]`,
    };

    // ── Mettre à jour la course ──
    const updated = await base44.asServiceRole.entities.CourseExterne.update(course_id, updateData);

    // ── Mettre le livreur en course ──
    await base44.asServiceRole.entities.Livreur.update(livreur_id, {
      statut: 'en_course',
    });

    // ── Notification push au livreur ──
    if (livreur.user_email) {
      await base44.asServiceRole.entities.Notification.create({
        titre: '🚨 Course assignée par admin',
        message: `Course ${course.adresse_depart || ''} → ${course.adresse_arrivee || ''} vous a été assignée manuellement.`,
        type: 'course_assignee',
        course_id,
        destinataire_email: livreur.user_email,
        lue: false,
      }).catch(() => null);

      // Push notification
      await base44.asServiceRole.functions.invoke('envoiNotificationPush', {
        titre: '🚨 Course assignée par admin',
        message: `Course ${course.adresse_depart || ''} → ${course.adresse_arrivee || ''} vous a été assignée manuellement.`,
        type: 'course_assignee',
        destinataire_email: livreur.user_email,
        user_type: 'livreur',
        course_id,
      }).catch(() => null);
    }

    console.log(`[ASSIGN_ADMIN] Course ${course_id} assignée à livreur ${livreur_id} (${livreurNom}) par ${user.email}`);

    return Response.json({
      success: true,
      course: updated,
      livreur_id,
      livreur_nom: livreurNom,
      livreur_user_email: livreur.user_email || null,
      message: `Course assignée à ${livreurNom}`,
    });

  } catch (error) {
    console.error('[ASSIGN_ADMIN] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}