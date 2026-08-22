import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { computePushHealth, syncPushHealthAlerts, loadPushHealthConfig } from '../../shared/pushHealthMonitor.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Détection automatique de dégradation push.
// Appelé par automation planifiée (toutes les 10 minutes).
// Ne modifie aucune donnée — crée uniquement des AdminInboxItem.
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // ── Mode automation : pas d'utilisateur connecté ──
    let lanceur = 'automation';
    try {
      const user = await base44.auth.me();
      if (user) {
        if (user.role !== 'admin') {
          return Response.json({ error: 'Accès admin requis' }, { status: 403 });
        }
        lanceur = user.email;
      }
    } catch (_) {
      // Exécution automatique (scheduled automation)
    }

    const config = await loadPushHealthConfig(base44);
    const metrics = await computePushHealth(base44);

    // Créer/archiver les alertes seulement si dégradation détectée
    if (metrics.degradations.length > 0) {
      await syncPushHealthAlerts(base44, metrics, config);
    } else {
      // Aucune dégradation — archiver toutes les alertes push actives
      const existingItems = await base44.asServiceRole.entities.AdminInboxItem.filter(
        {}, '-created_date', 500
      ).catch(() => []);
      for (const item of (existingItems || [])) {
        if (item.deduplication_key && item.deduplication_key.startsWith('PUSH_DEGRADATION_') && item.status !== 'archived') {
          await base44.asServiceRole.entities.AdminInboxItem.update(item.id, { status: 'archived' }).catch(() => {});
        }
      }
    }

    console.log('[PUSH_HEALTH] Détection terminée', {
      niveau: metrics.niveau,
      score: metrics.degradation_score,
      degradations: metrics.degradations.length,
      taux_echec_1h: metrics.taux_echec_1h_pct,
      livreurs_joignables: metrics.taux_livreurs_joignables_pct,
      lanceur,
    });

    return Response.json({
      success: true,
      niveau: metrics.niveau,
      degradation_score: metrics.degradation_score,
      degradations_count: metrics.degradations.length,
      taux_echec_1h_pct: metrics.taux_echec_1h_pct,
      taux_echec_24h_pct: metrics.taux_echec_24h_pct,
      livreurs_joignables_pct: metrics.taux_livreurs_joignables_pct,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[PUSH_HEALTH] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}