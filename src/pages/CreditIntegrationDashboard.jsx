import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Zap, Clock, AlertTriangle, RefreshCw, TrendingDown,
  CheckCircle, XCircle, Cpu, Activity, DollarSign, Brain, Database
} from 'lucide-react';

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

export default function CreditIntegrationDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('24h');
  const [error, setError] = useState(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await base44.functions.invoke('getCreditStats', { period });
      const unwrapped = result?.data ? result.data : result;
      if (unwrapped?.error) {
        setError(unwrapped.error);
      } else {
        setStats(unwrapped);
      }
    } catch (e) {
      console.error('Erreur chargement stats crédit:', e.message);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl border border-red-200 p-6 max-w-md text-center shadow-sm">
          <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-sm font-bold text-slate-900 mb-2">Impossible de charger les statistiques</h2>
          <p className="text-xs text-red-600 font-mono bg-red-50 rounded p-2 mb-4 break-all">{error}</p>
          <button
            onClick={loadStats}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 mx-auto"
          >
            <RefreshCw className="w-4 h-4" /> Réessayer
          </button>
        </div>
      </div>
    );
  }

  const summary = stats?.summary || {};
  const base44Stats = stats?.base44_integrations || {};
  const openaiStats = stats?.openai_direct || {};
  const hourly = stats?.hourly || {};
  const recentLogs = stats?.recent_logs || [];
  const maxHourly = Math.max(...Object.values(hourly), 1);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Zap className="w-5 h-5 md:w-6 md:h-6 text-indigo-600" />
            Crédits d'intégration — SILGAPP
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Consommation globale des crédits sur toute la plateforme (VENUS, NEO, dispatch, et plus)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
          >
            <option value="1h">Dernière heure</option>
            <option value="24h">Dernières 24h</option>
            <option value="7d">7 derniers jours</option>
            <option value="30d">30 derniers jours</option>
          </select>
          <button
            onClick={loadStats}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </div>

      {/* ── Stats globales ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Zap} label="Crédits Base44" value={(base44Stats.total_credits || 0).toLocaleString()} color="amber"
          sublabel={`${base44Stats.total_calls || 0} appels`} />
        <StatCard icon={DollarSign} label="Coût OpenAI" value={`$${(openaiStats.cost_usd || 0).toFixed(4)}`} color="green"
          sublabel={`${openaiStats.total_calls || 0} appels`} />
        <StatCard icon={Activity} label="Appels totaux" value={summary.total_calls || 0} color="indigo" />
        <StatCard icon={CheckCircle} label="Succès" value={summary.success_count || 0} color="green" />
        <StatCard icon={XCircle} label="Erreurs" value={summary.error_count || 0} color="red"
          sublabel={`${summary.error_rate}% du total`} />
        <StatCard icon={Clock} label="Temps moyen" value={`${summary.avg_response_ms || 0}ms`} color="blue" />
      </div>

      {/* ── Graphique horaire ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Consommation par heure (24h)</h2>
        <div className="flex items-end gap-0.5 h-32">
          {Object.entries(hourly).map(([hour, credits]) => (
            <div key={hour} className="flex-1 flex flex-col items-center justify-end gap-1">
              <div
                className="w-full bg-gradient-to-t from-indigo-500 to-purple-500 rounded-t-sm transition-all hover:opacity-80"
                style={{ height: `${(credits / maxHourly) * 100}%`, minHeight: credits > 0 ? '4px' : '0' }}
                title={`${hour}: ${credits} crédits`}
              />
              {parseInt(hour) % 3 === 0 && (
                <span className="text-[9px] text-slate-400">{hour}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Section Base44 (intégrations natives) ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Database className="w-4 h-4 text-amber-500" />
          Intégrations Base44 — InvokeLLM, GenerateImage, etc.
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="text-center p-2 bg-amber-50 rounded-lg">
            <p className="text-xs text-slate-500">Crédits totaux</p>
            <p className="text-lg font-bold text-amber-600">{(base44Stats.total_credits || 0).toLocaleString()}</p>
          </div>
          <div className="text-center p-2 bg-indigo-50 rounded-lg">
            <p className="text-xs text-slate-500">Appels</p>
            <p className="text-lg font-bold text-indigo-600">{base44Stats.total_calls || 0}</p>
          </div>
          <div className="text-center p-2 bg-emerald-50 rounded-lg">
            <p className="text-xs text-slate-500">Succès</p>
            <p className="text-lg font-bold text-emerald-600">{base44Stats.success || 0}</p>
          </div>
          <div className="text-center p-2 bg-red-50 rounded-lg">
            <p className="text-xs text-slate-500">Erreurs</p>
            <p className="text-lg font-bold text-red-600">{base44Stats.errors || 0}</p>
          </div>
        </div>

        {/* Par fonction source */}
        <h3 className="text-xs font-semibold text-slate-600 mb-2">Par fonction backend</h3>
        {(base44Stats.by_function || []).length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Aucun appel enregistré sur cette période.</p>
        ) : (
          <div className="space-y-2">
            {(base44Stats.by_function || []).map((f) => {
              const pct = (base44Stats.total_credits || 0) > 0 ? (f.credits / base44Stats.total_credits) * 100 : 0;
              return (
                <div key={f.name} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">{f.name}</span>
                      {f.errors > 0 && (
                        <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                          {f.errors} erreur(s)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{f.calls} appels</span>
                      <span className="font-bold text-amber-600">{f.credits} crédits</span>
                      <span>{f.avgMs}ms moy</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-400">{pct.toFixed(1)}% de la consommation</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Par endpoint */}
        <h3 className="text-xs font-semibold text-slate-600 mb-2 mt-4">Par type d'intégration</h3>
        {(base44Stats.by_endpoint || []).length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-2">Aucune donnée.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {(base44Stats.by_endpoint || []).map(([name, s]) => (
              <div key={name} className="border border-slate-100 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">{name}</p>
                  <p className="text-xs text-slate-400">{s.calls} appels</p>
                </div>
                <span className="text-lg font-bold text-amber-600">{s.credits}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section OpenAI direct ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Brain className="w-4 h-4 text-emerald-500" />
          API OpenAI directe — gpt-4.1-mini, etc.
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
          <div className="text-center p-2 bg-indigo-50 rounded-lg">
            <p className="text-xs text-slate-500">Appels totaux</p>
            <p className="text-lg font-bold text-indigo-600">{openaiStats.total_calls || 0}</p>
          </div>
          <div className="text-center p-2 bg-emerald-50 rounded-lg">
            <p className="text-xs text-slate-500">Succès 1er coup</p>
            <p className="text-lg font-bold text-emerald-600">{openaiStats.success || 0}</p>
          </div>
          <div className="text-center p-2 bg-blue-50 rounded-lg">
            <p className="text-xs text-slate-500">Succès après retry</p>
            <p className="text-lg font-bold text-blue-600">{openaiStats.success_retry || 0}</p>
          </div>
          <div className="text-center p-2 bg-amber-50 rounded-lg">
            <p className="text-xs text-slate-500">Fallbacks Base44</p>
            <p className="text-lg font-bold text-amber-600">{openaiStats.fallbacks || 0}</p>
          </div>
          <div className="text-center p-2 bg-red-50 rounded-lg">
            <p className="text-xs text-slate-500">Erreurs</p>
            <p className="text-lg font-bold text-red-600">{openaiStats.errors || 0}</p>
          </div>
          <div className="text-center p-2 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500">Réponses vides</p>
            <p className="text-lg font-bold text-slate-600">{openaiStats.empty_response || 0}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <StatCard icon={DollarSign} label="Coût total" value={`$${(openaiStats.cost_usd || 0).toFixed(4)}`} color="green" />
          <StatCard icon={Cpu} label="Tokens totaux" value={(openaiStats.total_tokens || 0).toLocaleString()} color="blue" />
          <StatCard icon={Clock} label="Temps moyen" value={`${openaiStats.avg_response_ms || 0}ms`} color="slate" />
        </div>

        {/* Par modèle */}
        <h3 className="text-xs font-semibold text-slate-600 mb-2">Par modèle</h3>
        {(openaiStats.by_model || []).length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-2">Aucun appel OpenAI sur cette période.</p>
        ) : (
          <div className="space-y-2">
            {(openaiStats.by_model || []).map(([name, s]) => (
              <div key={name} className="border border-slate-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">{name}</span>
                    {s.errors > 0 && (
                      <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                        {s.errors} erreur(s)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>{s.calls} appels</span>
                    <span className="font-bold text-emerald-600">${s.cost.toFixed(4)}</span>
                    <span>{s.tokens.toLocaleString()} tokens</span>
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all"
                    style={{ width: `${Math.min(((s.cost / (openaiStats.cost_usd || 1)) * 100), 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Logs récents combinés ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Appels récents (toutes sources)</h2>
        {recentLogs.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Aucun appel enregistré sur cette période.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 px-2 font-medium">Date</th>
                  <th className="py-2 px-2 font-medium">Source</th>
                  <th className="py-2 px-2 font-medium">Fonction</th>
                  <th className="py-2 px-2 font-medium">Endpoint</th>
                  <th className="py-2 px-2 font-medium">Modèle</th>
                  <th className="py-2 px-2 font-medium text-right">Crédits</th>
                  <th className="py-2 px-2 font-medium text-right">Coût $</th>
                  <th className="py-2 px-2 font-medium text-right">Temps</th>
                  <th className="py-2 px-2 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((l, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-1.5 px-2 text-slate-500 whitespace-nowrap">
                      {new Date(l.date).toLocaleTimeString('fr-FR')}
                    </td>
                    <td className="py-1.5 px-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        l.source === 'openai' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {l.source === 'openai' ? 'OpenAI' : 'Base44'}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-slate-700 font-medium">{l.function_source || '?'}</td>
                    <td className="py-1.5 px-2 text-slate-600">{l.endpoint || '?'}</td>
                    <td className="py-1.5 px-2 text-slate-500">{l.model_used || '-'}</td>
                    <td className="py-1.5 px-2 text-right font-bold text-amber-600">{l.credits || 0}</td>
                    <td className="py-1.5 px-2 text-right font-bold text-emerald-600">
                      {l.cost_usd > 0 ? `$${l.cost_usd.toFixed(4)}` : '-'}
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-500">{l.response_time_ms || 0}ms</td>
                    <td className="py-1.5 px-2">
                      {l.status === 'success' || l.status === 'success_retry' ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <span className="flex items-center gap-1 text-red-600">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span className="truncate max-w-[100px]">{l.error_message}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-center text-xs text-slate-400 pb-4">
        Données générées le {stats?.generated_at ? new Date(stats.generated_at).toLocaleString('fr-FR') : '...'} — Auto-rafraîchissement toutes les 30 secondes
      </div>
    </div>
  );
}