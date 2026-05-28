import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Initialisation automatique pour NOUVEAU LIVREUR EXTERNE
 * Configure : GPS, device, notifications, heartbeat, statut
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
      device_id, 
      platform, 
      notification_token, 
      latitude, 
      longitude,
      telephone,
      vehicule,
      quartier
    } = payload;

    // 1. Créer le profil livreur s'il n'existe pas
    let livreur = await base44.asServiceRole.entities.Livreur.filter({ user_email: user.email });
    if (!livreur || livreur.length === 0) {
      livreur = await base44.asServiceRole.entities.Livreur.create({
        reseau: "externe",
        type_livreur: "externe",
        nom: user.full_name?.split(' ')[0] || user.email.split('@')[0],
        prenom: user.full_name?.split(' ').slice(1).join(' ') || '',
        telephone: telephone || "",
        user_email: user.email,
        validation: "valide",
        actif: true,
        statut: "hors_ligne",
        latitude: latitude || null,
        longitude: longitude || null,
        vehicule: vehicule || "moto",
        quartier: quartier || "",
        app_active: false,
        last_seen_at: new Date().toISOString(),
      });
    } else {
      livreur = livreur[0];
    }

    // 2. Enregistrer la session device
    const session = await base44.asServiceRole.entities.DeviceSession.create({
      user_email: user.email,
      user_type: "livreur",
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
        user_type: "livreur",
        livreur_id: livreur.id,
        actif: true,
        derniere_utilisation: new Date().toISOString(),
      });
    }

    // 4. Générer code d'identification unique
    const codeIdentification = `LIV${Date.now().toString().slice(-6)}`;
    await base44.asServiceRole.entities.Livreur.update(livreur.id, {
      code_identification: codeIdentification,
    });

    // 5. Tester la notification
    await base44.asServiceRole.functions.invoke('envoiNotificationPush', {
      user_email: user.email,
      titre: "🎉 Bienvenue Livreur SILGAPP",
      message: `Votre compte est activé. Code: ${codeIdentification}. GPS et notifications activés ✓`
    });

    return Response.json({
      success: true,
      livreur_id: livreur.id,
      session_id: session.id,
      code_identification: codeIdentification,
      gps_sync: !!(latitude && longitude),
      notifications: !!notification_token,
    });
  } catch (error) {
    console.error('[initLivreurAuto] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});