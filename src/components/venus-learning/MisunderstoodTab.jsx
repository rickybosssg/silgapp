import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Edit3, BookOpen, MessageSquare, EyeOff } from 'lucide-react';
import { PAYS_SILGAPP } from '@/components/international/CountrySelector';
import KnowledgeFormDialog from './KnowledgeFormDialog';
import ScenarioFormDialog from './ScenarioFormDialog';

export default function MisunderstoodTab({ onCorriger }) {
  const [search, setSearch] = useState('');
  const [knowledgeDialog, setKnowledgeDialog] = useState(null);
  const [scenarioDialog, setScenarioDialog] = useState(null);
  const queryClient = useQueryClient();

  const { data: interactions = [], isLoading } = useQuery({
    queryKey: ['venus-misunderstood'],
    queryFn: () => base44.entities.VenusInteraction.filter({ statut: 'non_resolu' }, '-created_date', 100),
  });

  const { data: negative = [] } = useQuery({
    queryKey: ['venus-negative'],
    queryFn: () => base44.entities.VenusInteraction.filter({ satisfaction: 'negative' }, '-created_date', 100),
  });

  const allItems = [...interactions, ...negative.filter(n => !interactions.find(i => i.id === n.id))];
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['venus-misunderstood'] }); queryClient.invalidateQueries({ queryKey: ['venus-negative'] }); };

  const filtered = allItems.filter(i => {
    if (!search) return true;
    return (i.question || '').toLowerCase().includes(search.toLowerCase()) ||
      (i.reponse || '').toLowerCase().includes(search.toLowerCase());
  });

  const handleIgnorer = async (item) => {
    await base44.entities.VenusInteraction.update(item.id, { statut: 'resolu' });
    refresh();
  };

  const flagFor = (cc) => PAYS_SILGAPP.find(p => p.code === cc)?.emoji_flag || '🌍';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="pl-9" />
        </div>
      </div>

      <div className="text-sm text-slate-500">{filtered.length} question(s) non comprise(s)</div>

      {isLoading ? (
        <div className="text-center py-10 text-slate-400">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400">Aucune question non comprise. VENUS gère bien ! 🎉</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{flagFor(item.country_code)}</span>
                    <span className="text-xs font-medium text-slate-500">{item.country_code}</span>
                    {item.ville && <span className="text-xs text-slate-400">· {item.ville}</span>}
                    <span className="text-xs text-slate-400">· {item.date_conversation || 'N/A'}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.satisfaction === 'negative' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                      {item.satisfaction === 'negative' ? 'Insatisfait' : 'Non résolu'}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-900 mb-1">❓ {item.question}</p>
                  <p className="text-xs text-slate-500 line-clamp-2">🤖 {item.reponse}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                <Button size="sm" variant="default" onClick={() => onCorriger?.(item)}><Edit3 className="w-3.5 h-3.5 mr-1" />Corriger</Button>
                <Button size="sm" variant="outline" onClick={() => setKnowledgeDialog(item)}><BookOpen className="w-3.5 h-3.5 mr-1" />Ajouter à la base</Button>
                <Button size="sm" variant="outline" onClick={() => setScenarioDialog(item)}><MessageSquare className="w-3.5 h-3.5 mr-1" />Créer scénario</Button>
                <Button size="sm" variant="ghost" onClick={() => handleIgnorer(item)}><EyeOff className="w-3.5 h-3.5 mr-1" />Ignorer</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <KnowledgeFormDialog
        open={!!knowledgeDialog}
        onClose={() => setKnowledgeDialog(null)}
        presetQuestion={knowledgeDialog?.question}
        onSaved={() => { setKnowledgeDialog(null); queryClient.invalidateQueries({ queryKey: ['venus-knowledge'] }); }}
      />
      <ScenarioFormDialog
        open={!!scenarioDialog}
        onClose={() => setScenarioDialog(null)}
        presetData={scenarioDialog ? { nom: `Scénario: ${scenarioDialog.question?.substring(0, 40)}`, question: scenarioDialog.question, reponse: scenarioDialog.reponse, categorie: scenarioDialog.categorie } : null}
        onSaved={() => { setScenarioDialog(null); queryClient.invalidateQueries({ queryKey: ['venus-scenarios'] }); }}
      />
    </div>
  );
}