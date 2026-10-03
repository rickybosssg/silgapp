import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getConfigValue } from '../../shared/growthBudgetGuard.ts';

// ═══════════════════════════════════════════════════════════════════════════
// getAutopiloteDashboard — Assemble les données du dashboard Autopilote
// ═══════════════════════════════════════════════════════════════════════════
//
// RÔLE : Retourner toutes les données nécessaires au dashboard Autopilote :
//   - Budget (sous-plafonds + global)
//   - KPIs (1ères courses, 2èmes courses, commissions, rentabilité)
//   - CAC par canal (Meta, réactivation, parrainage, global)
//   - Expériences en cours avec statut de performance
//   - Recommandations pending (GrowthDecision)
//   - Journal des décisions récentes
//   - Kill switch status
//
// LECTURE UNIQUEMENT — aucune modification de données.
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    // ── 1. Lire AppConfig ──
    const configs = await base44.asServiceRole.entities.AppConfig.list().catch(() => []);

    const killSwitch = getConfigValue(configs, 'GROWTH_AUTOPILOTE_KILL_SWITCH') === 'true';
    const cacTargetFcfa = parseInt(getConfigValue(configs, 'GROWTH_CAC_TARGET_FCFA') || '2000') || 2000;

    // ── 2. Lire GrowthMetricsCache ──
    let metricsCache: any = null;
    const cacheConfig = configs.find(c => c.cle === 'GROWTH_METRICS_CACHE');
    if (cacheConfig?.valeur) {
      try { metricsCache = JSON.parse(cacheConfig.valeur); } catch {}
    }

    // ── 3. Lire GrowthExperiment ──
    const experiments = await base44.asServiceRole.entities.GrowthExperiment.list('-created_date', 50).catch(() => []);

    // ── 4. Lire GrowthDecision (pending + récentes) ──
    const pendingDecisions = await base44.asServiceRole.entities.GrowthDecision.filter(
      { status: 'pending' },
      '-created_date', 20
    ).catch(() => []);

    const recentDecisions = await base44.asServiceRole.entities.GrowthDecision.list('-created_date', 20).catch(() => []);

    // ── 5. Assembler le payload ──
    const budget = metricsCache?.budget || {
      total_cap: parseInt(getConfigValue(configs, 'GROWTH_TOTAL_BUDGET_PER_MONTH') || '30000') || 30000,
      acquisition_cap: parseInt(getConfigValue(configs, 'GROWTH_BUDGET_ACQUISITION_PER_MONTH') || '20000') || 20000,
      primes_cap: parseInt(getConfigValue(configs, 'GROWTH_BUDGET_PRIMES_PER_MONTH') || '5000') || 5000,
      reactivation_cap: parseInt(getConfigValue(configs, 'GROWTH_BUDGET_REACTIVATION_PER_MONTH') || '3000') || 3000,
      acquisition_spent: 0,
      primes_spent: 0,
      reactivation_spent: 0,
      total_spent: 0,
    };

    const cacByChannel = metricsCache?.cac_by_channel || null;
    const revenue = metricsCache?.revenue || null;
    const acquisition = metricsCache?.acquisition || null;

    return Response.json({
      success: true,
      kill_switch_active: killSwitch,
      cac_target_fcfa: cacTargetFcfa,
      budget,
      cac_by_channel: cacByChannel,
      revenue,
      acquisition,
      experiments: (experiments || []).map((e: any) => ({
        id: e.id,
        name: e.name,
        status: e.status,
        targeting_geo: e.targeting_geo,
        targeting_age_min: e.targeting_age_min,
        targeting_age_max: e.targeting_age_max,
        targeting_gender: e.targeting_gender,
        message_angle: e.message_angle,
        budget_test_fcfa: e.budget_test_fcfa,
        meta_campaign_id: e.meta_campaign_id,
        spend_fcfa: e.spend_fcfa || 0,
        first_courses: e.first_courses || 0,
        second_courses: e.second_courses || 0,
        cac_first_course_fcfa: e.cac_first_course_fcfa,
        observation_days: e.observation_days || 0,
        performance_status: e.performance_status || 'donnees_insuffisantes',
        sample_sufficient: e.sample_sufficient || false,
        activated_at: e.activated_at,
        proposed_at: e.proposed_at,
        proposal_rationale: e.proposal_rationale,
        phase: e.phase,
      })),
      pending_recommendations: (pendingDecisions || []).map((d: any) => ({
        id: d.id,
        decision_type: d.decision_type,
        status: d.status,
        trigger_rule: d.trigger_rule,
        recommended_action: d.recommended_action,
        budget_impact: d.budget_impact,
        action_payload: d.action_payload,
        trigger_metrics: d.trigger_metrics,
        experiment_id: d.experiment_id,
        expires_at: d.expires_at,
        created_date: d.created_date,
      })),
      recent_decisions: (recentDecisions || []).map((d: any) => ({
        id: d.id,
        decision_type: d.decision_type,
        status: d.status,
        trigger_rule: d.trigger_rule,
        recommended_action: d.recommended_action,
        approved_by: d.approved_by,
        approved_at: d.approved_at,
        rejected_by: d.rejected_by,
        rejected_at: d.rejected_at,
        executed_at: d.executed_at,
        execution_result: d.execution_result,
        execution_error: d.execution_error,
        created_date: d.created_date,
      })),
      last_metrics_update: metricsCache?.last_updated_at || null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}