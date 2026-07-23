import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Récupère les statistiques d'utilisation OpenAI pour le tableau de bord.
 * Admin only.
 *
 * Retourne:
 * - current_model: modèle actuellement configuré
 * - openai_enabled: interrupteur VENUS_OPENAI_ENABLED
 * - today: stats du jour (calls, avg_response_ms, cost_usd, fallbacks, errors, tokens)
 * - month: stats du mois
 * - recent_errors: 10 dernières erreurs/fallbacks
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

    // ── Config actuelle ──
    const configs = await base44.asServiceRole.entities.SystemConfig.filter({});
    const getConfig = (cle: string) => configs.find((c: any) => c.cle === cle)?.valeur;
    const openai_enabled = getConfig('VENUS_OPENAI_ENABLED') === 'true';
    const current_model = getConfig('VENUS_OPENAI_MODEL') || 'gpt-4.1-mini (défaut)';

    // ── Récupérer les records récents (max 1000) ──
    const records = await base44.asServiceRole.entities.VenusOpenAIUsage.list('-date_appel', 1000);

    // ── Filtrer par période ──
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const todayRecords = [];
    const monthRecords = [];
    const recentErrors = [];

    for (const r of records || []) {
      const date = new Date(r.date_appel || r.created_date);
      if (date >= todayStart) todayRecords.push(r);
      if (date >= monthStart) monthRecords.push(r);
      if ((r.status === 'error' || r.status === 'fallback') && recentErrors.length < 10) {
        recentErrors.push({
          date: r.date_appel,
          status: r.status,
          error: r.error_message || '',
          telephone: r.telephone || '',
          model: r.model_used,
          response_time_ms: r.response_time_ms,
        });
      }
    }

    // ── Agréger ──
    const aggregate = (recs: any[]) => {
      const calls = recs.length;
      const successCount = recs.filter(r => r.status === 'success').length;
      const fallbackCount = recs.filter(r => r.status === 'fallback').length;
      const errorCount = recs.filter(r => r.status === 'error').length;
      const totalTime = recs.reduce((sum, r) => sum + (r.response_time_ms || 0), 0);
      const totalCost = recs.reduce((sum, r) => sum + (r.cost_usd || 0), 0);
      const totalTokens = recs.reduce((sum, r) => sum + (r.tokens_total || 0), 0);
      const promptTokens = recs.reduce((sum, r) => sum + (r.tokens_prompt || 0), 0);
      const completionTokens = recs.reduce((sum, r) => sum + (r.tokens_completion || 0), 0);
      return {
        calls,
        success: successCount,
        fallbacks: fallbackCount,
        errors: errorCount,
        avg_response_ms: calls > 0 ? Math.round(totalTime / calls) : 0,
        cost_usd: Math.round(totalCost * 10000) / 10000,
        total_tokens: totalTokens,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
      };
    };

    return Response.json({
      current_model,
      openai_enabled,
      today: aggregate(todayRecords),
      month: aggregate(monthRecords),
      recent_errors: recentErrors,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});