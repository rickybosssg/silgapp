import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Pencil, Trash2, Copy, Download, Upload, Filter } from 'lucide-react';
import { CATEGORIES, STATUT_LABELS, PRIORITE_LABELS, exportToCSV, logAudit, getCategoryLabel } from '@/lib/venusLearning';
import KnowledgeFormDialog from './KnowledgeFormDialog';

export default function KnowledgeBaseTab({ presetQuestion, presetOpen }) {
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterStatut, setFilterStatut] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [dialogPreset, setDialogPreset] = useState(null);
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['venus-knowledge'],
    queryFn: () => base44.entities.VenusKnowledge.list('-updated_date', 200),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['venus-knowledge'] });

  const filtered = entries.filter(e => {
    const matchSearch = !search || (e.titre || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.question || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.reponse_officielle || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === 'all' || e.categorie === filterCat;
    const matchStatut = filterStatut === 'all' || e.statut === filterStatut;
    return matchSearch && matchCat && matchStatut;
  });

  const handleDelete = async (entry) => {
    if (!confirm(`Supprimer "${entry.titre}" ?`)) return;
    await base44.entities.VenusKnowledge.delete(entry.id);
    await logAudit('delete', 'knowledge', entry.id, entry, null);
    refresh();
  };

  const handleDuplicate = async (entry) => {
    const { id, created_date, updated_date, created_by_id, ...rest } = entry;
    await base44.entities.VenusKnowledge.create({ ...rest, titre: `${entry.titre} (copie)`, version: 1, statut: 'brouillon' });
    await logAudit('create', 'knowledge', null, null, { ...rest, titre: `${entry.titre} (copie)` });
    refresh();
  };

  const openAdd = () => { setEditEntry(null); setDialogPreset(null); setDialogOpen(true); };
  const openEdit = (entry) => { setEditEntry(entry); setDialogPreset(null); setDialogOpen(true); };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const items = JSON.parse(ev.target.result);
        for (const item of items) {
          await base44.entities.VenusKnowledge.create({ ...item, version: 1, statut: item.statut || 'brouillon' });
        }
        refresh();
      } catch (err) { alert('Erreur import: fichier JSON invalide'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="pl-9" />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[160px]"><Filter className="w-3.5 h-3.5 mr-1" /><SelectValue placeholder="Catégorie" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes catégories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{getCategoryLabel(c)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatut} onValueChange={setFilterStatut}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            {Object.entries(STATUT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => exportToCSV(filtered)}><Download className="w-4 h-4 mr-1" />Exporter</Button>
        <label className="cursor-pointer">
          <Button size="sm" variant="outline" asChild><span><Upload className="w-4 h-4 mr-1" />Importer</span></Button>
          <input type="file" accept=".json" className="hidden" onChange={handleImport} />
        </label>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Ajouter</Button>
      </div>

      <div className="text-sm text-slate-500">{filtered.length} connaissance(s)</div>

      {isLoading ? (
        <div className="text-center py-10 text-slate-400">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400">Aucune connaissance. Cliquez sur "Ajouter" pour en créer une.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(entry => {
            const statut = STATUT_LABELS[entry.statut] || STATUT_LABELS.brouillon;
            const prio = PRIORITE_LABELS[entry.priorite] || PRIORITE_LABELS.normale;
            return (
              <div key={entry.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-slate-900 text-sm">{entry.titre}</h3>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(entry)} className="p-1.5 hover:bg-slate-100 rounded-lg"><Pencil className="w-3.5 h-3.5 text-slate-500" /></button>
                    <button onClick={() => handleDuplicate(entry)} className="p-1.5 hover:bg-slate-100 rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-500" /></button>
                    <button onClick={() => handleDelete(entry)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mb-2 line-clamp-2">{entry.question}</p>
                <p className="text-xs text-slate-400 line-clamp-2 mb-3">{entry.reponse_officielle}</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statut.color}`}>{statut.label}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${prio.color}`}>{prio.label}</span>
                  {entry.categorie && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{getCategoryLabel(entry.categorie)}</span>}
                  {entry.pays && entry.pays !== 'ALL' && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{entry.pays}</span>}
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">v{entry.version || 1}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <KnowledgeFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editEntry={editEntry}
        presetQuestion={dialogPreset}
        onSaved={refresh}
      />
    </div>
  );
}