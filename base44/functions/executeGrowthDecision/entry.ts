import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getConfigValue, checkGrowthBudget } from '../../shared/growthBudgetGuard.ts';

// ═══════════════════════════════════════════════════════════════════════════
// executeGrowthDecision — Exécute une décision approuvée par l'admin
// ═══════════════════════════════════════════════════════════════════════════
//
// RÔLE : Exécuter une GrowthDecision après validation admin.
//
// Actions V1 :
//   - create_experiment : crée une GrowthExperiment (status=approved).
//     NE crée PAS la campagne Meta — l'admin doit la créer manuellement
//     avec les paramètres fournis, puis linker le meta_campaign_id.
//   - pause_experiment : met en pause la campagne Meta (via manageMetaCampaign)
//     et met à jour le statut GrowthExperiment=paused.
//   - complete_experiment : marque la GrowthExperiment comme completed.
//
// Vérifie le circuit breaker avant toute action impliquant une dépense.
// NE MODIFIE PAS : Dispatch V2, finance livreur, tarification, paiements.
// ═══════════════════════════════════════════════════════════════════════════

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    const { decision_id } = await req.json();
    if (!decision_id) {
      return Response.json({ error: 'decision_id requis' }, { status: 400 });
    }

    // ── Lire la décision ──
    const decision = await base44.asServiceRole.entities.GrowthDecision.get(decision_id);
    if (!decision) {
      return Response.json({ error: 'Décision introuvable' }, { status: 404 });
    }

    if (decision.status !== 'approved') {
      return Response.json({ error: `Décision non approuvée (statut: ${decision.status})` }, { status: 400 });
    }

    // ── Vérifier le circuit breaker pour les actions avec dépense ──
    if (decision.decision_type === 'create_experiment' || decision.decision_type === 'increase_experiment_budget') {
      const budgetCheck = await checkGrowthBudget(base44);
      if (budgetCheck.channels.acquisition.exceeded || budgetCheck.global.exceeded) {
        await base44.asServiceRole.entities.GrowthDecision.update(decision_id, {
          status: 'auto_blocked_budget',
          execution_error: 'Budget acquisition dépassé — action bloquée par le circuit breaker',
        });
        return Response.json({ error: 'Budget acquisition dépassé — action bloquée', budget_check: budgetCheck }, { status: 403 });
      }
    }

    const now = new Date().toISOString();
    const actionPayload = decision.action_payload ? JSON.parse(decision.action_payload) : {};

    // ── Exécuter selon le type de décision ──
    if (decision.decision_type === 'create_experiment') {
      // ── Vérifier qu'aucune expérience active n'existe déjà ──
      const activeExperiments = await base44.asServiceRole.entities.GrowthExperiment.filter(
        { status: 'active' }
      ).catch(() => []);

      if (activeExperiments && activeExperiments.length > 0) {
        return Response.json({
          error: `Une expérience est déjà active (${activeExperiments[0].name}). Une seule expérience à la fois est autorisée en V1.`,
        }, { status: 400 });
      }

      // ── Étape 1 : Créer la GrowthExperiment ──
      const experiment = await base44.asServiceRole.entities.GrowthExperiment.create({
        name: actionPayload.name || `Test ${Date.now()}`,
        status: 'approved',
        targeting_geo: actionPayload.targeting_geo || 'ouaga_centre',
        targeting_age_min: actionPayload.targeting_age_min || 25,
        targeting_age_max: actionPayload.targeting_age_max || 35,
        targeting_gender: actionPayload.targeting_gender || 'all',
        meta_objective: actionPayload.meta_objective || 'OUTCOME_APP_PROMOTION',
        message_angle: actionPayload.message_angle || 'rapidite',
        budget_test_fcfa: actionPayload.budget_test_fcfa || 3000,
        utm_campaign_name: actionPayload.utm_campaign_name || `silgapp_exp_${Date.now()}`,
        proposed_by: 'autopilote',
        proposed_at: now,
        proposal_rationale: actionPayload.rationale || decision.recommended_action,
        approved_by: user.email,
        approved_at: now,
        source_decision_id: decision_id,
        phase: actionPayload.phase || 'exploration',
      });

      // ── Étape 2 : Tenter la création automatique de la campagne Meta en PAUSED ──
      // Le moteur crée la campagne Meta en PAUSED via manageMetaCampaign.
      // Le moteur NE L'ACTIVE PAS (ne la met pas en ACTIVE) — seul l'admin peut le faire.
      let metaCreationResult: any = null;
      let metaCreationError: string | null = null;

      // ── Constantes Meta API (inline car functions.invoke appelle la version déployée) ──
      const META_API_BASE = 'https://graph.facebook.com/v25.0';
      const ALLOWED_AD_ACCOUNT_ID = '234850849367733';
      const META_USD_TO_FCFA_RATE = 600;
      const OUAGADOUGOU_CITY_KEY = '193625';

      try {
        // ── Lire les guardrails Meta ──
        const metaConfigs = await base44.asServiceRole.entities.AppConfig.filter({});
        const getMetaConfig = (key: string) => metaConfigs.find((c: any) => c.cle === key)?.valeur;
        const metaEnabled = getMetaConfig('META_ACQUISITION_ENABLED') === 'true';
        const adAccountLocked = getMetaConfig('META_AD_ACCOUNT_LOCKED') || ALLOWED_AD_ACCOUNT_ID;
        const allowedObjectives = JSON.parse(getMetaConfig('META_ALLOWED_OBJECTIVES') || '["OUTCOME_TRAFFIC"]');

        if (!metaEnabled) {
          metaCreationError = 'META_ACQUISITION_ENABLED=false — campagne Meta non créée.';
        } else if (!allowedObjectives.includes(experiment.meta_objective)) {
          metaCreationError = `Objectif non autorisé: ${experiment.meta_objective}`;
        } else if (adAccountLocked !== ALLOWED_AD_ACCOUNT_ID) {
          metaCreationError = 'Compte publicitaire non autorisé';
        } else {
          // ── 2a. Créer le brouillon MetaCampaign (avec lifetime_budget) ──
          const idempotencyKey = `autopilote_exp_${experiment.id}`;
          const existingDraft = await base44.asServiceRole.entities.MetaCampaign.filter({ idempotency_key: idempotencyKey });
          let metaCampaignEntity: any;

          if (existingDraft && existingDraft.length > 0) {
            metaCampaignEntity = existingDraft[0];
          } else {
            metaCampaignEntity = await base44.asServiceRole.entities.MetaCampaign.create({
              name: experiment.name,
              objective: experiment.meta_objective,
              lifetime_budget: experiment.budget_test_fcfa,
              creative_ids: null,
              country_codes: '["BF"]',
              target_audience: JSON.stringify({
                geo: experiment.targeting_geo,
                age_min: experiment.targeting_age_min,
                age_max: experiment.targeting_age_max,
                gender: experiment.targeting_gender,
                message_angle: experiment.message_angle,
              }),
              idempotency_key: idempotencyKey,
              status: 'draft',
            });
          }

          // ── 2b. Approuver la MetaCampaign ──
          if (metaCampaignEntity.status === 'draft' || metaCampaignEntity.status === 'pending_approval') {
            await base44.asServiceRole.entities.MetaCampaign.update(metaCampaignEntity.id, {
              status: 'approved',
              approved_by: user.email,
              approved_at: now,
            });
          }

          // ── 2c. Anti-recréation si meta_campaign_id déjà présent ──
          if (metaCampaignEntity.meta_campaign_id) {
            throw new Error(`Campagne déjà liée à Meta (${metaCampaignEntity.meta_campaign_id})`);
          }

          // ── 2d. Obtenir le token Meta Ads ──
          const { accessToken } = await base44.asServiceRole.connectors.getConnection('meta_ads');
          if (!accessToken) throw new Error('Token Meta Ads non disponible');

          const accountId = `act_${adAccountLocked}`;
          const budgetFcfa = experiment.budget_test_fcfa;
          const budgetUsdCents = Math.round((budgetFcfa / META_USD_TO_FCFA_RATE) * 100);

          // ── 2e. Créer la campagne sur Meta (PAUSED) ──
          const campaignRes = await fetch(`${META_API_BASE}/${accountId}/campaigns`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: experiment.name,
              objective: experiment.meta_objective,
              status: 'PAUSED',
              special_ad_categories: '[]',
              is_adset_budget_sharing_enabled: false,
            }),
          });
          const campaignData = await campaignRes.json();
          if (campaignData.error) throw new Error(`Meta campaign: ${campaignData.error.message}`);
          const metaCampaignId = campaignData.id;

          // ── 2f. Créer l'ad set sur Meta (PAUSED) avec daily_budget + end_time ──
          // 3000 FCFA / 5 jours = 600 FCFA/jour ($1.00/jour = 100 cents USD)
          // daily_budget limite le dépôt quotidien, end_time limite la durée totale.
          // Maximum absolu = 600 FCFA × 5 jours = 3000 FCFA.
          const dailyBudgetFcfa = Math.ceil(budgetFcfa / 5);
          const dailyBudgetUsdCents = Math.round((dailyBudgetFcfa / META_USD_TO_FCFA_RATE) * 100);

          const adsetRes = await fetch(`${META_API_BASE}/${accountId}/adsets`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `${experiment.name} - AdSet`,
              campaign_id: metaCampaignId,
              daily_budget: dailyBudgetUsdCents,
              billing_event: 'IMPRESSIONS',
              optimization_goal: experiment.meta_objective === 'OUTCOME_TRAFFIC' ? 'LINK_CLICKS' : 'APP_INSTALLS',
              bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
              targeting: {
                geo_locations: {
                  cities: [{ key: OUAGADOUGOU_CITY_KEY, radius: 25, distance_unit: 'kilometer' }],
                },
                age_min: experiment.targeting_age_min,
                age_max: experiment.targeting_age_max,
                genders: experiment.targeting_gender === 'female' ? [1] : [0],
                targeting_automation: { advantage_audience: 0 },
              },
              status: 'PAUSED',
              end_time: new Date(Date.now() + 5 * 86400000).toISOString(),
            }),
          });
          const adsetData = await adsetRes.json();
          if (adsetData.error) {
            // Nettoyer la campagne orpheline sur Meta si l'ad set échoue
            await fetch(`${META_API_BASE}/${metaCampaignId}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${accessToken}` },
            }).catch(() => {});
            throw new Error(`Meta adset: ${adsetData.error.message}`);
          }
          const metaAdsetId = adsetData.id;

          // ── 2g. Mettre à jour la MetaCampaign avec les IDs Meta ──
          await base44.asServiceRole.entities.MetaCampaign.update(metaCampaignEntity.id, {
            status: 'paused',
            meta_campaign_id: metaCampaignId,
            activated_at: now,
          });

          // ── 2h. Lier les IDs Meta à la GrowthExperiment ──
          await base44.asServiceRole.entities.GrowthExperiment.update(experiment.id, {
            meta_campaign_id: metaCampaignId,
            meta_adset_id: metaAdsetId,
          });

          // ── 2i. Logger l'action ──
          await base44.asServiceRole.entities.AcquisitionLog.create({
            action_type: 'campaign_activated',
            actor_email: user.email,
            target_type: 'meta_campaign',
            target_id: metaCampaignEntity.id,
            target_name: experiment.name,
            details: JSON.stringify({
              meta_campaign_id: metaCampaignId,
              adset_id: metaAdsetId,
              meta_status: 'PAUSED',
              budget_type: 'lifetime',
              lifetime_budget_fcfa: budgetFcfa,
              lifetime_budget_usd_cents: budgetUsdCents,
            }),
            action_date: now,
          }).catch(() => {});

          metaCreationResult = {
            meta_campaign_entity_id: metaCampaignEntity.id,
            meta_campaign_id: metaCampaignId,
            meta_adset_id: metaAdsetId,
            meta_ad_id: null,
            meta_status: 'PAUSED',
            budget_type: 'lifetime',
            lifetime_budget_fcfa: budgetFcfa,
            message: 'Campagne Meta créée en PAUSED avec lifetime_budget. L\'admin doit ajouter des créatifs puis appeler resume_campaign.',
          };
        }
      } catch (metaErr: any) {
        metaCreationError = metaErr?.message || 'Erreur lors de la création Meta';
      }

      await base44.asServiceRole.entities.GrowthDecision.update(decision_id, {
        status: 'executed',
        executed_at: now,
        execution_result: JSON.stringify({
          experiment_id: experiment.id,
          experiment_name: experiment.name,
          meta_creation: metaCreationResult,
          meta_creation_error: metaCreationError,
          note: metaCreationResult
            ? 'Expérience créée + campagne Meta créée en PAUSED. Ajoutez des créatifs puis resume_campaign.'
            : 'Expérience créée. Campagne Meta non créée automatiquement.',
        }),
        experiment_id: experiment.id,
      });

      return Response.json({
        success: true,
        experiment_id: experiment.id,
        meta_creation: metaCreationResult,
        meta_creation_error: metaCreationError,
        message: metaCreationResult
          ? 'Expérience créée + campagne Meta créée en PAUSED (aucune dépense). L\'admin doit ajouter des créatifs puis resume_campaign.'
          : 'Expérience créée. Campagne Meta non créée automatiquement.',
      });
    }

    if (decision.decision_type === 'pause_experiment') {
      const experimentId = actionPayload.experiment_id;
      const metaCampaignId = actionPayload.meta_campaign_id;

      // Mettre en pause la campagne Meta si elle existe
      if (metaCampaignId) {
        try {
          await base44.asServiceRole.functions.invoke('manageMetaCampaign', {
            action: 'pause_campaign',
            campaign_id: metaCampaignId,
          });
        } catch (metaErr: any) {
          // Non-bloquant : la campagne Meta peut déjà être en pause
          console.warn('[executeGrowthDecision] Meta pause error:', metaErr?.message);
        }
      }

      // Mettre à jour la GrowthExperiment
      if (experimentId) {
        await base44.asServiceRole.entities.GrowthExperiment.update(experimentId, {
          status: 'paused',
        }).catch(() => {});
      }

      await base44.asServiceRole.entities.GrowthDecision.update(decision_id, {
        status: 'executed',
        executed_at: now,
        execution_result: JSON.stringify({ experiment_id: experimentId, meta_campaign_id: metaCampaignId, action: 'paused' }),
        experiment_id: experimentId,
      });

      return Response.json({ success: true, experiment_id: experimentId, action: 'paused' });
    }

    if (decision.decision_type === 'complete_experiment') {
      const experimentId = actionPayload.experiment_id;

      if (experimentId) {
        await base44.asServiceRole.entities.GrowthExperiment.update(experimentId, {
          status: 'completed',
          completed_at: now,
        }).catch(() => {});
      }

      await base44.asServiceRole.entities.GrowthDecision.update(decision_id, {
        status: 'executed',
        executed_at: now,
        execution_result: JSON.stringify({ experiment_id: experimentId, action: 'completed' }),
        experiment_id: experimentId,
      });

      return Response.json({ success: true, experiment_id: experimentId, action: 'completed' });
    }

    return Response.json({ error: `Type de décision non supporté en V1: ${decision.decision_type}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}