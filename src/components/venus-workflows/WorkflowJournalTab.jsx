import React, { useState, useEffect } from 'react';
import { RefreshCw, ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUT_STYLES = {
  en_cours: { label: 'En cours', color: 'bg-blue-100 text-blue-700', icon: Clock },
  en_attente: { label: 'En attente', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  en_attente_evenement: { label: 'Attente événement', color: 'bg-orange-100 text-orange-700', icon: Clock },
  termine: { label: 'Terminé', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  erreur: { label: 'Erreur', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
  annule: { label: 'Annulé', color: 'bg-gray-100 text-gray-700', icon: XCircle },
  simulation: { label: 'Simulation', color: 'bg-purple-100 text-purple-700', icon: FlaskConical },
};

function FlaskConical(props) { return <Clock {...props} />; }

export default function WorkflowJournalTab() {
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [filterStatut, setFilterStatut] = useState('all');

  const fetchExecutions = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.VenusWorkflowExecution.list('-date_debut', 100);
      setExecutions(data || []);
    } catch (e) {
      setExecutions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchExecutions(); }, []);

  const filtered = filterStatut === 'all' ? executions : executions.filter(e => e.statut === filterStatut);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Select value={filterStatut} onValueChange={setFilterStatut}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="en_cours">En cours</SelectItem>
              <SelectItem value="en_attente">En attente</SelectItem>
              <SelectItem value="en_attente_evenement">Attente événement</SelectItem>
              <SelectItem value="termine">Terminé</SelectItem>
              <SelectItem value="erreur">Erreur</SelectItem>
              <SelectItem value="annule">Annulé</SelectItem>
              <SelectItem value="simulation">Simulation</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{filtered.length} exécution(s)</span>
        </div>
        <Button onClick={fetchExecutions} variant="ghost" size="sm"><RefreshCw className="w-4 h-4" /> Rafraîchir</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><RefreshCw className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-20">Aucune exécution enregistrée.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((exec) => {
            const isExpanded = expandedId === exec.id;
            const statutStyle = STATUT_STYLES[exec.statut] || STATUT_STYLES.en_cours;
            const StatutIcon = statutStyle.icon;
            let historique = [];
            try { historique = JSON.parse(exec.historique || '[]'); } catch {}
            let donnees = {};
            try { donnees = JSON.parse(exec.donnees || '{}'); } catch {}

            return (
              <div key={exec.id} className="bg-white rounded-xl border border-border overflow-hidden">
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30"
                  onClick={() => setExpandedId(isExpanded ? null : exec.id)}
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{exec.workflow_nom || exec.workflow_code}</span>
                      <Badge variant="secondary" className={`text-[10px] ${statutStyle.color}`}>
                        <StatutIcon className="w-3 h-3 mr-1" />{statutStyle.label}
                      </Badge>
                      {exec.is_simulation && <Badge variant="outline" className="text-[10px]">SIM</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                      <span>📞 {exec.client_telephone || 'N/A'}</span>
                      {exec.course_id && <span>📦 {exec.course_id.slice(0, 8)}</span>}
                      <span>⏱ {exec.date_debut ? new Date(exec.date_debut).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      {exec.etape_actuelle && <span>📍 {exec.etape_actuelle}</span>}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border p-3 bg-muted/20 space-y-3">
                    {/* Données collectées */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-1">Données collectées</h4>
                      <div className="bg-white rounded-lg border border-border p-2 text-xs space-y-1">
                        {Object.entries(donnees).filter(([k]) => !k.startsWith('_')).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <span className="text-muted-foreground min-w-[120px]">{k}:</span>
                            <span className="font-medium truncate">{String(v)}</span>
                          </div>
                        ))}
                        {Object.keys(donnees).filter(k => !k.startsWith('_')).length === 0 && <span className="text-muted-foreground">Aucune donnée</span>}
                      </div>
                    </div>

                    {/* Historique */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-1">Historique d'exécution ({historique.length} étapes)</h4>
                      <div className="bg-white rounded-lg border border-border p-2 space-y-1 max-h-60 overflow-y-auto">
                        {historique.map((h, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs py-1 border-b border-border/50 last:border-0">
                            <span className="text-muted-foreground min-w-[60px]">{h.date ? new Date(h.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}</span>
                            <Badge variant="outline" className="text-[9px]">{h.type || h.action || 'event'}</Badge>
                            <span className="text-muted-foreground flex-1 truncate">{h.resultat || h.champ || h.evenement || ''}</span>
                            {h.success === false && <XCircle className="w-3 h-3 text-red-500" />}
                          </div>
                        ))}
                      </div>
                    </div>

                    {exec.erreur_type && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs">
                        <span className="font-semibold text-red-700">Erreur: {exec.erreur_type}</span>
                        {exec.erreur_message && <p className="text-red-600 mt-1">{exec.erreur_message}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}