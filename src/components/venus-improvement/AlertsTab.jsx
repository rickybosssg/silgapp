import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Bell, AlertTriangle, AlertCircle, Info, Check, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

const SEVERITE_CONFIG = {
  critique: { label: 'Critique', icon: AlertCircle, color: 'bg-red-100 text-red-700 border-red-200', iconColor: 'text-red-600' },
  warning: { label: 'Avertissement', icon: AlertTriangle, color: 'bg-amber-100 text-amber-700 border-amber-200', iconColor: 'text-amber-600' },
  info: { label: 'Info', icon: Info, color: 'bg-blue-100 text-blue-700 border-blue-200', iconColor: 'text-blue-600' },
};

const TYPE_LABELS = {
  erreur_frequente: 'Erreur fréquente',
  question_nouvelle: 'Nouvelle question',
  workflow_echec: 'Workflow en échec',
  outil_indisponible: 'Outil indisponible',
  score_bas: 'Score bas',
  reformulation_excessive: 'Reformulations excessives',
  intervention_humaine_frequente: 'Interventions humaines fréquentes',
};

export default function AlertsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('non_resolues');

  const { data: alertes = [], isLoading } = useQuery({
    queryKey: ['venus-alertes', filter],
    queryFn: () => base44.entities.VenusImprovementAlert.filter(
      filter === 'toutes' ? {} : filter === 'non_resolues' ? { resolue: false } : { resolue: true },
      '-creee_date', 100
    ),
    refetchInterval: 30000,
  });

  const handleResolve = async (alerteId) => {
    try {
      const user = await base44.auth.me();
      await base44.entities.VenusImprovementAlert.update(alerteId, {
        resolue: true,
        resolue_par: user?.email || 'admin',
        resolue_at: new Date().toISOString(),
      });
      toast({ title: '✅ Alerte résolue' });
      queryClient.invalidateQueries({ queryKey: ['venus-alertes'] });
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    }
  };

  if (isLoading) return <p className="text-center text-gray-400 py-8">Chargement...</p>;

  const alertesCritiques = alertes.filter(a => a.severite === 'critique' && !a.resolue);

  return (
    <div className="space-y-4">
      {/* En-tête */}
      {alertesCritiques.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-900">
              {alertesCritiques.length} alerte(s) critique(s) non résolue(s)
            </p>
            <p className="text-xs text-red-700">Une attention immédiate est requise.</p>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="non_resolues">Non résolues</SelectItem>
            <SelectItem value="resolues">Résolues</SelectItem>
            <SelectItem value="toutes">Toutes</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-500">{alertes.length} alerte(s)</span>
      </div>

      {/* Liste */}
      {alertes.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">Aucune alerte dans cette catégorie</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alertes.map(a => {
            const config = SEVERITE_CONFIG[a.severite] || SEVERITE_CONFIG.warning;
            const Icon = config.icon;
            return (
              <Card key={a.id} className={`p-4 border ${a.resolue ? 'opacity-60' : ''} ${config.color}`}>
                <div className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-gray-800">{a.titre}</p>
                      <Badge variant="outline" className="text-xs">
                        {TYPE_LABELS[a.type] || a.type}
                      </Badge>
                      {a.domaine && (
                        <Badge variant="secondary" className="text-xs capitalize">
                          {a.domaine.replace(/_/g, ' ')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{a.message}</p>
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(a.creee_date).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  {!a.resolue && (
                    <Button size="sm" variant="outline" onClick={() => handleResolve(a.id)}>
                      <Check className="w-4 h-4 mr-1" /> Résoudre
                    </Button>
                  )}
                  {a.resolue && (
                    <Badge variant="default" className="bg-green-600">
                      <Check className="w-3 h-3 mr-1" /> Résolue
                    </Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}