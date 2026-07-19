import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { CATEGORIES, PAYS_CODES, STATUT_LABELS, PRIORITE_LABELS, logAudit, createKnowledgeVersion } from '@/lib/venusLearning';

export default function KnowledgeFormDialog({ open, onClose, editEntry, presetQuestion, onSaved }) {
  const [form, setForm] = useState({
    titre: '', categorie: 'autres', question: '', reponse_officielle: '',
    mots_cles: '', pays: 'ALL', ville: '', langue: 'fr', priorite: 'normale', statut: 'brouillon',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editEntry) {
      setForm({
        titre: editEntry.titre || '', categorie: editEntry.categorie || 'autres',
        question: editEntry.question || '', reponse_officielle: editEntry.reponse_officielle || '',
        mots_cles: editEntry.mots_cles ? (typeof editEntry.mots_cles === 'string' ? JSON.parse(editEntry.mots_cles).join(', ') : '') : '',
        pays: editEntry.pays || 'ALL', ville: editEntry.ville || '', langue: editEntry.langue || 'fr',
        priorite: editEntry.priorite || 'normale', statut: editEntry.statut || 'brouillon',
      });
    } else if (presetQuestion) {
      setForm(f => ({ ...f, question: presetQuestion }));
    } else {
      setForm({ titre: '', categorie: 'autres', question: '', reponse_officielle: '', mots_cles: '', pays: 'ALL', ville: '', langue: 'fr', priorite: 'normale', statut: 'brouillon' });
    }
  }, [editEntry, presetQuestion, open]);

  const handleSave = async () => {
    if (!form.titre || !form.question || !form.reponse_officielle) return;
    setSaving(true);
    const motsArray = form.mots_cles.split(',').map(s => s.trim()).filter(Boolean);
    const data = { ...form, mots_cles: JSON.stringify(motsArray) };
    try {
      if (editEntry) {
        const newVersion = (editEntry.version || 1) + 1;
        await createKnowledgeVersion(editEntry.id, editEntry.version || 1, editEntry, 'update');
        await base44.entities.VenusKnowledge.update(editEntry.id, { ...data, version: newVersion });
        await logAudit('update', 'knowledge', editEntry.id, editEntry, data);
      } else {
        const created = await base44.entities.VenusKnowledge.create({ ...data, version: 1 });
        await createKnowledgeVersion(created.id, 1, created, 'create');
        await logAudit('create', 'knowledge', created.id, null, created);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      console.error('Erreur sauvegarde connaissance:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editEntry ? 'Modifier la connaissance' : 'Nouvelle connaissance'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Titre *</Label>
            <Input value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} placeholder="Titre de la connaissance" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Catégorie</Label>
              <Select value={form.categorie} onValueChange={v => setForm(f => ({ ...f, categorie: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priorité</Label>
              <Select value={form.priorite} onValueChange={v => setForm(f => ({ ...f, priorite: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PRIORITE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Question *</Label>
            <Textarea value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} rows={2} placeholder="Question du client" />
          </div>
          <div>
            <Label>Réponse officielle *</Label>
            <Textarea value={form.reponse_officielle} onChange={e => setForm(f => ({ ...f, reponse_officielle: e.target.value }))} rows={4} placeholder="Réponse validée" />
          </div>
          <div>
            <Label>Mots-clés (séparés par des virgules)</Label>
            <Input value={form.mots_cles} onChange={e => setForm(f => ({ ...f, mots_cles: e.target.value }))} placeholder="mot1, mot2, mot3" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Pays</Label>
              <Select value={form.pays} onValueChange={v => setForm(f => ({ ...f, pays: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYS_CODES.map(p => <SelectItem key={p} value={p}>{p === 'ALL' ? 'Tous' : p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ville</Label>
              <Input value={form.ville} onChange={e => setForm(f => ({ ...f, ville: e.target.value }))} placeholder="Ville" />
            </div>
            <div>
              <Label>Langue</Label>
              <Input value={form.langue} onChange={e => setForm(f => ({ ...f, langue: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Statut</Label>
            <Select value={form.statut} onValueChange={v => setForm(f => ({ ...f, statut: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(STATUT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving || !form.titre || !form.question || !form.reponse_officielle}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}