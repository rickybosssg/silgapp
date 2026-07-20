import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GitMerge, Lightbulb, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import SuggestionCard from './SuggestionCard';
import SuggestionImproveDialog from './SuggestionImproveDialog';

export default function SuggestionsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statutFilter, setStatutFilter] = useState('en_attente');
  const [search, setSearch] = useState('');
  const [improveDialog, setImproveDialog] = useState(null);
  const [mergeDialog, setMergeDialog] = useState(null);
  const [analysingId, setAnalysingId] = useState(null);

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['venus-suggestions', statutFilter],
    queryFn: () => base44.entities.VenusSuggestion.filter(
      statutFilter === 'tous' ? {} : { statut: statutFilter },
      '-nb_occurrences', 100
    ),
    refetchInterval: 30000,
  });

  const filtered = search.trim()
    ? suggestions.filter(s =>
        (s.question_detectee || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.reponse_proposee || '').toLowerCase().includes(search.toLowerCase())
      )
    : suggestions;

  const handleValidate = async (s) => {
    if (s.hallucination_detectee) {
      toast({ title: '⚠ Validation bloquée', description: 'Une hallucination a été détectée. Utilisez « Améliorer » d\'abord.', variant: 'destructive' });
      return;
    }
    try {
      const user = await base44.auth.me();
      const finalResponse = s.amelioration_reponse || s.reponse_proposee;
      const finalKeywords = s.amelioration_mots_cles || s.mots_cles || '[]';
      const finalCategory = s.amelioration_categorie || s.categorie || 'questions_generales';

      const knowledge = await base44.entities.VenusKnowledge.create({
        titre: s.question_detectee.substring(0, 100),
        categorie: finalCategory,
        question: s.question_detectee,
        reponse_officielle: finalResponse,
        mots_cles: finalKeywords,
        pays: 'ALL', langue: 'fr',
        priorite: s.priorite || 'normale',
        auteur: user?.email || 'admin',
        version: 1, statut: 'valide',
      });

      // Generate recommendations
      let recos = [];
      try {
        const llmRes = await base44.integrations.Core.InvokeLLM({
          prompt: `Une nouvelle connaissance SILGAPP vient d'être validée. Question: "${s.question_detectee}" Réponse: "${finalResponse.substring(0, 200)}". Propose 3 recommandations pour enrichir VENUS (nouvelle FAQ, règle métier, scénario, workflow). Réponds en JSON.`,
          response_json_schema: { type: 'object', properties: { recommandations: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, titre: { type: 'string' }, description: { type: 'string' } } } } } },
        });
        const result = typeof llmRes === 'string' ? JSON.parse(llmRes) : llmRes;
        recos = result.recommandations || [];
      } catch {}

      await base44.entities.VenusSuggestion.update(s.id, {
        statut: 'validee',
        validee_par: user?.email || 'admin',
        validee_at: new Date().toISOString(),
        knowledge_id_cree: knowledge.id,
        recommandations: JSON.stringify(recos),
      });

      toast({ title: '✅ Connaissance créée', description: 'La réponse est maintenant active pour VENUS.' });
      queryClient.invalidateQueries({ queryKey: ['venus-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['venus-knowledge'] });
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    }
  };

  const handleRefuse = async (s) => {
    const motif = prompt('Motif du refus:');
    if (!motif) return;
    try {
      const user = await base44.auth.me();
      await base44.entities.VenusSuggestion.update(s.id, {
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

  const handleAnalyse = async (s) => {
    setAnalysingId(s.id);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Tu es un analyste qualité de VENUS, l'assistante SILGAPP. Analyse cette suggestion de réponse.

Question du client: "${s.question_detectee}"
Réponse proposée: "${s.reponse_proposee}"
Intention: ${s.intention_detectee || 'non_specifiee'}
Catégorie: ${s.categorie || 'non_specifiee'}

Évalue selon ces critères (0-100):
1. exactitude: La réponse est-elle factuellement correcte ?
2. clarte: Est-elle claire et compréhensible ?
3. politesse: Est-elle polie et chaleureuse ?
4. respect_regles: Respecte-t-elle les règles métier SILGAPP ? (jamais inventer de prix, toujours confirmer les infos critiques, etc.)
5. utilite: Est-elle utile pour le client ?
6. coherence: Est-elle cohérente avec la question ?

Détecte aussi les hallucinations:
- VENUS invente-t-elle une information ?
- Invente-t-elle un tarif ?
- Invente-t-elle un partenaire ou livreur ?
- Invente-t-elle une procédure ?

Si une hallucination est détectée, mets hallucination_detectee=true et explique dans hallucination_details.

Réponds UNIQUEMENT avec un JSON:`,
        response_json_schema: {
          type: 'object',
          properties: {
            score_exactitude: { type: 'number' },
            score_clarte: { type: 'number' },
            score_politesse: { type: 'number' },
            score_respect_regles: { type: 'number' },
            score_utilite: { type: 'number' },
            score_coherence: { type: 'number' },
            hallucination_detectee: { type: 'boolean' },
            hallucination_details: { type: 'string' },
            sources_poids: { type: 'array', items: { type: 'object', properties: { source: { type: 'string' }, poids: { type: 'number' }, description: { type: 'string' } } } },
          },
          required: ['score_exactitude', 'score_clarte', 'score_politesse', 'score_respect_regles', 'score_utilite', 'score_coherence', 'hallucination_detectee'],
        },
      });
      const result = typeof res === 'string' ? JSON.parse(res) : res;
      const scoreGlobal = Math.round((result.score_exactitude * 0.25 + result.score_clarte * 0.15 + result.score_politesse * 0.10 + result.score_respect_regles * 0.25 + result.score_utilite * 0.15 + result.score_coherence * 0.10));

      await base44.entities.VenusSuggestion.update(s.id, {
        score_exactitude: result.score_exactitude,
        score_clarte: result.score_clarte,
        score_politesse: result.score_politesse,
        score_respect_regles: result.score_respect_regles,
        score_utilite: result.score_utilite,
        score_coherence: result.score_coherence,
        score_global_qualite: scoreGlobal,
        hallucination_detectee: result.hallucination_detectee,
        hallucination_details: result.hallucination_details || undefined,
        sources_poids: JSON.stringify(result.sources_poids || []),
      });

      toast({ title: `📊 Score: ${scoreGlobal}/100`, description: result.hallucination_detectee ? '⚠ Hallucination détectée!' : 'Analyse terminée' });
      queryClient.invalidateQueries({ queryKey: ['venus-suggestions'] });
    } catch (e) {
      toast({ title: 'Erreur analyse', description: e.message, variant: 'destructive' });
    } finally {
      setAnalysingId(null);
    }
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
      toast({ title: '🔀 Fusion réussie' });
      setMergeDialog(null);
      queryClient.invalidateQueries({ queryKey: ['venus-suggestions'] });
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statutFilter} onValueChange={setStatutFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="en_attente">En attente</SelectItem>
            <SelectItem value="amelioree">Améliorées</SelectItem>
            <SelectItem value="validee">Validées</SelectItem>
            <SelectItem value="refusee">Refusées</SelectItem>
            <SelectItem value="fusionnee">Fusionnées</SelectItem>
            <SelectItem value="tous">Toutes</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="pl-9" />
        </div>
        <span className="text-sm text-gray-500">{filtered.length} suggestion(s)</span>
      </div>

      {isLoading ? (
        <p className="text-center text-gray-400 py-8">Chargement...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Lightbulb className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">Aucune suggestion dans cette catégorie</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <SuggestionCard
              key={s.id}
              s={s}
              onValidate={() => handleValidate(s)}
              onImprove={() => setImproveDialog(s)}
              onRefuse={() => handleRefuse(s)}
              onMerge={() => setMergeDialog(s)}
              onAnalyse={() => handleAnalyse(s)}
              analysing={analysingId === s.id}
            />
          ))}
        </div>
      )}

      <SuggestionImproveDialog
        suggestion={improveDialog}
        onClose={() => setImproveDialog(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['venus-suggestions'] });
          queryClient.invalidateQueries({ queryKey: ['venus-business-rules'] });
        }}
      />

      {mergeDialog && <MergeDialog suggestion={mergeDialog} onClose={() => setMergeDialog(null)} onMerge={handleConfirmMerge} />}
    </div>
  );
}

function MergeDialog({ suggestion, onClose, onMerge }) {
  const { data: connaissances = [] } = useQuery({
    queryKey: ['venus-knowledge-for-merge'],
    queryFn: () => base44.entities.VenusKnowledge.filter({ statut: 'valide' }, '-created_date', 200),
  });
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const filtered = connaissances.filter(k => k.titre?.toLowerCase().includes(search.toLowerCase()) || k.question?.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Fusionner avec une connaissance</DialogTitle></DialogHeader>
        <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {filtered.map(k => (
            <div key={k.id} className={`p-3 rounded-lg border cursor-pointer ${selected === k.id ? 'border-purple-500 bg-purple-50' : 'border-gray-100 hover:bg-gray-50'}`} onClick={() => setSelected(k.id)}>
              <p className="text-sm font-medium text-gray-800">{k.titre}</p>
              <p className="text-xs text-gray-500 truncate">{k.question}</p>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button disabled={!selected} onClick={() => onMerge(selected)}><GitMerge className="w-4 h-4 mr-2" /> Fusionner</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}