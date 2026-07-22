import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Search, Pencil, Trash2, Play, ClipboardPaste, Database, Loader2, Upload } from 'lucide-react';
import { STATUT_LABELS, logAudit } from '@/lib/venusLearning';
import ScenarioFormDialog from './ScenarioFormDialog';
import PasteScenarioDialog from './PasteScenarioDialog';
import BulkScenarioImportDialog from './BulkScenarioImportDialog';

export default function ScenariosTab({ presetData, presetOpen }) {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [dialogPreset, setDialogPreset] = useState(null);
  const [testScenario, setTestScenario] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['venus-scenarios'],
    queryFn: () => base44.entities.VenusScenario.list('-updated_date', 200),
    refetchInterval: false,
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

  const [reindexing, setReindexing] = useState(null);
  const handleReindex = async (entry) => {
    setReindexing(entry.id);
    try {
      await fetch('/api/base44/functions/indexerDocumentVenus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'index_scenario', scenario_id: entry.id }),
      });
      refresh();
    } catch (e) {
      console.error('Erreur réindexation:', e);
    } finally {
      setReindexing(null);
    }
  };

  const [batchIndexing, setBatchIndexing] = useState(false);
  const pendingIndex = entries.filter(e => e.statut === 'valide' && !e.rag_indexe);
  const handleBatchIndex = async () => {
    if (pendingIndex.length === 0) return;
    setBatchIndexing(true);
    try {
      const res = await base44.functions.invoke('indexerScenarioVenus', { action: 'batch_index' });
      const data = res.data || res;
      alert(`${data.succes || 0} scénario(s) indexé(s), ${data.echecs || 0} échec(s)`);
      refresh();
    } catch (e) {
      console.error('Erreur indexation par lot:', e);
      alert('Erreur: ' + e.message);
    } finally {
      setBatchIndexing(false);
    }
  };

  const openAdd = () => { setEditEntry(null); setDialogPreset(null); setDialogOpen(true); };
  const openEdit = (entry) => { setEditEntry(entry); setDialogPreset(null); setDialogOpen(true); };

  const parseConversation = (conv) => {
    if (!conv) return [];
    try { return typeof conv === 'string' ? JSON.parse(conv) : conv; } catch { return [{ role: 'system', content: conv }]; }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-[150px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un scénario..." className="pl-9" />
          </div>
          <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Ajouter</Button>
          {pendingIndex.length > 0 && (
            <Button size="sm" variant="secondary" onClick={handleBatchIndex} disabled={batchIndexing}>
              {batchIndexing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Database className="w-4 h-4 mr-1" />}
              Indexer par lot ({pendingIndex.length})
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 border-dashed border-primary text-primary" onClick={() => setPasteOpen(true)}>
            <ClipboardPaste className="w-4 h-4 mr-2" />Coller une conversation
          </Button>
          <Button variant="outline" className="flex-1 border-dashed border-blue-500 text-blue-600" onClick={() => setBulkImportOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />Import massif
          </Button>
        </div>
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
                  {entry.statut === 'valide' && (
                    entry.rag_indexe ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-0.5">
                        <Database className="w-2.5 h-2.5" /> RAG
                      </span>
                    ) : entry.rag_erreur ? (
                      <button onClick={() => handleReindex(entry)} disabled={reindexing === entry.id} className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-0.5 hover:bg-red-200">
                        {reindexing === entry.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Database className="w-2.5 h-2.5" />} Erreur RAG
                      </button>
                    ) : (
                      <button onClick={() => handleReindex(entry)} disabled={reindexing === entry.id} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-0.5 hover:bg-amber-200">
                        {reindexing === entry.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Database className="w-2.5 h-2.5" />} Indexer
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ScenarioFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} editEntry={editEntry} presetData={dialogPreset} onSaved={refresh} />
      <PasteScenarioDialog open={pasteOpen} onClose={() => setPasteOpen(false)} onSaved={refresh} />
      <BulkScenarioImportDialog open={bulkImportOpen} onClose={() => setBulkImportOpen(false)} onSaved={refresh} />

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