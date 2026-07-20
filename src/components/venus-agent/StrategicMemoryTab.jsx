import React, { useState, useEffect, useCallback } from 'react';
import { MemoryStick, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function StrategicMemoryTab() {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/functions/venusAgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_strategic_memory' }),
      });
      const json = await res.json();
      if (json.success) setMemories(json.memories);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMemories(); }, [fetchMemories]);

  const TrendIcon = ({ direction }) => {
    if (direction === 'hausse') return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (direction === 'baisse') return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  // Group by category
  const grouped = {};
  for (const mem of memories) {
    if (!grouped[mem.categorie]) grouped[mem.categorie] = [];
    grouped[mem.categorie].push(mem);
  }

  const CATEGORY_LABELS = {
    tendance_demande: 'Tendances de Demande',
    zone_chaude: 'Zones Chaudes',
    heure_pointe: 'Heures de Pointe',
    livreur_top: 'Top Livreurs',
    partenaire_top: 'Top Partenaires',
    cause_reclamation: 'Causes de Réclamations',
    fonctionnalite_demandee: 'Fonctionnalités Demandées',
    probleme_recurrent: 'Problèmes Récurrents',
    saisonnalite: 'Saisonnalité',
    performance_globale: 'Performance Globale',
    comportement_client: 'Comportement Client',
    opportnite_business: 'Opportunités Business',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Mémoire Stratégique</h2>
          <p className="text-sm text-muted-foreground">VENUS conserve les tendances business pour anticiper et conseiller.</p>
        </div>
        <Button variant="outline" onClick={fetchMemories} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Chargement...</div>
      ) : memories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MemoryStick className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Aucune mémoire stratégique. Lancez une analyse métier pour la générer.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, items]) => (
            <Card key={cat}>
              <CardHeader>
                <CardTitle className="text-base">{CATEGORY_LABELS[cat] || cat}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((mem) => (
                    <div key={mem.id} className="p-3 rounded-lg border bg-muted/20">
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-sm font-medium text-foreground">{mem.valeur}</p>
                        <TrendIcon direction={mem.tendance_direction} />
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{mem.cle}</p>
                      <div className="flex items-center gap-2">
                        {mem.valeur_numerique != null && (
                          <span className="text-sm font-bold text-foreground">{mem.valeur_numerique}</span>
                        )}
                        {mem.tendance_pct !== 0 && mem.tendance_pct != null && (
                          <Badge variant={mem.tendance_direction === 'hausse' ? 'default' : 'secondary'} className="text-xs">
                            {mem.tendance_direction === 'hausse' ? '↑' : '↓'} {Math.abs(mem.tendance_pct)}%
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs ml-auto">{mem.periode_analyse}</Badge>
                      </div>
                      {mem.date_maj && (
                        <p className="text-xs text-muted-foreground mt-2">
                          MAJ: {new Date(mem.date_maj).toLocaleDateString('fr-FR')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}