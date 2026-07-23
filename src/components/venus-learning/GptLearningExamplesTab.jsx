import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Loader2, CheckCircle2, XCircle, Eye, Filter,
  Sparkles, AlertTriangle, Clock, DollarSign, Zap,
  ChevronDown, ChevronUp, User, MessageSquare, Bot
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const STATUS_CONFIG = {
  draft: { label: 'Brouillon', color: 'bg-slate-100 text-slate-700', icon: Clock },
  pending_review: { label: 'En attente', color: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
  approved: { label: 'Validé', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  rejected: { label: 'Rejeté', color: 'bg-red-100 text-red-700', icon: XCircle },
  archived: { label: 'Archivé', color: 'bg-gray-100 text-gray-500', icon: Eye },
};

const LEARNING_TYPE_LABELS = {
  faq: 'FAQ',
  scenario: 'Scénario',
  intent_example: 'Exemple d\'intention',
  entity_extraction: 'Extraction d\'entités',
  tool_routing: 'Routage d\'outil',
  response_template: 'Modèle de réponse',
  business_rule_candidate: 'Règle métier candidate',
  error_case: 'Cas d\'erreur',
};

export default function GptLearningExamplesTab() {
  const [examples, setExamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, draft: 0, pending: 0, approved: 0, rejected: 0 });
  const [filterStatus, setFilterStatus] = useState('pending_review');
  const [expandedId, setExpandedId] = useState(null);
  const [reviewComment, setReviewComment] = useState({});
  const [actionLoading, setActionLoading] = useState(null);

  const fetchExamples = useCallback(async () => {
    setLoading(true);
    try {
      let filter = {};
      if (filterStatus === 'pending_review') filter = { review_status: 'pending_review' };
      else if (filterStatus === 'draft') filter = { review_status: 'draft' };
      else if (filterStatus === 'approved') filter = { review_status: 'approved' };
      else if (filterStatus === 'rejected') filter = { review_status: 'rejected' };
      else if (filterStatus === 'all') filter = {};

      const data = await base44.entities.VenusLearningExample.filter(filter, '-created_date', 50);
      setExamples(data || []);

      // Fetch stats
      const [allDrafts, allPending, allApproved, allRejected] = await Promise.all([
        base44.entities.VenusLearningExample.filter({ review_status: 'draft' }, '-created_date', 500).catch(() => []),
        base44.entities.VenusLearningExample.filter({ review_status: 'pending_review' }, '-created_date', 500).catch(() => []),
        base44.entities.VenusLearningExample.filter({ review_status: 'approved' }, '-created_date', 500).catch(() => []),
        base44.entities.VenusLearningExample.filter({ review_status: 'rejected' }, '-created_date', 500).catch(() => []),
      ]);
      setStats({
        total: (allDrafts?.length || 0) + (allPending?.length || 0) + (allApproved?.length || 0) + (allRejected?.length || 0),
        draft: allDrafts?.length || 0,
        pending: allPending?.length || 0,
        approved: allApproved?.length || 0,
        rejected: allRejected?.length || 0,
      });
    } catch (e) {
      console.error('Erreur fetch examples:', e);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { fetchExamples(); }, [fetchExamples]);

  const handleReview = async (id, status) => {
    setActionLoading(id);
    try {
      const user = await base44.auth.me();
      await base44.entities.VenusLearningExample.update(id, {
        review_status: status,
        reviewer_id: user?.email || 'admin',
        review_comment: reviewComment[id] || '',
        reviewed_at: new Date().toISOString(),
      });
      setReviewComment({ ...reviewComment, [id]: '' });
      fetchExamples();
    } catch (e) {
      console.error('Erreur review:', e);
    } finally {
      setActionLoading(null);
    }
  };

  const FILTER_TABS = [
    { id: 'pending_review', label: 'En attente', count: stats.pending },
    { id: 'draft', label: 'Brouillons', count: stats.draft },
    { id: 'approved', label: 'Validés', count: stats.approved },
    { id: 'rejected', label: 'Rejetés', count: stats.rejected },
    { id: 'all', label: 'Tous', count: stats.total },
  ];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total" value={stats.total} icon={Sparkles} color="from-blue-500 to-indigo-600" />
        <StatCard label="En attente" value={stats.pending} icon={Clock} color="from-amber-500 to-orange-600" />
        <StatCard label="Validés" value={stats.approved} icon={CheckCircle2} color="from-green-500 to-emerald-600" />
        <StatCard label="Rejetés" value={stats.rejected} icon={XCircle} color="from-red-500 to-rose-600" />
        <StatCard label="Brouillons" value={stats.draft} icon={Eye} color="from-slate-500 to-gray-600" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide bg-white rounded-lg p-1 border border-slate-200">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilterStatus(tab.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors",
              filterStatus === tab.id ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-xs",
                filterStatus === tab.id ? "bg-white/20" : "bg-slate-200"
              )}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Examples list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : examples.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Sparkles className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>Aucun exemple dans cette catégorie.</p>
          <p className="text-xs mt-1">Les interactions GPT apparaîtront ici automatiquement.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {examples.map(ex => {
            const isExpanded = expandedId === ex.id;
            const statusCfg = STATUS_CONFIG[ex.review_status] || STATUS_CONFIG.draft;
            const StatusIcon = statusCfg.icon;
            return (
              <div key={ex.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Header */}
                <div
                  className="px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : ex.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className={cn("border-0", statusCfg.color)}>
                          <StatusIcon className="w-3 h-3 mr-1" />{statusCfg.label}
                        </Badge>
                        {ex.detected_intent && (
                          <Badge variant="outline" className="text-xs">{ex.detected_intent}</Badge>
                        )}
                        {ex.learning_type && (
                          <span className="text-xs text-slate-400">
                            {LEARNING_TYPE_LABELS[ex.learning_type] || ex.learning_type}
                          </span>
                        )}
                        {ex.country_code && (
                          <span className="text-xs text-slate-400">· {ex.country_code}</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 line-clamp-2">
                        <MessageSquare className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                        {ex.customer_message || '(message vide)'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs text-slate-400 shrink-0">
                      {ex.cost_usd > 0 && (
                        <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{ex.cost_usd.toFixed(4)}$</span>
                      )}
                      {ex.latency_ms > 0 && (
                        <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{ex.latency_ms}ms</span>
                      )}
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                  {/* Score badges */}
                  {(ex.quality_score > 0 || ex.risk_score > 0) && (
                    <div className="flex gap-2 mt-2">
                      {ex.quality_score > 0 && (
                        <span className={cn("text-xs px-1.5 py-0.5 rounded",
                          ex.quality_score >= 70 ? "bg-green-50 text-green-600" : ex.quality_score >= 40 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600")}>
                          Qualité: {ex.quality_score}/100
                        </span>
                      )}
                      {ex.risk_score > 0 && (
                        <span className={cn("text-xs px-1.5 py-0.5 rounded",
                          ex.risk_score >= 60 ? "bg-red-50 text-red-600" : ex.risk_score >= 30 ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600")}>
                          Risque: {ex.risk_score}/100
                        </span>
                      )}
                      {ex.model_used && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{ex.model_used}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-4 py-3 space-y-3 bg-slate-50/50">
                    {ex.gpt_response && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1"><Bot className="w-3 h-3" />Réponse GPT</p>
                        <p className="text-sm text-slate-700 bg-white rounded-lg p-2 border border-slate-200">{ex.gpt_response}</p>
                      </div>
                    )}
                    {ex.final_response_sent && ex.final_response_sent !== ex.gpt_response && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1">Réponse finale envoyée</p>
                        <p className="text-sm text-slate-700 bg-white rounded-lg p-2 border border-slate-200">{ex.final_response_sent}</p>
                      </div>
                    )}
                    {ex.tools_called && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1">Outils appelés</p>
                        <p className="text-sm text-slate-600 font-mono bg-white rounded p-2 border border-slate-200">{ex.tools_called}</p>
                      </div>
                    )}
                    {ex.conversation_context && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1">Contexte</p>
                        <p className="text-xs text-slate-500 font-mono bg-white rounded p-2 border border-slate-200 max-h-32 overflow-auto">{ex.conversation_context}</p>
                      </div>
                    )}
                    {ex.rag_documents_used && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1">Documents RAG utilisés</p>
                        <p className="text-xs text-slate-500 font-mono bg-white rounded p-2 border border-slate-200 max-h-32 overflow-auto">{ex.rag_documents_used}</p>
                      </div>
                    )}
                    {ex.review_comment && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-1">Commentaire admin</p>
                        <p className="text-sm text-slate-600 italic">"{ex.review_comment}"</p>
                        {ex.reviewer_id && <p className="text-xs text-slate-400">par {ex.reviewer_id}</p>}
                      </div>
                    )}

                    {/* Review actions */}
                    {(ex.review_status === 'draft' || ex.review_status === 'pending_review') && (
                      <div className="space-y-2 pt-2">
                        <Textarea
                          placeholder="Commentaire (optionnel)..."
                          value={reviewComment[ex.id] || ''}
                          onChange={e => setReviewComment({ ...reviewComment, [ex.id]: e.target.value })}
                          className="text-sm"
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleReview(ex.id, 'approved')}
                            disabled={actionLoading === ex.id}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" />Valider
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReview(ex.id, 'rejected')}
                            disabled={actionLoading === ex.id}
                            className="border-red-300 text-red-600 hover:bg-red-50"
                          >
                            <XCircle className="w-4 h-4 mr-1" />Rejeter
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleReview(ex.id, 'archived')}
                            disabled={actionLoading === ex.id}
                          >
                            Archiver
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <div className="flex items-center gap-2">
        <div className={cn("w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center", color)}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900 leading-none">{value}</p>
          <p className="text-xs text-slate-500 mt-0.5">{label}</p>
        </div>
      </div>
    </div>
  );
}