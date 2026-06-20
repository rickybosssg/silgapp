import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Gestion de session unique livreur.
 * Quand un livreur se connecte sur un nouvel appareil :
 * - Génère un nouvel ID de session
 * - Désactive toutes les autres sessions (force hors_ligne)
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

    // Trouver le profil livreur
    const livreurs = await base44.asServiceRole.entities.Livreur.filter({ user_email: user.email });
    if (!livreurs || livreurs.length === 0) {
      return Response.json({ error: 'Livreur non trouvé' }, { status: 404 });
    }

    const livreur = livreurs[0];
    const now = new Date().toISOString();
    const sessionId = `sess_${livreur.id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Si une session existait déjà, on la remplace (nouvelle connexion)
    const ancienneSession = livreur.session_active_id;
    
    // 1. Mettre à jour le livreur avec la nouvelle session
    await base44.asServiceRole.entities.Livreur.update(livreur.id, {
      session_active_id: sessionId,
      session_active_device: device_id || 'inconnu',
      session_active_date: now,
      app_active: true,
      background_active: true, // App native = foreground service actif
      last_seen_at: now,
      statut: 'disponible', // Forcer disponible pour la nouvelle session
    });

    // 2. Désactiver TOUS les anciens tokens FCM de ce livreur
    //    (pour qu'ils ne reçoivent plus de notifications)
    const allTokens = await base44.asServiceRole.entities.NotificationToken.filter({
      livreur_id: livreur.id,
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
      user_type: 'livreur',
      actif: true,
    });

    if (tokensByEmail && tokensByEmail.length > 0) {
      const toDeactivate = tokensByEmail.filter(t => t.livreur_id === livreur.id);
      await Promise.all(toDeactivate.map(t =>
        base44.asServiceRole.entities.NotificationToken.update(t.id, { actif: false })
      ));
    }

    // 4. Désactiver les DeviceSessions existantes
    const oldSessions = await base44.asServiceRole.entities.DeviceSession.filter({
      user_email: user.email,
      user_type: 'livreur',
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
      user_type: 'livreur',
      device_id: device_id || `device_${Date.now()}`,
      platform: plateforme || 'android',
      session_actif: true,
      app_active: true,
      last_seen_at: now,
    });

    console.log('[gestionSessionLivreur] Nouvelle session créée', {
      livreur_id: livreur.id,
      session_id: sessionId,
      device_id: device_id,
      ancienne_session: ancienneSession || 'aucune',
      tokens_desactives: deactivatedCount,
    });

    return Response.json({
      success: true,
      session_id: sessionId,
      device_id: device_id || 'inconnu',
      livreur_id: livreur.id,
      ancienne_session_remplacee: !!ancienneSession,
      tokens_desactives: deactivatedCount,
    });
  } catch (error) {
    console.error('[gestionSessionLivreur] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});