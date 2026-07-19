import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Database, Trash2, RefreshCw, Zap } from 'lucide-react';

export default function CacheTab() {
  const queryClient = useQueryClient();
  const [clearPattern, setClearPattern] = useState('');

  const { data: dashboard, isLoading, refetch } = useQuery({
    queryKey: ['venus-cache'],
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

  const clearCache = async () => {
    await fetch('/api/functions/venusPerformance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear_cache', pattern: clearPattern || undefined }),
    });
    refetch();
  };

  const flushMetrics = async () => {
    await fetch('/api/functions/venusPerformance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'flush_metrics' }),
    });
    refetch();
  };

  if (isLoading) return <div className="text-center py-8 text-gray-500">Chargement...</div>;

  const cache = dashboard?.cache || {};

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Cache intelligent multi-niveaux</h2>
        <p className="text-sm text-gray-500">FAQ, tarifs, config, workflows, documents — invalidation automatique sur modification</p>
      </div>

      {/* Stats cache */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-purple-50 border-0">
          <CardContent className="p-4 text-center">
            <Database className="w-6 h-6 mx-auto mb-2 text-purple-600" />
            <p className="text-3xl font-bold text-purple-600">{cache.totalEntries || 0}</p>
            <p className="text-xs text-gray-600 mt-1">Entrées en cache</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-0">
          <CardContent className="p-4 text-center">
            <Zap className="w-6 h-6 mx-auto mb-2 text-green-600" />
            <p className="text-3xl font-bold text-green-600">{(cache.hitRate || 0).toFixed(0)}%</p>
            <p className="text-xs text-gray-600 mt-1">Taux de hit</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-0">
          <CardContent className="p-4 text-center">
            <Zap className="w-6 h-6 mx-auto mb-2 text-blue-600" />
            <p className="text-3xl font-bold text-blue-600">{cache.totalHits || 0}</p>
            <p className="text-xs text-gray-600 mt-1">Hits total</p>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-0">
          <CardContent className="p-4 text-center">
            <RefreshCw className="w-6 h-6 mx-auto mb-2 text-orange-600" />
            <p className="text-3xl font-bold text-orange-600">{cache.expired || 0}</p>
            <p className="text-xs text-gray-600 mt-1">Expirées</p>
          </CardContent>
        </Card>
      </div>

      {/* Catégories de cache */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catégories de cache & TTL</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { cat: 'config_pays', ttl: '10 min', desc: 'Configuration des pays (Country)' },
            { cat: 'tarifs', ttl: '10 min', desc: 'Tarifs par pays (prix/km, minimum)' },
            { cat: 'knowledge_faq', ttl: '5 min', desc: 'Base de connaissances & FAQ' },
            { cat: 'workflows', ttl: '5 min', desc: 'Définitions de workflows actifs' },
            { cat: 'documents_popular', ttl: '10 min', desc: 'Documents RAG fréquemment consultés' },
            { cat: 'personality', ttl: '10 min', desc: 'Personnalités VENUS' },
            { cat: 'brand', ttl: '30 min', desc: 'Marques (SILGAPP, SILGA...)' },
            { cat: 'translations', ttl: '5 min', desc: 'Traductions multilingues' },
            { cat: 'cities', ttl: '30 min', desc: 'Villes, quartiers, zones' },
          ].map((c) => (
            <div key={c.cat} className="flex items-center justify-between border rounded-lg p-2 text-sm">
              <div>
                <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">{c.cat}</code>
                <span className="text-gray-600 ml-2">{c.desc}</span>
              </div>
              <Badge variant="outline">{c.ttl}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Actions cache */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={clearPattern} onChange={(e) => setClearPattern(e.target.value)} placeholder="Pattern à invalider (ex: config_pays:, knowledge_faq:) — vide = tout" />
            <Button variant="destructive" onClick={clearCache}>
              <Trash2 className="w-4 h-4 mr-2" /> Invalider
            </Button>
          </div>
          <Button variant="outline" onClick={flushMetrics}>
            <RefreshCw className="w-4 h-4 mr-2" /> Forcer le flush des métriques
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-0">
        <CardContent className="p-4">
          <p className="text-sm text-gray-700">
            <strong>🔒 Invalidation automatique :</strong> Le cache s'invalide automatiquement quand une entité est modifiée.
            Par exemple, modifier un <code className="text-xs bg-white px-1 rounded">VenusKnowledge</code> invalide toutes les clés
            <code className="text-xs bg-white px-1 rounded ml-1">knowledge_faq:</code> et
            <code className="text-xs bg-white px-1 rounded ml-1">knowledge_search:</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}