import React, { useState, useEffect, useCallback } from 'react';
import { ScrollText, RefreshCw, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function DecisionLogTab() {
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const fetchDecisions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/functions/venusAgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_decision_log' }),
      });
      const json = await res.json();
      if (json.success) setDecisions(json.decisions);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDecisions(); }, [fetchDecisions]);

  const toggleExpand = (id) => {
    setExpanded(expanded === id ? null : id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Journal des Décisions</h2>
          <p className="text-sm text-muted-foreground">Transparence totale: pourquoi VENUS a agi, quelles règles, quelles données.</p>
        </div>
        <Button variant="outline" onClick={fetchDecisions} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Chargement...</div>
      ) : decisions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ScrollText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Aucune décision enregistrée.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {decisions.map((dec) => (
            <Card key={dec.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{dec.agent}</Badge>
                      <Badge variant="secondary" className="text-xs">{dec.type_decision}</Badge>
                      {dec.niveau_confiance != null && (
                        <Badge variant={dec.niveau_confiance >= 80 ? 'default' : 'secondary'} className="text-xs">
                          Confiance: {dec.niveau_confiance}%
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(dec.date_creation).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <p className="text-sm text-foreground font-medium mb-1">{dec.explication_simple}</p>
                    <p className="text-sm text-muted-foreground">{dec.raisonnement}</p>

                    {expanded === dec.id && (
                      <div className="mt-3 space-y-3">
                        {/* Steps */}
                        {dec.etapes_raisonnement && (() => {
                          try {
                            const steps = JSON.parse(dec.etapes_raisonnement);
                            return (
                              <div className="p-3 rounded-lg bg-muted/30">
                                <p className="text-xs font-semibold text-foreground mb-2">Boucle de Raisonnement</p>
                                <div className="space-y-1">
                                  {steps.map((step, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs">
                                      <span className="font-medium text-primary min-w-[100px]">{step.etape}:</span>
                                      <span className="text-muted-foreground">{step.description}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          } catch { return null; }
                        })()}

                        {/* Rules Applied */}
                        {dec.regles_appliquees && dec.regles_appliquees !== '[]' && (() => {
                          try {
                            const rules = JSON.parse(dec.regles_appliquees);
                            if (rules.length === 0) return null;
                            return (
                              <div className="p-3 rounded-lg bg-muted/30">
                                <p className="text-xs font-semibold text-foreground mb-2">Règles Appliquées</p>
                                <div className="space-y-1">
                                  {rules.map((rule, i) => (
                                    <div key={i} className="text-xs text-muted-foreground">
                                      <span className="font-medium text-foreground">{rule.regle_nom || rule.rule_name}:</span>
                                      {' '}{rule.condition} → {rule.action}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          } catch { return null; }
                        })()}

                        {/* Data Used */}
                        {dec.donnees_utilisees && (
                          <div className="p-3 rounded-lg bg-muted/30">
                            <p className="text-xs font-semibold text-foreground mb-1">Données Utilisées</p>
                            <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                              {(() => {
                                try { return JSON.stringify(JSON.parse(dec.donnees_utilisees), null, 2); }
                                catch { return dec.donnees_utilisees; }
                              })()}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => toggleExpand(dec.id)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}