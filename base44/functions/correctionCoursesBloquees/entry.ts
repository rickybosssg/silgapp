import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const asService = base44.asServiceRole;

        const corrections = [];
        const anomalies = [];
        const now = Date.now();
        const AUDIT_TAG = '[AUDIT] Livreur supprimé — course historique';

        // ── Pré-chargement ──────────────────────────────────────────────
        const allLivreurs = await asService.entities.Livreur.list("id", 500);
        const allLivreurIds = new Set(allLivreurs.map(l => l.id));
        const livreurMap = {};
        for (const l of allLivreurs) livreurMap[l.id] = l;

        const coursesActives = await asService.entities.CourseExterne.filter({
            statut: { $nin: ["livree", "annulee"] }
        }, "livreur_id", 300);

        const coursesLivrees = await asService.entities.CourseExterne.filter({
            statut: "livree"
        }, "-updated_date", 200);

        const livreurParId = (id) => livreurMap[id] || null;

        // ── 1. Livreurs avec statut anormal et 0 course active ──────────
        for (const livreur of allLivreurs) {
            if (livreur.type_livreur !== "externe") continue;
            if (livreur.statut === "disponible" || livreur.statut === "hors_ligne") continue;

            const aDesCourses = coursesActives.some(c => c.livreur_id === livreur.id);
            if (aDesCourses) continue;

            await asService.entities.Livreur.update(livreur.id, { statut: "disponible" });
            corrections.push({
                type: "livreur_bloque_sans_course",
                livreur_id: livreur.id,
                livreur_nom: `${livreur.prenom || ""} ${livreur.nom || ""}`.trim(),
                statut_avant: livreur.statut,
                country: livreur.country_code,
            });
        }

        // ── 2. Courses "livree" → livreur toujours "en_course" ──────────
        for (const course of coursesLivrees) {
            if (!course.livreur_id) continue;
            const livreur = livreurParId(course.livreur_id);
            if (!livreur || livreur.statut !== "en_course") continue;

            await asService.entities.Livreur.update(livreur.id, { statut: "disponible" });
            corrections.push({
                type: "course_livree_livreur_bloque",
                course_id: course.id,
                livreur_id: livreur.id,
                livreur_nom: `${livreur.prenom || ""} ${livreur.nom || ""}`.trim(),
                prix_final: course.prix_final,
                country: course.country_code,
            });
        }

        // ── 3. Courses admin_manuel "livree" sans prix_final ────────────
        for (const course of coursesLivrees) {
            if (course.prix_final > 0) continue;
            if (course.pricing_mode !== "admin_manuel" && course.source !== "admin") continue;

            const prixDefault = 1000;
            // 🎯 Commission dynamique du pays de la course
            let commissionPct = 30; // fallback
            try {
              if (course.country_code) {
                const countries = await asService.entities.Country.filter({ code: course.country_code, actif: true });
                if (countries?.[0]?.commission_pct) commissionPct = countries[0].commission_pct;
              }
            } catch (_) {}
            const commission = Math.round(prixDefault * (commissionPct / 100));
            const gainLivreur = prixDefault - commission;

            await asService.entities.CourseExterne.update(course.id, {
                prix_final: prixDefault,
                commission_silga: commission,
                montant_livreur: gainLivreur,
                notes: (course.notes || "") + " | [AUTO] Prix admin manquant complété",
            });

            if (course.livreur_id) {
                const livreur = livreurParId(course.livreur_id);
                if (livreur) {
                    await asService.entities.Livreur.update(livreur.id, {
                        montant_du_silga: (livreur.montant_du_silga || 0) + commission,
                    });
                    if (livreur.statut === "en_course") {
                        await asService.entities.Livreur.update(livreur.id, { statut: "disponible" });
                    }
                }
            }

            corrections.push({
                type: "admin_manuel_prix_manquant",
                course_id: course.id,
                livreur_id: course.livreur_id,
                prix_complete: prixDefault,
                source: course.source,
            });
        }

        // ── 4. Déplacement "arrivee" avec prix → fermer (30 min+) ──────
        const coursesArrivee = await asService.entities.CourseExterne.filter({
            statut: "arrivee",
            type_course: "deplacement",
            prix_final: { $gt: 0 }
        }, "-updated_date", 100);

        for (const course of coursesArrivee) {
            const heureArrivee = course.heure_arrivee || course.updated_date;
            const diffMin = (now - new Date(heureArrivee).getTime()) / 60000;
            if (diffMin <= 30) continue;

            // 🎯 Commission dynamique du pays de la course
            let commissionPct = 30; // fallback
            try {
              if (course.country_code) {
                const countries = await asService.entities.Country.filter({ code: course.country_code, actif: true });
                if (countries?.[0]?.commission_pct) commissionPct = countries[0].commission_pct;
              }
            } catch (_) {}
            const commission = Math.round(course.prix_final * (commissionPct / 100));
            const gain = course.prix_final - commission;

            await asService.entities.CourseExterne.update(course.id, {
                statut: "livree",
                heure_livraison: new Date().toISOString(),
                commission_silga: commission,
                montant_livreur: gain,
            });

            if (course.livreur_id) {
                const livreur = livreurParId(course.livreur_id);
                if (livreur?.statut === "en_course") {
                    await asService.entities.Livreur.update(livreur.id, { statut: "disponible" });
                }
            }

            corrections.push({
                type: "deplacement_arrivee_non_ferme",
                course_id: course.id,
                livreur_id: course.livreur_id,
                prix_final: course.prix_final,
                minutes_depuis_arrivee: Math.round(diffMin),
            });
        }

        // ── 5. Courses coincées (statuts intermédiaires bloqués) ────────
        const seuils = { acceptee: 30, livreur_en_route: 60, colis_recupere: 120, en_livraison: 120, pris_en_charge: 120 };
        for (const course of coursesActives) {
            const seuil = seuils[course.statut];
            if (!seuil) continue;
            const diffMin = (now - new Date(course.updated_date).getTime()) / 60000;
            if (diffMin <= seuil) continue;

            await asService.entities.CourseExterne.update(course.id, {
                statut: "annulee",
                notes: (course.notes || "") + ` | [AUTO] Course bloquée ${diffMin.toFixed(0)}min — annulée`,
            });

            if (course.livreur_id) {
                const livreur = livreurParId(course.livreur_id);
                if (livreur && livreur.statut !== "hors_ligne") {
                    await asService.entities.Livreur.update(livreur.id, { statut: "disponible" });
                }
            }

            corrections.push({
                type: "course_coincee_annulee",
                course_id: course.id,
                statut: course.statut,
                minutes_bloque: Math.round(diffMin),
                livreur_id: course.livreur_id,
            });
        }

        // ── 6. Courses orphelines actives → annuler ─────────────────────
        const coursesOrphanActive = coursesActives.filter(c =>
            c.livreur_id && !allLivreurIds.has(c.livreur_id)
        );
        for (const course of coursesOrphanActive) {
            await asService.entities.CourseExterne.update(course.id, {
                statut: "annulee",
                notes: (course.notes || "") + " | [AUTO] Livreur supprimé — course fermée",
            });
            corrections.push({
                type: "course_orpheline_fermee",
                course_id: course.id,
                ancien_livreur_id: course.livreur_id,
                statut_precedent: course.statut,
            });
        }

        // ── 7. Tag courses orphelines historiques (batch 20) ────────────
        let taggedCount = 0;
        for (const course of coursesLivrees) {
            if (taggedCount >= 20) break;
            if (!course.livreur_id || allLivreurIds.has(course.livreur_id)) continue;
            if ((course.notes || "").includes(AUDIT_TAG)) continue;
            await asService.entities.CourseExterne.update(course.id, {
                notes: (course.notes || "") + " | " + AUDIT_TAG,
            });
            taggedCount++;
        }

        // ── 8. Rapport Maintenance ──────────────────────────────────────
        if (corrections.length > 0) {
            await asService.entities.RapportMaintenance.create({
                type: "audit_quotidien",
                titre: `Audit quotidien SILGAPP — ${corrections.length} correction(s)`,
                details: JSON.stringify({
                    corrections,
                    resume: {
                        livreurs_bloques: corrections.filter(c => c.type === "livreur_bloque_sans_course").length,
                        admin_manuel_prix: corrections.filter(c => c.type === "admin_manuel_prix_manquant").length,
                        deplacement_ferme: corrections.filter(c => c.type === "deplacement_arrivee_non_ferme").length,
                        courses_coincees: corrections.filter(c => c.type === "course_coincee_annulee").length,
                        orphelines_fermees: corrections.filter(c => c.type === "course_orpheline_fermee").length,
                        orphelines_tagguees: taggedCount,
                    },
                }),
                date_rapport: new Date().toISOString(),
            }).catch(() => null);
        }

        return Response.json({
            success: true,
            date: new Date().toISOString(),
            corrections_count: corrections.length,
            orphelines_tagguees: taggedCount,
            corrections,
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});