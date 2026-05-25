import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Déclenché quand une Notification est marquée comme lue.
 * Vérifie s'il reste des notifications non lues pour ce livreur.
 * Si plus aucune → supprime les alertes WhatsApp "sent" pour permettre
 * un prochain envoi lors de la prochaine notification.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const notification = body?.data;
    if (!notification) {
      return Response.json({ skipped: true, reason: 'no_data' });
    }

    // On ne traite que si la notification vient d'être lue
    if (!notification.lue) {
      return Response.json({ skipped: true, reason: 'not_lue' });
    }

    const destinataireEmail = notification.destinataire_email;
    if (!destinataireEmail) {
      return Response.json({ skipped: true, reason: 'no_email' });
    }

    // Vérifier s'il reste des notifs non lues pour ce destinataire
    const notifsNonLues = await base44.asServiceRole.entities.Notification.filter({
      destinataire_email: destinataireEmail,
      lue: false
    });

    if (notifsNonLues.length > 0) {
      // Encore des notifs non lues → on garde le verrou anti-doublon
      return Response.json({ skipped: true, reason: 'still_unread', count: notifsNonLues.length });
    }

    // Plus de notifs non lues → chercher le livreur et supprimer ses alertes "sent"
    const livreurs = await base44.asServiceRole.entities.Livreur.filter({
      user_email: destinataireEmail
    });

    if (!livreurs || livreurs.length === 0) {
      return Response.json({ skipped: true, reason: 'not_a_livreur' });
    }

    const livreur = livreurs[0];

    // Lister et supprimer les alertes "sent" pour ce livreur
    const alertesSent = await base44.asServiceRole.entities.WhatsAppAlerte.filter({
      livreur_id: livreur.id,
      statut: 'sent'
    });

    for (const alerte of alertesSent) {
      await base44.asServiceRole.entities.WhatsAppAlerte.delete(alerte.id);
    }

    return Response.json({ success: true, alertes_supprimees: alertesSent.length });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});