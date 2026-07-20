import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Edit3, Trash2, Target, RefreshCw } from 'lucide-react';

export default function IntentionsTab() {
  const [intents, setIntents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nom: '', code: '', description: '', variantes: '', exemples_phrases: '', workflow_associe: '', reponse_officielle: '', categorie: '', niveau_maitrise: 0 });

  const fetch = async () => {
    setLoading(true);
    try { setIntents(await base44.entities.VenusIntent.list('-created_date', 200) || []); } catch (e) {}
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const openNew = () => { setForm({ nom: '', code: '', description: '', variantes: '', exemples_phrases: '', workflow_associe: '', reponse_officielle: '', categorie: '', niveau_maitrise: 0 }); setEditing('new'); };
  const openEdit = (i) => { setForm({ nom: i.nom, code: i.code, description: i.description || '', variantes: i.variantes || '', exemples_phrases: i.exemples_phrases || '', workflow_associe: i.workflow_associe || '', reponse_officielle: i.reponse_officielle || '', categorie: i.categorie || '', niveau_maitrise: i.niveau_maitrise || 0 }); setEditing(i.id); };

  const save = async () => {
    const data = { ...form, niveau_maitrise: Number(form.niveau_maitrise), date_creation: new Date().toISOString() };
    if (editing === 'new') await base44.entities.VenusIntent.create(data);
    else await base44.entities.VenusIntent.update(editing, data);
    setEditing(null); fetch();
  };
  const remove = async (id) => { await base44.entities.VenusIntent.delete(id); fetch(); };

  const parseArr = (s) => { try { return JSON.parse(s); } catch { return s ? s.split('\n').filter(Boolean) : []; } };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{intents.length} intentions</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetch}><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" />Nouvelle intention</Button>
        </div>
      </div>
      {loading ? (
        <div className="text-center py-12 text-gray-400"><RefreshCw className="w-6 h-6 mx-auto animate-spin" /></div>
      ) : intents.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><Target className="w-10 h-10 mx-auto mb-2 opacity-20" /><p className="text-sm">Aucune intention. Créez la première !</p></div>
      ) : (
        <div className="space-y-2">
          {intents.map(i => {
            const variantes = parseArr(i.variantes);
            const exemples = parseArr(i.exemples_phrases);
            const maitrise = i.niveau_maitrise || 0;
            return (
              <div key={i.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0"><Target className="w-5 h-5 text-white" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-bold text-sm text-gray-900">{i.nom}</h3>
                        <code className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{i.code}</code>
                      </div>
                      <p className="text-xs text-gray-500 mb-2">{i.description || '—'}</p>
                      {variantes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {variantes.slice(0, 5).map((v, idx) => <span key={idx} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{v}</span>)}
                        </div>
                      )}
                      {exemples.length > 0 && (
                        <div className="text-[11px] text-gray-400 italic mt-1">« {exemples[0]} »</div>
                      )}
                      {i.workflow_associe && <div className="text-[10px] text-gray-400 mt-1">Workflow: <code>{i.workflow_associe}</code></div>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-[10px] text-gray-400 mb-0.5">Maîtrise</div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${maitrise >= 80 ? 'bg-green-500' : maitrise >= 50 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${maitrise}%` }} /></div>
                        <span className="text-xs font-bold text-gray-700">{maitrise}%</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(i)} className="h-7 px-2"><Edit3 className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(i.id)} className="h-7 px-2 text-red-500"><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing === 'new' ? 'Nouvelle intention' : 'Modifier l\'intention'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nom</Label><Input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} /></div>
              <div><Label>Code</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="creer_course" /></div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div><Label>Variantes (une par ligne)</Label><Textarea value={form.variantes} onChange={e => setForm({ ...form, variantes: e.target.value })} rows={2} placeholder="envoyer un colis&#10;expédier&#10;envoi" /></div>
            <div><Label>Exemples de phrases (une par ligne)</Label><Textarea value={form.exemples_phrases} onChange={e => setForm({ ...form, exemples_phrases: e.target.value })} rows={2} placeholder="Je veux envoyer un colis&#10;J'ai un paquet à envoyer" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Workflow associé</Label><Input value={form.workflow_associe} onChange={e => setForm({ ...form, workflow_associe: e.target.value })} placeholder="creer_course" /></div>
              <div><Label>Catégorie</Label><Input value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })} placeholder="expedition_colis" /></div>
            </div>
            <div><Label>Réponse officielle</Label><Textarea value={form.reponse_officielle} onChange={e => setForm({ ...form, reponse_officielle: e.target.value })} rows={3} /></div>
            <div><Label>Niveau de maîtrise: {form.niveau_maitrise}%</Label><input type="range" min="0" max="100" value={form.niveau_maitrise} onChange={e => setForm({ ...form, niveau_maitrise: e.target.value })} className="w-full" /></div>
          </div>
          <DialogFooter><Button onClick={save} disabled={!form.nom || !form.code}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}