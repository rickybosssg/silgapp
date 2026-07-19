import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, TrendingDown, TrendingUp, Clock, Brain, Zap, CheckCircle } from 'lucide-react';

const TYPE_CONFIG = {
  hausse_erreurs: { label: 'Hausse des erreurs', icon: AlertTriangle, color: 'text-red-600' },
  baisse_reussite: { label: 'Baisse du taux de réussite', icon: TrendingDown, color: 'text-orange-600' },
  hausse_escalades: { label: 'Hausse des escalades', icon: AlertTriangle, color: 'text-amber-600' },
  ralentissement: { label: 'Ralentissement', icon: Clock, color: 'text-purple-600' },
  comportement_anormal: { label: 'Comportement anormal', icon: AlertTriangle, color: 'text-pink-600' },
  pic_erreurs: { label: 'Pic d\'erreurs', icon: Zap, color: 'text-red-600' },
  baisse_confiance: { label: 'Baisse de confiance', icon: Brain, color: 'text-indigo-600' },
  outil_indisponible_long: { label: 'Outil indisponible (longue durée)', icon: AlertTriangle, color: 'text-red-600' },
  conversation_bloquee_long: { label: 'Conversation bloquée (longue durée)', icon: Clock, color: 'text-amber-600' },
};

const SEVERITE_COLOR = {
  critique: 'border-l-red-500 bg-red-50',
  warning: 'border-l-amber-500 bg-amber-50',
  info: 'border-l-blue-500 bg-blue-50',
};

export default function AnomaliesTab({ initialAnomalies }) {
  const [anomalies, setAnomalies] = useState(initialAnomalies || []);
  const [filter, setFilter] = useState('active');
  const [resolving, setResolving] = useState(null);

  useEffect(() => { setAnomalies(initialAnomalies || []); }, [initialAnomalies]);

  const fetchAnomalies = async (statut) => {
    try {
      const res = await base44.functions.invoke('supervisionVenus', { action: 'get_anomalies', statut });
      setAnomalies(res.data.anomalies);
    } catch (e) { console.error(e); }
  };

  const handleFilterChange = (statut) => {
    setFilter(statut);
    if (statut === 'all') fetchAnomalies(null);
    else fetchAnomalies(statut);
  };

  const handleResolve = async (id) => {
    try {
      setResolving(id);
      await base44.functions.invoke('supervisionVenus', { action: 'resolve_anomaly', anomaly_id: id });
      setAnomalies(anomalies.filter(a => a.id !== id));
    } catch (e) { console.error(e); }
    finally { setResolving(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Détection d'anomalies</h2>
          <p className="text-sm text-gray-500">Variations inhabituelles détectées automatiquement</p>
        </div>
        <div className="flex gap-1">
          {['active', 'résolue', 'all'].map(f => (
            <button key={f} onClick={() => handleFilterChange(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === f ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
              {f === 'all' ? 'Toutes' : f === 'active' ? 'Actives' : 'Résolues'}
            </button>
          ))}
        </div>
      </div>

      {anomalies.length === 0 ? (
        <Card className="p-12 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-gray-500">Aucune anomalie détectée — VENUS fonctionne normalement</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {anomalies.map((a) => {
            const config = TYPE_CONFIG[a.type] || TYPE_CONFIG.comportement_anormal;
            const Icon = config.icon;
            return (
              <Card key={a.id} className={`p-4 border-l-4 ${SEVERITE_COLOR[a.severite] || SEVERITE_COLOR.warning}`}>
                <div className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 ${config.color} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm text-gray-900">{a.titre}</p>
                      <span className={`text-xs font-bold uppercase ${config.color}`}>{a.severite}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{a.description}</p>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                      <div className="text-center p-2 rounded bg-white/50">
                        <p className="text-gray-500">Actuel</p>
                        <p className="font-bold text-gray-900">{a.valeur_actuelle}</p>
                      </div>
                      <div className="text-center p-2 rounded bg-white/50">
                        <p className="text-gray-500">Normal</p>
                        <p className="font-bold text-gray-900">{a.valeur_normale}</p>
                      </div>
                      <div className="text-center p-2 rounded bg-white/50">
                        <p className="text-gray-500">Écart</p>
                        <p className={`font-bold ${a.ecart_pct > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {a.ecart_pct > 0 ? '+' : ''}{a.ecart_pct}%
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-gray-400">{a.periode} — {new Date(a.creee_date).toLocaleString('fr-FR')}</span>
                      {a.statut === 'active' && (
                        <Button size="sm" variant="outline" onClick={() => handleResolve(a.id)} disabled={resolving === a.id}>
                          Résoudre
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}