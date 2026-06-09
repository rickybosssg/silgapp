import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Scheduled job — tourne toutes les 5 minutes.
 * Ferme les courses en recherche_livreur depuis > 4 minutes
 * et notifie le client pour qu'il puisse relancer.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const result = await base44.asServiceRole.functions.invoke('dispatchExterneAuto', {
      action: 'fermer_courses_expirees',
    });

    console.log(`[FERMETURE] ✅ Résultat : ${result?.fermees ?? 0} course(s) fermée(s)`);
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error('[FERMETURE] ❌ Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});