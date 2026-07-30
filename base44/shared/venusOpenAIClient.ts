/**
 * ═══════════════════════════════════════════════════════════════════
 * CLIENT OPENAI VENUS — Appels robustes avec retries et logs bruts
 * ═══════════════════════════════════════════════════════════════════
 *
 * Responsabilités :
 * 1. Extraction robuste du contenu depuis TOUS les formats de réponse OpenAI
 * 2. Retry automatique avec délai progressif (1s, 2s) sur erreurs transitoires
 * 3. Log de la réponse JSON brute (PII masquée) pour diagnostic admin
 * 4. Métadonnées structurées : http_status, retry_count, tokens, temps
 *
 * Formats supportés :
 * - Chat Completions : choices[0].message.content
 * - Legacy Completions : choices[0].text
 * - Responses API : output_text
 * - Responses API (structured) : output[].content[].text
 * ═══════════════════════════════════════════════════════════════════
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// ── Timeouts réduits pour limiter la latence (était 45s → 25s) ──
export const OPENAI_TIMEOUT_MS = 25000;
export const OPENAI_RETRY_TIMEOUT_MS = 20000;
const RETRY_DELAYS_MS = [1000, 2000]; // 1s puis 2s
const MAX_RETRIES = 2; // 2 retries = 3 tentatives total

export interface OpenAICallResult {
  success: boolean;
  content: string;
  rawResponse: any;
  httpStatus: number;
  retryCount: number;
  tokens: { prompt: number; completion: number; total: number };
  responseTimeMs: number;
  errorMessage: string;
  errorKind: 'none' | 'timeout' | 'http_error' | 'rate_limit' | 'empty' | 'network' | 'parse';
}

/**
 * Extrait le contenu texte d'une réponse OpenAI, quel que soit le format.
 * Vérifie TOUS les formats possibles avant de déclarer la réponse vide.
 */
export function extraireContenuOpenAI(data: any): string {
  if (!data) return '';

  // Format 1 : Chat Completions — choices[0].message.content
  const chatContent = data.choices?.[0]?.message?.content;
  if (typeof chatContent === 'string' && chatContent.trim().length > 0) {
    return chatContent;
  }

  // Format 2 : Legacy Completions — choices[0].text
  const legacyText = data.choices?.[0]?.text;
  if (typeof legacyText === 'string' && legacyText.trim().length > 0) {
    return legacyText;
  }

  // Format 3 : Responses API — output_text (string direct)
  if (typeof data.output_text === 'string' && data.output_text.trim().length > 0) {
    return data.output_text;
  }

  // Format 4 : Responses API structurée — output[].content[].text
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (typeof c?.text === 'string' && c.text.trim().length > 0) {
            return c.text;
          }
        }
      }
      // Variante : output[].message.content
      if (typeof item?.message?.content === 'string' && item.message.content.trim().length > 0) {
        return item.message.content;
      }
    }
  }

  return '';
}

/**
 * Masque les données sensibles (PII) dans un texte pour les logs admin.
 * - Numéros de téléphone → [TEL]
 * - Emails → [EMAIL]
 * - Coordonnées GPS → [GPS]
 */
export function masquerPII(text: string): string {
  if (!text) return '';
  let masked = text;
  // Numéros de téléphone (format international ou local groupé, 8+ chiffres)
  masked = masked.replace(/\+?\d[\d\s.-]{7,}\d/g, '[TEL]');
  // Emails
  masked = masked.replace(/[\w.+-]+@[\w.-]+\.\w{2,}/g, '[EMAIL]');
  // Coordonnées GPS (décimales avec 4+ décimales)
  masked = masked.replace(/-?\d{1,3}\.\d{4,}/g, '[GPS]');
  return masked.substring(0, 3000);
}

/**
 * Fetch avec timeout via AbortController.
 */
async function fetchAvecTimeout(
  url: string,
  options: any,
  timeoutMs: number
): Promise<{ response: Response; timedOut: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return { response, timedOut: false };
  } catch (e: any) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      return { response: null as any, timedOut: true };
    }
    throw e;
  }
}

/**
 * Effectue UN appel OpenAI et retourne un résultat structuré.
 * Ne gère PAS les retries — c'est `appelerOpenAIAvecRetry` qui s'en charge.
 */
async function appelerOpenAIUneFois(
  apiKey: string,
  body: any,
  timeoutMs: number
): Promise<OpenAICallResult> {
  const start = Date.now();
  try {
    const { response, timedOut } = await fetchAvecTimeout(
      OPENAI_API_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      timeoutMs
    );

    if (timedOut || !response) {
      return {
        success: false, content: '', rawResponse: null,
        httpStatus: 0, retryCount: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
        responseTimeMs: Date.now() - start,
        errorMessage: `OpenAI: timeout après ${timeoutMs}ms`,
        errorKind: 'timeout',
      };
    }

    const httpStatus = response.status;
    const rawText = await response.text();

    // Erreur HTTP (4xx/5xx)
    if (!response.ok) {
      let rawResponse: any = null;
      try { rawResponse = JSON.parse(rawText); } catch { rawResponse = { raw: rawText.substring(0, 500) }; }
      const errorKind = httpStatus === 429 ? 'rate_limit' : 'http_error';
      return {
        success: false, content: '', rawResponse,
        httpStatus, retryCount: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
        responseTimeMs: Date.now() - start,
        errorMessage: `OpenAI API ${httpStatus}: ${rawText.substring(0, 300)}`,
        errorKind,
      };
    }

    // Succès HTTP — parser et extraire le contenu
    let rawResponse: any;
    try { rawResponse = JSON.parse(rawText); } catch {
      return {
        success: false, content: '', rawResponse: { raw: rawText.substring(0, 500) },
        httpStatus, retryCount: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
        responseTimeMs: Date.now() - start,
        errorMessage: 'OpenAI: réponse JSON non parsable',
        errorKind: 'parse',
      };
    }

    const content = extraireContenuOpenAI(rawResponse);
    const usage = rawResponse.usage || {};

    if (!content || content.trim().length === 0) {
      return {
        success: false, content: '', rawResponse,
        httpStatus, retryCount: 0,
        tokens: {
          prompt: usage.prompt_tokens || 0,
          completion: usage.completion_tokens || 0,
          total: usage.total_tokens || 0,
        },
        responseTimeMs: Date.now() - start,
        errorMessage: 'OpenAI: réponse vide dans le JSON',
        errorKind: 'empty',
      };
    }

    return {
      success: true, content, rawResponse,
      httpStatus, retryCount: 0,
      tokens: {
        prompt: usage.prompt_tokens || 0,
        completion: usage.completion_tokens || 0,
        total: usage.total_tokens || 0,
      },
      responseTimeMs: Date.now() - start,
      errorMessage: '',
      errorKind: 'none',
    };
  } catch (e: any) {
    const isNetwork = e.message?.includes('fetch') || e.message?.includes('network') ||
      e.message?.includes('connection') || e.name === 'TypeError';
    return {
      success: false, content: '', rawResponse: null,
      httpStatus: 0, retryCount: 0,
      tokens: { prompt: 0, completion: 0, total: 0 },
      responseTimeMs: Date.now() - start,
      errorMessage: e.message || 'Erreur réseau',
      errorKind: isNetwork ? 'network' : 'http_error',
    };
  }
}

/**
 * Appelle OpenAI avec retries automatiques à délai progressif.
 *
 * Stratégie :
 * - Tentative 1 (timeout 25s)
 * - Si échec transitoire (timeout, 500, 429, réseau, vide) → attendre 1s
 * - Tentative 2 (timeout 20s)
 * - Si échec → attendre 2s
 * - Tentative 3 (timeout 20s, avec reasoning_effort bumpé si GPT-5)
 * - Si tout échoue → retourne errorKind pour fallback InvokeLLM
 *
 * @param apiKey  Clé API OpenAI
 * @param body    Corps de la requête (model, messages, tools, etc.)
 * @param opts    Options: { bumpReasoningOnRetry, conversationId, telephone }
 */
export async function appelerOpenAIAvecRetry(
  apiKey: string,
  body: any,
  opts: {
    bumpReasoningOnRetry?: boolean;
    conversationId?: string;
    telephone?: string;
  } = {}
): Promise<OpenAICallResult> {
  let lastResult: OpenAICallResult | null = null;
  const isGpt5 = (body.model || '').startsWith('gpt-5');

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const retryCount = attempt;
    const timeoutMs = attempt === 0 ? OPENAI_TIMEOUT_MS : OPENAI_RETRY_TIMEOUT_MS;

    // Bumper reasoning_effort sur le dernier retry pour GPT-5 (contenu vide fréquent)
    const adjustedBody = { ...body };
    if (attempt === MAX_RETRIES && opts.bumpReasoningOnRetry && isGpt5) {
      adjustedBody.reasoning_effort = 'medium';
    }

    const result = await appelerOpenAIUneFois(apiKey, adjustedBody, timeoutMs);
    result.retryCount = retryCount;

    if (result.success) {
      result.retryCount = retryCount;
      console.log(
        `[OpenAIClient] ✅ Tentative ${attempt + 1}/${MAX_RETRIES + 1} réussie` +
        `${attempt > 0 ? ` (après ${attempt} retry${attempt > 1 ? 's' : ''})` : ''}` +
        ` | ${result.responseTimeMs}ms | tokens: ${result.tokens.total}`
      );
      return result;
    }

    lastResult = result;
    console.warn(
      `[OpenAIClient] ⚠️ Tentative ${attempt + 1}/${MAX_RETRIES + 1} échouée` +
      ` | ${result.errorKind} | ${result.errorMessage.substring(0, 120)}` +
      ` | ${result.responseTimeMs}ms`
    );

    // Déterminer si on doit retry
    const isTransient = ['timeout', 'http_error', 'rate_limit', 'network', 'empty'].includes(result.errorKind);
    const is5xx = result.httpStatus >= 500;
    const is429 = result.httpStatus === 429;
    const shouldRetry = isTransient && (result.httpStatus === 0 || is5xx || is429 || result.errorKind === 'timeout' || result.errorKind === 'network' || result.errorKind === 'empty');

    if (!shouldRetry || attempt === MAX_RETRIES) {
      break;
    }

    // Délai progressif : 1s, 2s (ou 2s pour 429)
    const delay = is429 ? 2000 : RETRY_DELAYS_MS[attempt] || 2000;
    console.log(`[OpenAIClient] ⏳ Attente ${delay}ms avant retry ${attempt + 2}/${MAX_RETRIES + 1}`);
    await new Promise(r => setTimeout(r, delay));
  }

  // Toutes les tentatives ont échoué
  if (lastResult) {
    lastResult.success = false;
    return lastResult;
  }

  return {
    success: false, content: '', rawResponse: null,
    httpStatus: 0, retryCount: MAX_RETRIES,
    tokens: { prompt: 0, completion: 0, total: 0 },
    responseTimeMs: 0,
    errorMessage: 'OpenAI: toutes les tentatives ont échoué',
    errorKind: 'http_error',
  };
}