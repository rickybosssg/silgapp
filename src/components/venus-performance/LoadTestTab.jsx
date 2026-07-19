import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Zap, Gauge, Play, TrendingUp } from 'lucide-react';

const PRESETS = [100, 500, 1000, 5000, 10000];

export default function LoadTestTab() {
  const queryClient = useQueryClient();
  const [launching, setLaunching] = useState(null);
  const [duration, setDuration] = useState(30);

  const { data: testsData, isLoading } = useQuery({
    queryKey: ['venus-loadtests'],
    queryFn: async () => {
      const res = await fetch('/api/functions/venusPerformance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_load_tests' }),
      });
      const json = await res.json();
      return json.success ? json.tests : [];
    },
    refetchInterval: 10000,
  });

  const launchTest = async (nbUsers) => {
    setLaunching(nbUsers);
    try {
      await fetch('/api/functions/venusPerformance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'launch_load_test', nb_users: nbUsers, duration_seconds: duration }),
      });
      queryClient.invalidateQueries({ queryKey: ['venus-loadtests'] });
    } finally {
      setLaunching(null);
    }
  };

  const tests = testsData || [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Simulateur de charge</h2>
        <p className="text-sm text-gray-500">Testez VENUS avec 100 à 10 000 utilisateurs simultanés</p>
      </div>

      {/* Presets de charge */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {PRESETS.map((nb) => (
          <Card key={nb} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${nb >= 5000 ? 'bg-red-100' : nb >= 1000 ? 'bg-orange-100' : 'bg-green-100'}`}>
                  <Gauge className={`w-5 h-5 ${nb >= 5000 ? 'text-red-600' : nb >= 1000 ? 'text-orange-600' : 'text-green-600'}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{nb.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">utilisateurs simulés</p>
                </div>
              </div>
              <Button
                className="w-full"
                size="sm"
                onClick={() => launchTest(nb)}
                disabled={launching !== null}
              >
                {launching === nb ? (
                  <><Zap className="w-4 h-4 mr-2 animate-pulse" /> Test en cours...</>
                ) : (
                  <><Play className="w-4 h-4 mr-2" /> Lancer le test</>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Durée du test :</label>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="border rounded-md px-3 py-2 text-sm bg-white">
              <option value={15}>15 secondes</option>
              <option value={30}>30 secondes</option>
              <option value={60}>1 minute</option>
              <option value={120}>2 minutes</option>
              <option value={300}>5 minutes</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Historique des tests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historique des tests</CardTitle>
        </CardHeader>
        <CardContent>
          {tests.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucun test de charge effectué</p>
          ) : (
            <div className="space-y-2">
              {tests.map((t) => (
                <div key={t.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">{t.nom_test}</p>
                      <p className="text-xs text-gray-500">{t.nb_utilisateurs_simules} utilisateurs · {t.duree_secondes}s · {t.date_debut ? new Date(t.date_debut).toLocaleString('fr-FR') : '—'}</p>
                    </div>
                    <Badge variant={t.statut === 'termine' ? 'default' : t.statut === 'en_cours' ? 'secondary' : 'destructive'}>
                      {t.statut}
                    </Badge>
                  </div>
                  {t.statut === 'termine' && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm mt-2">
                      <div className="text-center"><p className="text-xs text-gray-500">Latence moy</p><p className="font-medium">{t.temps_reponse_moyen_ms}ms</p></div>
                      <div className="text-center"><p className="text-xs text-gray-500">P95</p><p className="font-medium">{t.temps_reponse_p95_ms}ms</p></div>
                      <div className="text-center"><p className="text-xs text-gray-500">Max</p><p className="font-medium text-red-600">{t.temps_reponse_max_ms}ms</p></div>
                      <div className="text-center"><p className="text-xs text-gray-500">Erreurs</p><p className={`font-medium ${t.taux_erreur_pct > 5 ? 'text-red-600' : 'text-green-600'}`}>{t.taux_erreur_pct}%</p></div>
                      <div className="text-center"><p className="text-xs text-gray-500">Dispo</p><p className={`font-medium ${t.disponibilite_pct < 99 ? 'text-red-600' : 'text-green-600'}`}>{t.disponibilite_pct}%</p></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Métriques mesurées */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Métriques mesurées pendant les tests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {[
              'Temps de réponse moyen',
              'Temps de réponse P95',
              'Temps de réponse max',
              'Taux d\'erreur',
              'Throughput (msg/sec)',
              'Disponibilité',
              'Conversations parallèles',
              'Messages envoyés',
              'Réponses reçues',
            ].map((m) => (
              <div key={m} className="flex items-center gap-2 border rounded-lg p-2">
                <TrendingUp className="w-3 h-3 text-blue-500" />
                <span className="text-gray-700">{m}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}