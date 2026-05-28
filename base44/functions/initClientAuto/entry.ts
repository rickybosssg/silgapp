import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Initialisation automatique pour NOUVEAU CLIENT
 * Configure : GPS, device, notifications, heartbeat
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { device_id, platform, notification_token, latitude, longitude } = payload;

    // 1. Créer le profil client s'il n'existe pas
    let client = await base44.asServiceRole.entities.ClientExterne.filter({ user_email: user.email });
    if (!client || client.length === 0) {
      client = await base44.asServiceRole.entities.ClientExterne.create({
        nom: user.full_name?.split(' ')[0] || user.email.split('@')[0],
        prenom: user.full_name?.split(' ').slice(1).join(' ') || '',
        telephone: "",
        user_email: user.email,
        actif: true,
        latitude: latitude || null,
        longitude: longitude || null,
      });
    } else {
      client = client[0];
    }

    // 2. Enregistrer la session device
    const session = await base44.asServiceRole.entities.DeviceSession.create({
      user_email: user.email,
      user_type: "client",
      device_id: device_id || `web_${user.email}_${Date.now()}`,
      platform: platform || "web",
      notification_token: notification_token || null,
      gps_actif: !!(latitude && longitude),
      derniere_position_lat: latitude || null,
      derniere_position_lng: longitude || null,
      derniere_sync_date: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      app_active: true,
      session_actif: true,
    });

    // 3. Configurer les notifications push
    if (notification_token) {
      await base44.asServiceRole.entities.NotificationToken.create({
        user_email: user.email,
        token: notification_token,
        platform: platform || "web",
        user_type: "client",
        actif: true,
        derniere_utilisation: new Date().toISOString(),
      });
    }

    // 4. Tester la notification
    await base44.asServiceRole.functions.invoke('envoiNotificationPush', {
      user_email: user.email,
      titre: "🎉 Bienvenue sur SILGAPP",
      message: "Votre compte est configuré. GPS et notifications activés ✓"
    });

    return Response.json({
      success: true,
      client_id: client.id,
      session_id: session.id,
      gps_sync: !!(latitude && longitude),
      notifications: !!notification_token,
    });
  } catch (error) {
    console.error('[initClientAuto] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});