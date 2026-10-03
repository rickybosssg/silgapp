import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { proposeNextExperiment } from '../../shared/growthDecisionRules.ts';
import { getConfigValue } from '../../shared/growthBudgetGuard.ts';

// ═══════════════════════════════════════════════════════════════════════════
// proposeGrowthActions — Propose la prochaine expérience à tester
// ═══════════════════════════════════════════════════════════════════════════
//
// RÔLE : À partir des expériences existantes et du CAC objectif, proposer
// la prochaine expérience (exploration ou exploitation) et créer une
// GrowthDecision (pending) pour validation admin.
//
// Stratégie V1 :
//   - Phase EXPLORATION : si aucune expérience n'a un sample suffisant,
//     proposer la prochaine combinaison non testée du catalogue.
//   - Phase EXPLOITATION : si une expérience a un CAC conforme à l'objectif,
//     proposer une variante (même ciblage, angle différent).
//
// Maximum 1 expérience ACTIVE à la fois en V1.
// Idempotent : ne crée pas de doublon si une décision create_experiment pending existe.
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    const configs = await base44.asServiceRole.entities.AppConfig.list().catch(() => []);
    const cacTargetFcfa = parseInt(getConfigValue(configs, 'GROWTH_CAC_TARGET_FCFA') || '2000') || 2000;

    // ── Lire toutes les expériences ──
    const experiments = await base44.asServiceRole.entities.GrowthExperiment.list('-created_date', 50).catch(() => []);

    // ── Vérifier qu'il n'y a pas déjà une décision create_experiment pending ──
    const existingPending = await base44.asServiceRole.entities.GrowthDecision.filter(
      { decision_type: 'create_experiment', status: 'pending' }
    ).catch(() => []);

    if (existingPending && existingPending.length > 0) {
      return Response.json({ success: true, proposal: null, reason: 'pending_create_experiment_already_exists' });
    }

    // ── Proposer la prochaine expérience ──
    const proposal = proposeNextExperiment(experiments || [], cacTargetFcfa);

    if (!proposal) {
      return Response.json({ success: true, proposal: null, reason: 'max_active_experiments_or_catalog_exhausted' });
    }

    // ── Créer la GrowthDecision ──
    const cycleId = `propose-${Date.now()}`;
    const expiryDate = new Date(Date.now() + 7 * 86400000).toISOString();

    const decision = await base44.asServiceRole.entities.GrowthDecision.create({
      decision_type: 'create_experiment',
      status: 'pending',
      trigger_rule: proposal.phase === 'exploitation' ? 'exploitation_phase' : 'exploration_phase',
      trigger_metrics: JSON.stringify({ phase: proposal.phase, source_experiment_id: proposal.source_experiment_id }),
      recommended_action: `Créer l'expérience : ${proposal.name} (angle: ${proposal.message_angle}, budget: ${proposal.budget_test_fcfa} FCFA). ${proposal.rationale}`,
      action_payload: JSON.stringify(proposal),
      budget_impact: proposal.budget_test_fcfa,
      expires_at: expiryDate,
      autopilot_cycle_id: cycleId,
    });

    return Response.json({ success: true, proposal, decision_id: decision.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}