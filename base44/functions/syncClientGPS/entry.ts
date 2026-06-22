import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Récupérer tous les clients externes
    const clients = await base44.entities.ClientExterne.filter({});

    if (!clients || clients.length === 0) {
      return Response.json({
        success: true,
        message: 'Aucun client trouvé',
        stats: { total: 0, synced: 0, sans_gps: 0 }
      });
    }

    let synced = 0;
    let sansGps = 0;
    const results = [];

    for (const client of clients) {
      // Si le client a déjà un GPS, on le compte comme synchronisé
      if (client.latitude && client.longitude) {
        synced++;
        results.push({
          id: client.id,
          nom: client.nom,
          telephone: client.telephone,
          status: 'déjà synchronisé',
          latitude: client.latitude,
          longitude: client.longitude
        });
        continue;
      }

      // Client sans GPS - on ne peut pas synchroniser sans données
      sansGps++;
      results.push({
        id: client.id,
        nom: client.nom,
        telephone: client.telephone,
        status: 'GPS manquant - client doit activer dans son profil',
        latitude: null,
        longitude: null
      });
    }

    return Response.json({
      success: true,
      message: `${synced} clients ont le GPS activé, ${sansGps} doivent l'activer`,
      stats: {
        total: clients.length,
        synced,
        sans_gps: sansGps
      },
      details: results
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});
