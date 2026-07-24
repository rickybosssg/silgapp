import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Edit3, Trash2, ScrollText, RefreshCw, Sparkles } from 'lucide-react';

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

const STATUTS = [
  { value: 'brouillon', label: 'Brouillon', color: 'bg-gray-100 text-gray-600' },
  { value: 'valide', label: 'Validé', color: 'bg-green-100 text-green-700' },
  { value: 'archive', label: 'Archivé', color: 'bg-gray-100 text-gray-400' },
];

const DEFAULT_FORM = { nom: '', description: '', domaine: '', categorie: 'general', priorite: 'haute', conditions_application: '', exceptions: '', exemples: '', reponse_associee: '', workflow_associe: '', intentions_concernees: '', pays: 'ALL', statut: 'valide' };

export default function BusinessRulesTab() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState(DEFAULT_FORM);

  const fetch = async () => {
    setLoading(true);
    try { setRules(await base44.entities.VenusBusinessRule.list('-created_date', 200) || []); } catch (e) {}
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const openNew = () => { setForm(DEFAULT_FORM); setEditing('new'); };
  const openEdit = (r) => {
    setForm({
      nom: r.nom || '', description: r.description || '', domaine: r.domaine || '', categorie: r.categorie || 'general',
      priorite: r.priorite || 'haute', conditions_application: r.conditions_application || '', exceptions: r.exceptions || '',
      exemples: r.exemples || '', reponse_associee: r.reponse_associee || '', workflow_associe: r.workflow_associe || '',
      intentions_concernees: r.intentions_concernees || '', pays: r.pays || 'ALL', statut: r.statut === 'active' ? 'valide' : (r.statut || 'valide'),
    });
    setEditing(r.id);
  };

  const save = async () => {
    const data = { ...form, version: 1, date_creation: new Date().toISOString(), date_modification: new Date().toISOString() };
    if (editing === 'new') await base44.entities.VenusBusinessRule.create(data);
    else await base44.entities.VenusBusinessRule.update(editing, { ...data, date_creation: undefined });
    setEditing(null); fetch();
  };
  const remove = async (id) => { await base44.entities.VenusBusinessRule.delete(id); fetch(); };

  const filtered = filter === 'all' ? rules : rules.filter(r => r.categorie === filter);
  const parseArr = (s) => { try { return JSON.parse(s); } catch { return s ? s.split('\n').filter(Boolean) : []; } };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-gray-500">{filtered.length} règles métier</p>
          <p className="text-xs text-violet-600 flex items-center gap-1 mt-0.5"><Sparkles className="w-3 h-3" /> Une règle = des centaines de conversations couvertes</p>
        </div>
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
            const st = STATUTS.find(s => s.value === (r.statut === 'active' ? 'valide' : r.statut)) || STATUTS[1];
            const exemples = parseArr(r.exemples);
            return (
              <div key={r.id} className={`bg-white rounded-xl border p-4 shadow-sm ${(r.statut === 'archive' || r.statut === 'desactivee') ? 'opacity-50 border-gray-100' : 'border-gray-100'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0"><ScrollText className="w-5 h-5 text-white" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <h3 className="font-bold text-sm text-gray-900">{r.nom}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${pri.color}`}>{pri.label}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${st.color}`}>{st.label}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-600">{cat.label}</span>
                        <span className="text-[10px] text-gray-400">v{r.version || 1}</span>
                      </div>
                      <p className="text-xs text-gray-600 mb-1">{r.description || '—'}</p>
                      {exemples.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {exemples.slice(0, 4).map((ex, i) => <span key={i} className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded italic">« {typeof ex === 'string' ? ex.substring(0, 40) : ''} »</span>)}
                          {exemples.length > 4 && <span className="text-[10px] text-gray-400">+{exemples.length - 4} autres</span>}
                        </div>
                      )}
                      {r.reponse_associee && <p className="text-[11px] text-green-700 bg-green-50 rounded p-1.5 mt-1">💡 {r.reponse_associee.substring(0, 100)}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing === 'new' ? 'Nouvelle règle métier' : 'Modifier la règle'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Titre *</Label><Input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="Ex: Destination implicite avec « à », « vers », « pour »" /></div>
            <div><Label>Principe général *</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Principe que VENUS devra appliquer dans toutes les situations similaires" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Catégorie</Label><select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })}>{CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
              <div><Label>Domaine</Label><Input value={form.domaine} onChange={e => setForm({ ...form, domaine: e.target.value })} placeholder="creation_course" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Priorité</Label><select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.priorite} onChange={e => setForm({ ...form, priorite: e.target.value })}>{PRIORITES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
              <div><Label>Statut</Label><select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.statut} onChange={e => setForm({ ...form, statut: e.target.value })}>{STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
            </div>
            <div><Label>Conditions d'application (une par ligne)</Label><Textarea value={form.conditions_application} onChange={e => setForm({ ...form, conditions_application: e.target.value })} rows={2} placeholder="Le client indique un seul lieu&#10;Le lieu est précédé de à, vers, pour, direction" /></div>
            <div><Label>Exceptions (une par ligne)</Label><Textarea value={form.exceptions} onChange={e => setForm({ ...form, exceptions: e.target.value })} rows={2} placeholder="Le client a déjà indiqué un départ et une arrivée&#10;Le client demande le prix" /></div>
            <div><Label>Exemples de phrases couvertes (une par ligne)</Label><Textarea value={form.exemples} onChange={e => setForm({ ...form, exemples: e.target.value })} rows={3} placeholder="Je veux envoyer un colis à Karpala&#10;Je vais à Pissy&#10;Direction Ouaga 2000&#10;Livraison vers Tampouy" /></div>
            <div><Label>Réponse associée</Label><Textarea value={form.reponse_associee} onChange={e => setForm({ ...form, reponse_associee: e.target.value })} rows={2} placeholder="Réponse modèle que VENUS doit donner" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Workflow associé</Label><Input value={form.workflow_associe} onChange={e => setForm({ ...form, workflow_associe: e.target.value })} placeholder="creer_course" /></div>
              <div><Label>Intentions concernées (virgules)</Label><Input value={form.intentions_concernees} onChange={e => setForm({ ...form, intentions_concernees: e.target.value })} placeholder="creer_course, modifier_info" /></div>
            </div>
            <div><Label>Pays</Label><Input value={form.pays} onChange={e => setForm({ ...form, pays: e.target.value })} placeholder="ALL ou BF" /></div>
          </div>
          <DialogFooter><Button onClick={save} disabled={!form.nom || !form.description}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}