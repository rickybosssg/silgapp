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
        stats: { total: 0, synced: 0, skipped: 0 }
      });
    }

    let synced = 0;
    let skipped = 0;
    const results = [];

    for (const client of clients) {
      // Si le client a déjà un GPS, on le garde
      if (client.latitude && client.longitude) {
        skipped++;
        results.push({
          id: client.id,
          nom: client.nom,
          status: 'déjà synchronisé',
          latitude: client.latitude,
          longitude: client.longitude
        });
        continue;
      }

      // Client sans GPS - on marque comme nécessitant une mise à jour
      // Note: On ne peut pas deviner le GPS, donc on laisse null
      // Mais on compte le client comme "nécessitant synchronisation"
      results.push({
        id: client.id,
        nom: client.nom,
        telephone: client.telephone,
        status: 'GPS manquant - devra activer dans le profil',
        latitude: null,
        longitude: null
      });
      skipped++;
    }

    return Response.json({
      success: true,
      message: `${synced} clients synchronisés avec GPS, ${skipped} clients sans GPS`,
      stats: {
        total: clients.length,
        synced,
        skipped
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