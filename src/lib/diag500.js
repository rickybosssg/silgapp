/**
 * DIAGNOSTIC TEMPORAIRE — Capture toutes les erreurs 500 (et autres HTTP)
 * pour identifier quelle requête backend déclenche le toast rouge admin.
 *
 * Capture :
 * - URL/fonction appelée
 * - Méthode HTTP
 * - Status HTTP
 * - Message backend (corps de réponse)
 * - Stack frontend
 * - Page courante
 * - Timestamp
 *
 * À SUPPRIMER une fois la fonction fautive identifiée et corrigée.
 */

const DIAGNOSE_500_ENABLED = true;
const MAX_LOG_ENTRIES = 100;
const diagnosticLog = [];
let listeners = [];

// ── Fonctions non critiques (fire-and-forget) ──
// Ces fonctions ne doivent JAMAIS déclencher le panneau DIAG 500.
// Un échec de tracking d'installation n'est pas une erreur critique.
const NON_CRITICAL_FUNCTIONS = new Set([
  'trackAppInstall',
  'trackDownload',
  'trackDownloadPublic',
  'trackReactivationOpened',
]);

function addEntry(entry) {
  diagnosticLog.push(entry);
  if (diagnosticLog.length > MAX_LOG_ENTRIES) diagnosticLog.shift();
  listeners.forEach((fn) => fn([...diagnosticLog]));
}

export function subscribeTo500Diagnostics(callback) {
  listeners.push(callback);
  callback([...diagnosticLog]);
  return () => {
    listeners = listeners.filter((fn) => fn !== callback);
  };
}

export function get500Diagnostics() {
  return [...diagnosticLog];
}

export function clear500Diagnostics() {
  diagnosticLog.length = 0;
  listeners.forEach((fn) => fn([]));
}

/**
 * Initialise l'intercepteur global. À appeler une fois au démarrage de l'app.
 */
export function init500Diagnostic() {
  if (!DIAGNOSE_500_ENABLED) return;
  if (window.__diag500_installed) return;
  window.__diag500_installed = true;

  // ── 1. Intercepter window.fetch pour toutes les requêtes HTTP ──
  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const method = (init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
    const pageUrl = window.location.href;
    const timestamp = new Date().toISOString();

    let response;
    try {
      response = await originalFetch.call(this, input, init);
    } catch (err) {
      // AbortError volontaire (debounce, navigation, cleanup) — ne pas journaliser
      if (err?.name === 'AbortError') {
        throw err;
      }
      // Vraie erreur réseau (pas de réponse du tout)
      addEntry({
        type: 'network_error',
        url,
        method,
        status: 0,
        backendMessage: err?.message || String(err),
        frontendStack: err?.stack,
        pageUrl,
        timestamp,
      });
      throw err;
    }

    // Logger seulement les erreurs 5xx
    if (response.status >= 500) {
      let backendMessage = '';
      try {
        const cloned = response.clone();
        backendMessage = await cloned.text();
      } catch (_) {}

      // Stack frontend
      let stack = '';
      try {
        stack = new Error().stack;
      } catch (_) {}

      // Essayer d'extraire le nom de la fonction backend depuis l'URL
      const funcMatch = url.match(/\/functions?\/([^/?#]+)/);
      const functionName = funcMatch?.[1] || null;

      // Ignorer les fonctions non critiques (trackAppInstall, etc.)
      if (functionName && NON_CRITICAL_FUNCTIONS.has(functionName)) {
        return response;
      }

      addEntry({
        type: 'http_5xx',
        url,
        method,
        status: response.status,
        functionName,
        backendMessage: backendMessage?.slice(0, 2000),
        frontendStack: stack,
        pageUrl,
        timestamp,
      });
    }

    return response;
  };

  // ── 2. Intercepter les rejections non catchées (toasts rouges) ──
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason?.message || String(reason);
    const is500 = message.includes('500') || reason?.response?.status >= 500 || reason?.status >= 500;

    if (is500 || message.includes('Request failed with status code')) {
      let stack = reason?.stack || '';
      try {
        stack = stack || new Error().stack;
      } catch (_) {}

      // Essayer d'extraire l'URL de la requête depuis le config de l'erreur Axios/fetch
      const configUrl = reason?.config?.url || reason?.request?.responseURL || '';
      const method = reason?.config?.method?.toUpperCase() || 'UNKNOWN';
      const status = reason?.response?.status || reason?.status || 0;
      const backendData = reason?.response?.data;
      let backendMessage = '';
      if (typeof backendData === 'string') backendMessage = backendData;
      else if (backendData) {
        try {
          backendMessage = JSON.stringify(backendData);
        } catch (_) {
          backendMessage = String(backendData);
        }
      }

      addEntry({
        type: 'unhandled_500_rejection',
        url: configUrl,
        method,
        status,
        functionName: null,
        backendMessage: backendMessage?.slice(0, 2000),
        frontendStack: stack,
        pageUrl: window.location.href,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ── 3. Intercepter base44.functions.invoke si disponible ──
  wrapBase44Invoke();

  console.log('[Diag500] Intercepteur global 500 installé');
}

/**
 * Wrappe base44.functions.invoke de façon asynchrone.
 */
async function wrapBase44Invoke() {
  try {
    const base44Module = await import('@/api/base44Client');
    const base44Client = base44Module.base44;
    if (base44Client?.functions?.invoke && !base44Client.functions.__diagWrapped) {
      const originalInvoke = base44Client.functions.invoke.bind(base44Client.functions);
      base44Client.functions.__diagWrapped = true;
      base44Client.functions.invoke = async function (functionName, payload, options) {
        const pageUrl = window.location.href;
        const timestamp = new Date().toISOString();
        try {
          const result = await originalInvoke(functionName, payload, options);
          return result;
        } catch (err) {
          const status = err?.response?.status || err?.status || 0;
          // Ignorer les fonctions non critiques (trackAppInstall, etc.)
          if (NON_CRITICAL_FUNCTIONS.has(functionName)) {
            throw err; // re-throw sans logger au DIAG 500
          }
          if (status >= 500 || (err?.message || '').includes('500')) {
            let backendMessage = '';
            const respData = err?.response?.data;
            if (typeof respData === 'string') backendMessage = respData;
            else if (respData) {
              try {
                backendMessage = JSON.stringify(respData);
              } catch (_) {
                backendMessage = String(respData);
              }
            }
            if (!backendMessage && err?.message) backendMessage = err.message;

            addEntry({
              type: 'function_invoke_5xx',
              functionName,
              url: `/functions/${functionName}`,
              method: 'POST',
              status,
              payload: payload ? JSON.stringify(payload).slice(0, 500) : '',
              backendMessage: backendMessage?.slice(0, 2000),
              frontendStack: err?.stack || '',
              pageUrl,
              timestamp,
            });
          }
          throw err;
        }
      };
    }
  } catch (_) {}
}