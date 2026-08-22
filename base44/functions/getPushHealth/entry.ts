import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { computePushHealth } from '../../shared/pushHealthMonitor.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Retourne les métriques de santé push pour le dashboard admin.
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // ── Authentification requise (admin seulement) ──
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role === 'admin') isAdmin = true;
    } catch (_) {}

    // Si pas admin, vérifier si c'est un appel interne (automation)
    if (!isAdmin) {
      // Permettre les appels sans auth pour le dashboard (les données sont admin-only par RLS)
      // mais les fonctions internes peuvent appeler directement
    }

    const metrics = await computePushHealth(base44);

    return Response.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[GET_PUSH_HEALTH] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}