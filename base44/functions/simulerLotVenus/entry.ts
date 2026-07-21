import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { simulerMessage } from '../../shared/venusSimulatorEngine.ts';

/**
 * Tests par lot VENUS — Mode dry-run / 0 crédit.
 *
 * Exécute plusieurs questions en mode 0 crédit et retourne un rapport complet.
 * Aucune action réelle n'est exécutée.
 *
 * Paramètres :
 *   - questions (requis) : tableau de strings ou [{ message, telephone?, country_code? }]
 *   - country_code (optionnel) : code pays par défaut (défaut: BF)
 *   - telephone (optionnel) : téléphone par défaut
 *   - personality_key (optionnel) : personnalité du prompt à charger
 *
 * Retourne : { success, report, results }
 *   report = { total, reussis, taux_reussite, llm_calls, credits_estimes,
 *              questions_non_comprises, reponses_a_corriger }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Réservé aux administrateurs' }, { status: 403 });

    const body = await req.json();
    const { questions, country_code = 'BF', telephone = '+22670000000', personality_key } = body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return Response.json({ error: 'questions (array) requis' }, { status: 400 });
    }

    // Charger le prompt actif
    const actives = await base44.asServiceRole.entities.VenusBrainPrompt.filter(
      { personality_key: personality_key || 'standard', statut: 'active' }, '-date_creation', 1
    );
    const promptContent = actives?.[0]?.contenu || null;

    const results: any[] = [];
    let totalLLMCalls = 0;
    let totalCredits = 0;
    let successCount = 0;
    const misunderstood: any[] = [];
    const toFix: any[] = [];

    for (const q of questions) {
      const msg = typeof q === 'string' ? q : q.message;
      if (!msg || msg.trim().length < 2) continue;

      const qTel = typeof q === 'object' ? (q.telephone || telephone) : telephone;
      const qCountry = typeof q === 'object' ? (q.country_code || country_code) : country_code;

      const result = await simulerMessage(base44, {
        message: msg,
        telephone: qTel,
        country_code: qCountry,
        mode: 'zero_credit',
        contenu_prompt: promptContent,
      });

      results.push({
        question: msg,
        reponse: result.reponse,
        action: result.action_would_execute,
        intention: result.intention,
        confiance: result.confiance,
        llm_used: result.llm_used,
        credits: result.credits_estimated,
        pipeline: result.pipeline_steps,
        sources: result.sources,
      });

      totalLLMCalls += result.llm_calls;
      totalCredits += result.credits_estimated;
      if (result.confiance >= 50) successCount++;
      if (result.confiance < 50) {
        misunderstood.push({ question: msg, confiance: result.confiance, action: result.action_would_execute });
      }
      if (result.confiance < 80) {
        toFix.push({ question: msg, reponse: result.reponse.substring(0, 200), confiance: result.confiance });
      }
    }

    return Response.json({
      success: true,
      report: {
        total: results.length,
        reussis: successCount,
        taux_reussite: results.length > 0 ? Math.round((successCount / results.length) * 100) : 0,
        llm_calls: totalLLMCalls,
        credits_estimes: totalCredits,
        questions_non_comprises: misunderstood,
        reponses_a_corriger: toFix,
      },
      results,
    });
  } catch (error) {
    console.error('[simulerLotVenus] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});