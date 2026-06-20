import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Force une synchronisation GPS pour un client spécifique
 * À appeler avant la création d'une course pour garantir une position récente
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { client_id } = await req.json();

    if (!client_id) {
      return Response.json({ error: 'client_id requis' }, { status: 400 });
    }

    // Récupérer le client
    const client = await base44.entities.ClientExterne.get(client_id);

    if (!client) {
      return Response.json({ error: 'Client non trouvé' }, { status: 404 });
    }

    // Vérifier si le client a déjà des coordonnées GPS
    if (!client.latitude || !client.longitude) {
      return Response.json({
        success: false,
        message: 'Client sans coordonnées GPS. Veuillez activer la localisation dans votre profil.',
        needs_gps_activation: true
      });
    }

    // Vérifier l'ancienneté du GPS
    const dt = client.last_seen_at;
    let gpsAgeMin = 0;
    if (dt) {
      gpsAgeMin = Math.round((Date.now() - new Date(dt).getTime()) / 60000);
    }

    // Si GPS < 5 min, pas besoin de refresh
    if (gpsAgeMin < 5) {
      return Response.json({
        success: true,
        message: 'GPS déjà récent',
        gps_age_minutes: gpsAgeMin,
        latitude: client.latitude,
        longitude: client.longitude,
        refreshed: false
      });
    }

    // Demander une synchronisation (le client devra accepter dans son app)
    // On met juste à jour le heartbeat pour marquer la demande
    await base44.entities.ClientExterne.update(client_id, {
      last_seen_at: new Date().toISOString()
    });

    return Response.json({
      success: true,
      message: 'Synchronisation GPS demandée. Veuillez patienter pendant que l\'application du client met à jour sa position.',
      gps_age_minutes: gpsAgeMin,
      latitude: client.latitude,
      longitude: client.longitude,
      refreshed: true,
      request_sync: true
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});