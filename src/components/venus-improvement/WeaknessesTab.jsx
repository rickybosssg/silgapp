import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function WeaknessesTab() {
  const { data: faiblesses = [], isLoading } = useQuery({
    queryKey: ['venus-weaknesses-full'],
    queryFn: () => base44.entities.VenusWeaknessReport.list('score_moyen', 50),
    refetchInterval: 60000,
  });

  if (isLoading) return <p className="text-center text-gray-400 py-8">Chargement...</p>;

  if (faiblesses.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-400">Aucune donnée de faiblesse disponible</p>
        <p className="text-sm text-gray-400 mt-1">Les analyses seront disponibles après exécution du moteur d'amélioration.</p>
      </div>
    );
  }

  // Calculer le score global moyen
  const scoreMoyen = faiblesses.length > 0
    ? Math.round(faiblesses.reduce((s, f) => s + (f.score_moyen || 0), 0) / faiblesses.length)
    : 0;

  return (
    <div className="space-y-4">
      {/* Score global */}
      <div className="bg-gradient-to-r from-gray-700 to-gray-800 rounded-2xl p-5 text-white">
        <p className="text-sm opacity-80 mb-1">Score Qualité Moyen Tous Domaines</p>
        <div className="text-4xl font-bold">{scoreMoyen}<span className="text-lg opacity-60">/100</span></div>
      </div>

      {/* Tableau classé */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="pb-2 pr-4 font-medium">Rang</th>
              <th className="pb-2 pr-4 font-medium">Domaine</th>
              <th className="pb-2 pr-4 font-medium text-center">Score</th>
              <th className="pb-2 pr-4 font-medium text-center">Conversations</th>
              <th className="pb-2 pr-4 font-medium text-center">Taux d'échec</th>
              <th className="pb-2 pr-4 font-medium text-center">Reformulations</th>
              <th className="pb-2 pr-4 font-medium text-center">Temps moyen</th>
              <th className="pb-2 font-medium text-center">Tendance</th>
            </tr>
          </thead>
          <tbody>
            {faiblesses.map((f, i) => {
              const isCritical = f.score_moyen < 50;
              const isWeak = f.score_moyen < 70;
              return (
                <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 pr-4">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i < 3 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                    }`}>{i + 1}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="font-medium text-gray-700 capitalize">{f.domaine?.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="py-3 pr-4 text-center">
                    <span className={`text-lg font-bold ${
                      isCritical ? 'text-red-600' : isWeak ? 'text-amber-600' : 'text-green-600'
                    }`}>{f.score_moyen}</span>
                  </td>
                  <td className="py-3 pr-4 text-center text-gray-600">{f.total_conversations}</td>
                  <td className="py-3 pr-4 text-center">
                    <span className={f.taux_echec >= 25 ? 'text-red-600 font-medium' : 'text-gray-600'}>
                      {f.taux_echec}%
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-center text-gray-600">{f.reformulations_moyennes?.toFixed(1)}</td>
                  <td className="py-3 pr-4 text-center text-gray-600">{f.temps_moyen_resolution_sec}s</td>
                  <td className="py-3 text-center">
                    {f.tendance === 'amelioration' && <TrendingUp className="w-4 h-4 text-green-600 inline" />}
                    {f.tendance === 'degradation' && <TrendingDown className="w-4 h-4 text-red-600 inline" />}
                    {f.tendance === 'stable' && <Minus className="w-4 h-4 text-gray-400 inline" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Légende */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-500" /> Score &lt; 50 (critique)
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-amber-500" /> Score 50-69 (à améliorer)
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-500" /> Score 70+ (satisfaisant)
        </div>
      </div>
    </div>
  );
}