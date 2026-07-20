import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { logAudit } from '@/lib/venusLearning';

export default function ScenarioFormDialog({ open, onClose, editEntry, presetData, onSaved }) {
  const [form, setForm] = useState({
    nom: '', description: '', categorie: '', declencheurs: '',
    conversation: '', reponse_ideale: '', outils_utilises: '', resultat_attendu: '', statut: 'brouillon',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editEntry) {
      setForm({
        nom: editEntry.nom || '', description: editEntry.description || '', categorie: editEntry.categorie || '',
        declencheurs: editEntry.declencheurs ? (typeof editEntry.declencheurs === 'string' ? JSON.parse(editEntry.declencheurs).join(', ') : '') : '',
        conversation: editEntry.conversation ? (typeof editEntry.conversation === 'string' ? editEntry.conversation : JSON.stringify(editEntry.conversation, null, 2)) : '',
        reponse_ideale: editEntry.reponse_ideale || '',
        outils_utilises: editEntry.outils_utilises ? (typeof editEntry.outils_utilises === 'string' ? JSON.parse(editEntry.outils_utilises).join(', ') : '') : '',
        resultat_attendu: editEntry.resultat_attendu || '', statut: editEntry.statut || 'brouillon',
      });
    } else if (presetData) {
      setForm({
        nom: presetData.nom || '', description: presetData.description || '', categorie: presetData.categorie || '',
        declencheurs: presetData.question || '', conversation: '', reponse_ideale: presetData.reponse || '',
        outils_utilises: '', resultat_attendu: '', statut: 'brouillon',
      });
    } else {
      setForm({ nom: '', description: '', categorie: '', declencheurs: '', conversation: '', reponse_ideale: '', outils_utilises: '', resultat_attendu: '', statut: 'brouillon' });
    }
  }, [editEntry, presetData, open]);

  const handleSave = async () => {
    if (!form.nom) return;
    setSaving(true);
    const triggers = form.declencheurs.split(',').map(s => s.trim()).filter(Boolean);
    const outils = form.outils_utilises.split(',').map(s => s.trim()).filter(Boolean);
    let conv = form.conversation;
    if (conv && conv.trim().startsWith('[')) { try { JSON.parse(conv); } catch { conv = JSON.stringify([{ role: 'client', content: conv }]); } }
    else if (conv) { conv = JSON.stringify([{ role: 'client', content: conv }]); }
    const data = { ...form, declencheurs: JSON.stringify(triggers), conversation: conv, outils_utilises: JSON.stringify(outils) };
    try {
      if (editEntry) {
        await base44.entities.VenusScenario.update(editEntry.id, data);
        await logAudit('update', 'scenario', editEntry.id, editEntry, data);
      } else {
        const created = await base44.entities.VenusScenario.create({ ...data, version: 1 });
        await logAudit('create', 'scenario', created.id, null, created);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      console.error('Erreur sauvegarde scénario:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editEntry ? 'Modifier le scénario' : 'Nouveau scénario'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nom *</Label>
            <Input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Nom du scénario" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
          </div>
          <div>
            <Label>Catégorie</Label>
            <Input value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value }))} placeholder="Ex: creation_course, paiement, pharmacie..." />
          </div>
          <div>
            <Label className="text-sm font-semibold">Statut</Label>
            <Select value={form.statut} onValueChange={v => setForm(f => ({ ...f, statut: v }))}>
              <SelectTrigger className="h-11 w-full text-sm font-medium"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="brouillon">📝 Brouillon</SelectItem>
                <SelectItem value="en_revision">🔍 En révision</SelectItem>
                <SelectItem value="valide">✅ Validé (indexation RAG auto)</SelectItem>
                <SelectItem value="archive">📦 Archivé</SelectItem>
              </SelectContent>
            </Select>
            {form.statut === 'valide' && (
              <p className="text-xs text-green-600 mt-1 font-medium">
                ✓ Ce scénario sera automatiquement indexé dans la base RAG de VENUS à l'enregistrement.
              </p>
            )}
          </div>
          <div>
            <Label>Déclencheurs (séparés par des virgules)</Label>
            <Input value={form.declencheurs} onChange={e => setForm(f => ({ ...f, declencheurs: e.target.value }))} placeholder="phrase1, mot2, ..." />
          </div>
          <div>
            <Label>Conversation (JSON ou texte)</Label>
            <Textarea value={form.conversation} onChange={e => setForm(f => ({ ...f, conversation: e.target.value }))} rows={4} placeholder='[{"role":"client","content":"..."}]' />
          </div>
          <div>
            <Label>Réponse idéale</Label>
            <Textarea value={form.reponse_ideale} onChange={e => setForm(f => ({ ...f, reponse_ideale: e.target.value }))} rows={3} />
          </div>
          <div>
            <Label>Outils utilisés (séparés par des virgules)</Label>
            <Input value={form.outils_utilises} onChange={e => setForm(f => ({ ...f, outils_utilises: e.target.value }))} />
          </div>
          <div>
            <Label>Résultat attendu</Label>
            <Textarea value={form.resultat_attendu} onChange={e => setForm(f => ({ ...f, resultat_attendu: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving || !form.nom}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}