import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, Clock, AlertTriangle, Database, TrendingUp } from 'lucide-react';

export default function PerformanceTestTab() {
  const { data: auditData, isLoading } = useQuery({
    queryKey: ['venus-certification-latest'],
    queryFn: async () => {
      const res = await fetch('/api/functions/venusAuditFinal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_latest' }),
      });
      const json = await res.json();
      return json.success ? json.report : null;
    },
  });

  if (isLoading) return <div className="text-center py-8 text-gray-500">Chargement...</div>;
  if (!auditData) return <div className="text-center py-8 text-gray-500">Aucun audit disponible.</div>;

  const perf = typeof auditData.metriques_performance === 'string' ? JSON.parse(auditData.metriques_performance) : (auditData.metriques_performance || {});
  const qualite = typeof auditData.evaluation_qualite === 'string' ? JSON.parse(auditData.evaluation_qualite) : (auditData.evaluation_qualite || {});

  const latency = perf.avg_latency_ms || 0;
  const maxLatency = perf.max_latency_ms || 0;
  const errors = perf.errors || 0;
  const cacheHit = perf.cache_hit_rate || 0;

  const perfScore = auditData.score_performance || 0;

  const cards = [
    { label: 'Latence moyenne', value: `${latency} ms`, icon: Clock, color: latency < 1000 ? 'text-green-600' : latency < 2000 ? 'text-orange-600' : 'text-red-600', bg: latency < 1000 ? 'bg-green-50' : latency < 2000 ? 'bg-orange-50' : 'bg-red-50' },
    { label: 'Latence max', value: `${maxLatency} ms`, icon: Zap, color: maxLatency < 3000 ? 'text-green-600' : 'text-orange-600', bg: maxLatency < 3000 ? 'bg-green-50' : 'bg-orange-50' },
    { label: 'Erreurs (24h)', value: errors, icon: AlertTriangle, color: errors < 10 ? 'text-green-600' : 'text-red-600', bg: errors < 10 ? 'bg-green-50' : 'bg-red-50' },
    { label: 'Cache hit rate', value: `${cacheHit}%`, icon: Database, color: cacheHit > 70 ? 'text-green-600' : 'text-orange-600', bg: cacheHit > 70 ? 'bg-green-50' : 'bg-orange-50' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Tests de Performance</h2>
        <p className="text-sm text-gray-500">Mesure des temps de réponse, cache, et qualité des réponses VENUS</p>
      </div>

      {/* Score performance */}
      <Card className="bg-gradient-to-r from-orange-500 to-amber-600 text-white border-0">
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <p className="text-sm opacity-90">Score de Performance</p>
            <p className="text-5xl font-bold">{perfScore}<span className="text-xl opacity-70">/100</span></p>
          </div>
          <Zap className="w-16 h-16 opacity-50" />
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <Card key={i} className={c.bg + ' border-0'}>
              <CardContent className="p-4 text-center">
                <Icon className={`w-6 h-6 mx-auto mb-2 ${c.color}`} />
                <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-xs text-gray-600 mt-1">{c.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Qualité des réponses */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="w-4 h-4 text-teal-600" /> Qualité des réponses VENUS</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-teal-600">{qualite.taux_reussite || 0}%</p>
              <p className="text-xs text-gray-600">Taux de réussite</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-orange-600">{qualite.taux_escalade || 0}%</p>
              <p className="text-xs text-gray-600">Taux d'escalade</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">{qualite.interactions_analysees || 0}</p>
              <p className="text-xs text-gray-600">Interactions analysées</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-red-600">{qualite.escalades_total || 0}</p>
              <p className="text-xs text-gray-600">Escalades totales</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cibles de performance */}
      <Card>
        <CardHeader><CardTitle className="text-base">Cibles de performance</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Métrique</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Actuel</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Cible</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">Statut</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t"><td className="px-4 py-2">Latence moyenne</td><td className="text-right px-4 py-2">{latency}ms</td><td className="text-right px-4 py-2">&lt; 1000ms</td><td className="text-center"><Badge variant={latency < 1000 ? 'default' : 'destructive'}>{latency < 1000 ? '✓' : '✗'}</Badge></td></tr>
              <tr className="border-t"><td className="px-4 py-2">Latence max</td><td className="text-right px-4 py-2">{maxLatency}ms</td><td className="text-right px-4 py-2">&lt; 3000ms</td><td className="text-center"><Badge variant={maxLatency < 3000 ? 'default' : 'destructive'}>{maxLatency < 3000 ? '✓' : '✗'}</Badge></td></tr>
              <tr className="border-t"><td className="px-4 py-2">Taux d'erreur</td><td className="text-right px-4 py-2">{errors}</td><td className="text-right px-4 py-2">&lt; 10/24h</td><td className="text-center"><Badge variant={errors < 10 ? 'default' : 'destructive'}>{errors < 10 ? '✓' : '✗'}</Badge></td></tr>
              <tr className="border-t"><td className="px-4 py-2">Cache hit rate</td><td className="text-right px-4 py-2">{cacheHit}%</td><td className="text-right px-4 py-2">&gt; 70%</td><td className="text-center"><Badge variant={cacheHit > 70 ? 'default' : 'destructive'}>{cacheHit > 70 ? '✓' : '✗'}</Badge></td></tr>
              <tr className="border-t"><td className="px-4 py-2">Taux de réussite</td><td className="text-right px-4 py-2">{qualite.taux_reussite || 0}%</td><td className="text-right px-4 py-2">&gt; 90%</td><td className="text-center"><Badge variant={(qualite.taux_reussite || 0) >= 90 ? 'default' : 'destructive'}>{(qualite.taux_reussite || 0) >= 90 ? '✓' : '✗'}</Badge></td></tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}