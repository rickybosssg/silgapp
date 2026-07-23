import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Activity, DollarSign, Clock, AlertTriangle, Zap,
  CheckCircle, XCircle, RefreshCw, TrendingUp, Cpu, TestTube
} from 'lucide-react';

function StatCard({ icon: Icon, label, value, sublabel, color = 'indigo' }) {
  const colorMap = {
    indigo: 'from-indigo-500 to-purple-600',
    green: 'from-emerald-500 to-teal-600',
    amber: 'from-amber-500 to-orange-600',
    red: 'from-red-500 to-rose-600',
    blue: 'from-blue-500 to-cyan-600',
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

export default function OpenAIDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const result = await base44.functions.invoke('getOpenAIStats', {});
      setStats(result);
    } catch (e) {
      console.error('Erreur fetchStats:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleTestOpenAI = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await base44.functions.invoke('diagnosticOpenAI', {});
      setTestResult(result);
    } catch (e) {
      setTestResult({ statut: 'ÉCHEC', erreur: e.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  const today = stats?.today || {};
  const month = stats?.month || {};

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
              <h1 className="text-lg font-bold text-slate-900">Suivi OpenAI VENUS</h1>
              <p className="text-xs text-slate-500">Monitoring temps réel du moteur d'intelligence</p>
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
              title="Rafraîchir"
            >
              <RefreshCw className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {/* KPIs du jour */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-500" />
            Aujourd'hui
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard icon={Zap} label="Conversations" value={today.calls || 0} sublabel={`${today.success || 0} réussies`} color="indigo" />
            <StatCard icon={Clock} label="Temps moyen" value={`${today.avg_response_ms || 0}ms`} sublabel="par conversation" color="blue" />
            <StatCard icon={DollarSign} label="Coût aujourd'hui" value={`$${(today.cost_usd || 0).toFixed(4)}`} sublabel={`${(today.total_tokens || 0).toLocaleString()} tokens`} color="green" />
            <StatCard icon={AlertTriangle} label="Bascules fallback" value={today.fallbacks || 0} sublabel="vers Base44" color="amber" />
            <StatCard icon={XCircle} label="Erreurs OpenAI" value={today.errors || 0} sublabel="échecs API" color="red" />
          </div>
        </div>

        {/* KPIs du mois */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            Ce mois-ci
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard icon={Zap} label="Conversations" value={month.calls || 0} sublabel={`${month.success || 0} réussies`} color="indigo" />
            <StatCard icon={Clock} label="Temps moyen" value={`${month.avg_response_ms || 0}ms`} sublabel="par conversation" color="blue" />
            <StatCard icon={DollarSign} label="Coût mensuel" value={`$${(month.cost_usd || 0).toFixed(4)}`} sublabel={`${(month.total_tokens || 0).toLocaleString()} tokens`} color="green" />
            <StatCard icon={AlertTriangle} label="Bascules fallback" value={month.fallbacks || 0} sublabel="vers Base44" color="amber" />
            <StatCard icon={XCircle} label="Erreurs OpenAI" value={month.errors || 0} sublabel="échecs API" color="red" />
          </div>
        </div>

        {/* Test OpenAI */}
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

        {/* Erreurs récentes */}
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
      </div>
    </div>
  );
}