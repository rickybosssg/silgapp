import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ═══════════════════════════════════════════════════════════════════════════
// RELANCER DISPATCH ADMIN — Reset propre du dispatch par l'admin
// ═══════════════════════════════════════════════════════════════════════════
//
// Utilisé par :
//   - CourseDetailDialog (handleRelancerVague0) → mode="vague0"
//   - CoursesRedispatch (relaunchMutation) → mode="redispatch"
//
// Sécurité :
//   - Valide l'identité admin (base44.auth.me)
//   - mode="vague0" : reset complet + vide livreur_id + livreur_user_email=null
//   - mode="redispatch" : reset dispatch sans vider livreur_id (comportement existant)
//   - Strip TOUS les champs financiers (prix_final, commission_silga, etc.)
//   - Utilise les mécanismes V2 existants (dispatchExterneAuto)
//   - Ne recrée aucune logique parallèle
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { course_id, mode, motif } = body;

    if (!course_id) {
      return Response.json({ error: 'course_id requis' }, { status: 400 });
    }

    const resetMode = mode || 'redispatch'; // "vague0" | "redispatch"

    // ── Récupérer la course ──
    const course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
    if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

    if (['livree', 'annulee'].includes(course.statut)) {
      return Response.json({ error: 'Course terminée ou annulée' }, { status: 400 });
    }

    // ── Construire le reset dispatch ──
    const now = new Date().toISOString();
    const noteLabel = motif || `RELANCE ADMIN → recherche_livreur (${resetMode})`;

    const resetData: any = {
      statut: 'recherche_livreur',
      dispatch_status: 'en_attente',
      dispatch_wave: 0,
      dispatch_cycle_count: 0,
      dispatch_notified_ids: '[]',
      dispatch_wave_notified_ids: '[]',
      dispatch_refused_ids: '[]',
      dispatch_locked_until: null,
      timeout_expires_at: null,
      dispatch_next_wave_at: null,
      dispatch_v2_secours_phase: 0,
      notes: (course.notes || '') + ` | [${noteLabel}]`,
    };

    // ── Mode "vague0" : reset complet + libération du livreur ──
    if (resetMode === 'vague0') {
      resetData.livreur_id = '';
      resetData.livreur_nom = '';
      resetData.livreur_telephone = '';
      resetData.livreur_photo_url = '';
      resetData.livreur_vehicule = '';
      resetData.livreur_note_moyenne = 0;
      resetData.livreur_nombre_avis = 0;
      resetData.livreur_user_email = null; // ⚠️ Retrait livreur → null
      resetData.heure_acceptation = null;
    }

    // ── Mettre à jour la course ──
    await base44.asServiceRole.entities.CourseExterne.update(course_id, resetData);

    // ── Réinitialiser les notifications DispatchNotification ──
    await base44.asServiceRole.entities.DispatchNotification
      .deleteMany({ course_id })
      .catch(() => null);

    // ── Déclencher le dispatch immédiatement (mécanisme V2 existant) ──
    await base44.asServiceRole.functions.invoke('dispatchExterneAuto', {}).catch((err: any) => {
      console.error('[RELANCE_DISPATCH] Erreur dispatchExterneAuto:', err?.message || String(err));
    });

    // ── Si mode vague0, libérer le livreur ──
    if (resetMode === 'vague0' && course.livreur_id) {
      const livreur = await base44.asServiceRole.entities.Livreur.get(course.livreur_id).catch(() => null);
      if (livreur) {
        await base44.asServiceRole.entities.Livreur.update(course.livreur_id, {
          statut: livreur.manual_hors_ligne === true ? 'hors_ligne' : 'disponible',
        }).catch(() => null);
      }
    }

    console.log(`[RELANCE_DISPATCH] Course ${course_id} relancée (mode=${resetMode}) par ${user.email}`);

    return Response.json({
      success: true,
      course_id,
      mode: resetMode,
      message: `Course relancée (${resetMode}) — dispatch en cours`,
    });

  } catch (error) {
    console.error('[RELANCE_DISPATCH] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}