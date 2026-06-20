import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * SYNC AUTOMATIQUE STATUT LIVREUR ← STATUT COURSE
 *
 * Déclenché par automation entity sur CourseExterne (create, update).
 *
 * Règle :
 * - Si course.statut ∈ TERMINAUX (annulee, livree) et livreur_id présent
 * → vérifier que le livreur n'a PAS d'autre course active
 * → si non → remettre livreur en disponible/hors_ligne selon heartbeat
 * - Si course.statut ∈ ACTIFS_LIVREUR (livreur_en_route, colis_recupere, en_livraison)
 * → s'assurer que le livreur est bien en_course
 */

const STATUTS_TERMINAUX = ["annulee", "livree", "terminee", "completed"];
const STATUTS_ACTIFS_LIVREUR = ["livreur_en_route", "colis_recupere", "en_livraison", "pris_en_charge", "arrivee"];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { event, data, old_data } = body;

    const course = data;
    if (!course) {
      return Response.json({ success: true, skipped: "no_data" });
    }

    const livreurId = course.livreur_id;
    const statut = course.statut;

    console.log(`[syncStatutLivreur] event=${event?.type} statut=${statut} livreur_id=${livreurId?.slice(-8) || 'NONE'}`);

    // Cas 1 : Course passée à un statut terminal (annulée ou livrée)
    if (STATUTS_TERMINAUX.includes(statut) && livreurId) {
      // ADMIN_MANUEL sans prix_final : ne PAS libérer le livreur
      // Le livreur doit d'abord saisir le montant payé par le client dans l'app.
      const isAdminSansPrix = (course.pricing_mode === "admin_manuel" || course.source === "admin")
        && statut === "livree"
        && (!course.prix_final || Number(course.prix_final) <= 0);
      if (isAdminSansPrix) {
        console.log(`[syncStatutLivreur] ⏸ Course admin_manuel livrée sans prix_final — livreur reste en_course (attente saisie montant)`);
        return Response.json({ success: true, skipped: "admin_manuel_waiting_price", livreur_id: livreurId });
      }

      // Vérifier si le livreur a une AUTRE course encore active
      const coursesActives = await base44.asServiceRole.entities.CourseExterne.filter(
        { livreur_id: livreurId },
        "-created_date",
        10
      );

      const autresCourseActives = (coursesActives || []).filter(c =>
        c.id !== course.id && STATUTS_ACTIFS_LIVREUR.includes(c.statut)
      );

      if (autresCourseActives.length === 0) {
        // Pas d'autre course active → libérer le livreur
        const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
        if (!livreur) {
          console.warn(`[syncStatutLivreur] Livreur ${livreurId} introuvable`);
          return Response.json({ success: true, skipped: "livreur_not_found" });
        }

        // Ne rien faire si déjà libre/hors_ligne
        if (livreur.statut !== "en_course") {
          console.log(`[syncStatutLivreur] Livreur déjà en statut "${livreur.statut}", rien à faire.`);
          return Response.json({ success: true, skipped: "already_correct", statut: livreur.statut });
        }

        // Livreur bloqué pour encours → toujours hors_ligne
        if (livreur.bloque_encours) {
          await base44.asServiceRole.entities.Livreur.update(livreurId, { statut: "hors_ligne" });
          console.log(`[syncStatutLivreur] Livreur ${livreur.prenom} ${livreur.nom} bloqué encours → forcé hors_ligne`);
          return Response.json({ success: true, action: "bloque_hors_ligne", livreur_id: livreurId });
        }

        const heartbeatAge = livreur.last_seen_at
          ? (Date.now() - new Date(livreur.last_seen_at).getTime()) / 60000
          : 999;
        const nouveauStatut = heartbeatAge < 10 ? "disponible" : "hors_ligne";

        await base44.asServiceRole.entities.Livreur.update(livreurId, { statut: nouveauStatut });
        console.log(`[syncStatutLivreur] Livreur ${livreur.prenom} ${livreur.nom} → "${nouveauStatut}" (course ${statut}, heartbeat: ${Math.round(heartbeatAge)}min)`);

        return Response.json({
          success: true,
          action: "livreur_libere",
          livreur_id: livreurId,
          ancien_statut: livreur.statut,
          nouveau_statut: nouveauStatut,
          cours_statut: statut,
        });
      } else {
        console.log(`[syncStatutLivreur] Livreur a ${autresCourseActives.length} autre(s) course(s) active(s), pas de libération.`);
        return Response.json({ success: true, skipped: "other_courses_active", count: autresCourseActives.length });
      }
    }

    // Cas 2 : Course active → s'assurer que le livreur est bien "en_course"
    if (STATUTS_ACTIFS_LIVREUR.includes(statut) && livreurId) {
      const livreur = await base44.asServiceRole.entities.Livreur.get(livreurId).catch(() => null);
      if (livreur && livreur.statut !== "en_course") {
        await base44.asServiceRole.entities.Livreur.update(livreurId, { statut: "en_course" });
        console.log(`[syncStatutLivreur] Livreur ${livreur.prenom} ${livreur.nom} → "en_course" (course ${statut})`);
        return Response.json({ success: true, action: "livreur_en_course", livreur_id: livreurId });
      }
      return Response.json({ success: true, skipped: "already_en_course" });
    }

    return Response.json({ success: true, skipped: "no_action_needed", statut });

  } catch (error) {
    console.error('[syncStatutLivreur] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});