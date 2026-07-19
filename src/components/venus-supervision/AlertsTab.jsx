import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { Bell, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';

const SEVERITE_CONFIG = {
  critique: { label: 'Critique', color: 'bg-red-500', text: 'text-red-600', border: 'border-red-200', icon: AlertCircle },
  warning: { label: 'Avertissement', color: 'bg-amber-500', text: 'text-amber-600', border: 'border-amber-200', icon: AlertTriangle },
  info: { label: 'Info', color: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-200', icon: Info },
};

const TYPE_LABELS = {
  reponse_incorrecte: 'Réponse incorrecte',
  workflow_echec: 'Échec de workflow',
  api_indisponible: 'API indisponible',
  document_introuvable: 'Document introuvable',
  erreur_repetee: 'Erreur répétée',
  conversation_bloquee: 'Conversation bloquée',
  outil_indisponible: 'Outil indisponible',
  anomalie_detectee: 'Anomalie détectée',
  confiance_basse: 'Confiance basse',
  escalade_declenchee: 'Escalade déclenchée',
  performance_degradee: 'Performance dégradée',
};

export default function AlertsTab({ initialAlerts }) {
  const [alerts, setAlerts] = useState(initialAlerts || []);
  const [filter, setFilter] = useState('active');
  const [resolving, setResolving] = useState(null);

  useEffect(() => { setAlerts(initialAlerts || []); }, [initialAlerts]);

  const fetchAlerts = async (statut) => {
    try {
      const res = await base44.functions.invoke('supervisionVenus', { action: 'get_alerts', statut });
      setAlerts(res.data.alerts);
    } catch (e) { console.error(e); }
  };

  const handleFilterChange = (statut) => {
    setFilter(statut);
    if (statut === 'all') fetchAlerts(null);
    else fetchAlerts(statut);
  };

  const handleResolve = async (alertId) => {
    try {
      setResolving(alertId);
      await base44.functions.invoke('supervisionVenus', { action: 'resolve_alert', alert_id: alertId });
      setAlerts(alerts.filter(a => a.id !== alertId));
    } catch (e) { console.error(e); }
    finally { setResolving(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Alertes de supervision</h2>
        <div className="flex gap-1">
          {['active', 'résolue', 'all'].map(f => (
            <button key={f} onClick={() => handleFilterChange(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === f ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
              {f === 'all' ? 'Toutes' : f === 'active' ? 'Actives' : 'Résolues'}
            </button>
          ))}
        </div>
      </div>

      {alerts.length === 0 ? (
        <Card className="p-12 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-gray-500">Aucune alerte {filter === 'active' ? 'active' : ''}</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => {
            const config = SEVERITE_CONFIG[alert.severite] || SEVERITE_CONFIG.info;
            const Icon = config.icon;
            return (
              <Card key={alert.id} className={`p-4 border-l-4 ${config.border}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`w-8 h-8 rounded-lg ${config.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-gray-900">{alert.titre}</p>
                        <span className={`text-xs font-bold ${config.text}`}>{config.label}</span>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-500">{TYPE_LABELS[alert.type] || alert.type}</span>
                      </div>
                      {alert.message && <p className="text-sm text-gray-600 mt-1">{alert.message}</p>}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        {alert.outil_concerne && <span>Outil: {alert.outil_concerne}</span>}
                        {alert.client_telephone && <span>Client: {alert.client_telephone}</span>}
                        <span>{new Date(alert.creee_date).toLocaleString('fr-FR')}</span>
                      </div>
                    </div>
                  </div>
                  {alert.statut === 'active' && (
                    <Button size="sm" variant="outline" onClick={() => handleResolve(alert.id)} disabled={resolving === alert.id}>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Résoudre
                    </Button>
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