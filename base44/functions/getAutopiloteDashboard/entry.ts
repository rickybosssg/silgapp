import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getConfigValue } from '../../shared/growthBudgetGuard.ts';

const META_API_BASE = 'https://graph.facebook.com/v25.0';

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
    const metaEnabled = getConfigValue(configs, 'META_ACQUISITION_ENABLED') !== 'false';

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

    // ── 5. Identifier l'expérience active ──
    const activeExperiment = (experiments || []).find((e: any) => e.status === 'active') || null;

    // ── 6. Vérifier le statut Meta pour l'expérience active ──
    let metaStatus: any = null;
    let metaInsights: any = null;

    if (activeExperiment && activeExperiment.meta_campaign_id) {
      try {
        const { accessToken } = await base44.asServiceRole.connectors.getConnection('meta_ads');
        if (accessToken) {
          const campRes = await fetch(`${META_API_BASE}/${activeExperiment.meta_campaign_id}?fields=id,name,status,effective_status,objective`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          const campData = await campRes.json();

          let adsetData: any = null;
          if (activeExperiment.meta_adset_id) {
            const adsetRes = await fetch(`${META_API_BASE}/${activeExperiment.meta_adset_id}?fields=id,name,status,effective_status,daily_budget,end_time`, {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            });
            adsetData = await adsetRes.json();
          }

          let adData: any = null;
          if (activeExperiment.meta_ad_id) {
            const adRes = await fetch(`${META_API_BASE}/${activeExperiment.meta_ad_id}?fields=id,name,status,effective_status,creative,adset_id`, {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            });
            adData = await adRes.json();
          }

          let insightsData: any = null;
          const insightsRes = await fetch(`${META_API_BASE}/${activeExperiment.meta_campaign_id}/insights?fields=spend,impressions,reach,clicks,ctr,cpc&date_preset=maximum`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          insightsData = await insightsRes.json();

          metaStatus = { campaign: campData, adset: adsetData, ad: adData };

          if (insightsData?.data?.[0]) {
            metaInsights = {
              spend_usd: parseFloat(insightsData.data[0].spend || '0'),
              impressions: parseInt(insightsData.data[0].impressions || '0'),
              reach: parseInt(insightsData.data[0].reach || '0'),
              clicks: parseInt(insightsData.data[0].clicks || '0'),
              ctr: parseFloat(insightsData.data[0].ctr || '0'),
              cpc: parseFloat(insightsData.data[0].cpc || '0'),
            };
          } else {
            metaInsights = { spend_usd: 0, impressions: 0, reach: 0, clicks: 0, ctr: 0, cpc: 0 };
          }
        }
      } catch (metaErr: any) {
        metaStatus = { error: metaErr?.message || 'Erreur API Meta' };
      }
    }

    // ── 7. Circuit breakers (read-only) ──
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

    const acquisitionExceeded = (budget.acquisition_cap || 0) > 0 && (budget.acquisition_spent || 0) >= budget.acquisition_cap;
    const globalExceeded = (budget.total_cap || 0) > 0 && (budget.total_spent || 0) >= budget.total_cap;

    const circuitBreakers = {
      acquisition: { spent: budget.acquisition_spent || 0, cap: budget.acquisition_cap || 0, exceeded: acquisitionExceeded },
      global: { spent: budget.total_spent || 0, cap: budget.total_cap || 0, exceeded: globalExceeded },
      kill_switch: killSwitch,
      meta_enabled: metaEnabled,
      any_blocked: killSwitch || acquisitionExceeded || globalExceeded || !metaEnabled,
    };

    // ── 8. Dernière sync Meta et dernière analyse ──
    // SOURCE DE VÉRITÉ : META_ADS_LATEST_INSIGHTS.synced_at (écrit par syncMetaAdsSpend).
    // META_ADS_LAST_SYNC n'est jamais écrit par syncMetaAdsSpend — c'est une clé legacy.
    // On lit synced_at depuis le JSON de META_ADS_LATEST_INSIGHTS pour obtenir le vrai
    // timestamp de la dernière synchronisation réussie.
    const lastMetaSyncConfig = configs.find(c => c.cle === 'META_ADS_LAST_SYNC');
    let lastMetaSync = lastMetaSyncConfig?.valeur || null;
    if (!lastMetaSync) {
      const latestInsightsConfig = configs.find(c => c.cle === 'META_ADS_LATEST_INSIGHTS');
      if (latestInsightsConfig?.valeur) {
        try {
          const parsed = JSON.parse(latestInsightsConfig.valeur);
          if (parsed?.synced_at) lastMetaSync = parsed.synced_at;
        } catch {}
      }
    }
    const lastAutopiloteAnalysis = recentDecisions?.[0]?.created_date || null;

    // ── 9. Assembler le payload ──
    const cacByChannel = metricsCache?.cac_by_channel || null;
    const revenue = metricsCache?.revenue || null;
    const acquisition = metricsCache?.acquisition || null;

    return Response.json({
      success: true,
      kill_switch_active: killSwitch,
      meta_enabled: metaEnabled,
      cac_target_fcfa: cacTargetFcfa,
      budget,
      circuit_breakers: circuitBreakers,
      cac_by_channel: cacByChannel,
      revenue,
      acquisition,
      active_experiment: activeExperiment ? {
        id: activeExperiment.id,
        name: activeExperiment.name,
        status: activeExperiment.status,
        targeting_geo: activeExperiment.targeting_geo,
        targeting_age_min: activeExperiment.targeting_age_min,
        targeting_age_max: activeExperiment.targeting_age_max,
        targeting_gender: activeExperiment.targeting_gender,
        message_angle: activeExperiment.message_angle,
        meta_objective: activeExperiment.meta_objective,
        budget_test_fcfa: activeExperiment.budget_test_fcfa,
        meta_campaign_id: activeExperiment.meta_campaign_id,
        meta_adset_id: activeExperiment.meta_adset_id,
        meta_creative_id: activeExperiment.meta_creative_id,
        meta_ad_id: activeExperiment.meta_ad_id,
        utm_campaign_name: activeExperiment.utm_campaign_name,
        spend_fcfa: activeExperiment.spend_fcfa || 0,
        installs: activeExperiment.installs || 0,
        signups: activeExperiment.signups || 0,
        first_courses: activeExperiment.first_courses || 0,
        second_courses: activeExperiment.second_courses || 0,
        cac_first_course_fcfa: activeExperiment.cac_first_course_fcfa,
        attributed_revenue_fcfa: activeExperiment.attributed_revenue_fcfa || 0,
        attributed_commission_fcfa: activeExperiment.attributed_commission_fcfa || 0,
        observation_days: activeExperiment.observation_days || 0,
        performance_status: activeExperiment.performance_status || 'donnees_insuffisantes',
        sample_sufficient: activeExperiment.sample_sufficient || false,
        activated_at: activeExperiment.activated_at,
        proposed_at: activeExperiment.proposed_at,
        proposal_rationale: activeExperiment.proposal_rationale,
        phase: activeExperiment.phase,
      } : null,
      meta_status: metaStatus,
      meta_insights: metaInsights,
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
        meta_adset_id: e.meta_adset_id,
        meta_creative_id: e.meta_creative_id,
        meta_ad_id: e.meta_ad_id,
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
      last_meta_sync: lastMetaSync,
      last_autopilote_analysis: lastAutopiloteAnalysis,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}