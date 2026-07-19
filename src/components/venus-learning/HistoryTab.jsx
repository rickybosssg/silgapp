import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, RotateCcw, User, Calendar } from 'lucide-react';
import { createKnowledgeVersion, logAudit } from '@/lib/venusLearning';

export default function HistoryTab() {
  const [filterKnowledge, setFilterKnowledge] = useState('all');
  const queryClient = useQueryClient();

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['venus-versions'],
    queryFn: () => base44.entities.VenusKnowledgeVersion.list('-created_date', 200),
  });

  const { data: knowledgeEntries = [] } = useQuery({
    queryKey: ['venus-knowledge-history'],
    queryFn: () => base44.entities.VenusKnowledge.list('-updated_date', 200),
  });

  const filtered = filterKnowledge === 'all' ? versions : versions.filter(v => v.knowledge_id === filterKnowledge);

  const handleRestore = async (version) => {
    if (!confirm(`Restaurer la version ${version.version} ?`)) return;
    try {
      const donnees = JSON.parse(version.donnees);
      const current = await base44.entities.VenusKnowledge.get(version.knowledge_id);
      await createKnowledgeVersion(current.id, current.version || 1, current, 'update');
      await base44.entities.VenusKnowledge.update(version.knowledge_id, {
        ...donnees,
        version: (current.version || 1) + 1,
      });
      await logAudit('restore', 'knowledge', version.knowledge_id, current, donnees);
      queryClient.invalidateQueries({ queryKey: ['venus-versions'] });
      queryClient.invalidateQueries({ queryKey: ['venus-knowledge'] });
    } catch (e) {
      console.error('Erreur restauration:', e);
    }
  };

  const parseData = (str) => {
    try { return JSON.parse(str); } catch { return {}; }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={filterKnowledge} onValueChange={setFilterKnowledge}>
          <SelectTrigger className="w-[300px]"><SelectValue placeholder="Filtrer par connaissance" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les connaissances</SelectItem>
            {knowledgeEntries.map(k => <SelectItem key={k.id} value={k.id}>{k.titre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="text-sm text-slate-500">{filtered.length} version(s)</div>

      {isLoading ? (
        <div className="text-center py-10 text-slate-400">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400">Aucune version enregistrée.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(v => {
            const data = parseData(v.donnees);
            const knowledge = knowledgeEntries.find(k => k.id === v.knowledge_id);
            return (
              <div key={v.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <History className="w-4 h-4 text-slate-400" />
                      <h3 className="font-semibold text-slate-900 text-sm">{knowledge?.titre || data.titre || 'N/A'}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">v{v.version}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{v.action}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mb-2">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{v.auteur || 'N/A'}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(v.created_date).toLocaleString('fr-FR')}</span>
                    </div>
                    {data.question && <p className="text-xs text-slate-600"><span className="font-medium">Q:</span> {data.question}</p>}
                    {data.reponse_officielle && <p className="text-xs text-slate-400 line-clamp-2 mt-1"><span className="font-medium">R:</span> {data.reponse_officielle}</p>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleRestore(v)}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />Restaurer
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}