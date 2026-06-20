import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Heartbeat automatique - appelé toutes les 30s par les apps
 * Met à jour : last_seen, GPS, app_active, session
 * Vérifie la validité de la session unique (session_id)
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
      user_type,
      latitude, 
      longitude,
      app_active = true,
      background_active = false,
      device_id,
      session_id, // NEW : ID de session unique
    } = payload;

    const now = new Date().toISOString();

    // --- VÉRIFICATION SESSION UNIQUE POUR LES LIVREURS ---
    if (user_type === "livreur" && session_id) {
      const livreurs = await base44.asServiceRole.entities.Livreur.filter({ user_email: user.email });
      if (livreurs && livreurs.length > 0) {
        const livreur = livreurs[0];
        if (livreur.session_active_id && livreur.session_active_id !== session_id) {
          console.log('[heartbeatAuto] Session livreur expirée', {
            livreur_id: livreur.id,
            session_attendue: livreur.session_active_id,
            session_recue: session_id,
          });
          return Response.json({
            success: false,
            error: 'session_expired',
            message: 'Vous avez été déconnecté car une autre session a été ouverte sur un autre appareil.',
            force_hors_ligne: true,
          }, { status: 409 });
        }
      }
    }

    // --- VÉRIFICATION SESSION UNIQUE POUR LES CLIENTS ---
    if (user_type === "client" && session_id) {
      const clients = await base44.asServiceRole.entities.ClientExterne.filter({ user_email: user.email });
      if (clients && clients.length > 0) {
        const client = clients[0];
        if (client.session_active_id && client.session_active_id !== session_id) {
          console.log('[heartbeatAuto] Session client expirée', {
            client_id: client.id,
            session_attendue: client.session_active_id,
            session_recue: session_id,
          });
          return Response.json({
            success: false,
            error: 'session_expired',
            message: 'Vous avez été déconnecté car une autre session a été ouverte sur un autre appareil.',
          }, { status: 409 });
        }
      }
    }

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
          background_active: background_active,
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