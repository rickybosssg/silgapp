import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ═══════════════════════════════════════════════════════════════════════════
// BACKFILL livreur_financier_id — Restauration de l'identité financière
// ═══════════════════════════════════════════════════════════════════════════
//
// Objectif : Reconstruire le lien financier immuable entre les courses livrées
// et le livreur qui les a réellement effectuées.
//
// ══ NIVEAUX DE CERTITUDE (multi-signal) ══
//
// CERTAIN  = ≥1 preuve technique indépendante du nom seul :
//   S1. livreur_telephone correspond au livreur
//   S2. livreur_user_email correspond au livreur
//   S3. pickup_confirmed_by / delivery_confirmed_by présent
//   S4. PaiementSilgapp.courses_concernees contient l'ID de la course
//   S5. "Acceptée par <livreur_id>" dans notes/remarque_livreur
//
// PROBABLE = nom unique dans Livreur MAIS aucune preuve technique ci-dessus.
//   (livreur_nom seul ne suffit JAMAIS pour CERTAIN)
//
// AMBIGU   = nom vide, "INCONNU", ou multiple livreurs avec ce nom et aucune preuve.
//
// ══ RÈGLES D'IMMUTABILITÉ ══
// 1. livreur_financier_id n'est backfillé QUE sur les courses CERTAINES.
// 2. Si déjà présent → SKIPPED (immuable).
// 3. Aucune modification de solde (montant_du_silga) — uniquement livreur_financier_id.
//
// dry_run=true (défaut) : ne modifie rien, retourne le rapport.
// dry_run=false : applique le backfill sur les courses CERTAINES uniquement.
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const asService = base44.asServiceRole;

    // Auth : admin uniquement (sauf automation)
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // défaut true

    // ── 1. Index des livreurs ──
    const allLivreurs = await asService.entities.Livreur.list("id", 500);
    const livreurByNomExact: Record<string, any[]> = {};
    const livreurById: Record<string, any> = {};
    const livreurByPhone: Record<string, any> = {};
    const livreurByEmail: Record<string, any> = {};

    allLivreurs.forEach((l: any) => {
      const fullName = `${l.prenom || ""} ${l.nom || ""}`.trim().toUpperCase();
      if (!livreurByNomExact[fullName]) livreurByNomExact[fullName] = [];
      livreurByNomExact[fullName].push(l);
      livreurById[l.id] = l;
      if (l.telephone) {
        // Normaliser téléphone (chiffres uniquement)
        const norm = l.telephone.replace(/\D/g, '');
        livreurByPhone[norm] = l;
      }
      if (l.user_email) {
        livreurByEmail[l.user_email.toUpperCase()] = l;
      }
    });

    // ── 2. Index des paiements traités avec courses_concernees ──
    const allPaiements = await asService.entities.PaiementSilgapp.filter(
      { user_type: 'livreur', statut: 'traite' },
      '-date_envoi', 2000
    ).catch(() => []);

    // course_id → livreur_id (via courses_concernees)
    const courseToLivreurIdByPaiement: Record<string, string> = {};
    // livreur_id → total paiements traités
    const paiementsByLivreur: Record<string, number> = {};

    (allPaiements || []).forEach((p: any) => {
      if (p.user_id) {
        paiementsByLivreur[p.user_id] = (paiementsByLivreur[p.user_id] || 0) + (Number(p.montant_paye) || 0);
      }
      if (p.courses_concernees) {
        try {
          const ids = JSON.parse(p.courses_concernees);
          ids.forEach((cid: string) => {
            if (p.user_id) courseToLivreurIdByPaiement[cid] = p.user_id;
          });
        } catch (_) {}
      }
    });

    // ── 3. Charger toutes les courses livrées ──
    const allCourses = await asService.entities.CourseExterne.filter(
      { statut: 'livree' },
      '-heure_livraison', 2000
    ).catch(() => []);

    // ── 4. Classification multi-signal ──
    const stats = {
      total_courses: 0,
      deja_backfillees: 0,
      // CERTAIN par type de preuve
      certain_s1_telephone: 0,
      certain_s2_email: 0,
      certain_s3_confirmed_by: 0,
      certain_s4_paiement: 0,
      certain_s5_acceptee_par: 0,
      certain_multi_signal: 0,
      certain_total: 0,
      probable_nom_unique: 0,
      ambigu_inconnu: 0,
      ambigu_aucun_match: 0,
      ambigu_multi_match: 0,
      backfillees: 0,
      erreurs: 0,
    };

    const detailsParLivreur: Record<string, any> = {};
    const anomalies: any[] = [];

    // Helper : extraire livreur_id depuis "Acceptée par <id>" dans notes
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

    for (const course of (allCourses || [])) {
      stats.total_courses++;

      // Déjà backfillée → skip (immuable)
      if (course.livreur_financier_id) {
        stats.deja_backfillees++;
        continue;
      }

      const nom = (course.livreur_nom || "").trim().toUpperCase();
      const commission = Number(course.commission_silga) || 0;

      // ── Étape A : Identifier le livreur candidat par nom ──
      let candidatParNom: any[] = [];
      if (nom && nom !== "INCONNU") {
        candidatParNom = livreurByNomExact[nom] || [];
      }

      // ── Étape B : Collecter les preuves techniques ──
      const preuves: string[] = [];
      let livreurConfirme: any = null;

      // S1. Téléphone
      const coursePhone = normalizePhone(course.livreur_telephone);
      if (coursePhone && livreurByPhone[coursePhone]) {
        preuves.push("S1_telephone");
        livreurConfirme = livreurByPhone[coursePhone];
      }

      // S2. user_email
      if (course.livreur_user_email) {
        const email = course.livreur_user_email.toUpperCase();
        if (livreurByEmail[email]) {
          preuves.push("S2_email");
          if (!livreurConfirme) livreurConfirme = livreurByEmail[email];
        }
      }

      // S3. pickup_confirmed_by / delivery_confirmed_by
      if (course.pickup_confirmed_by || course.delivery_confirmed_by) {
        preuves.push("S3_confirmed_by");
        // Ces champs sont "qr"/"manual_code"/"admin" — pas un livreur_id
        // Mais leur présence prouve que la course a été réellement confirmée
      }

      // S4. PaiementSilgapp.courses_concernees
      const livreurIdFromPaiement = courseToLivreurIdByPaiement[course.id];
      if (livreurIdFromPaiement && livreurById[livreurIdFromPaiement]) {
        preuves.push("S4_paiement");
        if (!livreurConfirme) livreurConfirme = livreurById[livreurIdFromPaiement];
      }

      // S5. "Acceptée par <livreur_id>" dans notes
      const livreurIdFromNotes = extractLivreurIdFromNotes(course);
      if (livreurIdFromNotes && livreurById[livreurIdFromNotes]) {
        preuves.push("S5_acceptee_par");
        if (!livreurConfirme) livreurConfirme = livreurById[livreurIdFromNotes];
      }

      // ── Étape C : Déterminer le niveau de certitude ──
      let niveau = "AMBIGU";
      let raison = "";
      let livreurFinal: any = null;

      if (preuves.length > 0 && livreurConfirme) {
        // Au moins une preuve technique ET livreur identifié
        niveau = "CERTAIN";
        livreurFinal = livreurConfirme;
        raison = preuves.join(", ");
        if (preuves.length > 1) stats.certain_multi_signal++;
        else if (preuves.includes("S1_telephone")) stats.certain_s1_telephone++;
        else if (preuves.includes("S2_email")) stats.certain_s2_email++;
        else if (preuves.includes("S3_confirmed_by")) stats.certain_s3_confirmed_by++;
        else if (preuves.includes("S4_paiement")) stats.certain_s4_paiement++;
        else if (preuves.includes("S5_acceptee_par")) stats.certain_s5_acceptee_par++;
      } else if (candidatParNom.length === 1) {
        // Nom unique MAIS aucune preuve technique → PROBABLE
        niveau = "PROBABLE";
        raison = "nom unique (aucune preuve technique)";
        livreurFinal = candidatParNom[0];
        stats.probable_nom_unique++;
      } else if (candidatParNom.length > 1) {
        // Multiple livreurs avec ce nom et aucune preuve → AMBIGU
        niveau = "AMBIGU";
        raison = `${candidatParNom.length} livreurs avec ce nom, aucune preuve`;
        stats.ambigu_multi_match++;
      } else if (!nom || nom === "INCONNU") {
        niveau = "AMBIGU";
        raison = "nom vide ou INCONNU";
        stats.ambigu_inconnu++;
      } else {
        niveau = "AMBIGU";
        raison = "aucun match de nom";
        stats.ambigu_aucun_match++;
      }

      if (niveau === "CERTAIN") stats.certain_total++;

      // ── Étape D : Backfill (CERTAIN uniquement) ──
      if (niveau === "CERTAIN" && livreurFinal && !dryRun) {
        try {
          await asService.entities.CourseExterne.update(course.id, {
            livreur_financier_id: livreurFinal.id,
          });
          stats.backfillees++;
        } catch (err: any) {
          stats.erreurs++;
          anomalies.push({
            course_id: course.id,
            erreur: err?.message || String(err),
          });
        }
      }

      // ── Étape E : Détail par livreur ──
      const key = livreurFinal?.id || nom || "INCONNU";
      if (!detailsParLivreur[key]) {
        detailsParLivreur[key] = {
          livreur_nom: course.livreur_nom,
          livreur_id: livreurFinal?.id || null,
          preuves_detectees: new Set<string>(),
          certain: 0,
          probable: 0,
          ambigu: 0,
          commissions_certaines: 0,
          commissions_probables: 0,
          commissions_ambigues: 0,
          courses_certaines_ids: [],
        };
      }
      if (niveau === "CERTAIN") {
        detailsParLivreur[key].certain++;
        detailsParLivreur[key].commissions_certaines += commission;
        detailsParLivreur[key].courses_certaines_ids.push(course.id);
        preuves.forEach(p => detailsParLivreur[key].preuves_detectees.add(p));
      } else if (niveau === "PROBABLE") {
        detailsParLivreur[key].probable++;
        detailsParLivreur[key].commissions_probables += commission;
      } else {
        detailsParLivreur[key].ambigu++;
        detailsParLivreur[key].commissions_ambigues += commission;
      }
    }

    // ── 5. Construire le tableau final ──
    const tableauFinal = Object.values(detailsParLivreur)
      .filter((d: any) => d.livreur_id)
      .map((d: any) => {
        const paiements = paiementsByLivreur[d.livreur_id] || 0;
        const totalCommissions = d.commissions_certaines + d.commissions_probables;
        return {
          ...d,
          preuves_detectees: Array.from(d.preuves_detectees),
          paiements_traites: paiements,
          total_commissions: totalCommissions,
          du_theorique: Math.max(0, totalCommissions - paiements),
          credit_theorique: Math.max(0, paiements - totalCommissions),
        };
      })
      .sort((a: any, b: any) => b.du_theorique - a.du_theorique);

    // ── 6. Récupérer les montant_du_silga stockés ──
    const livreurStockeMap: Record<string, any> = {};
    allLivreurs.forEach((l: any) => {
      livreurStockeMap[l.id] = l;
    });

    const tableauAvecStocke = tableauFinal.map((d: any) => {
      const livreur = livreurStockeMap[d.livreur_id];
      return {
        ...d,
        montant_du_silga_stocke: livreur?.montant_du_silga ?? livreur?.encours ?? 0,
        ecart: d.du_theorique - (livreur?.montant_du_silga ?? livreur?.encours ?? 0),
      };
    });

    // ── 7. Détail spécifique IRISSO (si demandé) ──
    const irissoDetail = tableauAvecStocke.find((d: any) =>
      (d.livreur_nom || "").toUpperCase().includes("IRISSO")
    );

    return Response.json({
      success: true,
      dry_run: dryRun,
      stats,
      tableau_livreurs: tableauAvecStocke,
      detail_irisso: irissoDetail || null,
      anomalies: anomalies.slice(0, 20),
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});