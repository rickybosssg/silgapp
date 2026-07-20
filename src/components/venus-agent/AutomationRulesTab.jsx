import React, { useState, useEffect, useCallback } from 'react';
import { Brain, RefreshCw, Play, ToggleLeft, ToggleRight, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function AutomationRulesTab() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/functions/venusAgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_rules' }),
      });
      const json = await res.json();
      if (json.success) setRules(json.rules);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const initDefaults = async () => {
    setInitializing(true);
    try {
      await fetch('/api/functions/venusAgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'init_default_rules' }),
      });
      await fetchRules();
    } catch (e) { console.error(e); }
    finally { setInitializing(false); }
  };

  const toggleRule = async (ruleId, currentActive) => {
    await fetch('/api/functions/venusAgent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_rule', rule_id: ruleId, active: !currentActive }),
    });
    fetchRules();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Règles d'Automatisation</h2>
          <p className="text-sm text-muted-foreground">SI condition ALORS action — VENUS agit automatiquement selon ces règles.</p>
        </div>
        <Button onClick={initDefaults} disabled={initializing} variant="outline" className="gap-2">
          {initializing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Initialiser les règles par défaut
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Chargement...</div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Aucune règle. Cliquez sur "Initialiser les règles par défaut" pour commencer.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Zap className={`w-4 h-4 ${rule.active ? 'text-primary' : 'text-muted-foreground'}`} />
                      <p className="text-sm font-semibold text-foreground">{rule.nom}</p>
                      <Badge variant="outline" className="text-xs">{rule.categorie}</Badge>
                      <Badge variant={rule.niveau_autonomie === 'auto_execute' ? 'default' : 'secondary'} className="text-xs">
                        {rule.niveau_autonomie === 'auto_execute' ? 'Auto' : 'Suggestion'}
                      </Badge>
                      <Badge variant={rule.priorite === 'critique' ? 'destructive' : 'secondary'} className="text-xs">
                        {rule.priorite}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{rule.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium">Condition:</span>
                      <code className="px-1.5 py-0.5 rounded bg-muted">{rule.condition_type}</code>
                      <span className="font-medium ml-2">Action:</span>
                      <code className="px-1.5 py-0.5 rounded bg-muted">{rule.action_type}</code>
                    </div>
                    {rule.nb_declenchements > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Déclenchée {rule.nb_declenchements} fois
                        {rule.dernier_declenchement && (
                          ` · Dernier: ${new Date(rule.dernier_declenchement).toLocaleString('fr-FR')}`
                        )}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => toggleRule(rule.id, rule.active)}
                    className="p-1"
                    title={rule.active ? 'Désactiver' : 'Activer'}
                  >
                    {rule.active
                      ? <ToggleRight className="w-8 h-8 text-primary" />
                      : <ToggleLeft className="w-8 h-8 text-muted-foreground" />
                    }
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}