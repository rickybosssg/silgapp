import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { code } = await req.json();
    
    if (!code || typeof code !== 'string') {
      return Response.json({ error: 'Code requis' }, { status: 400 });
    }
    
    const normalizedCode = code.trim().toUpperCase();
    
    const livreurs = await base44.entities.Livreur.filter({ code_identification: normalizedCode });
    
    if (!livreurs || livreurs.length === 0) {
      return Response.json({ error: 'Code incorrect' }, { status: 404 });
    }
    
    const livreur = livreurs.find(l => l.code_identification?.toUpperCase() === normalizedCode);
    
    if (!livreur) {
      return Response.json({ error: 'Code incorrect' }, { status: 404 });
    }
    
    return Response.json(livreur);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});