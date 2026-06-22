import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Déclenché par automation quand une CourseExterne est créée/mise à jour.
 * Crée UNE notification contextualisée par utilisateur concerné.
 * Anti-doublon : vérifie si une notif avec la même clé unique existe déjà.
 */

// Génère le titre et message selon le contexte de la course
function buildNotificationContent(course, recipientRole) {
  const expediteurNom = course.expediteur_nom || "Quelqu'un";
  const destinataireNom = course.destinataire_nom || "votre destinataire";
  const livreurNom = course.livreur_nom || "Le livreur";
  const statut = course.statut;

  if (recipientRole === "destinataire" && statut === "recherche_livreur") {
    return {
      titre: `Colis de ${expediteurNom}`,
      message: `Appuyez pour voir les details de la livraison.`,
      type: "nouvelle_course",
    };
  }

  if (recipientRole === "expediteur" && statut === "recherche_livreur") {
    return {
      titre: `Demande de recuperation`,
      message: `${destinataireNom} attend un colis de votre part via SILGAPP.`,
      type: "nouvelle_course",
    };
  }

  if (statut === "livreur_en_route") {
    return {
      titre: `Livreur trouve`,
      message: `${livreurNom} est en route pour recuperer le colis.`,
      type: "course_assignee",
    };
  }

  if (statut === "colis_recupere" || statut === "en_livraison") {
    return {
      titre: `Colis recupere`,
      message: `${livreurNom} a recupere le colis. La livraison est en cours.`,
      type: "colis_recupere",
    };
  }

  if (statut === "livree") {
    return {
      titre: `Colis livre avec succes`,
      message: `${livreurNom} a livre votre colis. Appuyez pour voir le recapitulatif.`,
      type: "course_livree",
    };
  }

  if (statut === "annulee") {
    return {
      titre: `Course annulee`,
      message: `La course a ete annulee. Appuyez pour voir les details.`,
      type: "course_annulee",
    };
  }

  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const courseId = payload.event?.entity_id || payload.course_id || payload.data?.id;

    if (!courseId) {
      console.error('[notifyClientSync] course_id manquant');
      return Response.json({ error: "course_id manquant" }, { status: 400 });
    }

    const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
    if (!course) {
      return Response.json({ error: "Course non trouvée" }, { status: 404 });
    }

    // Indicatifs SILGAPP multi-pays
    const COUNTRY_DIALCODES = [
      { code: "226", len: 8 }, // BF
      { code: "225", len: 10 }, // CI
      { code: "228", len: 8 }, // TG
      { code: "229", len: 8 }, // BJ
      { code: "221", len: 9 }, // SN
      { code: "223", len: 8 }, // ML
      { code: "224", len: 9 }, // GN
      { code: "227", len: 8 }, // NE
    ];

    // Génère toutes les variantes d'un numéro (tous pays)
    function phoneVariants(num) {
      const n = (num || "").replace(/\D/g, "");
      if (!n) return [n];
      const variants = new Set([n]);
      for (const { code, len } of COUNTRY_DIALCODES) {
        if (n.startsWith(code) && n.length === code.length + len) {
          variants.add(n.slice(code.length));
        }
        if (n.length === len && !n.startsWith("0")) {
          variants.add(code + n);
        }
        if (n.startsWith("0") && n.length === len + 1) {
          variants.add(n.slice(1));
          variants.add(code + n.slice(1));
        }
      }
      return [...variants];
    }

    // Helper : résoudre un client par id OU par téléphone (multi-pays)
    const resolveClient = async (clientId, telephone) => {
      if (clientId) {
        try { return await base44.asServiceRole.entities.ClientExterne.get(clientId); } catch (_) {}
      }
      if (telephone) {
        const variants = phoneVariants(telephone);
        const results = await Promise.all(
          variants.map(v => base44.asServiceRole.entities.ClientExterne.filter({ telephone: v }).catch(() => []))
        );
        for (const res of results) {
          if (res?.length > 0) return res[0];
        }
      }
      return null;
    };

    // Anti-doublon strict : une seule notif par course + email + type
    const createNotifIfNotExists = async (userEmail, recipientRole) => {
      const content = buildNotificationContent(course, recipientRole);
      if (!content) {
        console.log(`[notifyClientSync] Statut ignore pour ${userEmail} (statut=${course.statut}, course=${course.id})`);
        return null;
      }

      // Chercher une notif existante avec la même course + email + type (doublon exact)
      const existing = await base44.asServiceRole.entities.Notification.filter({
        course_id: course.id,
        destinataire_email: userEmail,
        type: content.type,
      });

      if (existing?.length > 0) {
        console.log(`[notifyClientSync] ⏭ Doublon évité pour ${userEmail} (type=${content.type}, course=${course.id})`);
        // Supprimer les doublons en trop (garder le plus récent)
        if (existing.length > 1) {
          const sorted = existing.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
          for (let i = 1; i < sorted.length; i++) {
            await base44.asServiceRole.entities.Notification.delete(sorted[i].id);
            console.log(`[notifyClientSync] Doublon supprimé: ${sorted[i].id}`);
          }
        }
        return null;
      }

      const notif = await base44.asServiceRole.entities.Notification.create({
        titre: content.titre,
        message: content.message,
        type: content.type,
        course_id: course.id,
        destinataire_email: userEmail,
        lue: false,
      });

      console.log(`[notifyClientSync] Notif créée pour ${userEmail}: "${content.titre}"`);

      // Envoi push FCM natif (son + vibration Android)
      try {
        await base44.functions.invoke("envoiNotificationPush", {
          destinataire_email: userEmail,
          titre: content.titre,
          message: content.message,
          type: content.type,
          course_id: course.id,
        });
        console.log(`[notifyClientSync] Push FCM envoyé à ${userEmail}`);
      } catch (pushErr) {
        console.warn(`[notifyClientSync] Push FCM échoué (non bloquant): ${pushErr.message}`);
      }

      return notif;
    };

    const notifications = [];

    // 1. Course "expedier" → notifier le destinataire
    if (course.type_course === "expedier") {
      const dest = await resolveClient(course.destinataire_client_id, course.destinataire_telephone);
      if (dest?.user_email) {
        if (!course.destinataire_client_id) {
          await base44.asServiceRole.entities.CourseExterne.update(course.id, {
            destinataire_client_id: dest.id, recipient_has_app: true,
          });
        }
        const notif = await createNotifIfNotExists(dest.user_email, "destinataire");
        if (notif) notifications.push(notif);
      }
    }

    // 2. Course "recevoir" → notifier l'expéditeur
    if (course.type_course === "recevoir") {
      const exped = await resolveClient(course.expediteur_client_id, course.expediteur_telephone);
      if (exped?.user_email) {
        if (!course.expediteur_client_id) {
          await base44.asServiceRole.entities.CourseExterne.update(course.id, {
            expediteur_client_id: exped.id,
          });
        }
        const notif = await createNotifIfNotExists(exped.user_email, "expediteur");
        if (notif) notifications.push(notif);
      }
    }

    return Response.json({ success: true, notifications_created: notifications.length });

  } catch (error) {
    console.error('[notifyClientSync] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
