/**
 * Panneau de diagnostic flottant — affiche en temps réel les erreurs 500
 * capturées par l'intercepteur global.
 *
 * Affiché uniquement sur les pages /admin/* pour ne pas polluer le client.
 * À SUPPRIMER avec diag500.js une fois le diagnostic terminé.
 */
import React, { useState, useEffect } from 'react';
import { subscribeTo500Diagnostics, clear500Diagnostics } from '@/lib/diag500';
import { Bug, X, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

export default function Diag500Panel() {
  const [errors, setErrors] = useState([]);
  const [expanded, setExpanded] = useState(true);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    const unsub = subscribeTo500Diagnostics((newErrors) => setErrors(newErrors));
    return unsub;
  }, []);

  // Ne rien afficher sur les pages non-admin
  if (!window.location.pathname.startsWith('/admin')) return null;

  if (errors.length === 0) {
    return (
      <div className="fixed bottom-20 right-3 z-[10000] bg-emerald-600 text-white rounded-full px-3 py-1.5 text-[10px] font-bold shadow-lg flex items-center gap-1 opacity-80 pointer-events-none">
        <Bug className="w-3 h-3" />
        Diag500 actif
      </div>
    );
  }

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-20 right-3 z-[10000] bg-red-600 text-white rounded-full px-4 py-2 text-xs font-black shadow-lg flex items-center gap-1.5 animate-pulse"
      >
        <Bug className="w-4 h-4" />
        {errors.length} erreur{errors.length > 1 ? 's' : ''} 500
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-3 left-3 sm:left-auto sm:w-[480px] z-[10000] bg-slate-900 text-white rounded-xl shadow-2xl border border-red-500/50 max-h-[60vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between bg-red-600 px-3 py-2 rounded-t-xl">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4" />
          <span className="text-xs font-black">
            DIAG 500 — {errors.length} erreur{errors.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-red-700"
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setMinimized(true)}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-red-700"
          >
            <ChevronDown className="w-3.5 h-3.5 rotate-180" />
          </button>
          <button
            onClick={clear500Diagnostics}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-red-700"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setMinimized(true)}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-red-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-950/80">
          {errors.map((err, idx) => (
            <div key={idx} className="bg-slate-800 rounded-lg p-2 border border-slate-700 text-[10px] font-mono">
              {/* Type + status */}
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-1.5 py-0.5 rounded font-bold ${
                  err.type === 'http_5xx' ? 'bg-red-500/30 text-red-300' :
                  err.type === 'unhandled_500_rejection' ? 'bg-orange-500/30 text-orange-300' :
                  err.type === 'function_invoke_5xx' ? 'bg-purple-500/30 text-purple-300' :
                  'bg-slate-500/30 text-slate-300'
                }`}>
                  {err.type}
                </span>
                <span className="font-bold text-red-400">HTTP {err.status}</span>
                <span className="text-slate-400">{err.method}</span>
                <span className="text-slate-500 ml-auto">{new Date(err.timestamp).toLocaleTimeString()}</span>
              </div>

              {/* Function name */}
              {err.functionName && (
                <div className="text-purple-400 font-bold mb-1">→ {err.functionName}</div>
              )}

              {/* URL */}
              {err.url && (
                <div className="text-cyan-400 break-all mb-1">URL: {err.url}</div>
              )}

              {/* Page */}
              <div className="text-slate-400 mb-1">Page: {err.pageUrl}</div>

              {/* Backend message */}
              {err.backendMessage && (
                <div className="bg-red-950/50 rounded p-1.5 mt-1 border border-red-900">
                  <div className="text-red-300 font-bold mb-0.5">Backend:</div>
                  <pre className="text-red-200 whitespace-pre-wrap break-all text-[9px]">{err.backendMessage}</pre>
                </div>
              )}

              {/* Payload */}
              {err.payload && (
                <div className="text-yellow-400 mt-1 break-all">Payload: {err.payload}</div>
              )}

              {/* Stack */}
              {err.frontendStack && (
                <details className="mt-1">
                  <summary className="text-slate-400 cursor-pointer hover:text-slate-200">Stack frontend</summary>
                  <pre className="text-slate-500 mt-1 whitespace-pre-wrap break-all text-[8px] max-h-32 overflow-y-auto">
                    {err.frontendStack}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}