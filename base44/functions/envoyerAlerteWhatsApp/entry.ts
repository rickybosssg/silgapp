import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Fonction déclenchée par l'automation sur création de Notification.
 * Envoie un WhatsApp Twilio au livreur si :
 * - la notification est destinée à un livreur (pas un admin)
 * - il n'y a pas déjà une alerte WhatsApp "pending" ou "sent" non acquittée pour ce livreur
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // Payload de l'automation entity (création de Notification)
    const notification = body?.data;
    if (!notification) {
      return Response.json({ skipped: true, reason: 'no_notification_data' });
    }

    const destinataireEmail = notification.destinataire_email;
    if (!destinataireEmail) {
      return Response.json({ skipped: true, reason: 'no_destinataire_email' });
    }

    // Chercher le livreur par email
    const livreurs = await base44.asServiceRole.entities.Livreur.filter({
      user_email: destinataireEmail,
      actif: true
    });

    if (!livreurs || livreurs.length === 0) {
      // Pas un livreur (admin ou inconnu) → on ne fait rien
      return Response.json({ skipped: true, reason: 'not_a_livreur' });
    }

    const livreur = livreurs[0];

    // Vérifier si le livreur a un numéro de téléphone
    if (!livreur.telephone) {
      return Response.json({ skipped: true, reason: 'no_telephone' });
    }

    // Anti-doublon : vérifier s'il existe déjà une alerte pending ou sent
    // pour ce livreur ET qu'il a encore des notifications non lues
    const alertesExistantes = await base44.asServiceRole.entities.WhatsAppAlerte.filter({
      livreur_id: livreur.id,
      statut: 'sent'
    });

    // Vérifier les notifications non lues de ce livreur
    const notifsNonLues = await base44.asServiceRole.entities.Notification.filter({
      destinataire_email: destinataireEmail,
      lue: false
    });

    // S'il y a déjà une alerte envoyée ET des notifs non lues → doublon, on skip
    if (alertesExistantes.length > 0 && notifsNonLues.length > 1) {
      return Response.json({ skipped: true, reason: 'alerte_deja_envoyee_notifs_non_lues' });
    }

    // Normaliser le numéro de téléphone (ajouter indicatif Burkina si besoin)
    let telephone = livreur.telephone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
    if (!telephone.startsWith('+')) {
      // Burkina Faso indicatif +226
      telephone = '+226' + telephone;
    }
    const whatsappTo = `whatsapp:${telephone}`;

    // Créer l'enregistrement alerte en "pending"
    const alerte = await base44.asServiceRole.entities.WhatsAppAlerte.create({
      livreur_id: livreur.id,
      livreur_telephone: telephone,
      notification_id: notification.id || '',
      statut: 'pending'
    });

    // Envoi via Twilio WhatsApp API
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM');

    const message = `🚨 SILGAPP\nVous avez des notifications en attente.\nOuvrez l'application SILGAPP pour consulter.`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = btoa(`${accountSid}:${authToken}`);

    const formData = new URLSearchParams();
    formData.append('From', fromNumber);
    formData.append('To', whatsappTo);
    formData.append('Body', message);

    const twilioResp = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    const twilioData = await twilioResp.json();

    if (twilioResp.ok && twilioData.sid) {
      // Succès
      await base44.asServiceRole.entities.WhatsAppAlerte.update(alerte.id, {
        statut: 'sent',
        twilio_sid: twilioData.sid,
        heure_envoi: new Date().toISOString()
      });
      return Response.json({ success: true, twilio_sid: twilioData.sid, to: whatsappTo });
    } else {
      // Échec Twilio
      await base44.asServiceRole.entities.WhatsAppAlerte.update(alerte.id, {
        statut: 'failed',
        erreur: twilioData.message || JSON.stringify(twilioData)
      });
      return Response.json({ success: false, error: twilioData.message }, { status: 200 });
    }

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});