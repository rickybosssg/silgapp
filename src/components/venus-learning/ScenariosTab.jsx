import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Search, Pencil, Trash2, Play } from 'lucide-react';
import { STATUT_LABELS, logAudit } from '@/lib/venusLearning';
import ScenarioFormDialog from './ScenarioFormDialog';

export default function ScenariosTab({ presetData, presetOpen }) {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [dialogPreset, setDialogPreset] = useState(null);
  const [testScenario, setTestScenario] = useState(null);
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['venus-scenarios'],
    queryFn: () => base44.entities.VenusScenario.list('-updated_date', 200),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['venus-scenarios'] });

  const filtered = entries.filter(e => {
    if (!search) return true;
    return (e.nom || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.description || '').toLowerCase().includes(search.toLowerCase());
  });

  const handleDelete = async (entry) => {
    if (!confirm(`Supprimer "${entry.nom}" ?`)) return;
    await base44.entities.VenusScenario.delete(entry.id);
    await logAudit('delete', 'scenario', entry.id, entry, null);
    refresh();
  };

  const openAdd = () => { setEditEntry(null); setDialogPreset(null); setDialogOpen(true); };
  const openEdit = (entry) => { setEditEntry(entry); setDialogPreset(null); setDialogOpen(true); };

  const parseConversation = (conv) => {
    if (!conv) return [];
    try { return typeof conv === 'string' ? JSON.parse(conv) : conv; } catch { return [{ role: 'system', content: conv }]; }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un scénario..." className="pl-9" />
        </div>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Ajouter</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-slate-400">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400">Aucun scénario. Cliquez sur "Ajouter" pour en créer un.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(entry => {
            const statut = STATUT_LABELS[entry.statut] || STATUT_LABELS.brouillon;
            const triggers = (() => { try { return JSON.parse(entry.declencheurs || '[]'); } catch { return []; } })();
            const conv = parseConversation(entry.conversation);
            return (
              <div key={entry.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-slate-900 text-sm">{entry.nom}</h3>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => setTestScenario(entry)} className="p-1.5 hover:bg-slate-100 rounded-lg"><Play className="w-3.5 h-3.5 text-green-500" /></button>
                    <button onClick={() => openEdit(entry)} className="p-1.5 hover:bg-slate-100 rounded-lg"><Pencil className="w-3.5 h-3.5 text-slate-500" /></button>
                    <button onClick={() => handleDelete(entry)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                  </div>
                </div>
                {entry.description && <p className="text-xs text-slate-600 mb-2 line-clamp-2">{entry.description}</p>}
                {triggers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {triggers.slice(0, 3).map((t, i) => <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{t}</span>)}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statut.color}`}>{statut.label}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{conv.length} msg(s)</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ScenarioFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} editEntry={editEntry} presetData={dialogPreset} onSaved={refresh} />

      {/* Test / Preview dialog */}
      <Dialog open={!!testScenario} onOpenChange={() => setTestScenario(null)}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Test: {testScenario?.nom}</DialogTitle></DialogHeader>
          {testScenario && (
            <div className="space-y-3">
              {parseConversation(testScenario.conversation).map((msg, i) => (
                <div key={i} className={`p-3 rounded-lg text-sm ${msg.role === 'client' ? 'bg-blue-50 text-slate-700' : 'bg-slate-100 text-slate-700'}`}>
                  <span className="font-semibold text-xs text-slate-500">{msg.role}:</span>
                  <p className="mt-1">{msg.content}</p>
                </div>
              ))}
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm">
                <span className="font-semibold text-xs text-green-700">Réponse idéale:</span>
                <p className="mt-1 text-slate-700">{testScenario.reponse_ideale}</p>
              </div>
              {testScenario.resultat_attendu && (
                <div className="text-xs text-slate-500"><span className="font-semibold">Résultat attendu:</span> {testScenario.resultat_attendu}</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}