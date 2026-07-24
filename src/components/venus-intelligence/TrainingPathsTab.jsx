import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Edit3, Trash2, GraduationCap, RefreshCw } from 'lucide-react';

const NIVEAUX = [
  { value: 'debutant', label: 'Débutant', color: 'bg-green-100 text-green-700' },
  { value: 'intermediaire', label: 'Intermédiaire', color: 'bg-blue-100 text-blue-700' },
  { value: 'avance', label: 'Avancé', color: 'bg-purple-100 text-purple-700' },
  { value: 'expert', label: 'Expert', color: 'bg-orange-100 text-orange-700' },
];

const CATEGORIES = ['creation_course', 'paiement', 'pharmacie', 'restaurant', 'boutique', 'qr_code', 'code_pin', 'gps', 'support', 'reclamation', 'livraison_programmee', 'annulation', 'deplacement'];

export default function TrainingPathsTab() {
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nom: '', description: '', niveau: 'debutant', categorie: 'creation_course', pays: 'ALL', intention_associee: '', workflow_associe: '' });

  const fetch = async () => {
    setLoading(true);
    try { setPaths(await base44.entities.VenusTrainingPath.list('-created_date', 100) || []); } catch (e) {}
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const openNew = () => { setForm({ nom: '', description: '', niveau: 'debutant', categorie: 'creation_course', pays: 'ALL', intention_associee: '', workflow_associe: '' }); setEditing('new'); };
  const openEdit = (p) => { setForm({ nom: p.nom, description: p.description || '', niveau: p.niveau || 'debutant', categorie: p.categorie || 'creation_course', pays: p.pays || 'ALL', intention_associee: p.intention_associee || '', workflow_associe: p.workflow_associe || '' }); setEditing(p.id); };

  const save = async () => {
    const data = { ...form, date_creation: new Date().toISOString() };
    if (editing === 'new') await base44.entities.VenusTrainingPath.create(data);
    else await base44.entities.VenusTrainingPath.update(editing, data);
    setEditing(null); fetch();
  };

  const remove = async (id) => { await base44.entities.VenusTrainingPath.delete(id); fetch(); };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{paths.length} parcours de formation</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetch}><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" />Nouveau parcours</Button>
        </div>
      </div>
      {loading ? (
        <div className="text-center py-12 text-gray-400"><RefreshCw className="w-6 h-6 mx-auto animate-spin" /></div>
      ) : paths.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-20" /><p className="text-sm">Aucun parcours. Créez le premier !</p></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {paths.map(p => {
            const niv = NIVEAUX.find(n => n.value === (p.niveau || 'debutant')) || NIVEAUX[0];
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center"><GraduationCap className="w-5 h-5 text-white" /></div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${niv.color}`}>{niv.label}</span>
                </div>
                <h3 className="font-bold text-sm text-gray-900 mb-1">{p.nom}</h3>
                <p className="text-xs text-gray-500 line-clamp-2 mb-2">{p.description || '—'}</p>
                <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-2">
                  <span>📦 {p.categorie || '—'}</span>
                  <span>🌍 {p.pays || 'ALL'}</span>
                </div>
                {p.progression > 0 && (
                  <div className="mb-2">
                    <div className="flex justify-between text-[10px] text-gray-400 mb-0.5"><span>Progression</span><span>{p.progression}%</span></div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${p.progression}%` }} /></div>
                  </div>
                )}
                <div className="flex gap-1 pt-2 border-t border-gray-50">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)} className="h-7 px-2 text-xs"><Edit3 className="w-3 h-3" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(p.id)} className="h-7 px-2 text-xs text-red-500"><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing === 'new' ? 'Nouveau parcours' : 'Modifier le parcours'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom</Label><Input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Niveau</Label><select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.niveau} onChange={e => setForm({ ...form, niveau: e.target.value })}>{NIVEAUX.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}</select></div>
              <div><Label>Catégorie</Label><select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Pays</Label><Input value={form.pays} onChange={e => setForm({ ...form, pays: e.target.value })} placeholder="ALL ou BF" /></div>
              <div><Label>Intention associée</Label><Input value={form.intention_associee} onChange={e => setForm({ ...form, intention_associee: e.target.value })} placeholder="creer_course" /></div>
            </div>
            <div><Label>Workflow associé</Label><Input value={form.workflow_associe} onChange={e => setForm({ ...form, workflow_associe: e.target.value })} placeholder="creer_course" /></div>
          </div>
          <DialogFooter><Button onClick={save} disabled={!form.nom}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}