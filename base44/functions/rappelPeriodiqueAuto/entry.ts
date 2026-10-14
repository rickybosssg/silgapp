import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { gererRappelPeriodique } from '../../shared/pushRappelPeriodique.ts';

/**
 * RAPPEL PÉRIODIQUE AUTO — Fonction légère appelée par le workflow dédié.
 *
 * Cette fonction est SÉPARÉE du watchdog pour garantir l'exécution même
 * si le watchdog est lent ou en timeout. Elle ne fait qu'une seule chose :
 * appeler gererRappelPeriodique.
 *
 * Anti-concurrence : le verrou par pays dans gererRappelPeriodique empêche
 * les doubles exécutions (watchdog + ce workflow).
 *
 * Coût : ~6 appels BDD par pays + 1 invocation FCM batch. 0 crédit Base44.
 */
Deno.serve(async (req: Request): Promise<Response> => {
  try {
    const base44 = createClientFromRequest(req);
    const result = await gererRappelPeriodique(base44);
    return Response.json(result);
  } catch (error) {
    console.error('[RAPPEL_PERIODIQUE_AUTO] Erreur:', error?.message || String(error));
    return Response.json({ success: false, error: error?.message || 'unknown' }, { status: 500 });
  }
});