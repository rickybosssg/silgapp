import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { UserCheck, Clock, Phone, MapPin, Wrench, AlertCircle, MessageSquare, CheckCircle } from 'lucide-react';

const STATUT_CONFIG = {
  en_attente: { label: 'En attente', color: 'bg-amber-100 text-amber-700' },
  pris_en_charge: { label: 'Pris en charge', color: 'bg-blue-100 text-blue-700' },
  résolu: { label: 'Résolu', color: 'bg-green-100 text-green-700' },
  abandonné: { label: 'Abandonné', color: 'bg-gray-100 text-gray-700' },
};

export default function EscalationsTab({ initialEscalations }) {
  const [escalations, setEscalations] = useState(initialEscalations || []);
  const [filter, setFilter] = useState('en_attente');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [resolution, setResolution] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { setEscalations(initialEscalations || []); }, [initialEscalations]);

  const fetchEscalations = async (statut) => {
    try {
      const res = await base44.functions.invoke('supervisionVenus', { action: 'get_escalations', statut });
      setEscalations(res.data.escalations);
    } catch (e) { console.error(e); }
  };

  const handleFilterChange = (statut) => {
    setFilter(statut);
    if (statut === 'all') fetchEscalations(null);
    else fetchEscalations(statut);
  };

  const openDetail = async (esc) => {
    setSelected(esc);
    setResolution('');
    try {
      const res = await base44.functions.invoke('supervisionVenus', { action: 'get_escalation_detail', escalation_id: esc.id });
      setDetail(res.data);
    } catch (e) { console.error(e); }
  };

  const handleAssign = async () => {
    try {
      setLoading(true);
      await base44.functions.invoke('supervisionVenus', { action: 'assign_escalation', escalation_id: selected.id });
      const updated = { ...selected, statut: 'pris_en_charge', assigne_a: 'vous' };
      setSelected(updated);
      setEscalations(escalations.map(e => e.id === selected.id ? updated : e));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleResolve = async () => {
    try {
      setLoading(true);
      await base44.functions.invoke('supervisionVenus', {
        action: 'resolve_escalation',
        escalation_id: selected.id,
        resolution,
        client_informe: true,
      });
      setEscalations(escalations.filter(e => e.id !== selected.id));
      setSelected(null);
      setDetail(null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Escalades vers un humain</h2>
        <div className="flex gap-1">
          {['en_attente', 'pris_en_charge', 'résolu', 'all'].map(f => (
            <button key={f} onClick={() => handleFilterChange(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === f ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
              {f === 'all' ? 'Toutes' : STATUT_CONFIG[f]?.label || f}
            </button>
          ))}
        </div>
      </div>

      {escalations.length === 0 ? (
        <Card className="p-12 text-center">
          <UserCheck className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-gray-500">Aucune escalade {filter !== 'all' ? 'dans cet état' : ''}</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {escalations.map((esc) => {
            const config = STATUT_CONFIG[esc.statut] || STATUT_CONFIG.en_attente;
            return (
              <Card key={esc.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDetail(esc)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${config.color}`}>{config.label}</span>
                      {esc.client_nom && <span className="font-semibold text-sm">{esc.client_nom}</span>}
                      {esc.country_code && <span className="text-xs text-gray-500">{esc.country_code}</span>}
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{esc.raison_escalade}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      {esc.niveau_confiance > 0 && <span>Confiance: {esc.niveau_confiance}/100</span>}
                      {esc.assigne_a && <span>Assigné: {esc.assigne_a}</span>}
                      <span>{new Date(esc.creee_date).toLocaleString('fr-FR')}</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); setDetail(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5" />
                  Escalade — {selected.client_nom || selected.client_telephone || 'Client'}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> {selected.client_telephone || 'N/A'}</div>
                  <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /> {selected.country_code || 'N/A'}</div>
                  <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-gray-400" /> Confiance: {selected.niveau_confiance}/100</div>
                  <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /> {new Date(selected.creee_date).toLocaleString('fr-FR')}</div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Raison de l'escalade</p>
                  <p className="text-sm bg-amber-50 p-3 rounded-lg">{selected.raison_escalade}</p>
                </div>

                {selected.infos_collectees && selected.infos_collectees !== '{}' && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Informations collectées par VENUS</p>
                    <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-x-auto max-h-40">{selected.infos_collectees}</pre>
                  </div>
                )}

                {selected.outils_utilises && selected.outils_utilises !== '[]' && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1"><Wrench className="w-3 h-3" /> Outils utilisés</p>
                    <div className="flex flex-wrap gap-1">
                      {JSON.parse(selected.outils_utilises).map((o, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs">{o}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selected.erreurs_rencontrees && selected.erreurs_rencontrees !== '[]' && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Erreurs rencontrées</p>
                    <div className="space-y-1">
                      {JSON.parse(selected.erreurs_rencontrees).map((e, i) => (
                        <div key={i} className="text-xs bg-red-50 p-2 rounded">
                          <span className="font-medium">{e.action}</span> — Confiance: {e.confiance}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detail?.messages?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Historique de la conversation</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {detail.messages.map((m, i) => (
                        <div key={i} className={`text-xs p-2 rounded-lg ${m.role === 'client' ? 'bg-blue-50 ml-4' : 'bg-gray-50 mr-4'}`}>
                          <span className="font-semibold">{m.role}:</span> {m.content?.substring(0, 200)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selected.statut === 'en_attente' && (
                  <Button onClick={handleAssign} disabled={loading} className="w-full">
                    <UserCheck className="w-4 h-4 mr-2" />
                    Prendre en charge
                  </Button>
                )}

                {selected.statut === 'pris_en_charge' && (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Résolution</p>
                      <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)}
                        placeholder="Décrivez la résolution apportée..." rows={3} />
                    </div>
                    <Button onClick={handleResolve} disabled={loading || !resolution} className="w-full">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Marquer comme résolu
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}