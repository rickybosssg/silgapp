import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Zap, Clock, AlertTriangle, RefreshCw, TrendingDown,
  CheckCircle, XCircle, Cpu, Activity
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
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('24h');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      let since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      if (period === '7d') since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (period === '30d') since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (period === '1h') since = new Date(now.getTime() - 60 * 60 * 1000);

      const all = await base44.entities.IntegrationCreditLog.list('-date_appel', 500);
      const filtered = (all || []).filter(l => {
        const d = new Date(l.date_appel || l.created_date);
        return d >= since;
      });
      setLogs(filtered);
    } catch (e) {
      console.error('Erreur chargement logs crédit:', e.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // ── Calculs statistiques ──
  const totalCredits = logs.reduce((s, l) => s + (l.credits_estimated || 0), 0);
  const totalCalls = logs.length;
  const successCount = logs.filter(l => l.status === 'success').length;
  const errorCount = logs.filter(l => l.status === 'error').length;
  const avgResponseMs = logs.length > 0
    ? Math.round(logs.reduce((s, l) => s + (l.response_time_ms || 0), 0) / logs.length)
    : 0;

  // ── Grouper par fonction source ──
  const byFunction = {};
  for (const l of logs) {
    const key = l.function_source || 'inconnu';
    if (!byFunction[key]) byFunction[key] = { calls: 0, credits: 0, errors: 0, avgMs: 0, totalMs: 0 };
    byFunction[key].calls++;
    byFunction[key].credits += l.credits_estimated || 0;
    if (l.status === 'error') byFunction[key].errors++;
    byFunction[key].totalMs += l.response_time_ms || 0;
  }
  const functionStats = Object.entries(byFunction)
    .map(([name, s]) => ({ name, ...s, avgMs: Math.round(s.totalMs / s.calls) }))
    .sort((a, b) => b.credits - a.credits);

  // ── Grouper par endpoint ──
  const byEndpoint = {};
  for (const l of logs) {
    const key = l.endpoint || 'inconnu';
    if (!byEndpoint[key]) byEndpoint[key] = { calls: 0, credits: 0 };
    byEndpoint[key].calls++;
    byEndpoint[key].credits += l.credits_estimated || 0;
  }
  const endpointStats = Object.entries(byEndpoint).sort((a, b) => b[1].credits - a[1].credits);

  // ── Grouper par heure (24h) ──
  const hourlyData = {};
  for (let i = 23; i >= 0; i--) {
    const h = new Date(Date.now() - i * 60 * 60 * 1000);
    const key = `${String(h.getHours()).padStart(2, '0')}h`;
    hourlyData[key] = 0;
  }
  for (const l of logs) {
    const d = new Date(l.date_appel || l.created_date);
    const h = String(d.getHours()).padStart(2, '0') + 'h';
    if (hourlyData[h] !== undefined) hourlyData[h] += l.credits_estimated || 0;
  }
  const maxHourly = Math.max(...Object.values(hourlyData), 1);

  const errorRate = totalCalls > 0 ? ((errorCount / totalCalls) * 100).toFixed(1) : '0';

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Zap className="w-5 h-5 md:w-6 md:h-6 text-indigo-600" />
            Consommation de crédits d'intégration
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Suivi en temps réel des appels aux intégrations Base44 (InvokeLLM, GenerateImage, etc.)
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
            onClick={loadLogs}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </div>

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Zap} label="Crédits totaux" value={totalCredits.toLocaleString()} color="amber" />
        <StatCard icon={Activity} label="Appels totaux" value={totalCalls} color="indigo" />
        <StatCard icon={CheckCircle} label="Succès" value={successCount} color="green" />
        <StatCard icon={XCircle} label="Erreurs" value={errorCount} color="red"
          sublabel={`${errorRate}% du total`} />
        <StatCard icon={Clock} label="Temps moyen" value={`${avgResponseMs}ms`} color="blue" />
        <StatCard icon={TrendingDown} label="Crédits/heure" value={period === '1h' ? totalCredits : Math.round(totalCredits / (period === '24h' ? 24 : period === '7d' ? 168 : 720))} color="slate" />
      </div>

      {/* ── Graphique horaire ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Consommation par heure (24h)</h2>
        <div className="flex items-end gap-0.5 h-32">
          {Object.entries(hourlyData).map(([hour, credits]) => (
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

      {/* ── Par fonction source ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-slate-400" />
          Consommation par fonction backend
        </h2>
        {functionStats.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Aucun appel enregistré sur cette période.</p>
        ) : (
          <div className="space-y-2">
            {functionStats.map((f) => {
              const pct = totalCredits > 0 ? (f.credits / totalCredits) * 100 : 0;
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
      </div>

      {/* ── Par endpoint ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Répartition par type d'intégration</h2>
        {endpointStats.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Aucune donnée.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {endpointStats.map(([name, s]) => (
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

      {/* ── Logs récents ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Appels récents</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Aucun appel enregistré sur cette période.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 px-2 font-medium">Date</th>
                  <th className="py-2 px-2 font-medium">Fonction</th>
                  <th className="py-2 px-2 font-medium">Endpoint</th>
                  <th className="py-2 px-2 font-medium">Modèle</th>
                  <th className="py-2 px-2 font-medium text-right">Crédits</th>
                  <th className="py-2 px-2 font-medium text-right">Temps</th>
                  <th className="py-2 px-2 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 50).map((l) => (
                  <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-1.5 px-2 text-slate-500 whitespace-nowrap">
                      {new Date(l.date_appel || l.created_date).toLocaleTimeString('fr-FR')}
                    </td>
                    <td className="py-1.5 px-2 text-slate-700 font-medium">{l.function_source || '?'}</td>
                    <td className="py-1.5 px-2 text-slate-600">{l.endpoint || '?'}</td>
                    <td className="py-1.5 px-2 text-slate-500">{l.model_used || '-'}</td>
                    <td className="py-1.5 px-2 text-right font-bold text-amber-600">{l.credits_estimated || 0}</td>
                    <td className="py-1.5 px-2 text-right text-slate-500">{l.response_time_ms || 0}ms</td>
                    <td className="py-1.5 px-2">
                      {l.status === 'success' ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <span className="flex items-center gap-1 text-red-600">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span className="truncate max-w-[120px]">{l.error_message}</span>
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
    </div>
  );
}