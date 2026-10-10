import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { normalizeEnterpriseId } from '../../shared/enterpriseFinance.ts';

/**
 * deciderApresAnnulationLivreur
 *
 * Permet au client de décider après qu'un livreur ait annulé une course acceptée.
 * Le client choisit entre :
 *   - "chercher_autre_livreur" : relance le dispatch (redispatch)
 *   - "terminer_course" : annulation définitive de la course
 *
 * Idempotent : si la décision a déjà été prise, retourne le résultat précédent.
 * Sécurité : seul le client lié à la course peut décider. Vérification côté backend.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const asService = base44.asServiceRole;
    const body = await req.json();
    const { course_id, action } = body;

    if (!course_id) {
      return Response.json({ error: "course_id requis" }, { status: 400 });
    }

    if (action !== "chercher_autre_livreur" && action !== "terminer_course") {
      return Response.json({ error: "action invalide (chercher_autre_livreur ou terminer_course)" }, { status: 400 });
    }

    // ── Récupérer la course ──
    const course = await asService.entities.CourseExterne.get(course_id);
    if (!course) {
      return Response.json({ error: "Course introuvable" }, { status: 404 });
    }

    // ── Idempotence : si déjà décidé, retourner le résultat précédent ──
    if (course.client_decision_action) {
      return Response.json({
        success: true,
        already_decided: true,
        action: course.client_decision_action,
        message: "Décision déjà prise",
      });
    }

    // ── Vérifier que la course est bien en attente de décision ──
    if (!course.client_decision_attendue) {
      return Response.json({
        success: false,
        error: "Cette course n'est pas en attente de décision",
      }, { status: 400 });
    }

    // ── Authentification : seul le client lié peut décider ──
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ error: "Authentification requise" }, { status: 401 });
    }

    // Vérifier que l'utilisateur est bien le client de cette course
    const clientEmail = course.client_user_email;
    if (clientEmail && user.email !== clientEmail) {
      // Vérifier aussi via expediteur_client_id / destinataire_client_id
      let isClient = false;
      if (course.expediteur_client_id) {
        const exp = await asService.entities.ClientExterne.get(course.expediteur_client_id).catch(() => null);
        if (exp?.user_email === user.email) isClient = true;
      }
      if (!isClient && course.destinataire_client_id) {
        const dest = await asService.entities.ClientExterne.get(course.destinataire_client_id).catch(() => null);
        if (dest?.user_email === user.email) isClient = true;
      }
      // Admin peut toujours décider (fallback)
      if (!isClient && user.role !== "admin") {
        return Response.json({
          success: false,
          error: "Action non autorisée — vous n'êtes pas le client de cette course",
        }, { status: 403 });
      }
    }

    const now = new Date().toISOString();

    // ── Action 1 : Chercher un autre livreur (redispatch) ──
    if (action === "chercher_autre_livreur") {
      const updateData = {
        client_decision_attendue: false,
        client_decision_at: now,
        client_decision_action: "chercher_autre_livreur",
        statut: "recherche_livreur",
        dispatch_status: "en_attente",
        notes: (course.notes || "") + ` | [DÉCISION CLIENT — CHERCHER AUTRE LIVREUR] ${now}`,
      };

      await asService.entities.CourseExterne.update(course_id, updateData);

      // ── Déclencher le redispatch via dispatchExterneAuto ──
      try {
        await base44.asServiceRole.functions.invoke('dispatchExterneAuto', {
          action: 'lancer_recherche_auto',
          course_id,
        });
        console.log(`[DÉCISION CLIENT] Redispatch déclenché pour course ${course_id}`);
      } catch (dispatchErr) {
        console.error(`[DÉCISION CLIENT] Erreur redispatch course ${course_id}:`, dispatchErr?.message);
      }

      // ── Notification au client ──
      if (clientEmail) {
        await asService.entities.Notification.create({
          titre: "Recherche d'un nouveau livreur",
          message: "Votre demande a été relancée. Un nouveau livreur sera assigné prochainement.",
          type: "course_modifiee",
          course_id,
          destinataire_email: clientEmail,
          lue: false,
        }).catch(() => null);
      }

      return Response.json({
        success: true,
        action: "chercher_autre_livreur",
        redispatch: true,
        message: "Recherche d'un nouveau livreur lancée",
      });
    }

    // ── Action 2 : Terminer la course (annulation définitive) ──
    if (action === "terminer_course") {
      const updateData = {
        client_decision_attendue: false,
        client_decision_at: now,
        client_decision_action: "terminer_course",
        statut: "annulee",
        dispatch_status: "expire",
        notes: (course.notes || "") + ` | [DÉCISION CLIENT — TERMINER LA COURSE] ${now}`,
      };

      await asService.entities.CourseExterne.update(course_id, updateData);

      // ── Notification au client ──
      if (clientEmail) {
        await asService.entities.Notification.create({
          titre: "Course terminée",
          message: "Votre course a été clôturée. Le motif d'annulation du livreur reste disponible dans l'historique.",
          type: "course_annulee",
          course_id,
          destinataire_email: clientEmail,
          lue: false,
        }).catch(() => null);
      }

      // ── [ECO] Si la course fait partie d'une mission Eco, vérifier l'impact ──
      if (course.eco_mission_id) {
        try {
          const mission = await asService.entities.EcoMission.get(course.eco_mission_id).catch(() => null);
          if (mission && mission.status === "in_progress") {
            // La mission reste active — l'autre course continue normalement
            console.log(`[DÉCISION CLIENT] Course ${course_id} fait partie de la mission Eco ${mission.id} — mission conservée`);
          }
        } catch (e) {
          console.error("[DÉCISION CLIENT] Erreur vérification mission Eco:", e?.message);
        }
      }

      return Response.json({
        success: true,
        action: "terminer_course",
        annulee: true,
        message: "Course terminée définitivement",
      });
    }

  } catch (error) {
    console.error("[DÉCISION CLIENT] Erreur:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});