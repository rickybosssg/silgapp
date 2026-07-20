import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, X, GitMerge, Sparkles, AlertTriangle, Brain, ChevronDown, ChevronUp, History, Target, Gauge, ScrollText, BookOpen, FileText, Workflow, Lightbulb } from 'lucide-react';

const STATUT_LABELS = { en_attente: { label: 'En attente', cls: 'bg-gray-100 text-gray-600' }, validee: { label: 'Validée', cls: 'bg-green-100 text-green-700' }, refusee: { label: 'Refusée', cls: 'bg-red-100 text-red-700' }, fusionnee: { label: 'Fusionnée', cls: 'bg-blue-100 text-blue-700' }, amelioree: { label: 'Améliorée', cls: 'bg-violet-100 text-violet-700' } };
const PRIORITE_LABELS = { critique: { label: 'Critique', cls: 'bg-red-100 text-red-700' }, haute: { label: 'Haute', cls: 'bg-orange-100 text-orange-700' }, normale: { label: 'Normale', cls: 'bg-blue-100 text-blue-700' }, basse: { label: 'Basse', cls: 'bg-gray-100 text-gray-600' } };
const parse = (s, f) => { try { return JSON.parse(s); } catch { return f || []; } };

export default function SuggestionCard({ s, onValidate, onImprove, onRefuse, onMerge, onAnalyse, analysing }) {
  const [showWhy, setShowWhy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const exemples = useMemo(() => parse(s.conversations_exemples, []), [s]);
  const sources = useMemo(() => parse(s.sources_poids, []), [s]);
  const versions = useMemo(() => parse(s.historique_versions, []), [s]);
  const recos = useMemo(() => parse(s.recommandations, []), [s]);
  const hasAnalysis = s.score_global_qualite != null;

  const qualityMetrics = [
    { label: 'Exactitude', val: s.score_exactitude, color: 'bg-blue-500' },
    { label: 'Clarté', val: s.score_clarte, color: 'bg-cyan-500' },
    { label: 'Politesse', val: s.score_politesse, color: 'bg-green-500' },
    { label: 'Règles métier', val: s.score_respect_regles, color: 'bg-amber-500' },
    { label: 'Utilité', val: s.score_utilite, color: 'bg-violet-500' },
    { label: 'Cohérence', val: s.score_coherence, color: 'bg-pink-500' },
  ];

  return (
    <Card className={`p-4 border shadow-sm ${s.hallucination_detectee ? 'border-red-200 bg-red-50/30' : 'border-gray-100'}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${(PRIORITE_LABELS[s.priorite] || PRIORITE_LABELS.normale).cls}`}>{(PRIORITE_LABELS[s.priorite] || PRIORITE_LABELS.normale).label}</span>
            {s.is_nouvelle_question && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-600">Nouvelle</span>}
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${(STATUT_LABELS[s.statut] || STATUT_LABELS.en_attente).cls}`}>{(STATUT_LABELS[s.statut] || STATUT_LABELS.en_attente).label}</span>
            <span className="text-[10px] text-gray-400">×{s.nb_occurrences} occurrences</span>
          </div>
          <p className="text-sm font-medium text-gray-900">{s.question_detectee}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span className="flex items-center gap-1"><Target className="w-3 h-3" /> {s.intention_detectee || '—'}</span>
            <span className="flex items-center gap-1"><Gauge className="w-3 h-3" /> {s.niveau_confiance || '—'}%</span>
            {s.categorie && <span className="capitalize">{s.categorie.replace(/_/g, ' ')}</span>}
          </div>
        </div>
      </div>

      {/* Hallucination warning */}
      {s.hallucination_detectee && (
        <div className="bg-red-100 border border-red-300 rounded-lg p-2.5 mb-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-red-700">⚠ Hallucination détectée</p>
            <p className="text-[11px] text-red-600">{s.hallucination_details || 'La réponse contient potentiellement des informations inventées.'}</p>
            <p className="text-[10px] text-red-500 mt-0.5 italic">Validation bloquée — corrigez via « Améliorer »</p>
          </div>
        </div>
      )}

      {/* Quality score */}
      {hasAnalysis && (
        <div className="bg-gradient-to-br from-gray-50 to-white rounded-lg border border-gray-100 p-3 mb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Analyse qualité</span>
            <span className={`text-2xl font-black ${s.score_global_qualite >= 80 ? 'text-green-600' : s.score_global_qualite >= 60 ? 'text-orange-500' : 'text-red-500'}`}>{s.score_global_qualite}<span className="text-sm">/100</span></span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {qualityMetrics.map(m => (
              <div key={m.label}>
                <div className="flex items-center justify-between text-[10px] mb-0.5"><span className="text-gray-500">{m.label}</span><span className="font-bold text-gray-700">{m.val ?? '—'}</span></div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${m.color} rounded-full`} style={{ width: `${m.val || 0}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Responses */}
      <div className="space-y-2 mb-2">
        {s.reponse_proposee && (
          <div className="bg-violet-50 rounded-lg p-2.5 border border-violet-100">
            <p className="text-[10px] font-bold text-violet-600 uppercase mb-0.5">Réponse proposée par VENUS</p>
            <p className="text-xs text-gray-700 whitespace-pre-wrap">{s.reponse_proposee}</p>
          </div>
        )}
        {s.amelioration_reponse && (
          <div className="bg-green-50 rounded-lg p-2.5 border border-green-200">
            <p className="text-[10px] font-bold text-green-700 uppercase mb-0.5">✨ Réponse améliorée</p>
            <p className="text-xs text-gray-700 whitespace-pre-wrap">{s.amelioration_reponse}</p>
          </div>
        )}
        {s.reponse_actuelle && s.reponse_actuelle !== 'Aucune réponse officielle' && !showComparison && (
          <div className="bg-amber-50 rounded-lg p-2.5 border border-amber-100">
            <p className="text-[10px] font-bold text-amber-600 uppercase mb-0.5">Réponse actuelle de VENUS</p>
            <p className="text-xs text-gray-600 line-clamp-2">{s.reponse_actuelle}</p>
          </div>
        )}
      </div>

      {/* Comparison toggle */}
      {s.amelioration_reponse && s.reponse_proposee && (
        <button onClick={() => setShowComparison(!showComparison)} className="text-[11px] text-violet-600 hover:underline mb-2 flex items-center gap-1">
          {showComparison ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Comparaison côte à côte
        </button>
      )}
      {showComparison && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="bg-amber-50 rounded-lg p-2 border border-amber-100">
            <p className="text-[9px] font-bold text-amber-600 uppercase mb-1">Actuelle</p>
            <p className="text-[11px] text-gray-600 line-clamp-4">{s.reponse_actuelle || '—'}</p>
          </div>
          <div className="bg-violet-50 rounded-lg p-2 border border-violet-100">
            <p className="text-[9px] font-bold text-violet-600 uppercase mb-1">Proposée</p>
            <p className="text-[11px] text-gray-700 line-clamp-4">{s.reponse_proposee}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-2 border border-green-200">
            <p className="text-[9px] font-bold text-green-700 uppercase mb-1">Améliorée</p>
            <p className="text-[11px] text-gray-700 line-clamp-4">{s.amelioration_reponse}</p>
          </div>
        </div>
      )}

      {/* Sources used */}
      {sources.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-100 p-2.5 mb-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> Sources utilisées</p>
          <div className="space-y-1">
            {sources.map((src, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-gray-600 w-24 truncate">{src.source}</span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400 rounded-full" style={{ width: `${src.poids || 0}%` }} /></div>
                <span className="text-[9px] text-gray-400">{src.poids || 0}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* "Pourquoi cette suggestion?" panel */}
      <button onClick={() => setShowWhy(!showWhy)} className="text-[11px] text-violet-600 hover:underline mb-2 flex items-center gap-1">
        <Brain className="w-3 h-3" /> Pourquoi cette suggestion ?
        {showWhy ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {showWhy && (
        <div className="bg-violet-50/50 rounded-lg border border-violet-100 p-3 mb-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="flex items-center gap-1.5"><Target className="w-3 h-3 text-blue-500" /><span className="text-gray-500">Intention:</span> <span className="font-medium text-gray-800">{s.intention_detectee || '—'}</span></div>
            <div className="flex items-center gap-1.5"><Gauge className="w-3 h-3 text-purple-500" /><span className="text-gray-500">Confiance:</span> <span className="font-medium text-gray-800">{s.niveau_confiance || '—'}%</span></div>
            <div className="flex items-center gap-1.5"><ScrollText className="w-3 h-3 text-amber-500" /><span className="text-gray-500">Règle métier:</span> <span className="font-medium text-gray-800">{s.regle_metier_nom || '—'}</span></div>
            <div className="flex items-center gap-1.5"><Workflow className="w-3 h-3 text-gray-500" /><span className="text-gray-500">Workflow:</span> <span className="font-medium text-gray-800">{s.workflow_utilise || '—'}</span></div>
            <div className="flex items-center gap-1.5"><BookOpen className="w-3 h-3 text-green-500" /><span className="text-gray-500">Connaissance:</span> <span className="font-medium text-gray-800">{s.knowledge_titre || '—'}</span></div>
            <div className="flex items-center gap-1.5"><FileText className="w-3 h-3 text-cyan-500" /><span className="text-gray-500">Document:</span> <span className="font-medium text-gray-800">{s.document_sources ? 'Consulté' : '—'}</span></div>
            <div className="flex items-center gap-1.5"><Lightbulb className="w-3 h-3 text-yellow-500" /><span className="text-gray-500">Scénario:</span> <span className="font-medium text-gray-800">{s.scenario_utilise || '—'}</span></div>
          </div>
          {s.raisonnement_detaille && (
            <div className="mt-2 pt-2 border-t border-violet-100">
              <p className="text-[10px] font-bold text-violet-600 uppercase mb-1">Étapes du raisonnement</p>
              <p className="text-[11px] text-gray-600 whitespace-pre-wrap">{typeof s.raisonnement_detaille === 'string' && s.raisonnement_detaille.startsWith('{') ? parse(s.raisonnement_detaille, {}).resume || s.raisonnement_detaille : s.raisonnement_detaille}</p>
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {recos.length > 0 && (
        <div className="bg-blue-50 rounded-lg border border-blue-100 p-2.5 mb-2">
          <p className="text-[10px] font-bold text-blue-600 uppercase mb-1 flex items-center gap-1"><Lightbulb className="w-3 h-3" /> Recommandations post-validation</p>
          {recos.map((r, i) => (
            <div key={i} className="text-[11px] text-blue-700 flex items-start gap-1.5 mt-0.5">
              <span className="text-blue-400">→</span>
              <div><span className="font-medium">{r.titre}:</span> {r.description}</div>
            </div>
          ))}
        </div>
      )}

      {/* History */}
      {versions.length > 0 && (
        <button onClick={() => setShowHistory(!showHistory)} className="text-[11px] text-gray-500 hover:underline mb-2 flex items-center gap-1">
          <History className="w-3 h-3" /> Historique ({versions.length} versions)
          {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      )}
      {showHistory && versions.length > 0 && (
        <div className="bg-gray-50 rounded-lg border border-gray-100 p-2.5 mb-2 space-y-2">
          {versions.map((v, i) => (
            <div key={i} className="text-[11px] border-l-2 border-gray-200 pl-2">
              <p className="font-medium text-gray-700">v{v.version || i + 1} — {v.auteur || '—'} · {v.date ? new Date(v.date).toLocaleDateString('fr-FR') : '—'}</p>
              {v.raison && <p className="text-gray-500 italic">{v.raison}</p>}
              {v.ancienne_reponse && <p className="text-gray-400 line-through line-clamp-1">{v.ancienne_reponse}</p>}
              {v.nouvelle_reponse && <p className="text-gray-600 line-clamp-1">{v.nouvelle_reponse}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {s.statut === 'en_attente' && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={onValidate} disabled={s.hallucination_detectee} className="bg-green-600 hover:bg-green-700 disabled:opacity-40">
            <Check className="w-4 h-4 mr-1" /> Valider
          </Button>
          <Button size="sm" variant="outline" onClick={onImprove} className="border-violet-200 text-violet-700 hover:bg-violet-50">
            <Sparkles className="w-4 h-4 mr-1" /> Améliorer
          </Button>
          <Button size="sm" variant="outline" onClick={onMerge}>
            <GitMerge className="w-4 h-4 mr-1" /> Fusionner
          </Button>
          <Button size="sm" variant="outline" onClick={onRefuse} className="text-red-600 hover:text-red-700">
            <X className="w-4 h-4 mr-1" /> Refuser
          </Button>
          {!hasAnalysis && (
            <Button size="sm" variant="ghost" onClick={onAnalyse} disabled={analysing}>
              <Gauge className="w-4 h-4 mr-1" /> {analysing ? 'Analyse...' : 'Analyser qualité'}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}