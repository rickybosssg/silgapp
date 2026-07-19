import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { TrendingUp, TrendingDown, Minus, CheckCircle, XCircle, AlertTriangle, Lightbulb, Star, Clock, Award, Zap, FileBarChart } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function ImprovementOverviewTab({ onNavigate }) {
  const [scoreGlobal, setScoreGlobal] = useState(null);
  const [tendance, setTendance] = useState(null);

  // Analyses récentes
  const { data: analyses = [] } = useQuery({
    queryKey: ['venus-analyses-recentes'],
    queryFn: () => base44.entities.VenusConversationAnalysis.list('-analyse_date', 100),
    refetchInterval: 30000,
  });

  // Suggestions en attente
  const { data: suggestions = [] } = useQuery({
    queryKey: ['venus-suggestions-attente'],
    queryFn: () => base44.entities.VenusSuggestion.filter({ statut: 'en_attente' }, '-nb_occurrences', 50),
    refetchInterval: 30000,
  });

  // Faiblesses
  const { data: faiblesses = [] } = useQuery({
    queryKey: ['venus-faiblesses'],
    queryFn: () => base44.entities.VenusWeaknessReport.list('-score_moyen', 30),
    refetchInterval: 60000,
  });

  // Alertes non résolues
  const { data: alertes = [] } = useQuery({
    queryKey: ['venus-alertes-non-resolues'],
    queryFn: () => base44.entities.VenusImprovementAlert.filter({ resolue: false }, '-creee_date', 20),
    refetchInterval: 30000,
  });

  // Dernier rapport
  const { data: dernierRapport } = useQuery({
    queryKey: ['venus-dernier-rapport'],
    queryFn: () => base44.entities.VenusImprovementReport.list('-created_date', 1),
    refetchInterval: 60000,
  });

  // Connaissances les plus utilisées
  const { data: connaissances = [] } = useQuery({
    queryKey: ['venus-connaissances-top'],
    queryFn: () => base44.entities.VenusKnowledge.filter({ statut: 'valide' }, '-created_date', 100),
    refetchInterval: 60000,
  });

  // Calculer score global et tendance
  useEffect(() => {
    if (analyses.length > 0) {
      const recent = analyses.slice(0, 50);
      const score = Math.round(recent.reduce((s, a) => s + (a.score_qualite || 0), 0) / recent.length);
      setScoreGlobal(score);

      // Calculer tendance: comparer 25 premières vs 25 suivantes
      if (recent.length >= 20) {
        const old = recent.slice(25, 50);
        const newR = recent.slice(0, 25);
        const oldScore = old.length > 0 ? old.reduce((s, a) => s + (a.score_qualite || 0), 0) / old.length : score;
        const newScore = newR.reduce((s, a) => s + (a.score_qualite || 0), 0) / newR.length;
        if (newScore > oldScore + 3) setTendance('amelioration');
        else if (newScore < oldScore - 3) setTendance('degradation');
        else setTendance('stable');
      }
    }
  }, [analyses]);

  const totalConversations = analyses.length;
  const reussites = analyses.filter(a => a.objectif_atteint === true).length;
  const echecs = analyses.filter(a => a.objectif_atteint === false).length;
  const tauxReussite = totalConversations > 0 ? Math.round((reussites / totalConversations) * 100) : 0;

  const pointsForts = [...faiblesses].sort((a, b) => b.score_moyen - a.score_moyen).slice(0, 3);
  const pointsFaibles = [...faiblesses].sort((a, b) => a.score_moyen - b.score_moyen).slice(0, 3);

  const suggestionsHaute = suggestions.filter(s => s.priorite === 'haute' || s.priorite === 'critique');

  return (
    <div className="space-y-6">
      {/* Score Global + Tendance */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium opacity-90">Score Qualité Global</span>
            {tendance === 'amelioration' && <TrendingUp className="w-5 h-5" />}
            {tendance === 'degradation' && <TrendingDown className="w-5 h-5" />}
            {tendance === 'stable' && <Minus className="w-5 h-5" />}
          </div>
          <div className="text-4xl font-bold">{scoreGlobal || '—'}<span className="text-lg opacity-70">/100</span></div>
          <div className="text-xs opacity-80 mt-1">
            {tendance === 'amelioration' && '📈 En amélioration'}
            {tendance === 'degradation' && '📉 En dégradation'}
            {tendance === 'stable' && '➡️ Stable'}
          </div>
        </div>

        <StatCard
          icon={CheckCircle}
          label="Taux de Réussite"
          value={`${tauxReussite}%`}
          subtext={`${reussites}/${totalConversations} conversations`}
          color="green"
        />
        <StatCard
          icon={Lightbulb}
          label="Suggestions en Attente"
          value={suggestions.length}
          subtext={`${suggestionsHaute.length} prioritaires`}
          color="amber"
          onClick={() => onNavigate('suggestions')}
        />
        <StatCard
          icon={AlertTriangle}
          label="Alertes Actives"
          value={alertes.length}
          subtext={`${alertes.filter(a => a.severite === 'critique').length} critiques`}
          color="red"
          onClick={() => onNavigate('alertes')}
        />
      </div>

      {/* Résumé Exécutif */}
      {dernierRapport?.[0] && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <FileBarChart className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-blue-900 mb-1">Résumé Exécutif — {dernierRapport[0].type_rapport}</h3>
              <p className="text-sm text-blue-800">{dernierRapport[0].resume_executif}</p>
            </div>
          </div>
        </div>
      )}

      {/* Points Forts et Faibles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Award className="w-4 h-4 text-green-600" /> Points Forts
          </h3>
          <div className="space-y-2">
            {pointsForts.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Pas encore assez de données</p>
            ) : pointsForts.map(f => (
              <div key={f.id} className="flex items-center justify-between bg-green-50 rounded-lg p-3 border border-green-100">
                <span className="text-sm font-medium text-gray-700 capitalize">{f.domaine.replace(/_/g, ' ')}</span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-green-700">{f.score_moyen}</span>
                  <span className="text-xs text-gray-400">/100</span>
                  {f.tendance === 'amelioration' && <TrendingUp className="w-3 h-3 text-green-600" />}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-600" /> Points Faibles
          </h3>
          <div className="space-y-2">
            {pointsFaibles.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Pas encore assez de données</p>
            ) : pointsFaibles.map(f => (
              <div key={f.id} className="flex items-center justify-between bg-red-50 rounded-lg p-3 border border-red-100">
                <div>
                  <span className="text-sm font-medium text-gray-700 capitalize">{f.domaine.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-red-500 ml-2">{f.taux_echec}% d'échec</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-red-700">{f.score_moyen}</span>
                  <span className="text-xs text-gray-400">/100</span>
                  {f.tendance === 'degradation' && <TrendingDown className="w-3 h-3 text-red-600" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Suggestions Prioritaires */}
      {suggestionsHaute.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" /> Améliorations Proposées (Priorité Haute)
          </h3>
          <div className="space-y-2">
            {suggestionsHaute.slice(0, 5).map(s => (
              <div key={s.id} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{s.question_detectee}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {s.nb_occurrences} occurrences · Confiance: {s.niveau_confiance}%
                    </p>
                  </div>
                  <Badge variant={s.priorite === 'critique' ? 'destructive' : 'secondary'}>
                    {s.priorite}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => onNavigate('suggestions')}>
            Voir toutes les suggestions →
          </Button>
        </div>
      )}

      {/* Connaissances les plus utilisées */}
      {connaissances.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-500" /> Connaissances les Plus Utilisées
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {connaissances.slice(0, 6).map(k => (
              <div key={k.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg p-3">
                <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center flex-shrink-0">
                  <Star className="w-4 h-4 text-yellow-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{k.titre}</p>
                  <p className="text-xs text-gray-400 capitalize">{k.categorie?.replace(/_/g, ' ')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtext, color, onClick }) {
  const colors = {
    green: 'bg-green-50 text-green-700 border-green-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
  };
  return (
    <div
      className={`rounded-2xl p-5 border ${colors[color]} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium opacity-80">{label}</span>
        <Icon className="w-5 h-5 opacity-60" />
      </div>
      <div className="text-3xl font-bold">{value}</div>
      {subtext && <div className="text-xs opacity-60 mt-1">{subtext}</div>}
    </div>
  );
}