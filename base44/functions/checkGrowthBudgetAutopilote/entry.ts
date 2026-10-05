import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { checkGrowthBudget } from '../../shared/growthBudgetGuard.ts';

// ═══════════════════════════════════════════════════════════════════════════
// checkGrowthBudgetAutopilote — Circuit breaker de l'Autopilote
// ═══════════════════════════════════════════════════════════════════════════
//
// RÔLE : Vérifier les budgets Growth et bloquer les moteurs concernés
// lorsqu'un sous-plafond est atteint.
//
// Hiérarchie :
//   Niveau 1 — Sous-plafonds par canal (acquisition, primes, réactivation)
//   Niveau 2 — Plafond global (dernier rempart)
//
// Le moteur ne peut JAMAIS augmenter les plafonds.
// Crée une GrowthDecision (auto_blocked_budget) pour traçabilité si un budget est dépassé.
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    const result = await checkGrowthBudget(base44);

    // ── Créer une GrowthDecision pour traçabilité si un budget est dépassé ──
    if (result.any_exceeded) {
      const exceededChannels = Object.entries(result.channels)
        .filter(([_, c]: [string, any]) => c.exceeded)
        .map(([k, _]: [string, any]) => k);

      const reason = result.global.exceeded
        ? `Plafond global dépassé : ${result.global.spent}/${result.global.cap} FCFA`
        : `Sous-plafond dépassé : ${exceededChannels.join(', ')}`;

      await base44.asServiceRole.entities.GrowthDecision.create({
        decision_type: 'auto_blocked_budget',
        status: 'auto_blocked_budget',
        trigger_rule: result.global.exceeded ? 'global_budget_exceeded' : 'channel_budget_exceeded',
        trigger_metrics: JSON.stringify({
          channels: result.channels,
          global: result.global,
          actions_taken: result.actions_taken,
        }),
        recommended_action: reason,
        action_payload: JSON.stringify({ exceeded_channels: exceededChannels, global_exceeded: result.global.exceeded }),
        budget_impact: 0,
        autopilot_cycle_id: `breaker-${Date.now()}`,
      }).catch(() => {});
    }

    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}