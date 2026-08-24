import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ═══════════════════════════════════════════════════════════════════════════
// BACKFILL livreur_financier_id — Restauration de l'identité financière
// ═══════════════════════════════════════════════════════════════════════════
//
// Objectif : Reconstruire le lien financier immuable entre les courses livrées
// et le livreur qui les a réellement effectuées, en utilisant des preuves
// fiables (PaiementSilgapp.courses_concernees, nom unique dans Livreur).
//
// RÈGLES :
// 1. Seules les courses CERTAINES (nom unique dans Livreur OU identifiées via
//    PaiementSilgapp.courses_concernees) sont backfillées.
// 2. Les courses PROBABLES (nom ambigu) et AMBIGUËS (nom vide/INCONNU) sont
//    laissées intactes pour validation humaine.
// 3. Aucune modification de solde (montant_du_silga) — uniquement le champ
//    livreur_financier_id est renseigné.
// 4. Si livreur_financier_id est déjà présent, la course est SKIPPÉE (immuable).
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

    // 1. Charger tous les livreurs pour index par nom
    const allLivreurs = await asService.entities.Livreur.list("id", 500);
    const livreurByNomExact: Record<string, any[]> = {};
    allLivreurs.forEach((l: any) => {
      const fullName = `${l.prenom || ""} ${l.nom || ""}`.trim().toUpperCase();
      if (!livreurByNomExact[fullName]) livreurByNomExact[fullName] = [];
      livreurByNomExact[fullName].push(l);
    });

    // 2. Charger tous les paiements traités avec courses_concernees
    const allPaiements = await asService.entities.PaiementSilgapp.filter(
      { user_type: 'livreur', statut: 'traite' },
      '-date_envoi', 2000
    ).catch(() => []);

    // Index : course_id → livreur_id (via courses_concernees)
    const courseToLivreurId: Record<string, string> = {};
    (allPaiements || []).forEach((p: any) => {
      if (p.courses_concernees) {
        try {
          const ids = JSON.parse(p.courses_concernees);
          ids.forEach((cid: string) => {
            if (p.user_id) courseToLivreurId[cid] = p.user_id;
          });
        } catch (_) {}
      }
    });

    // 3. Charger toutes les courses livrées
    const allCourses = await asService.entities.CourseExterne.filter(
      { statut: 'livree' },
      '-heure_livraison', 2000
    ).catch(() => []);

    // 4. Classification et backfill
    const stats = {
      total_courses: 0,
      deja_backfillees: 0,
      certain_nom_unique: 0,
      certain_paiement: 0,
      probable_nom_ambigu: 0,
      ambigu_inconnu: 0,
      ambigu_aucun_match: 0,
      backfillees: 0,
      erreurs: 0,
    };

    const detailsParLivreur: Record<string, any> = {};
    const anomalies: any[] = [];

    for (const course of (allCourses || [])) {
      stats.total_courses++;

      // Déjà backfillée → skip (immuable)
      if (course.livreur_financier_id) {
        stats.deja_backfillees++;
        continue;
      }

      const nom = (course.livreur_nom || "").trim().toUpperCase();
      const commission = Number(course.commission_silga) || 0;
      let niveau = "AMBIGU";
      let livreurMatch: any = null;
      let raison = "";

      // Tentative 1 : nom unique dans Livreur
      if (nom && nom !== "INCONNU") {
        const matches = livreurByNomExact[nom] || [];
        if (matches.length === 1) {
          niveau = "CERTAIN";
          livreurMatch = matches[0];
          raison = "nom unique dans Livreur";
        } else if (matches.length > 1) {
          niveau = "PROBABLE";
          raison = `${matches.length} livreurs avec ce nom`;
        }
      }

      // Tentative 2 : PaiementSilgapp.courses_concernees
      if (niveau !== "CERTAIN") {
        const livreurIdFromPaiement = courseToLivreurId[course.id];
        if (livreurIdFromPaiement) {
          livreurMatch = allLivreurs.find((l: any) => l.id === livreurIdFromPaiement);
          if (livreurMatch) {
            niveau = "CERTAIN";
            raison = "identifié via PaiementSilgapp.courses_concernees";
          }
        }
      }

      // Comptage par niveau
      if (niveau === "CERTAIN") {
        if (raison.includes("nom unique")) stats.certain_nom_unique++;
        else stats.certain_paiement++;
      } else if (niveau === "PROBABLE") {
        stats.probable_nom_ambigu++;
      } else {
        if (!nom || nom === "INCONNU") stats.ambigu_inconnu++;
        else stats.ambigu_aucun_match++;
      }

      // Backfill (si CERTAIN et pas dry_run)
      if (niveau === "CERTAIN" && livreurMatch && !dryRun) {
        try {
          await asService.entities.CourseExterne.update(course.id, {
            livreur_financier_id: livreurMatch.id,
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

      // Détail par livreur (pour le rapport)
      const key = livreurMatch?.id || nom || "INCONNU";
      if (!detailsParLivreur[key]) {
        detailsParLivreur[key] = {
          livreur_nom: course.livreur_nom,
          livreur_id: livreurMatch?.id || null,
          certain: 0,
          probable: 0,
          ambigu: 0,
          commissions_certaines: 0,
          commissions_probables: 0,
          commissions_ambigues: 0,
        };
      }
      if (niveau === "CERTAIN") {
        detailsParLivreur[key].certain++;
        detailsParLivreur[key].commissions_certaines += commission;
      } else if (niveau === "PROBABLE") {
        detailsParLivreur[key].probable++;
        detailsParLivreur[key].commissions_probables += commission;
      } else {
        detailsParLivreur[key].ambigu++;
        detailsParLivreur[key].commissions_ambigues += commission;
      }
    }

    // 5. Ajouter les paiements traités par livreur (pour le tableau final)
    const paiementsByLivreur: Record<string, number> = {};
    (allPaiements || []).forEach((p: any) => {
      if (p.user_id) {
        paiementsByLivreur[p.user_id] = (paiementsByLivreur[p.user_id] || 0) + (Number(p.montant_paye) || 0);
      }
    });

    // 6. Construire le tableau final avec dû théorique
    const tableauFinal = Object.values(detailsParLivreur)
      .filter((d: any) => d.livreur_id) // seulement les livreurs identifiés
      .map((d: any) => {
        const paiements = paiementsByLivreur[d.livreur_id] || 0;
        // Total commissions = certaines + probables (les ambigües ne sont pas comptées)
        const totalCommissions = d.commissions_certaines + d.commissions_probables;
        return {
          ...d,
          paiements_traites: paiements,
          total_commissions: totalCommissions,
          du_theorique: Math.max(0, totalCommissions - paiements),
          credit_theorique: Math.max(0, paiements - totalCommissions),
        };
      })
      .sort((a: any, b: any) => b.du_theorique - a.du_theorique);

    // 7. Récupérer les montant_du_silga stockés actuels
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

    return Response.json({
      success: true,
      dry_run: dryRun,
      stats,
      tableau_livreurs: tableauAvecStocke,
      anomalies: anomalies.slice(0, 20),
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});