import React, { useState, useEffect, useCallback } from 'react';
import { Zap, Clock, TrendingUp, Brain, RefreshCw, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function AgentOverviewTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/functions/venusAgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_dashboard' }),
      });
      const json = await res.json();
      if (json.success) setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  if (loading) return <div className="text-center py-12 text-muted-foreground">Chargement...</div>;
  if (!data) return <div className="text-center py-12 text-muted-foreground">Aucune donnée</div>;

  const { stats, pending_actions, recent_insights, strategic_memory, recent_decisions } = data;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard icon={Zap} label="Actions Totales" value={stats.total_actions} color="text-blue-500" />
        <StatCard icon={Clock} label="Validations en Attente" value={stats.pending_validations} color="text-orange-500" />
        <StatCard icon={Brain} label="Règles Actives" value={stats.active_rules} color="text-purple-500" />
        <StatCard icon={TrendingUp} label="Insights" value={stats.insights_count} color="text-green-500" />
        <StatCard icon={AlertCircle} label="Mémoires Stratégiques" value={stats.strategic_memories} color="text-red-500" />
      </div>

      {/* Pending Validations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="w-5 h-5 text-orange-500" />
            Actions en Attente de Validation
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pending_actions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucune action en attente</p>
          ) : (
            <div className="space-y-3">
              {pending_actions.map((action) => (
                <div key={action.id} className="flex items-start justify-between p-3 rounded-lg border bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">{action.type_action}</Badge>
                      <Badge variant={action.priorite === 'critique' ? 'destructive' : 'secondary'} className="text-xs">{action.priorite}</Badge>
                    </div>
                    <p className="text-sm text-foreground">{action.raisonnement}</p>
                    <p className="text-xs text-muted-foreground mt-1">{action.action_executee}</p>
                  </div>
                  <div className="flex gap-2 ml-2">
                    <Button size="sm" variant="default" onClick={() => validateAction(action.id, fetchDashboard)}>
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => rejectAction(action.id, fetchDashboard)}>
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Insights & Strategic Memory */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="w-5 h-5 text-green-500" />
              Insights Récents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recent_insights.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun insight</p>
            ) : (
              <div className="space-y-2">
                {recent_insights.map((insight) => (
                  <div key={insight.id} className="p-2 rounded border bg-muted/20">
                    <p className="text-sm font-medium text-foreground">{insight.titre}</p>
                    <p className="text-xs text-muted-foreground">{insight.description}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Mémoire Stratégique
            </CardTitle>
          </CardHeader>
          <CardContent>
            {strategic_memory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucune tendance</p>
            ) : (
              <div className="space-y-2">
                {strategic_memory.map((mem) => (
                  <div key={mem.id} className="flex items-center justify-between p-2 rounded border bg-muted/20">
                    <div>
                      <p className="text-sm font-medium text-foreground">{mem.cle}</p>
                      <p className="text-xs text-muted-foreground">{mem.valeur}</p>
                    </div>
                    {mem.tendance_pct !== 0 && (
                      <Badge variant={mem.tendance_direction === 'hausse' ? 'default' : 'secondary'} className="text-xs">
                        {mem.tendance_direction === 'hausse' ? '↑' : '↓'} {Math.abs(mem.tendance_pct || 0)}%
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Decisions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="w-5 h-5 text-purple-500" />
            Décisions Récentes (Transparence)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recent_decisions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucune décision</p>
          ) : (
            <div className="space-y-2">
              {recent_decisions.map((dec) => (
                <div key={dec.id} className="p-3 rounded-lg border bg-muted/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">{dec.agent}</Badge>
                    <Badge variant="secondary" className="text-xs">{dec.type_decision}</Badge>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(dec.date_creation).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">{dec.explication_simple}</p>
                  <p className="text-xs text-muted-foreground mt-1">Confiance: {dec.niveau_confiance}%</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button variant="outline" onClick={fetchDashboard} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </Button>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Icon className={`w-8 h-8 ${color}`} />
          <div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

async function validateAction(actionId, refresh) {
  try {
    await fetch('/api/functions/venusAgent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'validate_action', action_id: actionId }),
    });
    refresh();
  } catch (e) { console.error(e); }
}

async function rejectAction(actionId, refresh) {
  try {
    await fetch('/api/functions/venusAgent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject_action', action_id: actionId }),
    });
    refresh();
  } catch (e) { console.error(e); }
}