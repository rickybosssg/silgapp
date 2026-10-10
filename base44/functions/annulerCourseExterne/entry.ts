import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { normalizeEnterpriseId } from '../../shared/enterpriseFinance.ts';
import { completeEcoMissionIfNeeded } from '../../shared/ecoOptimizationEngine.ts';

const MOTIFS_VALIDES = [
  "client_injoignable",
  "client_change_avis",
  "mauvaise_adresse",
  "colis_inexistant",
  "colis_pas_pret",
  "panne_vehicule",
  "batterie_dechargee",
  "course_trop_loin",
  "prix_insuffisant",
  "autre_course_conflit_planning",
  "probleme_personnel",
  "acceptation_erreur",
  "accident",
  "autre",
  // ── Compatibilité anciens motifs ──
  "colis_interdit",
  "désaccord_prix",
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const asService = base44.asServiceRole;
    const body = await req.json();
    const { course_id, motif, motif_detail, source } = body; // source = "livreur" | "admin"

    if (!course_id) {
      return Response.json({ error: "course_id requis" }, { status: 400 });
    }

    // ── Validation : motif_detail OBLIGATOIRE uniquement pour motif=autre ──
    // Pour les autres motifs, motif_detail est facultatif.
    if (source === "livreur") {
      if (motif === "autre" && (!motif_detail || !String(motif_detail).trim())) {
        return Response.json({
          error: "Le détail du motif est obligatoire pour le motif 'Autre'",
          field: "motif_detail",
        }, { status: 400 });
      }
    }

    // ── Récupérer la course ───────────────────────────────────────────
    const course = await asService.entities.CourseExterne.get(course_id);
    if (!course) {
      return Response.json({ error: "Course introuvable" }, { status: 404 });
    }

    if (["annulee"].includes(course.statut)) {
      return Response.json({ success: false, error: "Course déjà annulée" });
    }
    if (course.statut === "livree") {
      return Response.json({ success: false, error: "Course déjà livrée" });
    }

    // ── Vérification pays admin ──────────────────────────────────────
    const user = await base44.auth.me().catch(() => null);
    if (user?.admin_type === "pays" && user.country_code && course.country_code !== user.country_code) {
      return Response.json({
        success: false,
        error: "Action interdite : course hors pays admin",
        blocked_reason: "country_mismatch",
      }, { status: 403 });
    }

    // ── [ENTERPRISE ISOLATION] Admin Enterprise ne peut annuler QUE les courses de son entreprise ──
    // Résolution côté backend UNIQUEMENT — jamais confiance au frontend.
    // normalizeEnterpriseId : null/undefined/"" → null (réseau public), "abc" → "abc" (entreprise).
    const userEnterpriseId = normalizeEnterpriseId(user?.data?.enterprise_id);
    if (userEnterpriseId) {
      const courseEnterpriseId = normalizeEnterpriseId(course.enterprise_id);
      if (courseEnterpriseId !== userEnterpriseId) {
        return Response.json({
          success: false,
          error: "Action interdite : cette course n'appartient pas à votre entreprise",
          blocked_reason: "enterprise_mismatch",
        }, { status: 403 });
      }
    }
    // ── Super Admin (enterprise_id null) : peut annuler toute course ──

    const livreurId = course.livreur_id;
    let livreurLibere = false;
    let courseRedispatch = false;

    // ── Libérer le livreur ────────────────────────────────────────────
    if (livreurId) {
      const livreur = await asService.entities.Livreur.get(livreurId).catch(() => null);
      if (livreur) {
        await asService.entities.Livreur.update(livreurId, {
          statut: livreur.manual_hors_ligne === true ? "hors_ligne" : "disponible",
        });
        livreurLibere = true;

        // Notification au livreur
        if (livreur.user_email) {
          await asService.entities.Notification.create({
            titre: "ℹ Course annulée",
            message: `La course #${course_id.slice(-8)} a été annulée. ${source === "livreur" ? "Vous êtes maintenant disponible." : ""}`,
            type: "course_annulee",
            course_id,
            destinataire_email: livreur.user_email,
            lue: false,
          }).catch(() => null);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // COMPORTEMENT DIFFÉRENT SELON LA SOURCE
    // ═══════════════════════════════════════════════════════════════════

    const now = new Date().toISOString();

    if (source === "livreur") {
      // ── ANNULATION LIVREUR APRÈS PRISE EN CHARGE : vérifier si des frais s'appliquent ──
      // Si le livreur a déjà récupéré le colis (statut ≥ colis_recupere), des frais
      // d'annulation peuvent s'appliquer pour compenser le client et SILGAPP.
      const statutsApresPriseEnCharge = ["colis_recupere", "passager_embarque", "pris_en_charge", "en_livraison", "arrivee"];
      if (statutsApresPriseEnCharge.includes(course.statut)) {
        try {
          const livreurPourFrais = await asService.entities.Livreur.get(livreurId).catch(() => null);
          // Résoudre le client (expéditeur ou destinataire)
          let clientId = course.expediteur_client_id || course.destinataire_client_id || "";
          let clientNom = course.expediteur_nom || course.destinataire_nom || course.client_nom || "";
          let clientTel = course.expediteur_telephone || course.destinataire_telephone || course.client_telephone || "";
          if (!clientId && course.expediteur_client_id) {
            const c = await asService.entities.ClientExterne.get(course.expediteur_client_id).catch(() => null);
            if (c) { clientId = c.id; clientNom = c.nom || clientNom; clientTel = c.telephone || clientTel; }
          }
          if (livreurPourFrais && clientId && clientTel) {
            await asService.entities.FraisAnnulation.create({
              course_id,
              client_id: clientId,
              client_nom: clientNom,
              client_telephone: clientTel,
              livreur_id: livreurId,
              livreur_nom: `${livreurPourFrais.prenom || ""} ${livreurPourFrais.nom || ""}`.trim(),
              montant: 500,
              country_code: course.country_code || "",
              statut_paiement: "impaye",
              raison: `Annulation livreur après prise en charge — ${motif || "non_specifie"}`,
              date_annulation: now,
            }).catch(() => null);
            console.log(`[ANNULATION] Frais d'annulation créés pour livreur ${livreurId} — course ${course_id} (statut: ${course.statut})`);
          }
        } catch (fraisErr) {
          console.error('[ANNULATION] Erreur création frais:', fraisErr?.message);
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // NOUVEAU COMPORTEMENT : SUSPENSION DU REDISPATCH AUTOMATIQUE
      // ═══════════════════════════════════════════════════════════════════
      // Le livreur annule → la course passe en "en_attente_decision_client"
      // AUCUN redispatch automatique n'est déclenché.
      // Le client reçoit une notification push + une modale de décision.
      // Le client choisit :
      //   - "chercher_autre_livreur" → redispatch via deciderApresAnnulationLivreur
      //   - "terminer_course" → annulation définitive
      // Tant que client_decision_attendue=true, aucun mécanisme (watchdog,
      // orchestrator, dispatchExterneAuto) ne peut attribuer cette course.
      // ═══════════════════════════════════════════════════════════════════

      let refusedIds = [];
      try { refusedIds = JSON.parse(course.dispatch_refused_ids || '[]'); } catch {}
      if (livreurId && !refusedIds.includes(livreurId)) refusedIds.push(livreurId);

      // ── Calculer le motif lisible pour le client ──
      const motifLabel = {
        client_injoignable: "Client injoignable",
        mauvaise_adresse: "Mauvaise adresse",
        colis_inexistant: "Colis inexistant",
        client_change_avis: "Client a changé d'avis",
        colis_interdit: "Colis interdit",
        désaccord_prix: "Désaccord sur le prix",
        panne_vehicule: "Panne de véhicule",
        batterie_dechargee: "Batterie déchargée",
        course_trop_loin: "Course trop loin",
        prix_insuffisant: "Prix insuffisant",
        autre_course_conflit_planning: "Conflit de planning",
        probleme_personnel: "Problème personnel",
        acceptation_erreur: "Acceptation par erreur",
        accident: "Accident",
        autre: motif_detail || "Autre",
      }[motif] || motif || "non spécifié";

      const resetData = {
        statut: "en_attente",
        dispatch_status: "en_attente",
        client_decision_attendue: true,
        livreur_annulation_motif: motifLabel,
        client_decision_action: null,
        client_decision_at: null,
        dispatch_wave: 0,
        livreur_id: null,
        livreur_nom: "",
        livreur_telephone: "",
        livreur_photo_url: null,
        livreur_vehicule: null,
        livreur_note_moyenne: 0,
        livreur_nombre_avis: 0,
        livreur_user_email: null,
        dispatch_notified_ids: "[]",
        dispatch_refused_ids: JSON.stringify(refusedIds),
        heure_acceptation: null,
        heure_recuperation: null,
        heure_livraison: null,
        timeout_expires_at: null,
        heure_sollicitation: null,
        pickup_confirmed_by: null,
        pickup_confirmed_at: null,
        delivery_confirmed_by: null,
        delivery_confirmed_at: null,
        accepted_by_livreur_id: null,
        accepted_at: null,
        notes: (course.notes || "") + ` | [ANNULÉ LIVREUR → ATTENTE DÉCISION CLIENT] ${motif || "non spécifié"}`,
      };

      // Nettoyer prix manuel si applicable
      if (course.pricing_mode === "manual" && course.manual_price_status === "pending_client_validation") {
        resetData.manual_price_status = null;
        resetData.manual_price = null;
        resetData.pricing_mode = "automatic";
      }

      await asService.entities.CourseExterne.update(course_id, resetData);
      courseRedispatch = true;

      // ── [ECO] Réévaluer la mission Éco après annulation livreur ──
      // La course est en "en_attente" (pas terminal), mais si elle faisait partie
      // d'une mission Éco, on vérifie si les autres courses sont déjà annulées.
      // La course actuelle n'étant pas terminal, la mission ne changera pas de statut
      // ici — sauf si toutes les autres sont déjà annulées ET que la course courante
      // est en "en_attente" (non terminal). Dans ce cas, la mission reste inchangée.
      if (course.eco_mission_id) {
        await completeEcoMissionIfNeeded(base44, course_id).catch((err: any) =>
          console.error('[ANNULATION] completeEcoMissionIfNeeded error (livreur):', err?.message)
        );
      }

      // Archiver toutes les notifications 'nouvelle_course' pour cette course
      // pour que les livreurs ne voient plus une course qui est retournée en dispatch
      const notifsNouvelleCourse = await asService.entities.Notification.filter({
        course_id,
        type: 'nouvelle_course',
        lue: false,
      }).catch(() => []);
      for (const n of notifsNouvelleCourse) {
        await asService.entities.Notification.update(n.id, { lue: true }).catch(() => null);
      }
      if (notifsNouvelleCourse.length > 0) {
        console.log(`[ANNULATION] ${notifsNouvelleCourse.length} notifications 'nouvelle_course' archivées pour course ${course_id}`);
      }

      // ── Historique d'annulation avec snapshot ──────────────────────
      // Snapshot de l'heure d'acceptation de CE livreur — ne change pas après redispatch.
      if (motif && livreurId) {
        const livreurPourLog = await asService.entities.Livreur.get(livreurId).catch(() => null);
        const prixSnapshot = course.prix_final || course.prix_estimate || course.prix_propose_admin || course.prix_propose_client || null;
        const distanceSnapshot = course.distance_reelle_km || course.distance_tarifaire_km || null;
        await asService.entities.AnnulationLivreur.create({
          livreur_id: livreurId,
          livreur_nom: livreurPourLog ? `${livreurPourLog.prenom || ""} ${livreurPourLog.nom || ""}`.trim() : (course.livreur_nom || ""),
          livreur_email: livreurPourLog?.user_email || "",
          course_id,
          type_course: course.type_course === "deplacement" ? "deplacement" : "colis",
          statut_course_avant: course.statut,
          motif,
          motif_detail: motif_detail || "",
          country_code: course.country_code || "",
          ville: course.ville_depart || "",
          date_annulation: now,
          course_redispatch: true,
          admin_notifie: true,
          // ── Snapshots pour audit (Phase 1 anti-annulation) ──
          heure_acceptation_livreur: course.heure_acceptation || null,
          prix_course_snapshot: prixSnapshot,
          distance_course_snapshot: distanceSnapshot,
          quartier_depart_snapshot: course.quartier_depart || "",
          quartier_arrivee_snapshot: course.quartier_arrivee || "",
          source_course: course.source || null,
        }).catch(() => null);

        // ── Alerte admin : 3 annulations sur 7 jours (anti-spam) ──
        try {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const recentAnnulations = await asService.entities.AnnulationLivreur.filter({
            livreur_id: livreurId,
          }, "-date_annulation", 50);
          const count7j = (recentAnnulations || []).filter(
            (a) => a.date_annulation && new Date(a.date_annulation) >= new Date(sevenDaysAgo)
          ).length;

          if (count7j >= 3) {
            // Anti-spam : ne créer l'alerte que si aucune alerte similaire n'existe déjà pour ce livreur sur 24h
            const deduplicationKey = `LIVREUR_FIABILITE_3_7J_${livreurId}`;
            const existingAlert = await asService.entities.AdminInboxItem.filter({
              deduplication_key: deduplicationKey,
              status: "unread",
            }).catch(() => []);

            if (!existingAlert || existingAlert.length === 0) {
              await asService.entities.AdminInboxItem.create({
                type: "system",
                priority: "P1",
                title: "⚠️ Fiabilité livreur",
                body: `${livreurPourLog ? `${livreurPourLog.prenom || ""} ${livreurPourLog.nom || ""}`.trim() : course.livreur_nom || "Livreur"} a annulé ${count7j} courses sur les 7 derniers jours. Vérification recommandée.`,
                source_entity: "AnnulationLivreur",
                source_id: livreurId,
                livreur_id: livreurId,
                country_code: course.country_code || "",
                action_url: `/admin/livreurs`,
                status: "unread",
                deduplication_key: deduplicationKey,
              }).catch(() => null);
            }
          }
        } catch (alertErr) {
          console.error("[ANNULATION] Erreur alerte fiabilité:", alertErr?.message);
        }
      }

      // ── Notification admin (modal — alerte_critique_dispatch pour déclencher le SystemAlertModal) ──
      // ⚠️ Le message ne contient QUE les faits + l'explication du livreur.
      // Les instructions système (redispatch) sont affichées séparément côté frontend
      // (SystemAlertModal) en tant que bloc statique, jamais concaténées au motif.
      await asService.entities.Notification.create({
        titre: "⏸ Course annulée par le livreur — redispatch requis",
        message: `Le livreur ${course.livreur_nom || "?"} a annulé la course #${course_id.slice(-8)} (${course.adresse_depart || "?"} → ${course.adresse_arrivee || "?"}). Motif: ${motif || "non spécifié"}. ${motif_detail ? `Détail: ${motif_detail}` : "Aucun détail fourni par le livreur."}`,
        type: "alerte_critique_dispatch",
        course_id,
        destinataire_email: "admin",
        lue: false,
      }).catch(() => null);

      // ── Notification + Push au client : modale de décision requise ──
      let clientEmail = null;
      if (course.expediteur_client_id) {
        const expediteur = await asService.entities.ClientExterne.get(course.expediteur_client_id).catch(() => null);
        clientEmail = expediteur?.user_email;
      }
      if (!clientEmail && course.destinataire_client_id) {
        const destinataire = await asService.entities.ClientExterne.get(course.destinataire_client_id).catch(() => null);
        clientEmail = destinataire?.user_email;
      }

      if (clientEmail) {
        await asService.entities.Notification.create({
          titre: "🚫 Votre livreur a annulé",
          message: `Motif: ${motifLabel}. Ouvrez SILGAPP pour choisir la suite.`,
          type: "course_annulee_livreur",
          course_id,
          destinataire_email: clientEmail,
          lue: false,
        }).catch(() => null);

        await base44.asServiceRole.functions.invoke('envoiNotificationPush', {
          titre: "SILGAPP — Votre livreur a annulé",
          message: `Motif: ${motifLabel}. Ouvrez SILGAPP pour choisir la suite.`,
          type: "course_annulee_livreur",
          destinataire_email: clientEmail,
          user_type: "client",
          course_id,
        }).catch(() => null);

        // ── Notification WhatsApp via VENUS au client (source: livreur) ──
        await base44.asServiceRole.functions.invoke('envoyerSuiviWhatsApp', {
          course_id,
          evenement: 'livreur_annule_attente_decision',
          motif_label: motifLabel,
        }).catch((err) => {
          console.error('[ANNULATION] ❌ Envoi WhatsApp client échoué:', err?.message || String(err));
        });
      }

      // ── AUCUN REDISPATCH AUTOMATIQUE ──
      // La course reste en client_decision_attendue=true jusqu'à la décision du client.
      // Le client choisira via la fonction deciderApresAnnulationLivreur :
      //   - chercher_autre_livreur → redispatch
      //   - terminer_course → annulation définitive
      console.log(`[ANNULATION] Course ${course_id} — attente décision client (redispatch SUSPENDU)`);

    } else {
      // ── ANNULATION CLIENT OU ADMIN : course définitivement annulée ──
      const sourceLabel = source === "client" ? "CLIENT" : "ADMIN";
      const annulData = {
        statut: "annulee",
        date_annulation: now,
        livreur_id: "",
        livreur_nom: "",
        livreur_telephone: "",
        livreur_photo_url: "",
        livreur_vehicule: "",
        livreur_note_moyenne: 0,
        livreur_nombre_avis: 0,
        livreur_user_email: null, // ⚠️ Retrait livreur → null pour RLS future
        // ⚠️ livreur_financier_id N'EST JAMAIS effacé (immuable) — sécurité financière
        notes: (course.notes || "") + ` | [ANNULÉ ${sourceLabel}] ${motif || ""}`,
      };

      // ⚠️ Toujours passer dispatch_status à "expire" pour les annulations client/admin,
      // quel que soit le statut actuel (disponible_push, propose, en_attente, etc.).
      // Sans cela, les courses annulées restent visibles dans le fil "Disponibles"
      // des livreurs car la requête filtre par dispatch_status ∈ [disponible_push, propose].
      annulData.dispatch_status = "expire";

      if (course.pricing_mode === "manual" && course.manual_price_status === "pending_client_validation") {
        annulData.manual_price_status = null;
        annulData.manual_price = null;
        annulData.pricing_mode = "automatic";
      }

      await asService.entities.CourseExterne.update(course_id, annulData);

      // ── [ECO] Réévaluer la mission Éco après annulation client/admin ──
      // La course passe en "annulee" (terminal). Si elle faisait partie d'une mission Éco,
      // on vérifie si toutes les courses sont désormais annulées → mission "cancelled".
      // Si une seule course est annulée, l'autre reste accessible et la mission reste inchangée.
      if (course.eco_mission_id) {
        await completeEcoMissionIfNeeded(base44, course_id).catch((err: any) =>
          console.error('[ANNULATION] completeEcoMissionIfNeeded error (client/admin):', err?.message)
        );
      }

      // Archiver notifications
      const notifs = await asService.entities.Notification.filter({
        course_id,
        lue: false,
      }).catch(() => []);
      for (const n of notifs) {
        await asService.entities.Notification.update(n.id, { lue: true }).catch(() => null);
      }
    }

    return Response.json({
      success: true,
      course_id,
      livreur_libere: livreurLibere,
      course_redispatch: courseRedispatch,
      message: "Course annulée définitivement",
    });

  } catch (error) {
    console.error("[ANNULATION] Erreur:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});