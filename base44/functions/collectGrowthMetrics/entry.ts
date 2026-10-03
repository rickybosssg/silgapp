import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { computeFirstAndSecondCourses, buildClientKey, attributeClientSource, getCurrentMonthRange } from '../../shared/growthEventNormalizer.ts';
import { computeExperimentStatus } from '../../shared/growthDecisionRules.ts';
import { BUDGET_CHANNELS, getConfigValue, computeSpendByMoteur, normalizeAmountToFcfa, computeAutopiloteAcquisitionSpend } from '../../shared/growthBudgetGuard.ts';

// ═══════════════════════════════════════════════════════════════════════════
// collectGrowthMetrics — Collecte et agrège les métriques Growth
// ═══════════════════════════════════════════════════════════════════════════
//
// RÔLE :
//   1. Calculer les 4 CAC séparés (Meta par campagne, réactivation, parrainage, global)
//   2. Mettre à jour les GrowthExperiment actives (spend, first_courses, CAC, statut)
//   3. Écrire le GrowthMetricsCache dans AppConfig
//
// LECTURE + ÉCRITURE (GrowthExperiment + AppConfig uniquement).
// NE MODIFIE PAS : Dispatch V2, finance livreur, tarification, paiements.
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    const { start, end, label } = getCurrentMonthRange();
    const now = new Date().toISOString();

    // ── 1. Lire AppConfig (une seule fois) ──
    const configs = await base44.asServiceRole.entities.AppConfig.list().catch(() => []);
    const cacTargetFcfa = parseInt(getConfigValue(configs, 'GROWTH_CAC_TARGET_FCFA') || '2000') || 2000;

    // ── 2. Lire GrowthSpend pour le mois courant ──
    const growthSpends = await base44.asServiceRole.entities.GrowthSpend.filter(
      { statut: ['engagee', 'payee'] },
      '-date_depense', 500
    ).catch(() => []);

    const spendByMoteur = computeSpendByMoteur(growthSpends);

    // ── Lire les GrowthExperiments pour isoler les dépenses Autopilote ──
    const experimentsForBudget = await base44.asServiceRole.entities.GrowthExperiment.filter(
      { status: ['active', 'paused', 'completed'] },
      '-created_date', 50
    ).catch(() => []);

    const autopiloteCampaignIds = new Set<string>();
    for (const exp of experimentsForBudget || []) {
      if (exp.meta_campaign_id) autopiloteCampaignIds.add(exp.meta_campaign_id);
    }

    const acquisitionSpendAutopilote = computeAutopiloteAcquisitionSpend(growthSpends, autopiloteCampaignIds);
    const acquisitionSpendTotal = BUDGET_CHANNELS.acquisition.moteurs.reduce((s: number, m: string) => s + (spendByMoteur[m] || 0), 0);
    const acquisitionSpend = acquisitionSpendAutopilote; // CAC calculé sur dépenses Autopilote uniquement

    // ── Build utm_campaign → meta_campaign_id mapping for attribution fallback ──
    // Nécessaire car Google Play Install Referrer ne transmet que les UTM, pas le meta_campaign_id.
    // Le mapping est déterministe : utm_campaign_name (GrowthExperiment) → meta_campaign_id (vrai ID Meta).
    const utmCampaignToMetaCampaignId = new Map<string, string>();
    for (const exp of experimentsForBudget || []) {
      if (exp.utm_campaign_name && exp.meta_campaign_id) {
        utmCampaignToMetaCampaignId.set(exp.utm_campaign_name, exp.meta_campaign_id);
      }
    }
    const primesSpend = BUDGET_CHANNELS.primes.moteurs.reduce((s: number, m: string) => s + (spendByMoteur[m] || 0), 0);
    const reactivationSpend = BUDGET_CHANNELS.reactivation.moteurs.reduce((s: number, m: string) => s + (spendByMoteur[m] || 0), 0);
    const totalSpend = acquisitionSpend + primesSpend + reactivationSpend;

    // ── 3. Lire AppInstall ──
    const allInstalls = await base44.asServiceRole.entities.AppInstall.list('-created_date', 1000).catch(() => []);

    const installsByEmail = new Map<string, any>();
    for (const install of allInstalls || []) {
      if (install.user_email) installsByEmail.set(install.user_email.toLowerCase(), install);
    }

    // ── 4. Lire toutes les CourseExterne livrées ──
    const deliveredCourses = await base44.asServiceRole.entities.CourseExterne.filter(
      { statut: 'livree' },
      '-heure_livraison', 1000
    ).catch(() => []);

    // ── 5. Calculer les 1ères et 2èmes courses du mois ──
    const { firstCourses, secondCourses } = computeFirstAndSecondCourses(deliveredCourses || [], start, end);

    // ── 6. Lire ReactivationScenario (converted) ──
    const convertedScenarios = await base44.asServiceRole.entities.ReactivationScenario.filter(
      { status: 'converted' }
    ).catch(() => []);

    const convertedScenarioClientKeys = new Set<string>();
    for (const s of convertedScenarios || []) {
      const key = buildClientKey(s.client_phone_normalized, s.client_user_email);
      if (key) convertedScenarioClientKeys.add(key);
    }

    // ── 7. Lire ClientExterne avec code_promo_utilise ──
    const allClients = await base44.asServiceRole.entities.ClientExterne.list('-created_date', 1000).catch(() => []);
    const clientsWithPromoCode = new Set<string>();
    for (const c of allClients || []) {
      if (c.code_promo_utilise) {
        const key = buildClientKey(c.telephone_normalized || c.telephone, c.user_email);
        if (key) clientsWithPromoCode.add(key);
      }
    }

    // ── 8. Attribuer chaque 1ère course à une source ──
    const firstCoursesBySource: Record<string, number> = { meta_ads: 0, reactivation: 0, parrainage: 0, organique: 0 };
    const firstCoursesByMetaCampaign = new Map<string, number>();

    for (const course of firstCourses) {
      const clientKey = buildClientKey(course.client_phone_normalized || course.client_telephone, course.client_user_email);
      const { source, source_id } = attributeClientSource(
        clientKey,
        course.client_user_email,
        installsByEmail,
        convertedScenarioClientKeys,
        clientsWithPromoCode,
        utmCampaignToMetaCampaignId
      );

      firstCoursesBySource[source] = (firstCoursesBySource[source] || 0) + 1;
      if (source === 'meta_ads' && source_id) {
        firstCoursesByMetaCampaign.set(source_id, (firstCoursesByMetaCampaign.get(source_id) || 0) + 1);
      }
    }

    // ── 9. Calculer les CAC par canal ──
    const cacMeta = firstCoursesBySource.meta_ads > 0 ? Math.round(acquisitionSpend / firstCoursesBySource.meta_ads) : null;
    const cacReactivation = firstCoursesBySource.reactivation > 0 ? Math.round(reactivationSpend / firstCoursesBySource.reactivation) : null;
    const cacParrainage = firstCoursesBySource.parrainage > 0 ? Math.round(primesSpend / firstCoursesBySource.parrainage) : null;
    const cacGlobal = firstCourses.length > 0 ? Math.round(totalSpend / firstCourses.length) : null;

    // ── 10. Calculer le revenu et les commissions attribués ──
    const totalRevenue = firstCourses.reduce((sum, c) => sum + (c.prix_final || 0), 0);
    const totalCommission = firstCourses.reduce((sum, c) => sum + (c.commission_silga || 0), 0);

    // ── 11. Mettre à jour les GrowthExperiment actives ──
    const experiments = await base44.asServiceRole.entities.GrowthExperiment.filter(
      { status: ['active', 'paused', 'completed'] },
      '-created_date', 50
    ).catch(() => []);

    for (const exp of experiments || []) {
      if (exp.status !== 'active') continue;

      const activatedAt = exp.activated_at ? new Date(exp.activated_at).getTime() : Date.now();
      const observationDays = Math.floor((Date.now() - activatedAt) / 86400000);

      // Dépenses Meta pour cette campagne
      let expSpend = 0;
      if (exp.meta_campaign_id) {
        for (const spend of growthSpends) {
          if (spend.statut === 'annulee') continue;
          if (spend.reference_id === exp.meta_campaign_id || spend.campagne_id === exp.meta_campaign_id) {
            const spendTs = spend.date_depense ? new Date(spend.date_depense).getTime() : 0;
            if (spendTs >= start && spendTs <= end) {
              expSpend += normalizeAmountToFcfa(spend);
            }
          }
        }
      }

      // 1ères courses attribuées à cette campagne
      const expFirstCourses = exp.meta_campaign_id ? (firstCoursesByMetaCampaign.get(exp.meta_campaign_id) || 0) : 0;
      const expCac = expFirstCourses > 0 ? Math.round(expSpend / expFirstCourses) : null;

      const performanceStatus = computeExperimentStatus(
        { observation_days: observationDays, first_courses: expFirstCourses, spend_fcfa: expSpend, cac_first_course_fcfa: expCac },
        cacTargetFcfa
      );
      const sampleSufficient = expFirstCourses >= 3 && observationDays >= 14;

      await base44.asServiceRole.entities.GrowthExperiment.update(exp.id, {
        spend_fcfa: expSpend,
        first_courses: expFirstCourses,
        cac_first_course_fcfa: expCac,
        observation_days: observationDays,
        performance_status: performanceStatus,
        sample_sufficient: sampleSufficient,
      }).catch(() => {});

      // ── Per-experiment budget cap: auto-pause si budget atteint ──
      if (expSpend >= exp.budget_test_fcfa && exp.status === 'active') {
        await base44.asServiceRole.entities.GrowthExperiment.update(exp.id, {
          status: 'paused',
        }).catch(() => {});

        if (exp.meta_campaign_id) {
          try {
            await base44.asServiceRole.functions.invoke('manageMetaCampaign', {
              action: 'pause_campaign',
              campaign_id: exp.meta_campaign_id,
            });
          } catch (e) {
            // Non-bloquant: la campagne Meta peut déjà être en pause
          }
        }

        await base44.asServiceRole.entities.GrowthDecision.create({
          decision_type: 'pause_experiment',
          status: 'executed',
          trigger_rule: 'experiment_budget_cap_reached',
          trigger_metrics: JSON.stringify({
            experiment_id: exp.id,
            experiment_name: exp.name,
            spend_fcfa: expSpend,
            budget_test_fcfa: exp.budget_test_fcfa,
          }),
          recommended_action: `Expérience auto-stoppée: ${expSpend}/${exp.budget_test_fcfa} FCFA consommés`,
          action_payload: JSON.stringify({ experiment_id: exp.id, meta_campaign_id: exp.meta_campaign_id }),
          autopilot_cycle_id: `budget-cap-${Date.now()}`,
        }).catch(() => {});
      }
    }

    // ── 12. Écrire le GrowthMetricsCache dans AppConfig ──
    const metricsCache = {
      last_updated_at: now,
      period: label,
      cac_target_fcfa: cacTargetFcfa,
      budget: {
        total_cap: parseInt(getConfigValue(configs, 'GROWTH_TOTAL_BUDGET_PER_MONTH') || '30000') || 30000,
        acquisition_cap: parseInt(getConfigValue(configs, 'GROWTH_BUDGET_ACQUISITION_PER_MONTH') || '20000') || 20000,
        primes_cap: parseInt(getConfigValue(configs, 'GROWTH_BUDGET_PRIMES_PER_MONTH') || '5000') || 5000,
        reactivation_cap: parseInt(getConfigValue(configs, 'GROWTH_BUDGET_REACTIVATION_PER_MONTH') || '3000') || 3000,
        acquisition_spent: acquisitionSpendAutopilote,
        acquisition_spent_total: acquisitionSpendTotal,
        primes_spent: primesSpend,
        reactivation_spent: reactivationSpend,
        total_spent: totalSpend,
      },
      acquisition: {
        installs_this_month: (allInstalls || []).filter((i: any) => {
          const ts = i.first_opened_at ? new Date(i.first_opened_at).getTime() : 0;
          return ts >= start && ts <= end;
        }).length,
        first_courses_this_month: firstCourses.length,
        second_courses_this_month: secondCourses.length,
      },
      cac_by_channel: {
        meta_ads: {
          spend_fcfa_autopilote: acquisitionSpendAutopilote,
          spend_fcfa_total: acquisitionSpendTotal,
          first_courses_attributed: firstCoursesBySource.meta_ads,
          cac_first_course_fcfa: cacMeta,
        },
        reactivation: {
          spend_fcfa: reactivationSpend,
          clients_reactivated: firstCoursesBySource.reactivation,
          cost_per_reactivation_fcfa: cacReactivation,
        },
        parrainage: {
          spend_fcfa: primesSpend,
          first_courses_attributed: firstCoursesBySource.parrainage,
          cac_first_course_fcfa: cacParrainage,
        },
        global: {
          spend_fcfa: totalSpend,
          first_courses_total: firstCourses.length,
          cac_first_course_fcfa: cacGlobal,
        },
      },
      revenue: {
        attributed_revenue_fcfa: totalRevenue,
        attributed_commission_fcfa: totalCommission,
        commission_to_spend_ratio: totalSpend > 0 ? Number((totalCommission / totalSpend).toFixed(4)) : 0,
      },
    };

    const existingCache = configs.find(c => c.cle === 'GROWTH_METRICS_CACHE');
    if (existingCache) {
      await base44.asServiceRole.entities.AppConfig.update(existingCache.id, { valeur: JSON.stringify(metricsCache) });
    } else {
      await base44.asServiceRole.entities.AppConfig.create({
        cle: 'GROWTH_METRICS_CACHE',
        valeur: JSON.stringify(metricsCache),
        description: 'Cache des métriques Growth calculé par collectGrowthMetrics (mis à jour 1×/jour)',
      });
    }

    return Response.json({ success: true, metrics_cache: metricsCache });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}