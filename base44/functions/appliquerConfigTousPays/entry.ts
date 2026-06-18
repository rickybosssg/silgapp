import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin uniquement' }, { status: 403 });
    }

    // Configuration de référence (Burkina Faso)
    const configReference = {
      prix_par_km: 100,
      prix_minimum: 500,
      devise: 'FCFA',
      rayon_km: 30,
    };

    // Récupérer tous les pays
    const tousPays = await base44.entities.Country.list();
    
    let updated = 0;
    for (const pays of tousPays) {
      // Appliquer la configuration de référence à tous les pays
      await base44.entities.Country.update(pays.id, {
        prix_par_km: configReference.prix_par_km,
        prix_minimum: configReference.prix_minimum,
        devise: configReference.devise,
        rayon_km: configReference.rayon_km,
      });
      updated++;
    }

    return Response.json({ 
      success: true, 
      message: `${updated} pays mis à jour avec la configuration de référence`,
      config: configReference 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
