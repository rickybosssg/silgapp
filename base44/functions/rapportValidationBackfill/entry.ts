import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ═══════════════════════════════════════════════════════════════════════════
// RAPPORT VALIDATION HUMAINE — 168 CERTAINES, 29 livreurs impactés
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const asService = base44.asServiceRole;

    // ── 1. Charger livreurs ──
    const allLivreurs = await asService.entities.Livreur.list("id", 500);
    const livreurById: Record<string, any> = {};
    const livreurByNomExact: Record<string, any[]> = {};
    const livreurByPhone: Record<string, any> = {};
    const livreurByEmail: Record<string, any> = {};

    allLivreurs.forEach((l: any) => {
      livreurById[l.id] = l;
      const fullName = `${l.prenom || ""} ${l.nom || ""}`.trim().toUpperCase();
      if (!livreurByNomExact[fullName]) livreurByNomExact[fullName] = [];
      livreurByNomExact[fullName].push(l);
      if (l.telephone) livreurByPhone[l.telephone.replace(/\D/g, '')] = l;
      if (l.user_email) livreurByEmail[l.user_email.toUpperCase()] = l;
    });

    // ── 2. Charger paiements ──
    const allPaiements = await asService.entities.PaiementSilgapp.filter(
      { user_type: 'livreur', statut: 'traite' },
      '-date_envoi', 2000
    ).catch(() => []);

    const courseToLivreurIdByPaiement: Record<string, string> = {};
    const paiementsByLivreur: Record<string, number> = {};

    (allPaiements || []).forEach((p: any) => {
      if (p.user_id) {
        paiementsByLivreur[p.user_id] = (paiementsByLivreur[p.user_id] || 0) + (Number(p.montant_paye) || 0);
      }
      if (p.courses_concernees) {
        try {
          JSON.parse(p.courses_concernees).forEach((cid: string) => {
            if (p.user_id) courseToLivreurIdByPaiement[cid] = p.user_id;
          });
        } catch (_) {}
      }
    });

    // ── 3. Charger courses livrées ──
    const allCourses = await asService.entities.CourseExterne.filter(
      { statut: 'livree' },
      '-heure_livraison', 2000
    ).catch(() => []);

    // ── 4. Classifier ──
    function extractLivreurIdFromNotes(course: any): string | null {
      const patterns = [
        /Accept[ée]e?\s+par\s+([0-9a-f]{24})/i,
        /Accept[ée]e?\s+par\s+([a-f0-9]{20,})/i,
      ];
      for (const field of [course.notes, course.remarque_livreur]) {
        if (!field) continue;
        for (const p of patterns) {
          const m = String(field).match(p);
          if (m && m[1]) return m[1];
        }
      }
      return null;
    }

    function normalizePhone(phone: string): string {
      return (phone || "").replace(/\D/g, '');
    }

    const courseClassification: Record<string, any> = {};
    for (const course of (allCourses || [])) {
      const nom = (course.livreur_nom || "").trim().toUpperCase();
      const candidatParNom = (nom && nom !== "INCONNU") ? (livreurByNomExact[nom] || []) : [];
      const preuves: string[] = [];
      let livreurConfirme: any = null;

      const coursePhone = normalizePhone(course.livreur_telephone);
      if (coursePhone && livreurByPhone[coursePhone]) {
        preuves.push("S1_telephone");
        livreurConfirme = livreurByPhone[coursePhone];
      }
      if (course.livreur_user_email) {
        const email = course.livreur_user_email.toUpperCase();
        if (livreurByEmail[email]) {
          preuves.push("S2_email");
          if (!livreurConfirme) livreurConfirme = livreurByEmail[email];
        }
      }
      if (course.pickup_confirmed_by || course.delivery_confirmed_by) {
        preuves.push("S3_confirmed_by");
      }
      const livreurIdFromPaiement = courseToLivreurIdByPaiement[course.id];
      if (livreurIdFromPaiement && livreurById[livreurIdFromPaiement]) {
        preuves.push("S4_paiement");
        if (!livreurConfirme) livreurConfirme = livreurById[livreurIdFromPaiement];
      }
      const livreurIdFromNotes = extractLivreurIdFromNotes(course);
      if (livreurIdFromNotes && livreurById[livreurIdFromNotes]) {
        preuves.push("S5_acceptee_par");
        if (!livreurConfirme) livreurConfirme = livreurById[livreurIdFromNotes];
      }

      let niveau = "AMBIGU";
      let livreurFinal: any = null;
      if (preuves.length > 0 && livreurConfirme) {
        niveau = "CERTAIN";
        livreurFinal = livreurConfirme;
      } else if (candidatParNom.length === 1) {
        niveau = "PROBABLE";
        livreurFinal = candidatParNom[0];
      }

      courseClassification[course.id] = {
        niveau,
        livreur_final_id: livreurFinal?.id || null,
        livreur_id: course.livreur_id || "",
        livreur_financier_id: course.livreur_financier_id || "",
        commission_silga: Number(course.commission_silga) || 0,
        heure_livraison: course.heure_livraison || course.colis_livre_at || course.updated_date,
        adresse_depart: course.adresse_depart,
        adresse_arrivee: course.adresse_arrivee,
      };
    }

    // ── 5. Calculer impact par livreur ──
    const livreurIdsImpactes = new Set<string>();
    for (const cid in courseClassification) {
      const cls = courseClassification[cid];
      if (cls.niveau === "CERTAIN" && cls.livreur_final_id) {
        livreurIdsImpactes.add(cls.livreur_final_id);
      }
    }

    const rapports: any[] = [];

    livreurIdsImpactes.forEach(lid => {
      const livreur = livreurById[lid];
      if (!livreur) return;

      const coursesCertaines: any[] = [];
      let commissionsAvant = 0;
      let commissionsApres = 0;

      for (const course of (allCourses || [])) {
        const cls = courseClassification[course.id];
        if (!cls) continue;

        // AVANT : livreur_financier_id vide → fallback livreur_id
        const keyAvant = cls.livreur_financier_id || cls.livreur_id;
        if (keyAvant === lid) {
          commissionsAvant += cls.commission_silga;
        }

        // APRÈS : CERTAINES avec livreur_final_id === lid
        if (cls.niveau === "CERTAIN" && cls.livreur_final_id === lid) {
          commissionsApres += cls.commission_silga;
          coursesCertaines.push({
            id: course.id,
            commission: cls.commission_silga,
            date: cls.heure_livraison,
            adresse_depart: cls.adresse_depart,
            adresse_arrivee: cls.adresse_arrivee,
          });
        }
      }

      const paiements = paiementsByLivreur[lid] || 0;
      const duAvant = Math.max(0, commissionsAvant - paiements);
      const duApres = Math.max(0, commissionsApres - paiements);
      const creditAvant = Math.max(0, paiements - commissionsAvant);
      const creditApres = Math.max(0, paiements - commissionsApres);
      const ecart = duApres - duAvant;

      // Plus ancienne / plus récente
      const dates = coursesCertaines.map(c => c.date).filter(Boolean).sort();
      const plusAncienne = dates[0] || null;
      const plusRecente = dates[dates.length - 1] || null;

      // Groupe
      let groupe = "A";
      if (ecart > 5000) groupe = "C";
      else if (ecart > 1000) groupe = "B";

      // Alertes
      const alertes: string[] = [];
      if (creditAvant > 0 && creditApres === 0) alertes.push("credit_disparait");
      if (creditAvant > 0 && creditApres < creditAvant * 0.5) alertes.push("credit_diminue_fortement");
      if (duAvant > 0 && duApres > duAvant * 4) alertes.push("du_augmente_300pct");

      rapports.push({
        livreur_id: lid,
        livreur_nom: `${livreur.prenom || ""} ${livreur.nom || ""}`.trim(),
        groupe,
        du_actuel: duAvant,
        du_apres_backfill: duApres,
        credit_actuel: creditAvant,
        credit_apres_backfill: creditApres,
        ecart,
        nb_courses_certaines: coursesCertaines.length,
        commissions_restaurees: commissionsApres,
        paiements_traites: paiements,
        plus_ancienne_course: plusAncienne,
        plus_recente_course: plusRecente,
        alertes,
        courses_certaines_detail: lid === "6a60ed26a774c3272f3317d9" ? coursesCertaines : undefined,
      });
    });

    // ── 6. Groupes ──
    const groupeA = rapports.filter(r => r.groupe === "A");
    const groupeB = rapports.filter(r => r.groupe === "B");
    const groupeC = rapports.filter(r => r.groupe === "C");

    const totalDuAjouteA = groupeA.reduce((s, r) => s + r.ecart, 0);
    const totalDuAjouteB = groupeB.reduce((s, r) => s + r.ecart, 0);
    const totalDuAjouteC = groupeC.reduce((s, r) => s + r.ecart, 0);

    const creditDisparait = rapports.filter(r => r.alertes.includes("credit_disparait"));
    const creditDiminue = rapports.filter(r => r.alertes.includes("credit_diminue_fortement"));
    const duExplosion = rapports.filter(r => r.alertes.includes("du_augmente_300pct"));

    return Response.json({
      success: true,
      resume: {
        total_livreurs_impactes: rapports.length,
        total_courses_certaines: rapports.reduce((s, r) => s + r.nb_courses_certaines, 0),
        total_du_ajoute: rapports.reduce((s, r) => s + r.ecart, 0),
        groupes: {
          A_faible_1000: {
            count: groupeA.length,
            total_du_ajoute: totalDuAjouteA,
            livreurs: groupeA.map(r => ({ nom: r.livreur_nom, ecart: r.ecart })).sort((a, b) => a.ecart - b.ecart),
          },
          B_moyen_1001_5000: {
            count: groupeB.length,
            total_du_ajoute: totalDuAjouteB,
            livreurs: groupeB.map(r => ({ nom: r.livreur_nom, ecart: r.ecart })).sort((a, b) => b.ecart - a.ecart),
          },
          C_eleve_5000: {
            count: groupeC.length,
            total_du_ajoute: totalDuAjouteC,
            livreurs: groupeC.map(r => ({ nom: r.livreur_nom, ecart: r.ecart })).sort((a, b) => b.ecart - a.ecart),
          },
        },
        alertes: {
          credit_disparait: creditDisparait.map(r => ({ nom: r.livreur_nom, credit_avant: r.credit_actuel, credit_apres: r.credit_apres_backfill })),
          credit_diminue_fortement: creditDiminue.map(r => ({ nom: r.livreur_nom, credit_avant: r.credit_actuel, credit_apres: r.credit_apres_backfill })),
          du_augmente_300pct: duExplosion.map(r => ({ nom: r.livreur_nom, du_avant: r.du_actuel, du_apres: r.du_apres_backfill, ratio: r.du_actuel > 0 ? Math.round(r.du_apres_backfill / r.du_actuel * 100) : null })),
        },
      },
      rapport_complet: rapports.sort((a, b) => b.ecart - a.ecart),
      options: {
        option1_backfill_complet: {
          description: "Backfill immédiat des 168 CERTAINES en une fois",
          avantages: [
            "Correction immédiate et complète",
            "Tous les soldes sont exacts après exécution",
            "Aucune période intermédiaire incohérente",
          ],
          risques: [
            "Choc financier brutal pour les livreurs groupe C (29 livreurs impactés simultanément)",
            "Si une erreur de classification est découverte, rollback difficile",
            "Pas de fenêtre d'observation entre les lots",
          ],
        },
        option2_backfill_progressif: {
          description: "Backfill par lots : Groupe A → Groupe B → Groupe C",
          avantages: [
            "Correction progressive avec surveillance après chaque lot",
            "Groupe A (écarts faibles) valide la mécanique sans risque",
            "Permet d'interrompre si une anomalie est détectée",
            "Moins de choc opérationnel pour les livreurs",
          ],
          risques: [
            "Période intermédiaire où certains soldes sont corrigés et d'autres non",
            "Nécessite 3 exécutions au lieu d'une",
            "getSoldeLivreur affichera des valeurs partiellement corrigées entre les lots",
          ],
          lots: {
            lot_1_groupe_A: { livreurs: groupeA.length, du_ajoute: totalDuAjouteA },
            lot_2_groupe_B: { livreurs: groupeB.length, du_ajoute: totalDuAjouteB },
            lot_3_groupe_C: { livreurs: groupeC.length, du_ajoute: totalDuAjouteC },
          },
        },
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});