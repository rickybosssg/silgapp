import React, { useState, useEffect, useCallback } from 'react';
import { Zap, RefreshCw, Filter, CheckCircle2, XCircle, Clock, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const STATUS_VARIANTS = {
  proposee: 'secondary',
  validee: 'default',
  executee: 'default',
  rejetee: 'destructive',
  echec: 'destructive',
  expiree: 'outline',
};

const STATUS_LABELS = {
  proposee: 'Proposée',
  validee: 'Validée',
  executee: 'Exécutée',
  rejetee: 'Rejetée',
  echec: 'Échec',
  expiree: 'Expirée',
};

export default function AgentActionsTab() {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [selectedAction, setSelectedAction] = useState(null);
  const [explanation, setExplanation] = useState(null);

  const fetchActions = useCallback(async () => {
    setLoading(true);
    try {
      const body = { action: 'get_actions', limit: 50 };
      if (filter) body.statut = filter;
      const res = await fetch('/api/functions/venusAgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) setActions(json.actions);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchActions(); }, [fetchActions]);

  const explainAction = async (actionId) => {
    setSelectedAction(actionId);
    setExplanation(null);
    try {
      const res = await fetch('/api/functions/venusAgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'explain_action', action_id: actionId }),
      });
      const json = await res.json();
      if (json.success) setExplanation(json);
    } catch (e) { console.error(e); }
  };

  const validateAction = async (actionId) => {
    await fetch('/api/functions/venusAgent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'validate_action', action_id: actionId }),
    });
    fetchActions();
  };

  const rejectAction = async (actionId) => {
    await fetch('/api/functions/venusAgent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject_action', action_id: actionId }),
    });
    fetchActions();
  };

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        {['', 'proposee', 'executee', 'validee', 'rejetee'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              filter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {s ? STATUS_LABELS[s] : 'Toutes'}
          </button>
        ))}
        <Button variant="outline" size="sm" onClick={fetchActions} className="ml-auto gap-2">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </Button>
      </div>

      {/* Actions List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Chargement...</div>
      ) : actions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Aucune action</div>
      ) : (
        <div className="space-y-3">
          {actions.map((action) => (
            <Card key={action.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{action.type_action}</Badge>
                      <Badge variant={STATUS_VARIANTS[action.statut] || 'outline'} className="text-xs">
                        {STATUS_LABELS[action.statut] || action.statut}
                      </Badge>
                      <Badge variant={action.priorite === 'critique' ? 'destructive' : 'secondary'} className="text-xs">
                        {action.priorite}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(action.date_creation).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <p className="text-sm text-foreground font-medium mb-1">{action.raisonnement}</p>
                    {action.action_executee && (
                      <p className="text-sm text-muted-foreground">{action.action_executee}</p>
                    )}
                    {action.resultat && (
                      <p className="text-xs text-muted-foreground mt-1">Résultat: {action.resultat}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {action.statut === 'proposee' && (
                      <>
                        <Button size="sm" variant="default" onClick={() => validateAction(action.id)}>
                          <CheckCircle2 className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => rejectAction(action.id)}>
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => explainAction(action.id)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Explanation Panel */}
                {selectedAction === action.id && explanation && (
                  <div className="mt-4 p-3 rounded-lg bg-muted/30 border space-y-2">
                    <p className="text-xs font-semibold text-foreground">Explication de la décision</p>
                    <p className="text-sm text-muted-foreground">{explanation.explication}</p>
                    {explanation.etapes && explanation.etapes.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-foreground mt-2">Étapes du raisonnement</p>
                        <div className="space-y-1 mt-1">
                          {explanation.etapes.map((etape, i) => (
                            <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                              <span className="font-medium text-foreground">{etape.etape}:</span>
                              <span>{etape.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold">Niveau de confiance:</span> {explanation.niveau_confiance}%
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}