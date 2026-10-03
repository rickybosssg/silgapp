import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { detectBottlenecks } from '../../shared/growthDecisionRules.ts';
import { getConfigValue } from '../../shared/growthBudgetGuard.ts';

// ═══════════════════════════════════════════════════════════════════════════
// detectGrowthBottlenecks — Détecte les goulots et crée des recommandations
// ═══════════════════════════════════════════════════════════════════════════
//
// RÔLE : Pour chaque GrowthExperiment active, appliquer les règles déterministes
// de détection et créer des GrowthDecision (pending) pour chaque goulot trouvé.
//
// Règles V1 :
//   1. 0 conversion après 7 jours avec dépense >= 500 FCFA → pause
//   2. CAC > 3 × objectif après 14 jours avec >= 1 conversion → pause
//   3. Pas de 2ème course après 14 jours → monitor (pas d'action)
//
// Idempotent : ne crée pas de doublon si une décision pending existe déjà.
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

    // ── Lire les expériences actives ──
    const experiments = await base44.asServiceRole.entities.GrowthExperiment.filter(
      { status: 'active' },
      '-created_date', 50
    ).catch(() => []);

    if (!experiments || experiments.length === 0) {
      return Response.json({ success: true, bottlenecks_detected: 0, decisions_created: 0, reason: 'no_active_experiments' });
    }

    // ── Détecter les goulots ──
    const bottlenecks = detectBottlenecks(experiments, cacTargetFcfa);

    if (bottlenecks.length === 0) {
      return Response.json({ success: true, bottlenecks_detected: 0, decisions_created: 0, reason: 'no_bottlenecks' });
    }

    // ── Créer les GrowthDecision ──
    const cycleId = `detect-${Date.now()}`;
    const expiryDate = new Date(Date.now() + 7 * 86400000).toISOString();
    const created: string[] = [];

    for (const b of bottlenecks) {
      // Idempotence : vérifier si une décision pending existe déjà pour cette expérience + règle
      const existing = await base44.asServiceRole.entities.GrowthDecision.filter(
        { experiment_id: b.experiment_id, status: 'pending', trigger_rule: b.rule }
      ).catch(() => []);

      if (existing && existing.length > 0) continue;

      const decision = await base44.asServiceRole.entities.GrowthDecision.create({
        decision_type: b.recommendation === 'pause_experiment' ? 'pause_experiment' : 'complete_experiment',
        status: 'pending',
        trigger_rule: b.rule,
        trigger_metrics: JSON.stringify(b.metrics),
        recommended_action: b.rationale,
        action_payload: b.action_payload,
        budget_impact: b.budget_impact,
        expires_at: expiryDate,
        autopilot_cycle_id: cycleId,
        experiment_id: b.experiment_id,
      });
      created.push(decision.id);
    }

    return Response.json({
      success: true,
      bottlenecks_detected: bottlenecks.length,
      decisions_created: created.length,
      decision_ids: created,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}