import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Déclenché quand une Notification est marquée comme lue.
 * Vérifie s'il reste des notifications non lues pour ce destinataire.
 * Si plus aucune → supprime les alertes WhatsApp "sent" (livreur ou client)
 * pour permettre un prochain envoi lors de la prochaine notification.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const notification = body?.data;
    if (!notification) {
      return Response.json({ skipped: true, reason: 'no_data' });
    }

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
      return Response.json({ skipped: true, reason: 'still_unread', count: notifsNonLues.length });
    }

    // Chercher l'ID du profil (livreur OU client externe) pour supprimer ses alertes
    let profileId = null;

    // Chercher dans Livreur
    const livreurs = await base44.asServiceRole.entities.Livreur.filter({ user_email: destinataireEmail });
    if (livreurs && livreurs.length > 0) {
      profileId = livreurs[0].id;
    }

    // Sinon chercher dans ClientExterne
    if (!profileId) {
      const clients = await base44.asServiceRole.entities.ClientExterne.filter({ user_email: destinataireEmail });
      if (clients && clients.length > 0) {
        profileId = clients[0].id;
      }
    }

    if (!profileId) {
      return Response.json({ skipped: true, reason: 'no_profile_found', email: destinataireEmail });
    }

    // Supprimer les alertes "sent" pour permettre la prochaine notification
    const alertesSent = await base44.asServiceRole.entities.WhatsAppAlerte.filter({
      livreur_id: profileId,
      statut: 'sent'
    });

    for (const alerte of alertesSent) {
      await base44.asServiceRole.entities.WhatsAppAlerte.delete(alerte.id);
    }

    console.log(`[resetWhatsApp] ${alertesSent.length} alerte(s) supprimées pour ${destinataireEmail}`);
    return Response.json({ success: true, alertes_supprimees: alertesSent.length });

  } catch (error) {
    console.error('[resetWhatsApp] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});