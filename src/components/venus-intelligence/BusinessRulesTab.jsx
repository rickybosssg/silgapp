import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Edit3, Trash2, ScrollText, RefreshCw } from 'lucide-react';

const CATEGORIES = [
  { value: 'livraison', label: 'Livraison' },
  { value: 'paiement', label: 'Paiement' },
  { value: 'pharmacie', label: 'Pharmacie' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'boutique', label: 'Boutique' },
  { value: 'qr_code', label: 'QR Code' },
  { value: 'code_pin', label: 'Code PIN' },
  { value: 'gps', label: 'GPS' },
  { value: 'support', label: 'Support' },
  { value: 'reclamation', label: 'Réclamations' },
  { value: 'securite', label: 'Sécurité' },
  { value: 'general', label: 'Général' },
];

const PRIORITES = [
  { value: 'critique', label: 'Critique', color: 'bg-red-100 text-red-700' },
  { value: 'haute', label: 'Haute', color: 'bg-orange-100 text-orange-700' },
  { value: 'normale', label: 'Normale', color: 'bg-blue-100 text-blue-700' },
  { value: 'basse', label: 'Basse', color: 'bg-gray-100 text-gray-600' },
];

export default function BusinessRulesTab() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({ nom: '', description: '', categorie: 'general', priorite: 'haute' });

  const fetch = async () => {
    setLoading(true);
    try { setRules(await base44.entities.VenusBusinessRule.list('-created_date', 200) || []); } catch (e) {}
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const openNew = () => { setForm({ nom: '', description: '', categorie: 'general', priorite: 'haute' }); setEditing('new'); };
  const openEdit = (r) => { setForm({ nom: r.nom, description: r.description || '', categorie: r.categorie || 'general', priorite: r.priorite || 'haute' }); setEditing(r.id); };

  const save = async () => {
    const data = { ...form, date_creation: new Date().toISOString() };
    if (editing === 'new') await base44.entities.VenusBusinessRule.create(data);
    else await base44.entities.VenusBusinessRule.update(editing, data);
    setEditing(null); fetch();
  };
  const remove = async (id) => { await base44.entities.VenusBusinessRule.delete(id); fetch(); };
  const toggle = async (r) => { await base44.entities.VenusBusinessRule.update(r.id, { statut: r.statut === 'active' ? 'desactivee' : 'active' }); fetch(); };

  const filtered = filter === 'all' ? rules : rules.filter(r => r.categorie === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{filtered.length} règles</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetch}><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" />Nouvelle règle</Button>
        </div>
      </div>
      <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-hide">
        <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${filter === 'all' ? 'bg-primary text-white' : 'bg-white text-gray-600 border border-gray-100'}`}>Toutes</button>
        {CATEGORIES.map(c => <button key={c.value} onClick={() => setFilter(c.value)} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${filter === c.value ? 'bg-primary text-white' : 'bg-white text-gray-600 border border-gray-100'}`}>{c.label}</button>)}
      </div>
      {loading ? (
        <div className="text-center py-12 text-gray-400"><RefreshCw className="w-6 h-6 mx-auto animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><ScrollText className="w-10 h-10 mx-auto mb-2 opacity-20" /><p className="text-sm">Aucune règle. Créez la première !</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const cat = CATEGORIES.find(c => c.value === r.categorie) || CATEGORIES[11];
            const pri = PRIORITES.find(p => p.value === (r.priorite || 'haute')) || PRIORITES[1];
            return (
              <div key={r.id} className={`bg-white rounded-xl border p-4 shadow-sm ${r.statut === 'desactivee' ? 'opacity-50 border-gray-100' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0"><ScrollText className="w-5 h-5 text-white" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <h3 className="font-bold text-sm text-gray-900">{r.nom}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${pri.color}`}>{pri.label}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-600">{cat.label}</span>
                        <span className="text-[10px] text-gray-400">v{r.version || 1}</span>
                      </div>
                      <p className="text-xs text-gray-600">{r.description || '—'}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => toggle(r)} className="h-7 px-2 text-xs">{r.statut === 'active' ? '✓' : '⊘'}</Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(r)} className="h-7 px-2"><Edit3 className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(r.id)} className="h-7 px-2 text-red-500"><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing === 'new' ? 'Nouvelle règle' : 'Modifier la règle'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom</Label><Input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Catégorie</Label><select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })}>{CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
              <div><Label>Priorité</Label><select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.priorite} onChange={e => setForm({ ...form, priorite: e.target.value })}>{PRIORITES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
            </div>
          </div>
          <DialogFooter><Button onClick={save} disabled={!form.nom}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}