import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Heartbeat automatique - appelé toutes les 30s par les apps
 * Met à jour : last_seen, GPS, app_active, session
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { 
      user_type, // "client" ou "livreur"
      latitude, 
      longitude,
      app_active = true,
      device_id
    } = payload;

    const now = new Date().toISOString();

    // 1. Mettre à jour la session device
    if (device_id) {
      const sessions = await base44.asServiceRole.entities.DeviceSession.filter({
        user_email: user.email,
        device_id: device_id,
        session_actif: true
      });

      if (sessions && sessions.length > 0) {
        await base44.asServiceRole.entities.DeviceSession.update(sessions[0].id, {
          last_seen_at: now,
          app_active: app_active,
          derniere_position_lat: latitude || sessions[0].derniere_position_lat,
          derniere_position_lng: longitude || sessions[0].derniere_position_lng,
          derniere_sync_date: latitude && longitude ? now : sessions[0].derniere_sync_date,
          gps_actif: !!(latitude && longitude),
        });
      }
    }

    // 2. Mettre à jour le profil (Client ou Livreur)
    if (user_type === "client") {
      const clients = await base44.asServiceRole.entities.ClientExterne.filter({ user_email: user.email });
      if (clients && clients.length > 0) {
        const client = clients[0];
        await base44.asServiceRole.entities.ClientExterne.update(client.id, {
          latitude: latitude || client.latitude,
          longitude: longitude || client.longitude,
          last_seen_at: now,
          app_active: app_active,
        });
      }
    } else if (user_type === "livreur") {
      const livreurs = await base44.asServiceRole.entities.Livreur.filter({ user_email: user.email });
      if (livreurs && livreurs.length > 0) {
        const livreur = livreurs[0];
        await base44.asServiceRole.entities.Livreur.update(livreur.id, {
          latitude: latitude || livreur.latitude,
          longitude: longitude || livreur.longitude,
          last_seen_at: now,
          app_active: app_active,
        });
      }
    }

    return Response.json({
      success: true,
      timestamp: now,
      gps_sync: !!(latitude && longitude),
    });
  } catch (error) {
    console.error('[heartbeatAuto] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});