/**
 * ═══════════════════════════════════════════════════════════════════
 * TRACKER OPENAI VENUS — Logging des appels API pour le tableau de bord
 * ═══════════════════════════════════════════════════════════════════
 *
 * Enregistre chaque appel OpenAI (succès, fallback, erreur) dans l'entité
 * VenusOpenAIUsage pour permettre le suivi en temps réel :
 * - Nombre de conversations traitées
 * - Temps moyen de réponse
 * - Coût journalier et mensuel
 * - Nombre de bascules vers le moteur de secours (fallback)
 * - Nombre d'erreurs OpenAI
 */

// ── Tarifs OpenAI (USD par 1M tokens) ──
// Source: https://openai.com/api/pricing/
const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1': { input: 2.00, output: 8.00 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-5-mini': { input: 0.25, output: 2.00 },
  'gpt-5': { input: 1.25, output: 10.00 },
};

/**
 * Calcule le coût USD d'un appel OpenAI basé sur le modèle et les tokens.
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = OPENAI_PRICING[model] || OPENAI_PRICING['gpt-4.1-mini'];
  const cost =
    (promptTokens / 1_000_000) * pricing.input +
    (completionTokens / 1_000_000) * pricing.output;
  return Math.round(cost * 10000) / 10000; // 4 décimales
}

/**
 * Log un appel OpenAI dans l'entité VenusOpenAIUsage.
 * Fire-and-safe : n'échoue jamais silencieusement (catch interne).
 */
/**
 * Log COMPLET d'un message WhatsApp traite par VENUS.
 * Enregistre chaque message avec la decision du moteur, le modele utilise,
 * les documents RAG, les outils, le temps, le cout et la reponse finale.
 *
 * Fire-and-safe : catch interne, n'echoue jamais.
 * Non-bloquant : a appeler SANS await (fire-and-forget).
 */
export async function loggerMessageVenus(
  base44: any,
  data: {
    telephone: string;
    conversation_id?: string;
    message_client: string;
    decision_moteur: string;
    openai_appele: boolean;
    model_utilise?: string;
    rag_documents?: any[];
    outils_utilises?: string[];
    temps_reponse_ms: number;
    cout_usd?: number;
    tokens_total?: number;
    reponse_envoyee: string;
    intention?: string;
    action?: string;
    confiance?: number;
    statut: 'succes' | 'erreur';
    erreur_detail?: string;
  }
): Promise<void> {
  try {
    await base44.asServiceRole.entities.VenusMessageLog.create({
      date_traitement: new Date().toISOString(),
      telephone: data.telephone || '',
      conversation_id: data.conversation_id || '',
      message_client: (data.message_client || '').substring(0, 2000),
      decision_moteur: data.decision_moteur,
      openai_appele: data.openai_appele ?? false,
      model_utilise: data.model_utilise || '',
      rag_documents: data.rag_documents ? JSON.stringify(data.rag_documents).substring(0, 4000) : '',
      outils_utilises: data.outils_utilises ? JSON.stringify(data.outils_utilises).substring(0, 2000) : '',
      temps_reponse_ms: data.temps_reponse_ms || 0,
      cout_usd: data.cout_usd || 0,
      tokens_total: data.tokens_total || 0,
      reponse_envoyee: (data.reponse_envoyee || '').substring(0, 2000),
      intention: data.intention || '',
      action: data.action || '',
      confiance: data.confiance ?? 0,
      statut: data.statut,
      erreur_detail: (data.erreur_detail || '').substring(0, 500),
    });
  } catch (e: any) {
    console.warn('[MessageLogger] Erreur logging message:', e.message);
  }
}

export async function logOpenAIUsage(
  base44: any,
  data: {
    model: string;
    tokens_prompt: number;
    tokens_completion: number;
    tokens_total: number;
    response_time_ms: number;
    status: 'success' | 'fallback' | 'error';
    error_message?: string;
    conversation_id?: string;
    telephone?: string;
    tools_used?: string;
  }
): Promise<void> {
  try {
    const cost_usd = calculateCost(
      data.model,
      data.tokens_prompt,
      data.tokens_completion
    );
    await base44.asServiceRole.entities.VenusOpenAIUsage.create({
      date_appel: new Date().toISOString(),
      model_used: data.model,
      tokens_prompt: data.tokens_prompt || 0,
      tokens_completion: data.tokens_completion || 0,
      tokens_total: data.tokens_total || 0,
      cost_usd,
      response_time_ms: data.response_time_ms || 0,
      status: data.status,
      error_message: (data.error_message || '').substring(0, 500),
      conversation_id: data.conversation_id || '',
      telephone: data.telephone || '',
      tools_used: data.tools_used || '',
    });
  } catch (e: any) {
    console.warn('[OpenAITracker] Erreur logging usage:', e.message);
  }
}