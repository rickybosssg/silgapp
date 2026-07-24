import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Gauge, Clock, AlertTriangle, Database, Zap, RefreshCw, TrendingUp, TrendingDown, Activity } from 'lucide-react';

export default function PerformanceOverviewTab() {
  const queryClient = useQueryClient();
  const [launching, setLaunching] = useState(false);

  const { data: dashboard, isLoading, refetch } = useQuery({
    queryKey: ['venus-perf-dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/functions/venusPerformance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_dashboard' }),
      });
      const json = await res.json();
      return json.success ? json : null;
    },
    refetchInterval: 15000,
  });

  const launchOptimization = async () => {
    setLaunching(true);
    try {
      await fetch('/api/functions/venusPerformance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'detect_optimizations' }),
      });
      refetch();
    } finally {
      setLaunching(false);
    }
  };

  if (isLoading) return <div className="text-center py-8 text-gray-500">Chargement du dashboard...</div>;

  const cache = dashboard?.cache || {};
  const queue = dashboard?.queue || {};
  const metrics = dashboard?.metrics || {};
  const suggestions = dashboard?.suggestions || [];

  const kpiCards = [
    {
      label: 'Latence moyenne',
      value: `${metrics.avg_latency_ms || 0} ms`,
      icon: Clock,
      color: metrics.avg_latency_ms > 3000 ? 'text-red-600' : metrics.avg_latency_ms > 1500 ? 'text-orange-600' : 'text-green-600',
      bg: metrics.avg_latency_ms > 3000 ? 'bg-red-50' : metrics.avg_latency_ms > 1500 ? 'bg-orange-50' : 'bg-green-50',
      trend: metrics.avg_latency_ms > 2000 ? 'up_bad' : 'down_good',
    },
    {
      label: 'Latence max',
      value: `${metrics.max_latency_ms || 0} ms`,
      icon: Zap,
      color: metrics.max_latency_ms > 5000 ? 'text-red-600' : 'text-orange-600',
      bg: metrics.max_latency_ms > 5000 ? 'bg-red-50' : 'bg-orange-50',
    },
    {
      label: 'Erreurs (24h)',
      value: metrics.errors_24h || 0,
      icon: AlertTriangle,
      color: metrics.errors_24h > 10 ? 'text-red-600' : 'text-green-600',
      bg: metrics.errors_24h > 10 ? 'bg-red-50' : 'bg-green-50',
    },
    {
      label: 'Cache hit rate',
      value: `${(cache.hitRate || 0).toFixed(0)}%`,
      icon: Database,
      color: cache.hitRate > 70 ? 'text-green-600' : 'text-orange-600',
      bg: cache.hitRate > 70 ? 'bg-green-50' : 'bg-orange-50',
    },
    {
      label: 'File d\'attente',
      value: queue.en_attente || 0,
      icon: Activity,
      color: queue.en_attente > 50 ? 'text-red-600' : 'text-green-600',
      bg: queue.en_attente > 50 ? 'bg-red-50' : 'bg-green-50',
    },
    {
      label: 'Entrées cache',
      value: cache.totalEntries || 0,
      icon: Database,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Santé globale de VENUS</h2>
          <p className="text-sm text-gray-500">Monitoring temps réel — actualisé toutes les 15 secondes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} size="sm">
            <RefreshCw className="w-4 h-4 mr-2" /> Actualiser
          </Button>
          <Button onClick={launchOptimization} disabled={launching} size="sm">
            <Zap className="w-4 h-4 mr-2" /> {launching ? 'Analyse...' : 'Détecter optimisations'}
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg} border-0`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-5 h-5 ${kpi.color}`} />
                  {kpi.trend === 'up_bad' && <TrendingUp className="w-3 h-3 text-red-400" />}
                  {kpi.trend === 'down_good' && <TrendingDown className="w-3 h-3 text-green-400" />}
                </div>
                <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-xs text-gray-600 mt-1">{kpi.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Queue + Suggestions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="w-4 h-4 text-orange-600" /> File d'attente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-500">En attente</span><Badge variant="outline">{queue.en_attente || 0}</Badge></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">En cours</span><Badge variant="outline">{queue.en_cours || 0}</Badge></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Terminées</span><Badge variant="outline" className="text-green-600">{queue.termine || 0}</Badge></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Échecs</span><Badge variant="outline" className="text-red-600">{queue.echec || 0}</Badge></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Retry</span><Badge variant="outline" className="text-orange-600">{queue.retry || 0}</Badge></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="w-4 h-4 text-indigo-600" /> Optimisations détectées
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {suggestions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucune optimisation active — tout va bien ! ✅</p>
            ) : (
              suggestions.map((s) => (
                <div key={s.id} className="border rounded-lg p-2">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant={s.severite === 'critique' ? 'destructive' : s.severite === 'warning' ? 'default' : 'secondary'} className="text-xs">
                      {s.severite}
                    </Badge>
                    <span className="text-xs text-gray-500">{s.composant_concerne}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{s.titre}</p>
                  <p className="text-xs text-gray-500 mt-1">{s.recommandation}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Load tests récents */}
      {dashboard?.loadTests && dashboard.loadTests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="w-4 h-4 text-red-600" /> Derniers tests de charge
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dashboard.loadTests.map((t) => (
                <div key={t.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
                  <div>
                    <p className="font-medium">{t.nom_test}</p>
                    <p className="text-xs text-gray-500">{t.nb_utilisateurs_simules} utilisateurs · {t.duree_secondes}s</p>
                  </div>
                  <div className="flex gap-4 text-right">
                    <div><p className="text-xs text-gray-500">Latence moy</p><p className="font-medium">{t.temps_reponse_moyen_ms || 0}ms</p></div>
                    <div><p className="text-xs text-gray-500">P95</p><p className="font-medium">{t.temps_reponse_p95_ms || 0}ms</p></div>
                    <div><p className="text-xs text-gray-500">Erreurs</p><p className="font-medium text-red-600">{t.taux_erreur_pct || 0}%</p></div>
                    <div><p className="text-xs text-gray-500">Dispo</p><p className="font-medium text-green-600">{t.disponibilite_pct || 100}%</p></div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}