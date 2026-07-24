/**
 * venusAgent — Backend function for VENUS Autonomous AI Agent
 *
 * Actions:
 *  - admin_question: Ask VENUS a business question (Q&A mode)
 *  - get_dashboard: Agent dashboard (recent actions, insights, recommendations)
 *  - get_actions: List agent actions (with filters)
 *  - get_insights: List business insights
 *  - get_recommendations: Generate prioritized recommendations
 *  - analyze_business: Run business analysis
 *  - get_strategic_memory: List strategic trends
 *  - get_decision_log: List decision logs (transparency)
 *  - explain_action: Explain a specific action
 *  - validate_action: Admin validates a proposed action
 *  - reject_action: Admin rejects a proposed action
 *  - propose_improvement: Suggest a knowledge improvement
 *  - init_default_rules: Initialize default automation rules
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  executeAgentLoop,
  proactiveSuggestion,
  explainDecision,
  proposeImprovement,
} from '../../shared/venusAgentEngine.ts';
import {
  analyzeBusinessMetrics,
  answerAdminQuestion,
  generateRecommendations,
  updateStrategicMemory,
} from '../../shared/venusAdvisorEngine.ts';
import { DEFAULT_RULES } from '../../shared/venusAutomationEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Accès admin requis' }, { status: 403 });

    const body = await req.json();
    const { action, ...params } = body;

    switch (action) {
      case 'admin_question': {
        const { question } = params;
        if (!question) return Response.json({ error: 'Question requise' }, { status: 400 });

        // Run agent loop in admin context
        await executeAgentLoop(base44, {
          source: 'admin',
          message: question,
          user_role: 'admin',
          user_email: user.email,
        });

        const answer = await answerAdminQuestion(base44, question);
        return Response.json({ success: true, ...answer });
      }

      case 'get_dashboard': {
        const recentActions = await base44.asServiceRole.entities.VenusAgentAction.list('-date_creation', 20);
        const pendingActions = await base44.asServiceRole.entities.VenusAgentAction.filter(
          { statut: 'proposee' }, '-date_creation', 10
        );
        const insights = await base44.asServiceRole.entities.VenusBusinessInsight.list('-date_creation', 10);
        const strategicMemory = await base44.asServiceRole.entities.VenusStrategicMemory.list('-date_maj', 20);
        const recentDecisions = await base44.asServiceRole.entities.VenusDecisionLog.list('-date_creation', 10);
        const rules = await base44.asServiceRole.entities.VenusAutomationRule.filter({ active: true });

        return Response.json({
          success: true,
          stats: {
            total_actions: recentActions.length,
            pending_validations: pendingActions.length,
            active_rules: rules.length,
            insights_count: insights.length,
            strategic_memories: strategicMemory.length,
          },
          pending_actions: pendingActions,
          recent_actions: recentActions.slice(0, 10),
          recent_insights: insights.slice(0, 5),
          strategic_memory: strategicMemory.slice(0, 10),
          recent_decisions: recentDecisions,
          active_rules: rules.length,
        });
      }

      case 'get_actions': {
        const { statut, type_action, limit } = params;
        const filter = {};
        if (statut) filter.statut = statut;
        if (type_action) filter.type_action = type_action;
        const actions = await base44.asServiceRole.entities.VenusAgentAction.filter(
          filter, '-date_creation', limit || 50
        );
        return Response.json({ success: true, actions });
      }

      case 'get_insights': {
        const { type_analyse, limit } = params;
        const filter = { statut: 'actif' };
        if (type_analyse) filter.type_analyse = type_analyse;
        const insights = await base44.asServiceRole.entities.VenusBusinessInsight.filter(
          filter, '-date_creation', limit || 50
        );
        return Response.json({ success: true, insights });
      }

      case 'get_recommendations': {
        const recommendations = await generateRecommendations(base44);
        return Response.json({ success: true, recommendations });
      }

      case 'analyze_business': {
        const { periode } = params;
        const insights = await analyzeBusinessMetrics(base44, periode || 'semaine');
        await updateStrategicMemory(base44);
        return Response.json({ success: true, insights, count: insights.length });
      }

      case 'get_strategic_memory': {
        const memories = await base44.asServiceRole.entities.VenusStrategicMemory.list('-date_maj', 50);
        return Response.json({ success: true, memories });
      }

      case 'get_decision_log': {
        const decisions = await base44.asServiceRole.entities.VenusDecisionLog.list('-date_creation', 50);
        return Response.json({ success: true, decisions });
      }

      case 'explain_action': {
        const { action_id } = params;
        const explanation = await explainDecision(base44, action_id);
        return Response.json({ success: true, ...explanation });
      }

      case 'validate_action': {
        const { action_id } = params;
        const act = await base44.asServiceRole.entities.VenusAgentAction.get(action_id);
        if (!act) return Response.json({ error: 'Action non trouvée' }, { status: 404 });

        await base44.asServiceRole.entities.VenusAgentAction.update(action_id, {
          statut: 'validee',
          valide_par: user.email,
          valide_date: new Date().toISOString(),
        });

        // Create audit log
        await base44.asServiceRole.entities.VenusAuditLog.create({
          utilisateur: user.email,
          role: user.role,
          action: 'validate',
          categorie: 'autre',
          entity_type: 'VenusAgentAction',
          entity_id: action_id,
          details: `Action validée: ${act.type_action}`,
          date_action: new Date().toISOString(),
        }).catch(() => {});

        return Response.json({ success: true, message: 'Action validée' });
      }

      case 'reject_action': {
        const { action_id, raison } = params;
        const act = await base44.asServiceRole.entities.VenusAgentAction.get(action_id);
        if (!act) return Response.json({ error: 'Action non trouvée' }, { status: 404 });

        await base44.asServiceRole.entities.VenusAgentAction.update(action_id, {
          statut: 'rejetee',
          valide_par: user.email,
          valide_date: new Date().toISOString(),
          resultat: raison || 'Rejetée par l\'admin',
        });

        return Response.json({ success: true, message: 'Action rejetée' });
      }

      case 'propose_improvement': {
        const { context } = params;
        const result = await proposeImprovement(base44, context || { source: 'admin', user_email: user.email });
        return Response.json({ success: true, ...result });
      }

      case 'init_default_rules': {
        const existingRules = await base44.asServiceRole.entities.VenusAutomationRule.list();
        const existingCodes = new Set(existingRules.map(r => r.code));
        const newRules = DEFAULT_RULES.filter(r => !existingCodes.has(r.code));

        for (const rule of newRules) {
          await base44.asServiceRole.entities.VenusAutomationRule.create({
            ...rule,
            active: true,
            nb_declenchements: 0,
            pays: 'ALL',
            cree_par: user.email,
            date_creation: new Date().toISOString(),
          });
        }

        return Response.json({
          success: true,
          message: `${newRules.length} règles par défaut créées`,
          created: newRules.length,
        });
      }

      case 'get_rules': {
        const rules = await base44.asServiceRole.entities.VenusAutomationRule.list('-date_creation', 50);
        return Response.json({ success: true, rules });
      }

      case 'toggle_rule': {
        const { rule_id, active } = params;
        await base44.asServiceRole.entities.VenusAutomationRule.update(rule_id, {
          active,
          date_modification: new Date().toISOString(),
        });
        return Response.json({ success: true, message: `Règle ${active ? 'activée' : 'désactivée'}` });
      }

      default:
        return Response.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    console.error('[venusAgent] Error:', error.message);
    return Response.json({ success: false, error: error.message });
  }
});