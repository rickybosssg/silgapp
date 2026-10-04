import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, FlaskConical, TrendingUp, Wallet, Users, Repeat, Percent, Globe } from 'lucide-react';
import AutopiloteStatusCard from '@/components/growth/AutopiloteStatusCard';

const STATUS_COLORS = {
  donnees_insuffisantes: 'bg-gray-100 text-gray-700',
  sous_performante: 'bg-red-100 text-red-700',
  a_surveiller: 'bg-amber-100 text-amber-700',
  performante: 'bg-green-100 text-green-700',
};

const STATUS_LABELS = {
  donnees_insuffisantes: 'Données insuffisantes',
  sous_performante: 'Sous-performante',
  a_surveiller: 'À surveiller',
  performante: 'Performante',
};

function formatFcfa(n) {
  if (n == null) return 'N/A';
  return Math.round(n).toLocaleString('fr-FR') + ' FCFA';
}

export default function AutopiloteDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('getAutopiloteDashboard');
      setData(res.data);
    } catch (err) {
      setError(err?.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const handleApprove = async (decisionId) => {
    setActionLoading(decisionId);
    try {
      await base44.entities.GrowthDecision.update(decisionId, {
        status: 'approved',
        approved_by: 'admin',
        approved_at: new Date().toISOString(),
      });
      await base44.functions.invoke('executeGrowthDecision', { decision_id: decisionId });
      await fetchDashboard();
    } catch (err) {
      setError(err?.message || 'Erreur lors de l\'approbation');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (decisionId) => {
    setActionLoading(decisionId);
    try {
      await base44.entities.GrowthDecision.update(decisionId, {
        status: 'rejected',
        rejected_by: 'admin',
        rejected_at: new Date().toISOString(),
        rejection_reason: 'Refusé par admin',
      });
      await fetchDashboard();
    } catch (err) {
      setError(err?.message || 'Erreur lors du refus');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Chargement de l'Autopilote...</div>;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;
  if (!data) return null;

  const budget = data.budget || {};
  const cac = data.cac_by_channel || {};
  const revenue = data.revenue || {};
  const experiments = data.experiments || [];
  const recommendations = data.pending_recommendations || [];
  const recentDecisions = data.recent_decisions || [];

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">🤖 Autopilote Acquisition</h1>
        <Button variant="outline" size="sm" onClick={fetchDashboard} disabled={loading}>
          <RefreshCw className="h-4 w-4" /> Actualiser
        </Button>
      </div>

      <AutopiloteStatusCard data={data} />

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4" /> Budget mensuel
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Acquisition', spent: budget.acquisition_spent, cap: budget.acquisition_cap },
            { label: 'Primes', spent: budget.primes_spent, cap: budget.primes_cap },
            { label: 'Réactivation', spent: budget.reactivation_spent, cap: budget.reactivation_cap },
            { label: 'Global', spent: budget.total_spent, cap: budget.total_cap },
          ].map((b) => {
            const pct = b.cap > 0 ? Math.min(100, (b.spent / b.cap) * 100) : 0;
            return (
              <div key={b.label} className="space-y-1">
                <div className="text-xs text-gray-500">{b.label}</div>
                <div className="text-sm font-semibold text-gray-900">{formatFcfa(b.spent)}</div>
                <div className="text-xs text-gray-400">/ {formatFcfa(b.cap)}</div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Globe className="h-4 w-4" /> Métriques globales (tous canaux confondus)
          <span className="text-[10px] font-normal text-gray-400 ml-1">— ≠ résultats du Test A ci-dessus</span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-500"><Users className="h-3 w-3" /> 1ères courses</div>
            <div className="text-lg font-bold text-gray-900">{data.acquisition?.first_courses_this_month ?? 0}</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-500"><Repeat className="h-3 w-3" /> 2èmes courses</div>
            <div className="text-lg font-bold text-gray-900">{data.acquisition?.second_courses_this_month ?? 0}</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-500"><TrendingUp className="h-3 w-3" /> Commissions</div>
            <div className="text-lg font-bold text-gray-900">{formatFcfa(revenue.attributed_commission_fcfa)}</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-500"><Percent className="h-3 w-3" /> Com./Dép.</div>
            <div className="text-lg font-bold text-gray-900">{revenue.commission_to_spend_ratio ? (revenue.commission_to_spend_ratio * 100).toFixed(1) + '%' : 'N/A'}</div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">CAC par canal</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-xs">
            <div className="text-gray-500">Meta Ads</div>
            <div className="font-semibold text-gray-900">{formatFcfa(cac.meta_ads?.cac_first_course_fcfa)}</div>
            <div className="text-gray-400">{cac.meta_ads?.first_courses_attributed ?? 0} clients</div>
          </div>
          <div className="text-xs">
            <div className="text-gray-500">Réactivation</div>
            <div className="font-semibold text-gray-900">{formatFcfa(cac.reactivation?.cost_per_reactivation_fcfa)}</div>
            <div className="text-gray-400">{cac.reactivation?.clients_reactivated ?? 0} clients</div>
          </div>
          <div className="text-xs">
            <div className="text-gray-500">Parrainage</div>
            <div className="font-semibold text-gray-900">{formatFcfa(cac.parrainage?.cac_first_course_fcfa)}</div>
            <div className="text-gray-400">{cac.parrainage?.first_courses_attributed ?? 0} clients</div>
          </div>
          <div className="text-xs">
            <div className="text-gray-500">Global</div>
            <div className="font-semibold text-gray-900">{formatFcfa(cac.global?.cac_first_course_fcfa)}</div>
            <div className="text-gray-400">{cac.global?.first_courses_total ?? 0} clients</div>
          </div>
        </div>
      </Card>

      {experiments.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <FlaskConical className="h-4 w-4" /> Expériences ({experiments.length})
          </h2>
          <div className="space-y-2">
            {experiments.map((exp) => (
              <div key={exp.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">{exp.name}</span>
                  <Badge className={STATUS_COLORS[exp.performance_status] || 'bg-gray-100'} variant="secondary">
                    {STATUS_LABELS[exp.performance_status] || exp.performance_status}
                  </Badge>
                </div>
                <div className="text-xs text-gray-500 grid grid-cols-3 gap-2">
                  <span>Dépense: {formatFcfa(exp.spend_fcfa)}</span>
                  <span>1ères: {exp.first_courses}</span>
                  <span>CAC: {formatFcfa(exp.cac_first_course_fcfa)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {recommendations.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Recommandations du moteur ({recommendations.length})</h2>
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div key={rec.id} className="border border-blue-200 rounded-lg p-3 bg-blue-50">
                <div className="text-sm text-gray-900 mb-2">{rec.recommended_action}</div>
                <div className="text-xs text-gray-500 mb-3">
                  Règle: {rec.trigger_rule} | Impact budget: {formatFcfa(rec.budget_impact)}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleApprove(rec.id)} disabled={actionLoading === rec.id}>
                    <CheckCircle2 className="h-4 w-4" /> Approuver
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleReject(rec.id)} disabled={actionLoading === rec.id}>
                    <XCircle className="h-4 w-4" /> Refuser
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {recentDecisions.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Journal des décisions</h2>
          <div className="space-y-1 text-xs text-gray-500">
            {recentDecisions.slice(0, 10).map((d) => (
              <div key={d.id} className="flex justify-between border-b border-gray-100 py-1">
                <span>{(d.recommended_action || '').slice(0, 60)}...</span>
                <Badge variant="outline" className="text-xs">{d.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="text-xs text-gray-400 text-center">
        Objectif CAC: {formatFcfa(data.cac_target_fcfa)} | Dernière collecte: {data.last_metrics_update ? new Date(data.last_metrics_update).toLocaleString('fr-FR') : 'Jamais'}
      </div>
    </div>
  );
}