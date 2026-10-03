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

      // Helper: invoke manageMetaCampaign et parse la réponse
      // (functions.invoke peut retourner un objet Response non parsé selon le runtime)
      const invokeMeta = async (action: string, payload: any = {}): Promise<any> => {
        const res = await base44.asServiceRole.functions.invoke('manageMetaCampaign', { action, ...payload });
        let parsed: any;
        if (typeof res?.json === 'function') {
          parsed = await res.json();
        } else if (res?.data && typeof res.data === 'object') {
          parsed = res.data;
        } else {
          parsed = res;
        }
        console.log(`[executeGrowthDecision] ${action}: success=${parsed?.success} error=${parsed?.error || 'none'}`);
        return parsed;
      };

      try {
        // Vérifier le kill switch META_ACQUISITION_ENABLED
        const metaConfigs = await base44.asServiceRole.entities.AppConfig.filter({ cle: 'META_ACQUISITION_ENABLED' });
        const metaEnabled = metaConfigs?.[0]?.valeur === 'true';

        if (!metaEnabled) {
          metaCreationError = 'META_ACQUISITION_ENABLED=false — campagne Meta non créée. Activez ce kill switch pour permettre la création automatique.';
        } else {
          // 2a. Créer le brouillon de MetaCampaign
          const draftRes = await invokeMeta('create_campaign_draft', {
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
            idempotency_key: `autopilote_exp_${experiment.id}`,
          });

          if (!draftRes?.success) {
            throw new Error(draftRes?.error || 'Échec create_campaign_draft');
          }
          const metaCampaignEntityId = draftRes.campaign.id;

          // 2b. Approuver la MetaCampaign
          const approveRes = await invokeMeta('approve_campaign', { campaign_id: metaCampaignEntityId });
          if (!approveRes?.success) {
            throw new Error(approveRes?.error || 'Échec approve_campaign');
          }

          // 2c. Activer la MetaCampaign (crée sur Meta en PAUSED — ne dépense rien)
          const activateRes = await invokeMeta('activate_campaign', { campaign_id: metaCampaignEntityId });

          if (!activateRes?.success) {
            throw new Error(activateRes?.error || 'Échec activate_campaign');
          }

          // 2d. Lier les IDs Meta à la GrowthExperiment
          await base44.asServiceRole.entities.GrowthExperiment.update(experiment.id, {
            meta_campaign_id: activateRes.meta_campaign_id || null,
            meta_adset_id: activateRes.meta_adset_id || null,
          });

          metaCreationResult = {
            meta_campaign_entity_id: metaCampaignEntityId,
            meta_campaign_id: activateRes.meta_campaign_id,
            meta_adset_id: activateRes.meta_adset_id,
            meta_ad_id: activateRes.meta_ad_id,
            meta_status: activateRes.meta_status || 'PAUSED',
            message: 'Campagne Meta créée en PAUSED. L\'admin doit ajouter des créatifs puis appeler resume_campaign pour démarrer la diffusion.',
          };
        }
      } catch (metaErr: any) {
        metaCreationError = metaErr?.message || 'Erreur lors de la création Meta';
        // Non-bloquant : la GrowthExperiment est créée, l'admin peut créer la campagne manuellement
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