import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollText, BookOpen, Workflow, Target, TrendingUp, Brain, Clock, Zap } from 'lucide-react';

export default function WhyThisResponseDialog({ interactionId, open, onOpenChange }) {
  const [log, setLog] = useState(null);
  const [rule, setRule] = useState(null);
  const [knowledge, setKnowledge] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !interactionId) return;
    setLoading(true);
    setLog(null); setRule(null); setKnowledge(null);
    (async () => {
      try {
        const logs = await base44.entities.VenusReasoningLog.filter({ interaction_id: interactionId }, '-date_traitement', 1);
        if (logs.length > 0) {
          const l = logs[0];
          setLog(l);
          if (l.business_rule_id) {
            try { setRule(await base44.entities.VenusBusinessRule.get(l.business_rule_id)); } catch {}
          }
          if (l.knowledge_id) {
            try { setKnowledge(await base44.entities.VenusKnowledge.get(l.knowledge_id)); } catch {}
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, [open, interactionId]);

  const parseJson = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Brain className="w-5 h-5 text-violet-500" /> Pourquoi cette réponse ?</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="text-center py-8 text-gray-400"><Brain className="w-8 h-8 mx-auto mb-2 animate-pulse" /><p className="text-sm">Analyse du raisonnement…</p></div>
        ) : !log ? (
          <div className="text-center py-8 text-gray-400"><Brain className="w-8 h-8 mx-auto mb-2 opacity-20" /><p className="text-sm">Aucun journal de raisonnement trouvé pour cette interaction.</p></div>
        ) : (
          <div className="space-y-3">
            {/* Score de confiance */}
            <div className={`rounded-xl p-4 text-white text-center ${log.confiance >= 80 ? 'bg-gradient-to-br from-green-500 to-emerald-600' : log.confiance >= 50 ? 'bg-gradient-to-br from-orange-500 to-amber-600' : 'bg-gradient-to-br from-red-500 to-rose-600'}`}>
              <p className="text-xs opacity-80 uppercase tracking-widest">Score de confiance</p>
              <p className="text-3xl font-black">{log.confiance || 0}%</p>
              <p className="text-xs opacity-70 mt-1 flex items-center justify-center gap-1"><Clock className="w-3 h-3" /> {log.temps_traitement_ms || 0}ms</p>
            </div>

            {/* Intention et contexte */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded-xl border border-gray-100 p-3">
                <div className="flex items-center gap-1.5 mb-1"><Target className="w-3.5 h-3.5 text-blue-500" /><p className="text-[10px] font-bold text-gray-400 uppercase">Intention</p></div>
                <p className="text-sm font-medium text-gray-900">{log.intention || '—'}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-3">
                <div className="flex items-center gap-1.5 mb-1"><Zap className="w-3.5 h-3.5 text-purple-500" /><p className="text-[10px] font-bold text-gray-400 uppercase">Action</p></div>
                <p className="text-sm font-medium text-gray-900">{log.action_choisie || '—'}</p>
              </div>
            </div>

            {/* Règle métier appliquée */}
            {rule && (
              <div className="bg-amber-50 rounded-xl border border-amber-200 p-3">
                <div className="flex items-center gap-1.5 mb-1"><ScrollText className="w-3.5 h-3.5 text-amber-600" /><p className="text-[10px] font-bold text-amber-700 uppercase">Règle métier appliquée</p></div>
                <p className="text-sm font-bold text-amber-900">{rule.nom}</p>
                <p className="text-xs text-amber-700 mt-1">{rule.description}</p>
                {rule.exemples && <p className="text-[11px] text-amber-600 italic mt-1">Exemples: {parseJson(rule.exemples, []).slice(0, 2).join(' · ')}</p>}
              </div>
            )}

            {/* Connaissance utilisée */}
            {knowledge && (
              <div className="bg-green-50 rounded-xl border border-green-200 p-3">
                <div className="flex items-center gap-1.5 mb-1"><BookOpen className="w-3.5 h-3.5 text-green-600" /><p className="text-[10px] font-bold text-green-700 uppercase">Connaissance utilisée</p></div>
                <p className="text-sm font-bold text-green-900">{knowledge.titre}</p>
                <p className="text-xs text-green-700 mt-1">{(knowledge.reponse_officielle || '').substring(0, 150)}</p>
              </div>
            )}

            {/* Outils utilisés */}
            {log.outils_utilises && (
              <div className="bg-white rounded-xl border border-gray-100 p-3">
                <div className="flex items-center gap-1.5 mb-1"><Workflow className="w-3.5 h-3.5 text-gray-500" /><p className="text-[10px] font-bold text-gray-400 uppercase">Outils utilisés</p></div>
                <div className="flex flex-wrap gap-1">
                  {parseJson(log.outils_utilises, []).map((tool, i) => (
                    <span key={i} className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{tool}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Message et réponse */}
            <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Message du client</p>
                <p className="text-xs text-gray-700 bg-gray-50 rounded-lg p-2">{log.message_recu || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Réponse de VENUS</p>
                <p className="text-xs text-gray-700 bg-violet-50 rounded-lg p-2">{log.reponse_envoyee || '—'}</p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}