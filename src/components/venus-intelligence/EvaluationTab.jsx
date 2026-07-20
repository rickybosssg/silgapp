import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Trophy, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function EvaluationTab() {
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    try { setScores(await base44.entities.VenusDomainScore.list('-created_date', 50) || []); } catch (e) {}
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const overall = scores.length > 0 ? Math.round(scores.reduce((s, d) => s + (d.score || 0), 0) / scores.length) : 0;

  const getScoreColor = (score) => score >= 90 ? 'from-green-500 to-emerald-500' : score >= 70 ? 'from-blue-500 to-indigo-500' : score >= 50 ? 'from-orange-500 to-amber-500' : 'from-red-500 to-rose-500';
  const getScoreTextColor = (score) => score >= 90 ? 'text-green-600' : score >= 70 ? 'text-blue-600' : score >= 50 ? 'text-orange-600' : 'text-red-600';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{scores.length} domaines évalués</p>
        <Button variant="outline" size="sm" onClick={fetch}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400"><RefreshCw className="w-6 h-6 mx-auto animate-spin" /></div>
      ) : (
        <>
          {/* Score global */}
          <div className={`bg-gradient-to-br ${getScoreColor(overall)} rounded-2xl p-6 text-white text-center shadow-lg mb-4`}>
            <Trophy className="w-10 h-10 mx-auto mb-2 opacity-90" />
            <p className="text-xs opacity-80 uppercase tracking-widest">Score global VENUS</p>
            <p className="text-5xl font-black">{overall}%</p>
            <p className="text-xs opacity-70 mt-1">Moyenne de {scores.length} domaines</p>
          </div>

          {/* Tableau par domaine */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Évaluation par domaine</p>
            </div>
            <div className="divide-y divide-gray-50">
              {scores.map(d => {
                const score = d.score || 0;
                const prog = d.progression || 0;
                return (
                  <div key={d.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{d.label || d.domaine}</p>
                        <span className={`text-sm font-bold ${getScoreTextColor(score)}`}>{score}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full bg-gradient-to-r ${getScoreColor(score)}`} style={{ width: `${score}%` }} />
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                        <span>{d.nb_interactions || 0} interactions</span>
                        <span>{d.nb_reussies || 0} réussies</span>
                        {prog !== 0 && (
                          <span className={`flex items-center gap-0.5 ${prog > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {prog > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {Math.abs(prog)}%
                          </span>
                        )}
                        {d.derniere_amelioration && <span className="truncate">💡 {d.derniere_amelioration}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {scores.length === 0 && <div className="px-4 py-8 text-center text-gray-400"><Trophy className="w-8 h-8 mx-auto mb-2 opacity-20" /><p className="text-sm">Aucune évaluation. Initialisez les scores.</p></div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}