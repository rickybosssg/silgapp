import { createClientFromRequest } from 'npm:@base44/sdk@0.8.51';

// ═══════════════════════════════════════════════════════════════════════════
// silgappCopilotWrite — Copilote de direction SILGAPP pour ChatGPT (MCP)
//
// PHASE 2 — WRITE (contrôlée)
//   • Super Admin SILGAPP uniquement (user.role === 'admin')
//   • Rate limiting : 10 actions WRITE/minute par utilisateur
//   • Validation des paramètres côté backend avant toute exécution
//   • Journalisation complète de chaque action (tool, user, date, course_id, params, résultat)
//   • Invoque les fonctions backend existantes sans les modifier
//   • Aucune logique métier dupliquée — délégation pure aux fonctions existantes
//
// Sécurité :
//   1. Auth Super Admin vérifiée AVANT toute action
//   2. Rate limiting indépendant du READ (10/min vs 30/min)
//   3. Validation des paramètres obligatoires par tool
//   4. Journalisation structurée (console + Base44 Logs)
//   5. Délégation aux fonctions existantes via functions.invoke
//
// Aucune donnée sensible n'est journalisée (pas de token, mot de passe, OTP).
// ═══════════════════════════════════════════════════════════════════════════

const WRITE_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const WRITE_RATE_LIMIT_MAX_CALLS = 10;
const writeRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkWriteRateLimit(userEmail: string): boolean {
  const now = Date.now();
  const entry = writeRateLimitMap.get(userEmail);
  if (!entry || now > entry.resetAt) {
    writeRateLimitMap.set(userEmail, { count: 1, resetAt: now + WRITE_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= WRITE_RATE_LIMIT_MAX_CALLS) return false;
  entry.count++;
  return true;
}

function logWriteAction(user: any, tool: string, params: any) {
  const safeParams = JSON.stringify(params).slice(0, 500);
  console.log(`[COPILOT_WRITE] ${new Date().toISOString()} | ${user.email} | ${tool} | PARAMS: ${safeParams}`);
}

function logWriteResult(user: any, tool: string, success: boolean, courseId: string | null, detail: string) {
  console.log(`[COPILOT_WRITE] ${new Date().toISOString()} | ${user.email} | ${tool} | RESULT: ${success ? 'SUCCESS' : 'FAIL'} | COURSE: ${courseId || 'N/A'} | ${detail.slice(0, 200)}`);
}

// ── Validation des paramètres par tool ──
function validateParams(tool: string, params: any): { valid: boolean; error?: string } {
  if (tool === 'create_course') {
    if (!params.type_course) return { valid: false, error: 'type_course requis (expedier, recevoir, deplacement)' };
    if (!params.adresse_depart) return { valid: false, error: 'adresse_depart requis' };
    if (!params.country_code) return { valid: false, error: 'country_code requis' };
    if (!params.client_telephone) return { valid: false, error: 'client_telephone requis pour une course admin' };
    return { valid: true };
  }
  if (tool === 'redispatch_course') {
    if (!params.course_id) return { valid: false, error: 'course_id requis' };
    if (params.mode && !['redispatch', 'vague0'].includes(params.mode)) {
      return { valid: false, error: 'mode doit être redispatch ou vague0' };
    }
    return { valid: true };
  }
  if (tool === 'assign_driver') {
    if (!params.course_id) return { valid: false, error: 'course_id requis' };
    if (!params.livreur_id) return { valid: false, error: 'livreur_id requis' };
    return { valid: true };
  }
  if (tool === 'cancel_course') {
    if (!params.course_id) return { valid: false, error: 'course_id requis' };
    return { valid: true };
  }
  return { valid: false, error: `Tool inconnu: ${tool}` };
}

// ── Mapping tool → fonction backend existante ──
const TOOL_FUNCTION_MAP: Record<string, string> = {
  create_course: 'creerCourseAdmin',
  redispatch_course: 'relancerDispatchAdmin',
  assign_driver: 'assignerLivreurAdmin',
  cancel_course: 'annulerCourseExterne',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // ── 1. Super Admin SILGAPP uniquement ──
    if (user.role !== 'admin') {
      return Response.json({ error: 'Super Admin requis pour les actions WRITE' }, { status: 403 });
    }

    // ── 2. Rate limiting WRITE (10/min) ──
    if (!checkWriteRateLimit(user.email)) {
      return Response.json({ error: 'Rate limit WRITE dépassé (10 actions/min)' }, { status: 429 });
    }

    // ── 3. Parser la payload ──
    const payload = await req.json().catch(() => ({}));
    const { tool, ...params } = payload;

    if (!tool) {
      return Response.json({ error: 'Paramètre tool requis' }, { status: 400 });
    }

    // ── 4. Validation des paramètres ──
    const validation = validateParams(tool, params);
    if (!validation.valid) {
      logWriteAction(user, tool, params);
      logWriteResult(user, tool, false, params.course_id || null, `VALIDATION FAIL: ${validation.error}`);
      return Response.json({ error: validation.error }, { status: 400 });
    }

    // ── 5. Journaliser l'action AVANT exécution ──
    logWriteAction(user, tool, params);

    // ── 6. Préparer les paramètres pour la fonction existante ──
    let functionParams: any = { ...params };

    // Pour cancel_course : forcer source='admin' (le copilote agit en tant qu'admin)
    if (tool === 'cancel_course') {
      functionParams.source = 'admin';
    }

    // Pour create_course : forcer source='admin'
    if (tool === 'create_course') {
      functionParams.source = 'admin';
    }

    // ── 7. Invoquer la fonction backend existante ──
    const functionName = TOOL_FUNCTION_MAP[tool];
    if (!functionName) {
      logWriteResult(user, tool, false, params.course_id || null, `UNKNOWN TOOL: ${tool}`);
      return Response.json({ error: `Tool inconnu: ${tool}` }, { status: 400 });
    }

    let result: any = null;
    let invokeError: string | null = null;
    let invokeStatusCode = 200;
    try {
      const rawResult = await base44.asServiceRole.functions.invoke(functionName, functionParams);
      // functions.invoke peut retourner un Response object ou du JSON déjà parsé
      if (rawResult instanceof Response) {
        invokeStatusCode = rawResult.status;
        try {
          result = await rawResult.json();
        } catch {
          result = { raw: 'Response non-JSON' };
        }
      } else if (typeof rawResult === 'object' && rawResult !== null) {
        result = rawResult;
      } else {
        result = { raw: String(rawResult) };
      }
    } catch (invokeErr: any) {
      invokeError = invokeErr?.message || String(invokeErr);
      const statusMatch = invokeError?.match(/status code (\d+)/);
      invokeStatusCode = statusMatch ? parseInt(statusMatch[1]) : 500;
    }

    // ── 8. Journaliser le résultat ──
    const success = !invokeError && (result?.success === true || result?.success === 'true');
    const courseId = result?.course_id || result?.course?.id || params.course_id || null;
    const detail = invokeError || result?.error || result?.message || 'OK';
    logWriteResult(user, tool, success, courseId, detail);

    // ── 9. Retourner le résultat ──
    const statusCode = success ? 200 : invokeStatusCode;
    const responseBody: any = {
      success,
      tool,
      function_invoked: functionName,
      course_id: courseId,
      executed_by: user.email,
      executed_at: new Date().toISOString(),
    };
    if (success && result) {
      // Ne pas sérialiser le résultat brut si c'est un objet Response (référence circulaire)
      if (typeof result === 'object' && result !== null && !(result instanceof Response)) {
        try {
          responseBody.result = JSON.parse(JSON.stringify(result));
        } catch {
          responseBody.result = { note: 'Result serialization skipped (non-serializable)' };
        }
      } else {
        responseBody.result = { note: 'Result was a Response object' };
      }
    }
    if (invokeError) {
      responseBody.error = invokeError;
    }
    return Response.json(responseBody, { status: statusCode });

  } catch (error) {
    console.error('[silgappCopilotWrite] Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});