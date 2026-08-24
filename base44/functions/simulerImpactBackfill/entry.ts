import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION D'IMPACT BACKFILL — Réplique exacte de soldeCalculator.ts
// ═══════════════════════════════════════════════════════════════════════════
//
// Simule ce que soldeCalculator.ts verrait AVANT et APRÈS backfill des CERTAINES,
// sans modifier aucune donnée.
//
// Pour un livreur donné (ex: IRISSO), retourne :
// 1. Commissions vues AVANT backfill (livreur_financier_id || livreur_id)
// 2. Commissions vues APRÈS backfill des CERTAINES
// 3. PROBABLES encore visibles via livreur_id existant
// 4. PROBABLES invisibles (livreur_id vide)
// 5. Total paiements retenus
// 6. Dû et crédit retournés par getSoldeLivreur (simulé)
//
// + Détail des paiements : courses_concernees et leur classification
// + Simulation globale des 168 CERTAINES
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const asService = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const livreurIdCible = body.livreur_id; // ex: IRISSO
    const simulateGlobal = body.global !== false; // défaut true

    // ── 1. Charger tous les livreurs ──
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
      if (l.telephone) {
        livreurByPhone[l.telephone.replace(/\D/g, '')] = l;
      }
      if (l.user_email) {
        livreurByEmail[l.user_email.toUpperCase()] = l;
      }
    });

    // ── 2. Charger tous les paiements traités ──
    const allPaiements = await asService.entities.PaiementSilgapp.filter(
      { user_type: 'livreur', statut: 'traite' },
      '-date_envoi', 2000
    ).catch(() => []);

    const courseToLivreurIdByPaiement: Record<string, string> = {};
    const paiementsByLivreur: Record<string, number> = {};
    const paiementDetails: any[] = [];

    (allPaiements || []).forEach((p: any) => {
      if (p.user_id) {
        paiementsByLivreur[p.user_id] = (paiementsByLivreur[p.user_id] || 0) + (Number(p.montant_paye) || 0);
      }
      const coursesIds: string[] = [];
      if (p.courses_concernees) {
        try {
          const ids = JSON.parse(p.courses_concernees);
          ids.forEach((cid: string) => {
            if (p.user_id) courseToLivreurIdByPaiement[cid] = p.user_id;
            coursesIds.push(cid);
          });
        } catch (_) {}
      }
      paiementDetails.push({
        paiement_id: p.id,
        livreur_id: p.user_id,
        montant_paye: Number(p.montant_paye) || 0,
        courses_concernees: coursesIds,
        type_paiement: p.type_paiement,
      });
    });

    // ── 3. Charger toutes les courses livrées ──
    const allCourses = await asService.entities.CourseExterne.filter(
      { statut: 'livree' },
      '-heure_livraison', 2000
    ).catch(() => []);

    // ── 4. Classifier chaque course (même logique que backfill) ──
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

    // Pour chaque course, déterminer : CERTAIN / PROBABLE / AMBIGU + livreur_final_id
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
      let raison = "";

      if (preuves.length > 0 && livreurConfirme) {
        niveau = "CERTAIN";
        livreurFinal = livreurConfirme;
        raison = preuves.join(", ");
      } else if (candidatParNom.length === 1) {
        niveau = "PROBABLE";
        livreurFinal = candidatParNom[0];
        raison = "nom unique (aucune preuve technique)";
      } else if (candidatParNom.length > 1) {
        niveau = "AMBIGU";
        raison = `${candidatParNom.length} livreurs avec ce nom`;
      } else if (!nom || nom === "INCONNU") {
        niveau = "AMBIGU";
        raison = "nom vide ou INCONNU";
      } else {
        niveau = "AMBIGU";
        raison = "aucun match de nom";
      }

      courseClassification[course.id] = {
        niveau,
        livreur_final_id: livreurFinal?.id || null,
        livreur_nom: course.livreur_nom,
        livreur_id: course.livreur_id || "",
        livreur_financier_id: course.livreur_financier_id || "",
        preuves,
        raison,
        commission_silga: Number(course.commission_silga) || 0,
      };
    }

    // ── 5. Simulation AVANT / APRÈS backfill pour un livreur ──
    function simulerPourLivreur(livreurId: string) {
      // Courses où (livreur_financier_id || livreur_id) === livreurId
      // AVANT backfill : livreur_financier_id est vide pour toutes les courses
      const coursesAvant: any[] = [];
      const coursesApres: any[] = [];
      const probablesVisiblesApres: any[] = [];
      const probablesInvisiblesApres: any[] = [];

      for (const course of (allCourses || [])) {
        const cls = courseClassification[course.id];
        if (!cls) continue;

        // AVANT backfill : livreur_financier_id vide → on utilise livreur_id
        const keyAvant = cls.livreur_financier_id || cls.livreur_id;
        if (keyAvant === livreurId) {
          coursesAvant.push({ id: course.id, ...cls });
        }

        // APRÈS backfill des CERTAINES :
        // - Si CERTAIN → livreur_financier_id = livreur_final_id (= livreurId si match)
        // - Si PROBABLE → livreur_financier_id reste vide → fallback livreur_id
        // - Si AMBIGU → livreur_financier_id reste vide → fallback livreur_id
        let keyApres = cls.livreur_financier_id || cls.livreur_id; // existant déjà backfillé
        if (!cls.livreur_financier_id) {
          if (cls.niveau === "CERTAIN" && cls.livreur_final_id === livreurId) {
            keyApres = livreurId; // simulé backfill
          } else if (cls.niveau === "CERTAIN") {
            keyApres = cls.livreur_final_id; // backfill vers un autre livreur
          } else {
            keyApres = cls.livreur_id; // PROBABLE/AMBIGU → fallback livreur_id
          }
        }

        if (keyApres === livreurId) {
          coursesApres.push({ id: course.id, ...cls });
          if (cls.niveau === "PROBABLE") {
            if (cls.livreur_id) {
              probablesVisiblesApres.push({ id: course.id, ...cls });
            } else {
              probablesInvisiblesApres.push({ id: course.id, ...cls });
            }
          }
        }
      }

      const commissionsAvant = coursesAvant.reduce((s, c) => s + (c.commission_silga || 0), 0);
      const commissionsApres = coursesApres.reduce((s, c) => s + (c.commission_silga || 0), 0);
      const paiements = paiementsByLivreur[livreurId] || 0;

      // Détail des paiements de ce livreur
      const paiementsDetail = paiementDetails
        .filter(p => p.livreur_id === livreurId)
        .map(p => {
          const coursesCls = (p.courses_concernees || []).map(cid => ({
            course_id: cid,
            classification: courseClassification[cid]?.niveau || "INCONNU",
            livreur_final_id: courseClassification[cid]?.livreur_final_id || null,
            commission: courseClassification[cid]?.commission_silga || 0,
          }));
          return {
            paiement_id: p.paiement_id,
            montant_paye: p.montant_paye,
            type_paiement: p.type_paiement,
            courses_concernees: coursesCls,
          };
        });

      return {
        livreur_id: livreurId,
        livreur_nom: livreurById[livreurId]?.nom || "",
        commissions_avant: commissionsAvant,
        commissions_apres: commissionsApres,
        courses_avant: coursesAvant.length,
        courses_apres: coursesApres.length,
        probables_visibles_apres: probablesVisiblesApres.length,
        probables_invisibles_apres: probablesInvisiblesApres.length,
        probables_visibles_ids: probablesVisiblesApres.map(c => c.id),
        probables_invisibles_ids: probablesInvisiblesApres.map(c => c.id),
        paiements_traites: paiements,
        du_avant: Math.max(0, commissionsAvant - paiements),
        credit_avant: Math.max(0, paiements - commissionsAvant),
        du_apres: Math.max(0, commissionsApres - paiements),
        credit_apres: Math.max(0, paiements - commissionsApres),
        montant_du_silga_stocke: livreurById[livreurId]?.montant_du_silga ?? livreurById[livreurId]?.encours ?? 0,
        paiements_detail: paiementsDetail,
      };
    }

    // ── 6. Simulation globale ──
    let globalImpact: any = null;
    if (simulateGlobal) {
      // Pour chaque livreur, calculer du_avant et du_apres
      const livreurIds = new Set<string>();
      // Tous les livreurs qui ont des courses CERTAINES
      for (const cid in courseClassification) {
        const cls = courseClassification[cid];
        if (cls.niveau === "CERTAIN" && cls.livreur_final_id) {
          livreurIds.add(cls.livreur_final_id);
        }
        // Aussi ceux qui ont des courses avec livreur_id
        if (cls.livreur_id) livreurIds.add(cls.livreur_id);
      }

      let totalDuAvant = 0;
      let totalDuApres = 0;
      let totalCreditAvant = 0;
      let totalCreditApres = 0;
      let livreursModifies = 0;
      const changements: any[] = [];

      livreurIds.forEach(lid => {
        const sim = simulerPourLivreur(lid);
        totalDuAvant += sim.du_avant;
        totalDuApres += sim.du_apres;
        totalCreditAvant += sim.credit_avant;
        totalCreditApres += sim.credit_apres;
        if (sim.du_avant !== sim.du_apres || sim.credit_avant !== sim.credit_apres) {
          livreursModifies++;
          changements.push({
            livreur_id: lid,
            livreur_nom: sim.livreur_nom,
            du_avant: sim.du_avant,
            du_apres: sim.du_apres,
            credit_avant: sim.credit_avant,
            credit_apres: sim.credit_apres,
            delta_du: sim.du_apres - sim.du_avant,
            delta_credit: sim.credit_apres - sim.credit_avant,
          });
        }
      });

      globalImpact = {
        total_du_avant: totalDuAvant,
        total_du_apres: totalDuApres,
        total_credit_avant: totalCreditAvant,
        total_credit_apres: totalCreditApres,
        augmentation_totale_du: totalDuApres - totalDuAvant,
        modification_totale_credit: totalCreditApres - totalCreditAvant,
        livreurs_concernes: livreursModifies,
        changements: changements.sort((a, b) => Math.abs(b.delta_du) - Math.abs(a.delta_du)),
      };
    }

    // ── 7. Détail IRISSO si demandé ──
    let irissoDetail = null;
    if (livreurIdCible) {
      irissoDetail = simulerPourLivreur(livreurIdCible);
    }

    return Response.json({
      success: true,
      irisso_detail: irissoDetail,
      global_impact: globalImpact,
      stats_classification: {
        certain: Object.values(courseClassification).filter((c: any) => c.niveau === "CERTAIN").length,
        probable: Object.values(courseClassification).filter((c: any) => c.niveau === "PROBABLE").length,
        ambigu: Object.values(courseClassification).filter((c: any) => c.niveau === "AMBIGU").length,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});