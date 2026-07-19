import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Check, X, GitMerge, Edit3, Lightbulb, TrendingUp, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

const STATUT_LABELS = {
  en_attente: { label: 'En attente', variant: 'secondary' },
  validee: { label: 'Validée', variant: 'default' },
  refusee: { label: 'Refusée', variant: 'destructive' },
  fusionnee: { label: 'Fusionnée', variant: 'default' },
};

const PRIORITE_LABELS = {
  critique: { label: 'Critique', variant: 'destructive' },
  haute: { label: 'Haute', variant: 'default' },
  normale: { label: 'Normale', variant: 'secondary' },
  basse: { label: 'Basse', variant: 'secondary' },
};

export default function SuggestionsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statutFilter, setStatutFilter] = useState('en_attente');
  const [editingSuggestion, setEditingSuggestion] = useState(null);
  const [mergeDialog, setMergeDialog] = useState(null);

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['venus-suggestions', statutFilter],
    queryFn: () => base44.entities.VenusSuggestion.filter(
      statutFilter === 'tous' ? {} : { statut: statutFilter },
      '-nb_occurrences', 100
    ),
    refetchInterval: 30000,
  });

  const handleValidate = async (suggestion) => {
    setEditingSuggestion({ ...suggestion, mode: 'validate' });
  };

  const handleConfirmValidate = async () => {
    try {
      const user = await base44.auth.me();
      await base44.functions.invoke('analyserConversationVenus', {
        action: 'noop',
      });
      // Use the shared engine via a different approach — direct entity creation
      const s = editingSuggestion;
      const knowledge = await base44.entities.VenusKnowledge.create({
        titre: s.titre || s.question_detectee.substring(0, 100),
        categorie: s.categorie || 'questions_generales',
        question: s.question_detectee,
        reponse_officielle: s.reponse_proposee,
        mots_cles: s.mots_cles || '[]',
        pays: 'ALL',
        langue: 'fr',
        priorite: s.priorite,
        auteur: user?.email || 'admin',
        version: 1,
        statut: 'valide',
      });

      await base44.entities.VenusSuggestion.update(s.id, {
        statut: 'validee',
        validee_par: user?.email || 'admin',
        validee_at: new Date().toISOString(),
        knowledge_id_cree: knowledge.id,
        reponse_proposee: s.reponse_proposee,
      });

      toast({ title: '✅ Connaissance créée', description: `"${knowledge.titre}" est maintenant active` });
      setEditingSuggestion(null);
      queryClient.invalidateQueries({ queryKey: ['venus-suggestions'] });
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    }
  };

  const handleRefuse = async (suggestion) => {
    const motif = prompt('Motif du refus:');
    if (!motif) return;
    try {
      const user = await base44.auth.me();
      await base44.entities.VenusSuggestion.update(suggestion.id, {
        statut: 'refusee',
        refusee_par: user?.email || 'admin',
        refusee_motif: motif,
      });
      toast({ title: 'Suggestion refusée' });
      queryClient.invalidateQueries({ queryKey: ['venus-suggestions'] });
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    }
  };

  const handleMerge = async (suggestion) => {
    setMergeDialog(suggestion);
  };

  const handleConfirmMerge = async (knowledgeId) => {
    try {
      const user = await base44.auth.me();
      const s = mergeDialog;
      const knowledge = await base44.entities.VenusKnowledge.get(knowledgeId);
      const existingMots = JSON.parse(knowledge.mots_cles || '[]');
      const suggestionMots = JSON.parse(s.mots_cles || '[]');
      const merged = [...new Set([...existingMots, ...suggestionMots])];
      await base44.entities.VenusKnowledge.update(knowledgeId, {
        mots_cles: JSON.stringify(merged),
        version: (knowledge.version || 1) + 1,
      });
      await base44.entities.VenusSuggestion.update(s.id, {
        statut: 'fusionnee',
        validee_par: user?.email || 'admin',
        validee_at: new Date().toISOString(),
        knowledge_id_fusion: knowledgeId,
      });
      toast({ title: '🔀 Fusion réussie', description: `Mots-clés ajoutés à "${knowledge.titre}"` });
      setMergeDialog(null);
      queryClient.invalidateQueries({ queryKey: ['venus-suggestions'] });
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statutFilter} onValueChange={setStatutFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en_attente">En attente</SelectItem>
            <SelectItem value="validee">Validées</SelectItem>
            <SelectItem value="refusee">Refusées</SelectItem>
            <SelectItem value="fusionnee">Fusionnées</SelectItem>
            <SelectItem value="tous">Toutes</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-500">{suggestions.length} suggestion(s)</span>
      </div>

      {/* Liste */}
      {isLoading ? (
        <p className="text-center text-gray-400 py-8">Chargement...</p>
      ) : suggestions.length === 0 ? (
        <div className="text-center py-12">
          <Lightbulb className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">Aucune suggestion dans cette catégorie</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map(s => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              onValidate={() => handleValidate(s)}
              onRefuse={() => handleRefuse(s)}
              onMerge={() => handleMerge(s)}
            />
          ))}
        </div>
      )}

      {/* Dialog d'édition / validation */}
      {editingSuggestion && (
        <Dialog open onOpenChange={() => setEditingSuggestion(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Valider la suggestion</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Question détectée</label>
                <Input value={editingSuggestion.question_detectee} readOnly className="mt-1 bg-gray-50" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Titre de la connaissance</label>
                <Input
                  value={editingSuggestion.titre || editingSuggestion.question_detectee.substring(0, 100)}
                  onChange={e => setEditingSuggestion({ ...editingSuggestion, titre: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Catégorie</label>
                  <Select
                    value={editingSuggestion.categorie || 'questions_generales'}
                    onValueChange={v => setEditingSuggestion({ ...editingSuggestion, categorie: v })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['tarifs','expedition_colis','reception_colis','suivi_colis','gps','paiement','annulation_course','compte_client','compte_livreur','inscription','notifications','questions_generales','autres'].map(c => (
                        <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Priorité</label>
                  <Select
                    value={editingSuggestion.priorite || 'normale'}
                    onValueChange={v => setEditingSuggestion({ ...editingSuggestion, priorite: v })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['basse','normale','haute','critique'].map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Réponse officielle proposée</label>
                <Textarea
                  value={editingSuggestion.reponse_proposee || ''}
                  onChange={e => setEditingSuggestion({ ...editingSuggestion, reponse_proposee: e.target.value })}
                  rows={6}
                  className="mt-1"
                />
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                ℹ️ Cette action créera une nouvelle connaissance officielle dans la base de VENUS.
                Elle sera immédiatement utilisée pour répondre aux clients.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingSuggestion(null)}>Annuler</Button>
              <Button onClick={handleConfirmValidate}>
                <Check className="w-4 h-4 mr-2" /> Valider et Créer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog de fusion */}
      {mergeDialog && (
        <MergeDialog
          suggestion={mergeDialog}
          onClose={() => setMergeDialog(null)}
          onMerge={handleConfirmMerge}
        />
      )}
    </div>
  );
}

function SuggestionCard({ suggestion, onValidate, onRefuse, onMerge }) {
  const [showDetails, setShowDetails] = useState(false);
  const exemples = useMemo(() => {
    try { return JSON.parse(suggestion.conversations_exemples || '[]'); } catch { return []; }
  }, [suggestion]);

  const s = suggestion;
  return (
    <Card className="p-4 border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={PRIORITE_LABELS[s.priorite]?.variant || 'secondary'}>
              {PRIORITE_LABELS[s.priorite]?.label || s.priorite}
            </Badge>
            {s.is_nouvelle_question && (
              <Badge variant="outline" className="text-blue-600 border-blue-200">Nouvelle</Badge>
            )}
            <Badge variant={STATUT_LABELS[s.statut]?.variant || 'secondary'}>
              {STATUT_LABELS[s.statut]?.label || s.statut}
            </Badge>
          </div>
          <p className="text-sm font-medium text-gray-800">{s.question_detectee}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> {s.nb_occurrences} occurrences
            </span>
            <span>Confiance: {s.niveau_confiance || '—'}%</span>
            {s.categorie && <span className="capitalize">{s.categorie.replace(/_/g, ' ')}</span>}
          </div>
        </div>
      </div>

      {/* Réponse proposée */}
      {s.reponse_proposee && (
        <div className="bg-gray-50 rounded-lg p-3 mb-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Réponse proposée:</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{s.reponse_proposee}</p>
        </div>
      )}

      {/* Réponse actuelle */}
      {s.reponse_actuelle && s.reponse_actuelle !== 'Aucune réponse officielle' && (
        <div className="bg-amber-50 rounded-lg p-3 mb-3">
          <p className="text-xs font-medium text-amber-600 mb-1">Réponse actuelle de VENUS:</p>
          <p className="text-sm text-gray-600 line-clamp-3">{s.reponse_actuelle}</p>
        </div>
      )}

      {/* Actions */}
      {s.statut === 'en_attente' && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onValidate} className="bg-green-600 hover:bg-green-700">
            <Check className="w-4 h-4 mr-1" /> Valider
          </Button>
          <Button size="sm" variant="outline" onClick={onMerge}>
            <GitMerge className="w-4 h-4 mr-1" /> Fusionner
          </Button>
          <Button size="sm" variant="outline" onClick={onRefuse} className="text-red-600 hover:text-red-700">
            <X className="w-4 h-4 mr-1" /> Refuser
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowDetails(!showDetails)}>
            {showDetails ? 'Masquer' : 'Détails'}
          </Button>
        </div>
      )}

      {/* Détails */}
      {showDetails && exemples.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-gray-500">Exemples de conversations:</p>
          {exemples.map((ex, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-lg p-2 text-xs">
              <p className="text-gray-600"><strong>Q:</strong> {ex.question?.substring(0, 150)}</p>
              {ex.reponse && <p className="text-gray-500 mt-1"><strong>R:</strong> {ex.reponse?.substring(0, 150)}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function MergeDialog({ suggestion, onClose, onMerge }) {
  const { data: connaissances = [] } = useQuery({
    queryKey: ['venus-knowledge-for-merge'],
    queryFn: () => base44.entities.VenusKnowledge.filter({ statut: 'valide' }, '-created_date', 200),
  });
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');

  const filtered = connaissances.filter(k =>
    k.titre?.toLowerCase().includes(search.toLowerCase()) ||
    k.question?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fusionner avec une connaissance existante</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Question: <strong>{suggestion.question_detectee}</strong>
          </p>
          <Input placeholder="Rechercher une connaissance..." value={search} onChange={e => setSearch(e.target.value)} />
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {filtered.map(k => (
              <div
                key={k.id}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selected === k.id ? 'border-purple-500 bg-purple-50' : 'border-gray-100 hover:bg-gray-50'
                }`}
                onClick={() => setSelected(k.id)}
              >
                <p className="text-sm font-medium text-gray-800">{k.titre}</p>
                <p className="text-xs text-gray-500 truncate">{k.question}</p>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button disabled={!selected} onClick={() => onMerge(selected)}>
            <GitMerge className="w-4 h-4 mr-2" /> Fusionner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}