import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { isTerminalCourse, updateActiveCourse } from '../../shared/courseTerminalGuard.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TRANSITION STATUT ADMIN — Transitions de statut contrôlées par l'admin
// ═══════════════════════════════════════════════════════════════════════════
//
// Utilisé par :
//   - CourseDetailDialog (updateMutation générique)
//
// Sécurité :
//   - Valide l'identité admin (base44.auth.me)
//   - Accepte UNIQUEMENT statut_cible + notes (pas de data arbitraire)
//   - Refuse les modifications financières (prix_final, commission_silga, etc.)
//   - Refuse livreur_id (utiliser assignerLivreurAdmin)
//   - Refuse annulee (utiliser cloturerCourseAdmin)
//   - Refuse livree (utiliser finaliserLivraisonLivreur)
//   - Résout livreur_user_email si livreur_id existe déjà (mais ne le change pas)
//   - Idempotent : si déjà au statut cible → success sans réécriture
// ═══════════════════════════════════════════════════════════════════════════

const STATUTS_VALIDES = [
  'nouvelle', 'en_attente', 'programmee', 'recherche_livreur',
  'livreur_en_route', 'client_contacte', 'en_route_expediteur',
  'arrive_prise_en_charge', 'colis_recupere', 'passager_embarque',
  'pris_en_charge', 'en_livraison', 'arrivee',
];

// Statuts interdits via cette fonction (utiliser les fonctions dédiées)
const STATUTS_INTERDITS = ['livree', 'annulee'];

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await req.json();
    const { course_id, statut_cible, notes } = body;

    if (!course_id || !statut_cible) {
      return Response.json({ error: 'course_id et statut_cible requis' }, { status: 400 });
    }

    // ── Valider le statut cible ──
    if (STATUTS_INTERDITS.includes(statut_cible)) {
      return Response.json({
        error: `Statut "${statut_cible}" interdit via cette fonction. Utiliser ${statut_cible === 'livree' ? 'finaliserLivraisonLivreur' : 'cloturerCourseAdmin'}.`,
      }, { status: 400 });
    }

    if (!STATUTS_VALIDES.includes(statut_cible)) {
      return Response.json({ error: `Statut cible invalide: ${statut_cible}` }, { status: 400 });
    }

    // ── Récupérer la course ──
    let course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
    if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });
    if (isTerminalCourse(course)) return Response.json({ success: false, error: 'Une course terminée ne peut pas être réactivée.' }, { status: 409 });

    // ── Idempotence ──
    if (course.statut === statut_cible) {
      return Response.json({ success: true, skipped: 'already_at_target', course_id, statut: statut_cible });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CAS SPÉCIAL : statut_cible = "recherche_livreur"
    // ═══════════════════════════════════════════════════════════════════════════
    // L'admin remet manuellement la course en recherche livreur. Une simple
    // modification du statut ne suffit PAS — il faut relancer le véritable
    // processus de dispatch backend (Dispatch V2 pour Standard, moteur Éco
    // pour Éco isolée).
    //
    // Blocages de sécurité :
    //   - client_decision_attendue = true → l'admin PEUT forcer le redispatch
    //     (override explicite). Le flag bloque le dispatch AUTOMATIQUE, pas l'admin.
    //   - Course Éco isolée → réintégrer au moteur Éco, pas au dispatch Standard.
    //   - Course déjà en disponible_push → déjà visible, skip.
    // ═══════════════════════════════════════════════════════════════════════════
    if (statut_cible === 'recherche_livreur') {
      // ── Admin override : si la course est en attente de décision client,
      //    l'admin peut explicitement forcer le redispatch. Le flag
      //    client_decision_attendue bloque le dispatch AUTOMATIQUE (watchdog,
      //    orchestrator) mais ne doit pas bloquer une action admin explicite. ──
      if (course.client_decision_attendue === true) {
        if (!await updateActiveCourse(base44, course, {
          client_decision_attendue: false,
          client_decision_action: 'chercher_autre_livreur',
          client_decision_at: new Date().toISOString(),
        })) return Response.json({ success: false, error: 'Course modifiée simultanément.' }, { status: 409 });
        course = await base44.asServiceRole.entities.CourseExterne.get(course_id);
        console.log(`[TRANSITION_ADMIN] Admin ${user.email} a levé client_decision_attendue pour course ${course_id} — redispatch forcé`);
      }

      // ── Course Éco isolée → réintégrer au moteur Éco ──
      if (course.delivery_mode === 'eco' && course.eco_status === 'isolated') {
        // S'assurer que dispatch_status = en_attente (pas disponible_push)
        if (!await updateActiveCourse(base44, course, {
          statut: 'recherche_livreur',
          dispatch_status: 'en_attente',
        })) return Response.json({ success: false, error: 'Course modifiée simultanément.' }, { status: 409 });

        // Tenter un regroupement immédiat
        await base44.asServiceRole.functions.invoke('ecoOptimizationOrchestrator', {
          action: 'process_course_created',
          course_id,
        }).catch(() => null);

        console.log(`[TRANSITION_ADMIN] Course Éco isolée ${course_id} réintégrée au moteur Éco par ${user.email}`);
        return Response.json({
          success: true,
          course_id,
          statut: 'recherche_livreur',
          eco_reintegrated: true,
          message: 'Course Éco isolée réintégrée au moteur de regroupement. Elle reste visible mais non acceptable individuellement tant qu\'aucun regroupement n\'est trouvé.',
        });
      }

      // ── Course déjà publiée dans le fil → déjà visible, skip ──
      if (course.dispatch_status === 'disponible_push' && !course.livreur_id) {
        return Response.json({
          success: true,
          skipped: 'already_in_dispatch_fil',
          course_id,
          statut: 'recherche_livreur',
          message: 'La course est déjà publiée dans le fil des livreurs disponibles.',
        });
      }

      // ── Course Standard : déléguer au mécanisme officiel de redispatch ──
      // relancerDispatchAdmin nettoie les anciennes notifications, préserve les
      // exclusions (annulations + refus), et déclenche dispatchExterneAuto.
      // mode="vague0" si la course avait un livreur assigné, sinon "redispatch".
      const mode = course.livreur_id || course.accepted_by_livreur_id ? 'vague0' : 'redispatch';

      const redispatchResult = await base44.asServiceRole.functions.invoke('relancerDispatchAdmin', {
        course_id,
        mode,
        motif: `Remise en recherche par admin (${user.email})`,
      }).catch((err: any) => {
        console.error('[TRANSITION_ADMIN] relancerDispatchAdmin error:', err?.message);
        return { data: { error: err?.message || 'Erreur redispatch' } };
      });

      const redispatchData = redispatchResult?.data ?? redispatchResult;
      if (redispatchData?.error) {
        return Response.json({
          error: `Impossible de relancer le dispatch: ${redispatchData.error}`,
          course_id,
          blocked_reason: 'redispatch_failed',
        }, { status: 500 });
      }

      console.log(`[TRANSITION_ADMIN] Course ${course_id} remise en recherche (mode=${mode}) par ${user.email} — dispatch relancé`);
      return Response.json({
        success: true,
        course_id,
        statut: 'recherche_livreur',
        dispatch_relanced: true,
        mode,
        message: redispatchData?.message || 'Course remise en recherche — dispatch relancé.',
      });
    }

    // ── Construire l'update (UNIQUEMENT statut + notes + heure_*) ──
    const now = new Date().toISOString();
    const updateData: any = { statut: statut_cible };

    // Champs heure selon le statut
    if (statut_cible === 'client_contacte') updateData.heure_contact_client = now;
    if (statut_cible === 'colis_recupere') {
      updateData.heure_recuperation = now;
      updateData.pickup_confirmed_by = 'admin';
      updateData.pickup_confirmed_at = now;
    }
    if (statut_cible === 'pris_en_charge') updateData.heure_prise_en_charge = now;
    if (statut_cible === 'arrivee') updateData.heure_arrivee = now;

    // Notes (append)
    if (notes && typeof notes === 'string' && notes.trim().length > 0) {
      updateData.notes = (course.notes || '') + `\n[ADMIN → ${statut_cible}] ${notes.trim()}`;
    }

    // ── Mettre à jour la course ──
    if (!await updateActiveCourse(base44, course, updateData)) return Response.json({ success: false, error: 'Course modifiée simultanément.' }, { status: 409 });
    const updated = await base44.asServiceRole.entities.CourseExterne.get(course_id);

    console.log(`[TRANSITION_ADMIN] Course ${course_id} → ${statut_cible} par ${user.email}`);

    return Response.json({
      success: true,
      course: updated,
      statut: statut_cible,
    });

  } catch (error) {
    console.error('[TRANSITION_ADMIN] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
