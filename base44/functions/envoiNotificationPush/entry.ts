import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json();
    const { titre, message, type, destinataire_email, user_type, livreur_id } = body;

    if (!titre || !message || !destinataire_email) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Récupérer les tokens actifs pour le destinataire
    const tokens = await base44.entities.NotificationToken.filter({
      user_email: destinataire_email,
      actif: true
    });

    if (tokens.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'Aucun token de notification trouvé pour cet utilisateur' 
      }, { status: 404 });
    }

    // Créer la notification en base
    const notification = await base44.entities.Notification.create({
      titre,
      message,
      type: type || 'generic',
      destinataire_email,
      lue: false,
    });

    // Envoyer via FCM (Firebase Cloud Messaging)
    const fcmKey = Deno.env.get('FIREBASE_SERVER_KEY');
    if (!fcmKey) {
      return Response.json({ 
        success: true, 
        notification_id: notification.id,
        warning: 'FCM key not configured, notification saved but not sent' 
      });
    }

    const fcmPayload = {
      registration_ids: tokens.map(t => t.token),
      notification: {
        title: titre,
        body: message,
        click_action: 'https://silga-livraison.base44.app/notifications',
      },
      data: {
        type: type || 'generic',
        livreur_id: livreur_id || '',
        notification_id: notification.id,
      },
      priority: 'high',
    };

    const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${fcmKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fcmPayload),
    });

    const fcmResult = await fcmResponse.json();

    return Response.json({
      success: true,
      notification_id: notification.id,
      tokens_sent: tokens.length,
      fcm_response: fcmResult,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});