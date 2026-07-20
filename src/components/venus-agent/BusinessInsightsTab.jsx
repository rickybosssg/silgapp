import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, RefreshCw, TrendingUp, TrendingDown, Minus, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function BusinessInsightsTab() {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/functions/venusAgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_insights' }),
      });
      const json = await res.json();
      if (json.success) setInsights(json.insights);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/functions/venusAgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analyze_business', periode: 'semaine' }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchInsights();
      }
    } catch (e) { console.error(e); }
    finally { setAnalyzing(false); }
  };

  const TrendIcon = ({ direction }) => {
    if (direction === 'hausse') return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (direction === 'baisse') return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Analyses Métier Automatiques</h2>
          <p className="text-sm text-muted-foreground">Meilleures heures, zones actives, livreurs performants, causes de réclamations...</p>
        </div>
        <Button onClick={runAnalysis} disabled={analyzing} className="gap-2">
          {analyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {analyzing ? 'Analyse...' : 'Lancer l\'analyse'}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Chargement...</div>
      ) : insights.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Aucun insight disponible. Lancez une analyse pour générer des insights.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {insights.map((insight) => (
            <Card key={insight.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{insight.titre}</p>
                    <Badge variant="outline" className="text-xs mt-1">{insight.type_analyse}</Badge>
                  </div>
                  <TrendIcon direction={insight.tendance} />
                </div>
                <p className="text-sm text-muted-foreground mb-2">{insight.description}</p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-foreground">{insight.valeur_principale}</span>
                  <Badge variant="secondary" className="text-xs">{insight.periode}</Badge>
                  {insight.tendance_pct !== 0 && insight.tendance_pct != null && (
                    <span className="text-xs text-muted-foreground">
                      ({insight.tendance_pct > 0 ? '+' : ''}{insight.tendance_pct}%)
                    </span>
                  )}
                </div>

                {/* Detailed Data */}
                {insight.donnees_detaillees && (() => {
                  try {
                    const data = JSON.parse(insight.donnees_detaillees);
                    if (Array.isArray(data) && data.length > 0) {
                      return (
                        <div className="mt-3 space-y-1">
                          {data.slice(0, 5).map((item, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{item.label}</span>
                              <span className="font-medium text-foreground">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                  } catch {}
                  return null;
                })()}

                {/* Recommendations */}
                {insight.recommandations && insight.recommandations !== '[]' && (() => {
                  try {
                    const recs = JSON.parse(insight.recommandations);
                    if (recs.length > 0) {
                      return (
                        <div className="mt-3 p-2 rounded-lg bg-primary/5 border border-primary/20">
                          {recs.map((rec, i) => (
                            <div key={i} className="text-xs">
                              <Badge variant={rec.priorite === 'critique' ? 'destructive' : 'secondary'} className="text-xs mr-1">
                                {rec.priorite}
                              </Badge>
                              <span className="text-foreground">{rec.titre}</span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                  } catch {}
                  return null;
                })()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}