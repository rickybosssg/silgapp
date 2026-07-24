import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, Zap, CheckCircle, XCircle, Lightbulb } from 'lucide-react';

export default function OptimizationsTab() {
  const queryClient = useQueryClient();
  const [detecting, setDetecting] = useState(false);

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['venus-optimizations'],
    queryFn: () => base44.entities.VenusOptimizationSuggestion.filter(
      { statut: 'active' }, '-creee_date', 50
    ),
    refetchInterval: 30000,
  });

  const detect = async () => {
    setDetecting(true);
    try {
      await fetch('/api/functions/venusPerformance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'detect_optimizations' }),
      });
      queryClient.invalidateQueries({ queryKey: ['venus-optimizations'] });
    } finally {
      setDetecting(false);
    }
  };

  const applySuggestion = async (id) => {
    await base44.entities.VenusOptimizationSuggestion.update(id, {
      statut: 'appliquee',
      appliquee_at: new Date().toISOString(),
    });
    queryClient.invalidateQueries({ queryKey: ['venus-optimizations'] });
  };

  const dismissSuggestion = async (id) => {
    await base44.entities.VenusOptimizationSuggestion.update(id, { statut: 'ignoree' });
    queryClient.invalidateQueries({ queryKey: ['venus-optimizations'] });
  };

  const sevColors = {
    critique: 'bg-red-100 text-red-700 border-red-200',
    warning: 'bg-orange-100 text-orange-700 border-orange-200',
    info: 'bg-blue-100 text-blue-700 border-blue-200',
  };

  const typeLabels = {
    requete_lente: 'Requête lente',
    workflow_inefficace: 'Workflow inefficace',
    recherche_couteuse: 'Recherche coûteuse',
    api_lente: 'API lente',
    cache_manquant: 'Cache manquant',
    db_query_lourde: 'Requête DB lourde',
    llm_appel_excessif: 'Appel LLM excessif',
    memoire_fuite: 'Fuite mémoire',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Optimisations automatiques</h2>
          <p className="text-sm text-gray-500">Détection des requêtes lentes, recherches coûteuses et API lentes</p>
        </div>
        <Button onClick={detect} disabled={detecting}>
          <Zap className="w-4 h-4 mr-2" /> {detecting ? 'Analyse en cours...' : 'Lancer la détection'}
        </Button>
      </div>

      {suggestions.length === 0 ? (
        <Card className="bg-green-50 border-0">
          <CardContent className="p-8 text-center">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-600" />
            <p className="text-lg font-medium text-green-900">Aucune optimisation requise</p>
            <p className="text-sm text-green-700 mt-1">VENUS fonctionne de manière optimale. Lancez une détection pour analyser les dernières métriques.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <Card key={s.id} className={sevColors[s.severite] || sevColors.info}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Brain className="w-5 h-5" />
                    <div>
                      <p className="font-medium text-gray-900">{s.titre}</p>
                      <p className="text-xs text-gray-600">{typeLabels[s.type] || s.type} · {s.composant_concerne}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize">{s.severite}</Badge>
                </div>

                <p className="text-sm text-gray-700 mb-2">{s.description}</p>

                {s.metrique_actuelle != null && s.metrique_cible != null && (
                  <div className="flex items-center gap-2 mb-2 text-sm">
                    <span className="text-gray-500">Actuel:</span>
                    <Badge variant="destructive" className="text-xs">{s.metrique_actuelle}</Badge>
                    <span className="text-gray-500">→</span>
                    <span className="text-gray-500">Cible:</span>
                    <Badge variant="default" className="text-xs bg-green-600">{s.metrique_cible}</Badge>
                    {s.gain_estime_pct > 0 && (
                      <Badge variant="outline" className="text-xs text-green-700">+{s.gain_estime_pct}% perf</Badge>
                    )}
                  </div>
                )}

                <div className="bg-white/60 rounded-lg p-2 mb-3">
                  <div className="flex items-center gap-1 mb-1">
                    <Lightbulb className="w-3 h-3 text-yellow-600" />
                    <span className="text-xs font-medium text-gray-700">Recommandation</span>
                  </div>
                  <p className="text-sm text-gray-800">{s.recommandation}</p>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => dismissSuggestion(s.id)}>
                    <XCircle className="w-3.5 h-3.5 mr-1" /> Ignorer
                  </Button>
                  <Button size="sm" onClick={() => applySuggestion(s.id)}>
                    <CheckCircle className="w-3.5 h-3.5 mr-1" /> Marquer appliquée
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}