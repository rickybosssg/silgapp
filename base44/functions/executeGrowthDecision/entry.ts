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
      // Créer la GrowthExperiment
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
        proposed_by: 'autopilote',
        proposed_at: now,
        proposal_rationale: actionPayload.rationale || decision.recommended_action,
        approved_by: user.email,
        approved_at: now,
        source_decision_id: decision_id,
        phase: actionPayload.phase || 'exploration',
      });

      await base44.asServiceRole.entities.GrowthDecision.update(decision_id, {
        status: 'executed',
        executed_at: now,
        execution_result: JSON.stringify({
          experiment_id: experiment.id,
          experiment_name: experiment.name,
          note: 'Expérience créée. L\'admin doit créer la campagne Meta Ads en PAUSED avec ces paramètres, puis linker le meta_campaign_id à l\'expérience.',
        }),
        experiment_id: experiment.id,
      });

      return Response.json({
        success: true,
        experiment_id: experiment.id,
        message: 'Expérience créée. Créez la campagne Meta Ads en PAUSED avec les paramètres fournis, puis linkez le meta_campaign_id.',
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