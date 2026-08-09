import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Récupère les statistiques de consommation de crédits d'intégration
 * pour TOUT SILGAPP (pas seulement VENUS).
 *
 * Sources agrégées :
 * 1. IntegrationCreditLog — appels aux intégrations Base44 (InvokeLLM, GenerateImage, GenerateSpeech, etc.)
 * 2. VenusOpenAIUsage — appels directs à l'API OpenAI (gpt-4.1-mini, etc.)
 *
 * Retourne les stats combinées par période (1h, 24h, 7d, 30d).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

    let period = '24h';
    try {
      const body = await req.json();
      if (body?.period) period = body.period;
    } catch {
      // Body peut être vide — utiliser la valeur par défaut
    }

    const now = new Date();
    let since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    if (period === '7d') since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (period === '30d') since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (period === '1h') since = new Date(now.getTime() - 60 * 60 * 1000);

    // ── Source 1: IntegrationCreditLog (intégrations Base44 tracées via wrapper) ──
    const creditLogs = await base44.asServiceRole.entities.IntegrationCreditLog.list('-date_appel', 500);
    const filteredCreditLogs = (creditLogs || []).filter((l: any) => {
      const d = new Date(l.date_appel || l.created_date);
      return d >= since;
    });

    // ── Source 2: VenusMessageLog (tous les messages VENUS — contient les appels InvokeLLM réels) ──
    const messageLogs = await base44.asServiceRole.entities.VenusMessageLog.list('-date_traitement', 1000);
    const filteredMessageLogs = (messageLogs || []).filter((l: any) => {
      const d = new Date(l.date_traitement || l.created_date);
      return d >= since;
    });

    // ── Source 3: VenusOpenAIUsage (API OpenAI directe) ──
    const openAiLogs = await base44.asServiceRole.entities.VenusOpenAIUsage.list('-date_appel', 500);
    const filteredOpenAiLogs = (openAiLogs || []).filter((l: any) => {
      const d = new Date(l.date_appel || l.created_date);
      return d >= since;
    });

    // ── Agrégation IntegrationCreditLog (wrapper) + VenusMessageLog (appels réels) ──
    // VenusMessageLog contient TOUS les appels InvokeLLM via decision_moteur:
    //   rag_llm = Base44 InvokeLLM, fallback_base44 = OpenAI échoué → Base44 InvokeLLM
    //   openai = OpenAI direct (compté dans openaiStats), déterministes = 0 crédit
    const BASE44_DECISIONS = ['rag_llm', 'fallback_base44'];
    const base44FromMessages = filteredMessageLogs.filter((l: any) => BASE44_DECISIONS.includes(l.decision_moteur));

    const creditTotal = filteredCreditLogs.reduce((s: number, l: any) => s + (l.credits_estimated || 0), 0)
      + base44FromMessages.length; // chaque appel InvokeLLM = 1 crédit
    const creditCalls = filteredCreditLogs.length + base44FromMessages.length;
    const creditSuccess = filteredCreditLogs.filter((l: any) => l.status === 'success').length
      + base44FromMessages.filter((l: any) => l.statut === 'succes').length;
    const creditErrors = filteredCreditLogs.filter((l: any) => l.status === 'error').length
      + base44FromMessages.filter((l: any) => l.statut === 'erreur').length;
    const creditAvgMs = creditCalls > 0
      ? Math.round(
          (filteredCreditLogs.reduce((s: number, l: any) => s + (l.response_time_ms || 0), 0)
           + base44FromMessages.reduce((s: number, l: any) => s + (l.temps_reponse_ms || 0), 0))
          / creditCalls
        )
      : 0;

    // Par fonction source (IntegrationCreditLog + VenusMessageLog)
    const byFunction: Record<string, any> = {};
    for (const l of filteredCreditLogs) {
      const key = l.function_source || 'inconnu';
      if (!byFunction[key]) byFunction[key] = { calls: 0, credits: 0, errors: 0, totalMs: 0 };
      byFunction[key].calls++;
      byFunction[key].credits += l.credits_estimated || 0;
      if (l.status === 'error') byFunction[key].errors++;
      byFunction[key].totalMs += l.response_time_ms || 0;
    }
    // Ajouter les appels InvokeLLM depuis VenusMessageLog
    for (const l of base44FromMessages) {
      const key = `VENUS (${l.decision_moteur === 'rag_llm' ? 'RAG+LLM' : 'Fallback Base44'})`;
      if (!byFunction[key]) byFunction[key] = { calls: 0, credits: 0, errors: 0, totalMs: 0 };
      byFunction[key].calls++;
      byFunction[key].credits += 1;
      if (l.statut === 'erreur') byFunction[key].errors++;
      byFunction[key].totalMs += l.temps_reponse_ms || 0;
    }
    const functionStats = Object.entries(byFunction)
      .map(([name, s]: [string, any]) => ({ name, ...s, avgMs: Math.round(s.totalMs / s.calls) }))
      .sort((a, b) => b.credits - a.credits);

    // Par endpoint
    const byEndpoint: Record<string, any> = {};
    for (const l of filteredCreditLogs) {
      const key = l.endpoint || 'inconnu';
      if (!byEndpoint[key]) byEndpoint[key] = { calls: 0, credits: 0 };
      byEndpoint[key].calls++;
      byEndpoint[key].credits += l.credits_estimated || 0;
    }
    const endpointStats = Object.entries(byEndpoint).sort((a, b) => b[1].credits - a[1].credits);

    // ── Agrégation VenusOpenAIUsage ──
    const openaiCalls = filteredOpenAiLogs.length;
    const openaiSuccess = filteredOpenAiLogs.filter((l: any) => l.status === 'success').length;
    const openaiRetry = filteredOpenAiLogs.filter((l: any) => l.status === 'success_retry').length;
    const openaiFallback = filteredOpenAiLogs.filter((l: any) => l.status === 'fallback').length;
    const openaiErrors = filteredOpenAiLogs.filter((l: any) => l.status === 'error' || l.status === 'total_failure').length;
    const openaiEmpty = filteredOpenAiLogs.filter((l: any) => l.status === 'empty_response').length;
    const openaiCostUsd = filteredOpenAiLogs.reduce((s: number, l: any) => s + (l.cost_usd || 0), 0);
    const openaiTokens = filteredOpenAiLogs.reduce((s: number, l: any) => s + (l.tokens_total || 0), 0);
    const openaiAvgMs = openaiCalls > 0
      ? Math.round(filteredOpenAiLogs.reduce((s: number, l: any) => s + (l.response_time_ms || 0), 0) / openaiCalls)
      : 0;

    // Par modèle OpenAI
    const byModel: Record<string, any> = {};
    for (const l of filteredOpenAiLogs) {
      const key = l.model_used || 'inconnu';
      if (!byModel[key]) byModel[key] = { calls: 0, cost: 0, tokens: 0, errors: 0 };
      byModel[key].calls++;
      byModel[key].cost += l.cost_usd || 0;
      byModel[key].tokens += l.tokens_total || 0;
      if (l.status === 'error' || l.status === 'total_failure') byModel[key].errors++;
    }
    const modelStats = Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost);

    // ── Graphique horaire (24h) ──
    const hourlyData: Record<string, number> = {};
    for (let i = 23; i >= 0; i--) {
      const h = new Date(Date.now() - i * 60 * 60 * 1000);
      const key = `${String(h.getHours()).padStart(2, '0')}h`;
      hourlyData[key] = 0;
    }
    for (const l of filteredCreditLogs) {
      const d = new Date(l.date_appel || l.created_date);
      const h = String(d.getHours()).padStart(2, '0') + 'h';
      if (hourlyData[h] !== undefined) hourlyData[h] += l.credits_estimated || 0;
    }

    // ── Logs combinés récents ──
    const recentLogs = [
      ...filteredCreditLogs.map((l: any) => ({
        source: 'base44',
        date: l.date_appel || l.created_date,
        function_source: l.function_source || '',
        endpoint: l.endpoint || '',
        model_used: l.model_used || '',
        credits: l.credits_estimated || 0,
        response_time_ms: l.response_time_ms || 0,
        status: l.status || 'success',
        error_message: l.error_message || '',
        telephone: l.telephone || '',
        cost_usd: 0,
      })),
      ...base44FromMessages.map((l: any) => ({
        source: 'base44',
        date: l.date_traitement || l.created_date,
        function_source: `VENUS (${l.decision_moteur === 'rag_llm' ? 'RAG+LLM' : 'Fallback'})`,
        endpoint: 'InvokeLLM',
        model_used: l.model_utilise || 'base44-invoke-llm',
        credits: 1,
        response_time_ms: l.temps_reponse_ms || 0,
        status: l.statut === 'succes' ? 'success' : 'error',
        error_message: l.erreur_detail || '',
        telephone: l.telephone || '',
        cost_usd: 0,
      })),
      ...filteredOpenAiLogs.map((l: any) => ({
        source: 'openai',
        date: l.date_appel || l.created_date,
        function_source: 'VENUS (OpenAI direct)',
        endpoint: 'OpenAI Chat Completions',
        model_used: l.model_used || '',
        credits: 0,
        response_time_ms: l.response_time_ms || 0,
        status: l.status || 'success',
        error_message: l.error_message || '',
        telephone: l.telephone || '',
        cost_usd: l.cost_usd || 0,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 50);

    return Response.json({
      period,
      generated_at: new Date().toISOString(),
      summary: {
        total_credits: creditTotal,
        total_calls: creditCalls + openaiCalls,
        total_cost_usd: Math.round(openaiCostUsd * 10000) / 10000,
        success_count: creditSuccess + openaiSuccess,
        error_count: creditErrors + openaiErrors,
        error_rate: (creditCalls + openaiCalls) > 0
          ? (((creditErrors + openaiErrors) / (creditCalls + openaiCalls)) * 100).toFixed(1)
          : '0',
        avg_response_ms: (creditCalls + openaiCalls) > 0
          ? Math.round((creditAvgMs * creditCalls + openaiAvgMs * openaiCalls) / (creditCalls + openaiCalls))
          : 0,
      },
      base44_integrations: {
        total_credits: creditTotal,
        total_calls: creditCalls,
        success: creditSuccess,
        errors: creditErrors,
        avg_response_ms: creditAvgMs,
        by_function: functionStats,
        by_endpoint: endpointStats,
      },
      openai_direct: {
        total_calls: openaiCalls,
        success: openaiSuccess,
        success_retry: openaiRetry,
        fallbacks: openaiFallback,
        errors: openaiErrors,
        empty_response: openaiEmpty,
        cost_usd: Math.round(openaiCostUsd * 10000) / 10000,
        total_tokens: openaiTokens,
        avg_response_ms: openaiAvgMs,
        by_model: modelStats,
      },
      hourly: hourlyData,
      recent_logs: recentLogs,
    });
  } catch (error) {
    console.error('[getCreditStats] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});