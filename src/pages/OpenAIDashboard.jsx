import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Activity, DollarSign, Clock, AlertTriangle, Zap,
  CheckCircle, XCircle, RefreshCw, TrendingUp, Cpu, TestTube,
  MessageSquare, Brain, Database, Shield, FileText, Cog
} from 'lucide-react';

function BudgetBar({ label, cost, budget, pct }) {
  const isOver = pct >= 100;
  const isWarning = pct >= 80 && pct < 100;
  const barColor = isOver ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <span className={`text-xs font-bold ${isOver ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-slate-700'}`}>
          ${cost.toFixed(4)} / ${budget.toFixed(2)}
        </span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-slate-400">{pct}% utilisé</span>
        {isOver && <span className="text-xs text-red-600 font-semibold flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Budget dépassé — fallback automatique</span>}
        {isWarning && !isOver && <span className="text-xs text-amber-600 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Seuil d'alerte (80%)</span>}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sublabel, color = 'indigo' }) {
  const colorMap = {
    indigo: 'from-indigo-500 to-purple-600',
    green: 'from-emerald-500 to-teal-600',
    amber: 'from-amber-500 to-orange-600',
    red: 'from-red-500 to-rose-600',
    blue: 'from-blue-500 to-cyan-600',
    slate: 'from-slate-500 to-slate-700',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${colorMap[color]} flex items-center justify-center shadow-sm`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sublabel && <p className="text-xs text-slate-400 mt-1">{sublabel}</p>}
    </div>
  );
}

const DECISION_LABELS = {
  securite: { label: 'Sécurité', color: 'bg-red-100 text-red-700' },
  salutation: { label: 'Salutation', color: 'bg-blue-100 text-blue-700' },
  raccourci: { label: 'Raccourci', color: 'bg-cyan-100 text-cyan-700' },
  cache: { label: 'Cache', color: 'bg-slate-100 text-slate-700' },
  regle_metier: { label: 'Règle métier', color: 'bg-purple-100 text-purple-700' },
  connaissance: { label: 'Connaissance', color: 'bg-indigo-100 text-indigo-700' },
  rag_llm: { label: 'RAG + Base44', color: 'bg-amber-100 text-amber-700' },
  openai: { label: 'OpenAI', color: 'bg-emerald-100 text-emerald-700' },
  fallback_base44: { label: 'Fallback Base44', color: 'bg-orange-100 text-orange-700' },
  erreur: { label: 'Erreur', color: 'bg-red-100 text-red-700' },
};

export default function OpenAIDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const result = await base44.functions.invoke('getOpenAIStats', {});
      // Le SDK enveloppe la réponse dans { data: ... } — déballer si nécessaire
      const unwrapped = result?.data ? result.data : result;
      if (unwrapped?.error) {
        setFetchError(`Réponse backend: ${unwrapped.error}`);
      } else {
        setStats(unwrapped);
      }
    } catch (e) {
      console.error('Erreur fetchStats:', e);
      setFetchError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Auto-refresh toutes les 30 secondes
  useEffect(() => {
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleTestOpenAI = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await base44.functions.invoke('diagnosticOpenAI', {});
      // Dépaquetage robuste — le SDK peut envelopper dans { data: ... } ou { data: { data: ... } }
      let unwrapped = result;
      while (unwrapped && typeof unwrapped === 'object' && 'data' in unwrapped && !('connexion_ok' in unwrapped) && !('statut_global' in unwrapped)) {
        unwrapped = unwrapped.data;
      }
      // Considérer comme succès si connexion_ok=true OU http_status=200 OU statut_global contient ACTIVE
      const isSuccess = unwrapped?.connexion_ok === true
        || unwrapped?.http_status === 200
        || (typeof unwrapped?.statut_global === 'string' && unwrapped.statut_global.includes('ACTIVE'));
      setTestResult({ ...unwrapped, connexion_ok: isSuccess });
    } catch (e) {
      setTestResult({ statut: 'ÉCHEC', erreur: e.message, connexion_ok: false });
    } finally {
      setTesting(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (fetchError && !stats) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl border border-red-200 p-6 max-w-md text-center shadow-sm">
          <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-sm font-bold text-slate-900 mb-2">Impossible de charger les statistiques</h2>
          <p className="text-xs text-slate-500 mb-1">Erreur détectée :</p>
          <p className="text-xs text-red-600 font-mono bg-red-50 rounded p-2 mb-4 break-all">{fetchError}</p>
          <button
            onClick={fetchStats}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 mx-auto"
          >
            <RefreshCw className="w-4 h-4" /> Réessayer
          </button>
        </div>
      </div>
    );
  }

  const today = stats?.today || {};
  const month = stats?.month || {};

  const msgStats = stats?.message_stats_recent || stats?.message_stats_today || {};
  const lastCalls = stats?.last_20_calls || [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Audit OpenAI VENUS</h1>
              <p className="text-xs text-slate-500">Monitoring temps réel — stats de production</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${stats?.openai_enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {stats?.openai_enabled ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {stats?.openai_enabled ? 'OpenAI ACTIF' : 'OpenAI DÉSACTIVÉ'}
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700">
              <Cpu className="w-3.5 h-3.5" />
              {stats?.current_model || 'gpt-4.1-mini'}
            </div>
            <button
              onClick={fetchStats}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              title="Rafraîchir (auto toutes les 30s)"
            >
              <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {/* ═══ Section 0: Budget tracking ═══ */}
        {stats?.budget && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm font-semibold text-slate-700">Suivi budgétaire OpenAI</h2>
              <span className={`ml-auto px-2 py-0.5 rounded text-xs font-semibold ${stats.learning_mode === 'gpt_principal' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                Mode: {stats.learning_mode || 'gpt_principal'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <BudgetBar
                label="Budget quotidien"
                cost={stats.budget.today_cost}
                budget={stats.budget.daily_budget}
                pct={stats.budget.daily_pct}
              />
              <BudgetBar
                label="Budget mensuel"
                cost={stats.budget.month_cost}
                budget={stats.budget.monthly_budget}
                pct={stats.budget.monthly_pct}
              />
            </div>
          </div>
        )}

        {/* ═══ Section 1: Audit des messages WhatsApp aujourd'hui ═══ */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-500" />
            Audit des messages WhatsApp — Récents
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard icon={MessageSquare} label="Total messages reçus" value={msgStats.total || 0} sublabel="messages WhatsApp" color="indigo" />
            <StatCard icon={Shield} label="Règles déterministes" value={msgStats.deterministes || 0} sublabel="0 crédit LLM" color="slate" />
            <StatCard icon={Cpu} label="OpenAI appelé" value={msgStats.openai_success || 0} sublabel="GPT-4.1-mini" color="green" />
            <StatCard icon={Database} label="RAG uniquement" value={msgStats.rag_only || 0} sublabel="Base44 InvokeLLM" color="amber" />
            <StatCard icon={AlertTriangle} label="Fallback Base44" value={msgStats.fallback_base44 || 0} sublabel="OpenAI échoué" color="red" />
          </div>
        </div>

        {/* ═══ Section 2: KPIs OpenAI aujourd'hui ═══ */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-500" />
            Performance OpenAI — Aujourd'hui
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard icon={Zap} label="Appels OpenAI" value={today.calls || 0} sublabel={`${today.success || 0} réussis`} color="indigo" />
            <StatCard icon={Clock} label="Temps moyen" value={`${today.avg_response_ms || 0}ms`} sublabel="par appel" color="blue" />
            <StatCard icon={DollarSign} label="Coût aujourd'hui" value={`$${(today.cost_usd || 0).toFixed(4)}`} sublabel={`${(today.total_tokens || 0).toLocaleString()} tokens`} color="green" />
            <StatCard icon={AlertTriangle} label="Bascules fallback" value={today.fallbacks || 0} sublabel="vers Base44" color="amber" />
            <StatCard icon={XCircle} label="Erreurs OpenAI" value={today.errors || 0} sublabel="timeouts, quota..." color="red" />
          </div>
        </div>

        {/* ═══ Section 3: KPIs du mois ═══ */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            Ce mois-ci
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard icon={Zap} label="Appels OpenAI" value={month.calls || 0} sublabel={`${month.success || 0} réussis`} color="indigo" />
            <StatCard icon={Clock} label="Temps moyen" value={`${month.avg_response_ms || 0}ms`} sublabel="par appel" color="blue" />
            <StatCard icon={DollarSign} label="Coût mensuel" value={`$${(month.cost_usd || 0).toFixed(4)}`} sublabel={`${(month.total_tokens || 0).toLocaleString()} tokens`} color="green" />
            <StatCard icon={AlertTriangle} label="Bascules fallback" value={month.fallbacks || 0} sublabel="vers Base44" color="amber" />
            <StatCard icon={XCircle} label="Erreurs OpenAI" value={month.errors || 0} sublabel="échecs API" color="red" />
          </div>
        </div>

        {/* ═══ Section 4: 20 derniers appels ═══ */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" />
              20 derniers messages traités
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Heure</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Message client</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Décision</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-600">Moteur</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Modèle</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">Durée</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600">Coût</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 max-w-[200px]">Réponse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lastCalls.length > 0 ? (
                  lastCalls.map((call, i) => {
                    const dec = DECISION_LABELS[call.decision_moteur] || { label: call.decision_moteur, color: 'bg-slate-100 text-slate-700' };
                    return (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                          {call.date ? new Date(call.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-700 max-w-[180px] truncate" title={call.message_client}>
                          {call.message_client || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${dec.color}`}>
                            {dec.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {(() => {
                            const dm = call.decision_moteur;
                            if (dm === 'openai') return <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700" title={call.model_utilise || ''}>GPT</span>;
                            if (dm === 'fallback_base44') return <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700" title={call.erreur_detail || 'Fallback vers Base44'}>Base44</span>;
                            if (dm === 'rag_llm') return <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700" title={call.model_utilise || ''}>Base44</span>;
                            if (dm === 'erreur') return <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700" title={call.erreur_detail || ''}>Erreur</span>;
                            return <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">Règle</span>;
                          })()}
                        </td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                          {call.model_utilise || '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">
                          {call.temps_reponse_ms > 0 ? `${call.temps_reponse_ms}ms` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">
                          {call.cout_usd > 0 ? `$${call.cout_usd.toFixed(4)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-500 max-w-[200px]">
                          <div className="truncate" title={call.reponse_envoyee}>
                            {call.reponse_envoyee || '—'}
                          </div>
                          {call.erreur_detail && (
                            <div className="text-[10px] text-red-500 mt-0.5 truncate" title={call.erreur_detail}>
                              ⚠ {call.erreur_detail}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      Aucun message traité pour le moment.
                      <br />
                      <span className="text-xs">Les logs apparaîtront ici dès le prochain message WhatsApp reçu par VENUS.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ═══ Section 5: Test de connexion ═══ */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TestTube className="w-5 h-5 text-indigo-500" />
              <h2 className="text-sm font-semibold text-slate-700">Test de connexion OpenAI</h2>
            </div>
            <button
              onClick={handleTestOpenAI}
              disabled={testing}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {testing ? 'Test en cours...' : 'Tester OpenAI'}
            </button>
          </div>

          {testResult && (
            <div className={`rounded-lg p-4 text-sm ${testResult.connexion_ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {testResult.connexion_ok ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                <span className={`font-semibold ${testResult.connexion_ok ? 'text-emerald-800' : 'text-red-800'}`}>
                  {testResult.connexion_ok ? 'Connexion réussie' : 'Échec de connexion'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                {testResult.latence_ms != null && <div>Latence: <strong>{testResult.latence_ms}ms</strong></div>}
                {testResult.modele_teste && <div>Modèle: <strong>{testResult.modele_teste}</strong></div>}
                {testResult.secret_prefix && <div>Clé: <strong>{testResult.secret_prefix}***</strong></div>}
                {testResult.tokens && <div>Tokens: <strong>{testResult.tokens.total_tokens || 'N/A'}</strong></div>}
                {testResult.erreur_message && <div className="col-span-2 text-red-600">Erreur: {testResult.erreur_message}</div>}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500">
                <strong>Flux VENUS:</strong> {testResult.flux_venus?.moteur_principal || 'raisonnerAvecOpenAI()'} → {testResult.flux_venus?.fallback || 'InvokeLLM Base44'}
              </div>
            </div>
          )}
        </div>

        {/* ═══ Section 6: Erreurs récentes ═══ */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Erreurs & bascules récentes
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {stats?.recent_errors?.length > 0 ? (
              stats.recent_errors.map((err, i) => (
                <div key={i} className="px-5 py-3 flex items-start gap-3">
                  <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${err.status === 'error' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-semibold ${err.status === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                        {err.status === 'error' ? 'ERREUR' : 'FALLBACK'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {err.date ? new Date(err.date).toLocaleString('fr-FR') : 'N/A'}
                      </span>
                      {err.response_time_ms > 0 && <span className="text-xs text-slate-400">{err.response_time_ms}ms</span>}
                    </div>
                    <p className="text-sm text-slate-700 truncate">{err.error || 'Pas de détail'}</p>
                    {err.telephone && <p className="text-xs text-slate-400 mt-0.5">Client: {err.telephone}</p>}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-5 py-8 text-center text-sm text-slate-400">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                Aucune erreur ou bascule récente
              </div>
            )}
          </div>
        </div>

        <div className="text-center text-xs text-slate-400 pb-4">
          Données générées le {stats?.generated_at ? new Date(stats.generated_at).toLocaleString('fr-FR') : '...'} — Auto-rafraîchissement toutes les 30 secondes
        </div>
      </div>
    </div>
  );
}