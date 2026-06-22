import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Retourne tous les livreurs via service role.
 * Pas de vérification d'auth Base44 (l'app utilise un système custom PIN admin).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const livreurs = await base44.asServiceRole.entities.Livreur.list('-created_date', 1000);
    return Response.json({ success: true, livreurs });
  } catch (error) {
    console.error('[getLivreurs] ERROR:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
