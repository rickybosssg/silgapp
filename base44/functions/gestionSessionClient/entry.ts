import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Gestion de session unique client.
 * Quand un client se connecte sur un nouvel appareil :
 * - Génère un nouvel ID de session
 * - Désactive toutes les autres sessions
 * - Désactive tous les anciens tokens de notification
 * - Retourne le nouveau session_id
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { device_id, plateforme } = payload;

    // Trouver le profil client
    const clients = await base44.asServiceRole.entities.ClientExterne.filter({ user_email: user.email });
    if (!clients || clients.length === 0) {
      return Response.json({ error: 'Client non trouvé' }, { status: 404 });
    }

    const client = clients[0];
    const now = new Date().toISOString();
    const sessionId = `sess_client_${client.id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const ancienneSession = client.session_active_id;

    // 1. Mettre à jour le client avec la nouvelle session
    await base44.asServiceRole.entities.ClientExterne.update(client.id, {
      session_active_id: sessionId,
      session_active_device: device_id || 'inconnu',
      session_active_date: now,
      app_active: true,
      last_seen_at: now,
    });

    // 2. Désactiver TOUS les anciens tokens FCM de ce client
    const allTokens = await base44.asServiceRole.entities.NotificationToken.filter({
      client_id: client.id,
      actif: true,
    });

    const deactivatedCount = allTokens ? allTokens.length : 0;
    if (allTokens && allTokens.length > 0) {
      await Promise.all(allTokens.map(t =>
        base44.asServiceRole.entities.NotificationToken.update(t.id, { actif: false })
      ));
    }

    // 3. Désactiver aussi par email (fallback)
    const tokensByEmail = await base44.asServiceRole.entities.NotificationToken.filter({
      user_email: user.email,
      user_type: 'client',
      actif: true,
    });

    if (tokensByEmail && tokensByEmail.length > 0) {
      const toDeactivate = tokensByEmail.filter(t => t.client_id === client.id);
      await Promise.all(toDeactivate.map(t =>
        base44.asServiceRole.entities.NotificationToken.update(t.id, { actif: false })
      ));
    }

    // 4. Désactiver les DeviceSessions existantes
    const oldSessions = await base44.asServiceRole.entities.DeviceSession.filter({
      user_email: user.email,
      user_type: 'client',
      session_actif: true,
    });

    if (oldSessions && oldSessions.length > 0) {
      await Promise.all(oldSessions.map(s =>
        base44.asServiceRole.entities.DeviceSession.update(s.id, {
          session_actif: false,
          app_active: false,
        })
      ));
    }

    // 5. Créer la nouvelle DeviceSession
    await base44.asServiceRole.entities.DeviceSession.create({
      user_email: user.email,
      user_type: 'client',
      device_id: device_id || `device_${Date.now()}`,
      platform: plateforme || 'android',
      session_actif: true,
      app_active: true,
      last_seen_at: now,
    });

    console.log('[gestionSessionClient] Nouvelle session créée', {
      client_id: client.id,
      session_id: sessionId,
      device_id: device_id,
      ancienne_session: ancienneSession || 'aucune',
      tokens_desactives: deactivatedCount,
    });

    return Response.json({
      success: true,
      session_id: sessionId,
      device_id: device_id || 'inconnu',
      client_id: client.id,
      ancienne_session_remplacee: !!ancienneSession,
      tokens_desactives: deactivatedCount,
    });
  } catch (error) {
    console.error('[gestionSessionClient] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});