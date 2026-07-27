import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const MOTIFS_VALIDES = [
  "client_injoignable",
  "mauvaise_adresse",
  "colis_inexistant",
  "client_change_avis",
  "colis_interdit",
  "désaccord_prix",
  "panne_vehicule",
  "accident",
  "autre"
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
      // ── ANNULATION LIVREUR : course retourne au dispatch ──────────
      // ⚠️ Le livreur qui a annulé est EXCLU de cette course précise
      // (ajouté dans dispatch_notified_ids) mais reste disponible pour les autres.
      const exclusionsLivreur = livreurId ? JSON.stringify([livreurId]) : '[]';
      const resetData = {
        statut: "annulee",
        dispatch_status: "expire",
        dispatch_wave: 0,
        livreur_id: null,
        // ⚠️ On GARDE livreur_nom et livreur_telephone pour tracer qui a annulé
        livreur_photo_url: null,
        livreur_vehicule: null,
        livreur_note_moyenne: 0,
        livreur_nombre_avis: 0,
        dispatch_notified_ids: exclusionsLivreur, // ⚠️ livreur annulant EXCLU de cette course
        heure_acceptation: null,
        heure_recuperation: null,
        heure_livraison: null,
        timeout_expires_at: null,
        heure_sollicitation: null,
        pickup_confirmed_by: null,
        pickup_confirmed_at: null,
        delivery_confirmed_by: null,
        delivery_confirmed_at: null,
        notes: (course.notes || "") + ` | [ANNULÉ LIVREUR] ${motif || "non spécifié"}`,
      };

      // Nettoyer prix manuel si applicable
      if (course.pricing_mode === "manual" && course.manual_price_status === "pending_client_validation") {
        resetData.manual_price_status = null;
        resetData.manual_price = null;
        resetData.pricing_mode = "automatic";
      }

      await asService.entities.CourseExterne.update(course_id, resetData);
      courseRedispatch = false;

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

      // ── Historique d'annulation ──────────────────────────────────
      if (motif && livreurId) {
        const livreurPourLog = await asService.entities.Livreur.get(livreurId).catch(() => null);
        await asService.entities.AnnulationLivreur.create({
          livreur_id: livreurId,
          livreur_nom: livreurPourLog ? `${livreurPourLog.prenom || ""} ${livreurPourLog.nom || ""}`.trim() : (course.livreur_nom || ""),
          livreur_email: livreurPourLog?.user_email || "",
          course_id,
          type_course: course.type_course === "deplacement" ? "deplacement" : "colis",
          statut_course_avant: course.statut,
          motif,
          motif_detail: motif === "autre" ? (motif_detail || "") : "",
          country_code: course.country_code || "",
          ville: course.ville_depart || "",
          date_annulation: now,
          course_redispatch: false,
          admin_notifie: true,
        }).catch(() => null);
      }

      // ── Notification admin (modal — alerte_critique_dispatch pour déclencher le SystemAlertModal) ──
      await asService.entities.Notification.create({
        titre: "🚨 Course annulée par le livreur",
        message: `Le livreur ${course.livreur_nom || "?"} a annulé la course #${course_id.slice(-8)} (${course.adresse_depart || "?"} → ${course.adresse_arrivee || "?"}). Motif: ${motif || "non spécifié"}. ${motif_detail ? `Détail: ${motif_detail}.` : ""} La course a été annulée définitivement.`,
        type: "alerte_critique_dispatch",
        course_id,
        destinataire_email: "admin",
        lue: false,
      }).catch(() => null);

      // ── Notification + Push au client ────────────────────────────
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
        const motifLabel = {
          client_injoignable: "Client injoignable",
          mauvaise_adresse: "Mauvaise adresse",
          colis_inexistant: "Colis inexistant",
          client_change_avis: "Client a changé d'avis",
          colis_interdit: "Colis interdit",
          désaccord_prix: "Désaccord sur le prix",
          panne_vehicule: "Panne de véhicule",
          accident: "Accident",
          autre: motif_detail || "Autre",
        }[motif] || motif || "non spécifié";

        await asService.entities.Notification.create({
          titre: "❌ Course annulée",
          message: `Votre course a été annulée par le livreur. Motif: ${motifLabel}.`,
          type: "course_annulee",
          course_id,
          destinataire_email: clientEmail,
          lue: false,
        }).catch(() => null);

        await base44.asServiceRole.functions.invoke('envoiNotificationPush', {
          titre: "❌ Course annulée",
          message: `Votre livreur a annulé. Motif: ${motifLabel}.`,
          type: "course_annulee",
          destinataire_email: clientEmail,
          user_type: "client",
          course_id,
        }).catch(() => null);
      }

      // Course annulée définitivement — pas de redispatch, pas de WhatsApp

    } else {
      // ── ANNULATION ADMIN : course définitivement annulée ──────────
      const annulData = {
        statut: "annulee",
        date_annulation: now,
        notes: (course.notes || "") + ` | [ANNULÉ ADMIN] ${motif || ""}`,
      };

      if (course.dispatch_status === "propose" || course.dispatch_status === "en_attente") {
        annulData.dispatch_status = "expire";
      }

      if (course.pricing_mode === "manual" && course.manual_price_status === "pending_client_validation") {
        annulData.manual_price_status = null;
        annulData.manual_price = null;
        annulData.pricing_mode = "automatic";
      }

      await asService.entities.CourseExterne.update(course_id, annulData);

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