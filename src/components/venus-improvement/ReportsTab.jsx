import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FileBarChart, FileText, Calendar, RefreshCw, TrendingUp, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

const TYPE_LABELS = {
  quotidien: { label: 'Quotidien', color: 'bg-blue-100 text-blue-700' },
  hebdomadaire: { label: 'Hebdomadaire', color: 'bg-purple-100 text-purple-700' },
  mensuel: { label: 'Mensuel', color: 'bg-green-100 text-green-700' },
};

export default function ReportsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedReport, setSelectedReport] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genType, setGenType] = useState('quotidien');

  const { data: rapports = [], isLoading } = useQuery({
    queryKey: ['venus-improvement-reports'],
    queryFn: () => base44.entities.VenusImprovementReport.list('-created_date', 50),
    refetchInterval: 60000,
  });

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await base44.functions.invoke('ameliorationContinueVenus', { action: `rapport_${genType === 'quotidien' ? 'quotidien' : genType === 'hebdomadaire' ? 'hebdomadaire' : 'mensuel'}` });
      toast({ title: '✅ Rapport généré', description: `Rapport ${genType} créé avec succès` });
      queryClient.invalidateQueries({ queryKey: ['venus-improvement-reports'] });
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    }
    setGenerating(false);
  };

  if (isLoading) return <p className="text-center text-gray-400 py-8">Chargement...</p>;

  return (
    <div className="space-y-4">
      {/* Génération de rapport */}
      <div className="flex items-end gap-3 bg-gray-50 rounded-xl p-4">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Type de rapport</label>
          <Select value={genType} onValueChange={setGenType}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="quotidien">Quotidien (24h)</SelectItem>
              <SelectItem value="hebdomadaire">Hebdomadaire (7j)</SelectItem>
              <SelectItem value="mensuel">Mensuel (30j)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleGenerate} disabled={generating}>
          {generating ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <FileBarChart className="w-4 h-4 mr-2" />}
          Générer
        </Button>
      </div>

      {/* Liste des rapports */}
      {rapports.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">Aucun rapport généré pour le moment</p>
          <p className="text-sm text-gray-400 mt-1">Cliquez sur "Générer" pour créer le premier rapport.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rapports.map(r => (
            <Card
              key={r.id}
              className="p-4 border-gray-100 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedReport(r)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${TYPE_LABELS[r.type_rapport]?.color || 'bg-gray-100'}`}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      Rapport {TYPE_LABELS[r.type_rapport]?.label || r.type_rapport}
                    </p>
                    <p className="text-xs text-gray-500">
                      {r.periode_debut} → {r.periode_fin}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Score moyen</p>
                    <p className="text-lg font-bold text-gray-700">{r.score_moyen_global}/100</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Conversations</p>
                    <p className="text-lg font-bold text-gray-700">{r.total_conversations}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Taux réussite</p>
                    <p className={`text-lg font-bold ${r.taux_reussite >= 70 ? 'text-green-600' : r.taux_reussite >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                      {r.taux_reussite}%
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de détails */}
      {selectedReport && (
        <Dialog open onOpenChange={() => setSelectedReport(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Rapport {TYPE_LABELS[selectedReport.type_rapport]?.label} — {selectedReport.periode_debut}
              </DialogTitle>
            </DialogHeader>
            <ReportDetails report={selectedReport} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function ReportDetails({ report: r }) {
  const pointsForts = (() => { try { return JSON.parse(r.points_forts || '[]'); } catch { return []; } })();
  const pointsFaibles = (() => { try { return JSON.parse(r.points_faibles || '[]'); } catch { return []; } })();
  const ameliorations = (() => { try { return JSON.parse(r.ameliorations_proposees || '[]'); } catch { return []; } })();
  const intentions = (() => { try { return JSON.parse(r.intentions_detectees || '[]'); } catch { return []; } })();
  const questionsNouvelles = (() => { try { return JSON.parse(r.questions_nouvelles || '[]'); } catch { return []; } })();
  const connaissancesTop = (() => { try { return JSON.parse(r.connaissances_les_plus_utilisees || '[]'); } catch { return []; } })();
  const nouvellesIntentions = (() => { try { return JSON.parse(r.nouvelles_intentions || '[]'); } catch { return []; } })();

  return (
    <div className="space-y-4">
      {/* Résumé exécutif */}
      <div className="bg-blue-50 rounded-lg p-4">
        <p className="text-sm font-medium text-blue-900 mb-1">Résumé Exécutif</p>
        <p className="text-sm text-blue-800">{r.resume_executif}</p>
      </div>

      {/* Métriques principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricBox label="Conversations" value={r.total_conversations} />
        <MetricBox label="Réussites" value={r.total_reussites} color="green" />
        <MetricBox label="Échecs" value={r.total_echecs} color="red" />
        <MetricBox label="Taux réussite" value={`${r.taux_reussite}%`} color={r.taux_reussite >= 70 ? 'green' : 'amber'} />
        <MetricBox label="Score moyen" value={`${r.score_moyen_global}/100`} />
        <MetricBox label="Temps moyen" value={`${r.temps_moyen_resolution_sec}s`} />
        <MetricBox label="Suggestions générées" value={r.suggestions_generees} />
        <MetricBox label="Suggestions validées" value={r.suggestions_validees} />
      </div>

      {/* Points forts et faibles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Points Forts</h4>
          <div className="space-y-1">
            {pointsForts.map((pf, i) => (
              <div key={i} className="flex justify-between bg-green-50 rounded-lg px-3 py-2 text-sm">
                <span className="capitalize text-gray-700">{pf.domaine?.replace(/_/g, ' ')}</span>
                <span className="font-bold text-green-700">{pf.score}/100</span>
              </div>
            ))}
            {pointsForts.length === 0 && <p className="text-sm text-gray-400">N/A</p>}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Points Faibles</h4>
          <div className="space-y-1">
            {pointsFaibles.map((pf, i) => (
              <div key={i} className="flex justify-between bg-red-50 rounded-lg px-3 py-2 text-sm">
                <span className="capitalize text-gray-700">{pf.domaine?.replace(/_/g, ' ')}</span>
                <span className="font-bold text-red-700">{pf.score}/100 ({pf.taux_echec}%)</span>
              </div>
            ))}
            {pointsFaibles.length === 0 && <p className="text-sm text-gray-400">N/A</p>}
          </div>
        </div>
      </div>

      {/* Améliorations proposées */}
      {ameliorations.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Améliorations Proposées</h4>
          <div className="space-y-1">
            {ameliorations.map((a, i) => (
              <div key={i} className="flex items-start gap-2 bg-amber-50 rounded-lg px-3 py-2 text-sm">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">{a.description}</span>
                <Badge variant={a.priorite === 'critique' ? 'destructive' : 'secondary'} className="ml-auto">
                  {a.priorite}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Intentions détectées */}
      {intentions.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Intentions Détectées</h4>
          <div className="flex flex-wrap gap-2">
            {intentions.map((it, i) => (
              <Badge key={i} variant="secondary" className="capitalize">
                {it.intention} ({it.count})
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Nouvelles intentions */}
      {nouvellesIntentions.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Nouvelles Intentions</h4>
          <div className="space-y-2">
            {nouvellesIntentions.map((ni, i) => (
              <div key={i} className="bg-purple-50 rounded-lg px-3 py-2 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="font-medium text-purple-900 capitalize">{ni.intention}</span>
                  <span className="text-purple-600">{ni.occurrences} occurrences</span>
                </div>
                {ni.exemples?.map((ex, j) => (
                  <p key={j} className="text-xs text-gray-600 truncate">• {ex.question}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connaissances les plus utilisées */}
      {connaissancesTop.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Connaissances les Plus Utilisées</h4>
          <div className="space-y-1">
            {connaissancesTop.map((c, i) => (
              <div key={i} className="flex justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <span className="text-gray-700">{c.titre}</span>
                <span className="font-medium text-gray-500">{c.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value, color }) {
  const colors = {
    green: 'text-green-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
  };
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${colors[color] || 'text-gray-700'}`}>{value}</p>
    </div>
  );
}