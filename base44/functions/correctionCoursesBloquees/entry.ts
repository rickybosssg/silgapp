import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const asService = base44.asServiceRole;

        const corrections = [];
        const logs = [];

        // 1. Livreurs "en_course" sans course active assignée
        const livreursEnCourse = await asService.entities.Livreur.filter({
            statut: "en_course",
            type_livreur: "externe"
        });
        
        for (const livreur of livreursEnCourse) {
            const coursesActives = await asService.entities.CourseExterne.filter({
                livreur_id: livreur.id,
                statut: { $nin: ["livree", "annulee"] }
            });
            
            if (coursesActives.length === 0) {
                await asService.entities.Livreur.update(livreur.id, {
                    statut: "disponible"
                });
                corrections.push({
                    type: "livreur_bloque_sans_course",
                    livreur_id: livreur.id,
                    livreur_nom: `${livreur.prenom || ""} ${livreur.nom || ""}`.trim(),
                    country: livreur.country_code,
                });
                logs.push(`[CORRECTION] Livreur ${livreur.nom} (${livreur.id?.slice(-8)}) : en_course → disponible (aucune course active)`);
            }
        }

        // 2. Courses "livree" avec prix_final > 0 mais livreur toujours "en_course"
        const coursesLivrees = await asService.entities.CourseExterne.filter({
            statut: "livree",
            prix_final: { $gt: 0 }
        }, "-updated_date", 200);
        
        for (const course of coursesLivrees) {
            if (!course.livreur_id) continue;
            const livreur = await asService.entities.Livreur.get(course.livreur_id).catch(() => null);
            if (!livreur) continue;
            
            if (livreur.statut === "en_course") {
                await asService.entities.Livreur.update(livreur.id, {
                    statut: "disponible"
                });
                corrections.push({
                    type: "course_livree_livreur_bloque",
                    course_id: course.id,
                    livreur_id: livreur.id,
                    livreur_nom: `${livreur.prenom || ""} ${livreur.nom || ""}`.trim(),
                    prix_final: course.prix_final,
                    country: course.country_code,
                });
                logs.push(`[CORRECTION] Course ${course.id?.slice(-8)} livrée (${course.prix_final}F) — Livreur ${livreur.nom} libéré`);
            }
        }

        // 3. Courses "arrivee" (déplacement) avec prix_final > 0 non fermées
        const coursesArrivee = await asService.entities.CourseExterne.filter({
            statut: "arrivee",
            type_course: "deplacement",
            prix_final: { $gt: 0 }
        }, "-updated_date", 100);
        
        for (const course of coursesArrivee) {
            if (!course.livreur_id) continue;
            const livreur = await asService.entities.Livreur.get(course.livreur_id).catch(() => null);
            if (!livreur) continue;
            
            // Si la course a un prix_final ET est arrivée depuis +30min → fermer
            const heureArrivee = course.heure_arrivee || course.updated_date;
            const diffMin = (Date.now() - new Date(heureArrivee).getTime()) / (1000 * 60);
            
            if (diffMin > 30) {
                const commissionSilga = Math.round(course.prix_final * 0.3);
                const montantLivreur = course.prix_final - commissionSilga;
                
                await asService.entities.CourseExterne.update(course.id, {
                    statut: "livree",
                    heure_livraison: new Date().toISOString(),
                    commission_silga: commissionSilga,
                    montant_livreur: montantLivreur,
                });
                
                if (livreur.statut === "en_course") {
                    await asService.entities.Livreur.update(livreur.id, {
                        statut: "disponible"
                    });
                }
                
                corrections.push({
                    type: "deplacement_arrivee_non_ferme",
                    course_id: course.id,
                    livreur_id: livreur.id,
                    livreur_nom: `${livreur.prenom || ""} ${livreur.nom || ""}`.trim(),
                    prix_final: course.prix_final,
                    minutes_depuis_arrivee: Math.round(diffMin),
                    country: course.country_code,
                });
                logs.push(`[CORRECTION] Déplacement ${course.id?.slice(-8)} arrivée depuis ${Math.round(diffMin)}min — fermée automatiquement`);
            }
        }

        // 4. Log d'audit dans RapportMaintenance
        if (corrections.length > 0) {
            await asService.entities.RapportMaintenance.create({
                type: "correction_courses_bloquees",
                titre: `Correction automatique — ${corrections.length} anomalie(s)`,
                details: JSON.stringify({ corrections, logs }),
                date_rapport: new Date().toISOString(),
            }).catch(() => null);
        }

        return Response.json({
            success: true,
            date: new Date().toISOString(),
            corrections_count: corrections.length,
            corrections,
            logs,
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});