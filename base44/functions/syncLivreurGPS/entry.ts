import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Récupérer tous les livreurs externes
    const livreurs = await base44.entities.Livreur.filter({ type_livreur: "externe" });
    
    if (!livreurs || livreurs.length === 0) {
      return Response.json({ 
        success: true, 
        message: 'Aucun livreur externe trouvé',
        stats: { total: 0, synced: 0, sans_gps: 0 }
      });
    }

    let synced = 0;
    let sansGps = 0;
    const results = [];

    for (const livreur of livreurs) {
      // Si le livreur a déjà un GPS, on le garde
      if (livreur.latitude && livreur.longitude) {
        synced++;
        results.push({
          id: livreur.id,
          nom: `${livreur.prenom} ${livreur.nom}`,
          telephone: livreur.telephone,
          status: 'déjà synchronisé',
          latitude: livreur.latitude,
          longitude: livreur.longitude,
          statut: livreur.statut,
          app_active: livreur.app_active
        });
        continue;
      }

      // Livreur sans GPS
      sansGps++;
      results.push({
        id: livreur.id,
        nom: `${livreur.prenom} ${livreur.nom}`,
        telephone: livreur.telephone,
        status: 'GPS manquant - devra activer dans l\'app',
        latitude: null,
        longitude: null,
        statut: livreur.statut,
        app_active: livreur.app_active
      });
    }

    return Response.json({
      success: true,
      message: `${synced} livreurs avec GPS, ${sansGps} sans GPS`,
      stats: {
        total: livreurs.length,
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