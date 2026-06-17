import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { id } = await req.json();

        if (!id) {
            return Response.json({ success: false, error: "id requis" }, { status: 400 });
        }

        const asService = base44.asServiceRole;

        // Vérifier que le livreur existe
        const livreur = await asService.entities.Livreur.get(id).catch(() => null);
        if (!livreur) {
            return Response.json({ success: false, error: "Livreur introuvable" }, { status: 404 });
        }

        // ── Nettoyage préventif des courses liées ──────────────────────
        const courses = await asService.entities.CourseExterne.filter(
            { livreur_id: id },
            "-updated_date",
            200
        );

        for (const course of courses) {
            if (["livree", "annulee"].includes(course.statut)) {
                // Course déjà terminée → tagger comme historique
                if (!(course.notes || "").includes("[AUDIT] Livreur supprimé")) {
                    await asService.entities.CourseExterne.update(course.id, {
                        notes: (course.notes || "") + " | [AUDIT] Livreur supprimé — course historique",
                    });
                }
            } else {
                // Course active → annuler proprement
                await asService.entities.CourseExterne.update(course.id, {
                    statut: "annulee",
                    notes: (course.notes || "") + " | [AUTO] Livreur supprimé — course annulée",
                });
            }
        }

        // Supprimer le livreur
        await asService.entities.Livreur.delete(id);

        return Response.json({
            success: true,
            livreur_nom: `${livreur.prenom || ""} ${livreur.nom || ""}`.trim(),
            courses_nettoyees: courses.length,
            courses_actives_annulees: courses.filter(c => !["livree", "annulee"].includes(c.statut)).length,
            courses_historiques_tagguees: courses.filter(c => ["livree", "annulee"].includes(c.statut)).length,
        });

    } catch (error) {
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});