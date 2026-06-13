import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const livreurs = await base44.entities.Livreur.list();
    
    let updatedCount = 0;
    const results = [];

    for (const livreur of livreurs) {
      if (!livreur.code_identification) {
        const nomPart = (livreur.nom || 'LIV').substring(0, 3).toUpperCase();
        const telPart = (livreur.telephone || '000').replace(/\D/g, '').slice(-3);
        const code = `LVR-${nomPart}${telPart}`;
        
        await base44.entities.Livreur.update(livreur.id, { code_identification: code });
        results.push({ id: livreur.id, nom: livreur.nom, code });
        updatedCount++;
      }
    }

    return Response.json({ 
      success: true, 
      message: `${updatedCount} livreurs mis à jour`,
      results 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});