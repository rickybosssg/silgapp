import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Activity, Search } from 'lucide-react';

export default function MetricsTab() {
  const [filterType, setFilterType] = useState('');
  const [filterComposant, setFilterComposant] = useState('');
  const [search, setSearch] = useState('');

  const { data: metricsData, isLoading } = useQuery({
    queryKey: ['venus-metrics', filterType, filterComposant],
    queryFn: async () => {
      const res = await fetch('/api/functions/venusPerformance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_metrics',
          type_metric: filterType || undefined,
          composant: filterComposant || undefined,
          limit: 200,
        }),
      });
      const json = await res.json();
      return json.success ? json.metrics : [];
    },
    refetchInterval: 10000,
  });

  const metrics = metricsData || [];

  // Agrégats par composant
  const byComposant = {};
  for (const m of metrics) {
    if (!byComposant[m.composant]) byComposant[m.composant] = { count: 0, avg: 0, max: 0 };
    byComposant[m.composant].count++;
    byComposant[m.composant].avg += m.valeur;
    byComposant[m.composant].max = Math.max(byComposant[m.composant].max, m.valeur);
  }
  for (const c of Object.values(byComposant)) c.avg = Math.round(c.avg / c.count);

  const typeColors = {
    latence: 'bg-blue-100 text-blue-700',
    erreur: 'bg-red-100 text-red-700',
    throughput: 'bg-green-100 text-green-700',
    cache_hit: 'bg-purple-100 text-purple-700',
    cache_miss: 'bg-orange-100 text-orange-700',
    llm_call: 'bg-indigo-100 text-indigo-700',
    db_query: 'bg-teal-100 text-teal-700',
  };

  const filtered = metrics.filter(m =>
    !search ||
    m.composant?.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 100);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Métriques temps réel</h2>
        <p className="text-sm text-gray-500">Latence, erreurs, throughput par composant</p>
      </div>

      {/* Agrégats par composant */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Object.entries(byComposant).map(([composant, stats]) => (
          <Card key={composant}>
            <CardContent className="p-4">
              <p className="text-sm font-medium text-gray-900 capitalize mb-2">{composant}</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Mesures</span><span className="font-medium">{stats.count}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Moyenne</span><span className="font-medium">{stats.avg}ms</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Max</span><span className="font-medium text-red-600">{stats.max}ms</span></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white">
          <option value="">Tous types</option>
          <option value="latence">Latence</option>
          <option value="erreur">Erreur</option>
          <option value="throughput">Throughput</option>
          <option value="cache_hit">Cache hit</option>
          <option value="cache_miss">Cache miss</option>
          <option value="llm_call">LLM call</option>
          <option value="db_query">DB query</option>
        </select>
        <Input value={filterComposant} onChange={(e) => setFilterComposant(e.target.value)} placeholder="Composant..." className="w-48" />
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..." className="pl-9" />
        </div>
      </div>

      {/* Liste métriques */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[500px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Activity className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>Aucune métrique</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Type</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Composant</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Valeur</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr key={m.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2"><Badge className={typeColors[m.type_metric] || 'bg-gray-100'} variant="outline">{m.type_metric}</Badge></td>
                      <td className="px-4 py-2 text-gray-900">{m.composant}</td>
                      <td className="px-4 py-2 text-right font-medium">{m.valeur} {m.unite}</td>
                      <td className="px-4 py-2 text-right text-xs text-gray-500">{m.timestamp ? new Date(m.timestamp).toLocaleTimeString('fr-FR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}