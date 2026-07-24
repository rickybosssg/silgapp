import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Edit3, Trash2, MessageSquareText, RefreshCw, Bot, User } from 'lucide-react';

export default function TrainingDialoguesTab() {
  const [dialogues, setDialogues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nom: '', description: '', categorie: '', intention_associee: '', workflow_associe: '', pays: 'ALL' });
  const [messages, setMessages] = useState([]);

  const fetch = async () => {
    setLoading(true);
    try { setDialogues(await base44.entities.VenusTrainingDialogue.list('-created_date', 200) || []); } catch (e) {}
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const openNew = () => { setForm({ nom: '', description: '', categorie: '', intention_associee: '', workflow_associe: '', pays: 'ALL' }); setMessages([{ role: 'client', content: '' }]); setEditing('new'); };
  const openEdit = (d) => {
    setForm({ nom: d.nom, description: d.description || '', categorie: d.categorie || '', intention_associee: d.intention_associee || '', workflow_associe: d.workflow_associe || '', pays: d.pays || 'ALL' });
    try { setMessages(JSON.parse(d.messages || '[]')); } catch { setMessages([{ role: 'client', content: '' }]); }
    setEditing(d.id);
  };

  const save = async () => {
    const cleanMsgs = messages.filter(m => m.content.trim());
    const data = { ...form, messages: JSON.stringify(cleanMsgs), nb_messages: cleanMsgs.length, date_creation: new Date().toISOString() };
    if (editing === 'new') await base44.entities.VenusTrainingDialogue.create(data);
    else await base44.entities.VenusTrainingDialogue.update(editing, data);
    setEditing(null); fetch();
  };
  const remove = async (id) => { await base44.entities.VenusTrainingDialogue.delete(id); fetch(); };

  const addMessage = () => setMessages([...messages, { role: messages.length % 2 === 0 ? 'client' : 'venus', content: '' }]);
  const updateMsg = (idx, field, val) => setMessages(messages.map((m, i) => i === idx ? { ...m, [field]: val } : m));
  const removeMsg = (idx) => setMessages(messages.filter((_, i) => i !== idx));

  const parseMsgs = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{dialogues.length} dialogues d'entraînement</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetch}><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" />Nouveau dialogue</Button>
        </div>
      </div>
      {loading ? (
        <div className="text-center py-12 text-gray-400"><RefreshCw className="w-6 h-6 mx-auto animate-spin" /></div>
      ) : dialogues.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><MessageSquareText className="w-10 h-10 mx-auto mb-2 opacity-20" /><p className="text-sm">Aucun dialogue. Créez le premier !</p></div>
      ) : (
        <div className="space-y-2">
          {dialogues.map(d => {
            const msgs = parseMsgs(d.messages);
            return (
              <div key={d.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center flex-shrink-0"><MessageSquareText className="w-5 h-5 text-white" /></div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm text-gray-900">{d.nom}</h3>
                      <p className="text-xs text-gray-500">{d.description || '—'}</p>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
                        <span>💬 {msgs.length} messages</span>
                        {d.intention_associee && <span>🎯 {d.intention_associee}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(d)} className="h-7 px-2"><Edit3 className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(d.id)} className="h-7 px-2 text-red-500"><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
                {msgs.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-50 space-y-1 max-h-32 overflow-y-auto">
                    {msgs.slice(0, 4).map((m, idx) => (
                      <div key={idx} className={`flex gap-2 ${m.role === 'venus' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${m.role === 'venus' ? 'bg-violet-100' : 'bg-gray-100'}`}>
                          {m.role === 'venus' ? <Bot className="w-3 h-3 text-violet-600" /> : <User className="w-3 h-3 text-gray-500" />}
                        </div>
                        <p className={`text-[11px] rounded-lg px-2 py-1 max-w-[80%] ${m.role === 'venus' ? 'bg-violet-50 text-violet-900' : 'bg-gray-50 text-gray-700'}`}>{m.content}</p>
                      </div>
                    ))}
                    {msgs.length > 4 && <p className="text-[10px] text-gray-400 text-center">+{msgs.length - 4} messages...</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing === 'new' ? 'Nouveau dialogue' : 'Modifier le dialogue'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nom</Label><Input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Intention</Label><Input value={form.intention_associee} onChange={e => setForm({ ...form, intention_associee: e.target.value })} placeholder="creer_course" /></div>
              <div><Label>Workflow</Label><Input value={form.workflow_associe} onChange={e => setForm({ ...form, workflow_associe: e.target.value })} /></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Messages</Label>
                <Button size="sm" variant="outline" onClick={addMessage} className="h-7 text-xs"><Plus className="w-3 h-3 mr-1" />Message</Button>
              </div>
              <div className="space-y-2">
                {messages.map((m, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <select value={m.role} onChange={e => updateMsg(idx, 'role', e.target.value)} className="rounded-lg border border-gray-200 px-2 py-2 text-xs">
                      <option value="client">Client</option>
                      <option value="venus">VENUS</option>
                    </select>
                    <Textarea value={m.content} onChange={e => updateMsg(idx, 'content', e.target.value)} rows={1} className="flex-1 text-xs" placeholder="Message..." />
                    <Button size="sm" variant="ghost" onClick={() => removeMsg(idx)} className="h-8 px-2 text-red-500"><Trash2 className="w-3 h-3" /></Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter><Button onClick={save} disabled={!form.nom}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}