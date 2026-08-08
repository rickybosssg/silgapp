// ── Wrapper de traçage des crédits d'intégration Base44 ──────────────────
// Toute fonction backend appelant une intégration Base44 (InvokeLLM, GenerateImage,
// GenerateSpeech, etc.) doit passer par ce wrapper pour que l'appel soit journalisé
// dans IntegrationCreditLog. Cela permet de suivre la consommation de crédits
// en temps réel via le tableau de bord admin.

const CREDIT_COSTS: Record<string, number> = {
  InvokeLLM: 1,
  GenerateImage: 1,
  GenerateSpeech: 1,
  GenerateVideo: 5,
  TranscribeAudio: 1,
  UploadFile: 0,
  UploadPrivateFile: 0,
  CreateFileSignedUrl: 0,
  SendEmail: 0,
  ExtractDataFromUploadedFile: 1,
};

const MODEL_MULTIPLIERS: Record<string, number> = {
  automatic: 1,
  gpt_5_mini: 1,
  gemini_3_flash: 1,
  gpt_5_4: 2,
  gpt_5_6_sol: 2,
  gpt_5_6_luna: 2,
  gemini_3_1_pro: 2,
  claude_sonnet_4_6: 3,
  claude_opus_4_6: 5,
  claude_opus_4_7: 5,
  claude_opus_4_8: 5,
  'claude-sonnet-5': 3,
};

export interface CreditLogOptions {
  function_source: string;
  endpoint: string;
  model?: string;
  telephone?: string;
  conversation_id?: string;
  country_code?: string;
  metadata?: Record<string, any>;
}

/**
 * Journalise un appel d'intégration Base44 dans IntegrationCreditLog.
 * Fire-and-forget — ne bloque jamais l'exécution.
 */
export async function logIntegrationCredit(base44: any, opts: CreditLogOptions, status: string, responseTimeMs: number, errorMessage?: string): Promise<void> {
  try {
    const baseCost = CREDIT_COSTS[opts.endpoint] ?? 1;
    const multiplier = opts.model ? (MODEL_MULTIPLIERS[opts.model] ?? 1) : 1;
    const credits = baseCost * multiplier;

    await base44.asServiceRole.entities.IntegrationCreditLog.create({
      date_appel: new Date().toISOString(),
      function_source: opts.function_source,
      endpoint: opts.endpoint,
      model_used: opts.model || '',
      credits_estimated: credits,
      response_time_ms: responseTimeMs,
      status: status === 'success' ? 'success' : 'error',
      error_message: errorMessage || '',
      telephone: opts.telephone || '',
      conversation_id: opts.conversation_id || '',
      country_code: opts.country_code || '',
      metadata: opts.metadata ? JSON.stringify(opts.metadata) : '',
    });
  } catch (e) {
    console.warn('[CreditLog] Erreur journalisation crédit:', e.message);
  }
}

/**
 * Wrapper pour InvokeLLM avec traçage automatique des crédits.
 * Utiliser à la place de base44.asServiceRole.integrations.Core.InvokeLLM.
 */
export async function invokeLLMTracked(base44: any, params: any, logOpts?: CreditLogOptions): Promise<any> {
  const t0 = Date.now();
  const opts = logOpts || { function_source: 'unknown', endpoint: 'InvokeLLM' };
  try {
    const client = base44.asServiceRole || base44;
    const result = await client.integrations.Core.InvokeLLM(params);
    const elapsed = Date.now() - t0;
    logIntegrationCredit(base44, {
      ...opts,
      endpoint: 'InvokeLLM',
      model: params.model || 'automatic',
    }, 'success', elapsed).catch(() => {});
    return result;
  } catch (e) {
    const elapsed = Date.now() - t0;
    logIntegrationCredit(base44, {
      ...opts,
      endpoint: 'InvokeLLM',
      model: params.model || 'automatic',
    }, 'error', elapsed, e.message).catch(() => {});
    throw e;
  }
}