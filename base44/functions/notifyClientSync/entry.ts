import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

  // Nouvelle course créée → notifier le destinataire
  if (recipientRole === "destinataire" && statut === "recherche_livreur") {
    return {
      titre: `📦 ${expediteurNom} vous envoie un colis`,
      message: `Appuyez pour voir les détails de la livraison.`,
      type: "nouvelle_course",
    };
  }

  // Nouvelle course "recevoir" → notifier l'expéditeur
  if (recipientRole === "expediteur" && statut === "recherche_livreur") {
    return {
      titre: `📦 Une demande de récupération vous concerne`,
      message: `${destinataireNom} attend un colis de votre part via SILGAPP.`,
      type: "nouvelle_course",
    };
  }

  // Course acceptée par un livreur
  if (statut === "livreur_en_route") {
    return {
      titre: `🛵 Votre course a été acceptée`,
      message: `${livreurNom} est en route pour récupérer le colis.`,
      type: "course_acceptee",
    };
  }

  // Colis récupéré → livreur parti vers destination
  if (statut === "colis_recupere" || statut === "en_livraison") {
    return {
      titre: `📦 ${livreurNom} récupère votre colis`,
      message: `La livraison est en cours. Appuyez pour suivre en temps réel.`,
      type: "course_livree",
    };
  }

  // Course livrée
  if (statut === "livree") {
    return {
      titre: `✅ Colis livré avec succès`,
      message: `${livreurNom} a livré votre colis. Appuyez pour voir le récapitulatif.`,
      type: "course_livree",
    };
  }

  // Annulée
  if (statut === "annulee") {
    return {
      titre: `❌ Course annulée`,
      message: `La course a été annulée. Appuyez pour voir les détails.`,
      type: "course_annulee",
    };
  }

  // Fallback minimal
  return {
    titre: `📦 Mise à jour de votre course`,
    message: `Appuyez pour voir les détails.`,
    type: "nouvelle_course",
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const courseId = payload.event?.entity_id || payload.course_id || payload.data?.id;

    if (!courseId) {
      console.error('[notifyClientSync] ❌ course_id manquant');
      return Response.json({ error: "course_id manquant" }, { status: 400 });
    }

    const course = await base44.asServiceRole.entities.CourseExterne.get(courseId);
    if (!course) {
      return Response.json({ error: "Course non trouvée" }, { status: 404 });
    }

    // Helper : résoudre un client par id OU par téléphone
    const resolveClient = async (clientId, telephone) => {
      if (clientId) {
        try { return await base44.asServiceRole.entities.ClientExterne.get(clientId); } catch (_) {}
      }
      if (telephone) {
        const tel = telephone.replace(/\D/g, "");
        const telNorm = tel.startsWith("226") && tel.length === 11 ? "+" + tel : tel.length === 8 ? "+226" + tel : null;
        if (telNorm) {
          try {
            const found = await base44.asServiceRole.entities.ClientExterne.filter({ telephone: telNorm });
            if (found?.length > 0) return found[0];
          } catch (_) {}
        }
      }
      return null;
    };

    // Anti-doublon strict : une seule notif par course + email + type
    const createNotifIfNotExists = async (userEmail, recipientRole) => {
      const content = buildNotificationContent(course, recipientRole);

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
            console.log(`[notifyClientSync] 🗑 Doublon supprimé: ${sorted[i].id}`);
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

      console.log(`[notifyClientSync] ✅ Notif créée pour ${userEmail}: "${content.titre}"`);
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
    console.error('[notifyClientSync] ❌ Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});