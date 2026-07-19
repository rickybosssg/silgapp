import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CATEGORIES, logAudit } from '@/lib/venusLearning';
import { Save, ArrowLeft } from 'lucide-react';

export default function CorrectionTab({ presetData, onDone }) {
  const [form, setForm] = useState({
    question_client: '', reponse_venus: '', nouvelle_reponse: '',
    commentaires: '', categorie: 'autres', mots_cles: '',
  });
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (presetData) {
      setForm({
        question_client: presetData.question || '',
        reponse_venus: presetData.reponse || '',
        nouvelle_reponse: '',
        commentaires: '',
        categorie: presetData.categorie || 'autres',
        mots_cles: '',
      });
    }
  }, [presetData]);

  const handleSave = async () => {
    if (!form.question_client || !form.nouvelle_reponse) return;
    setSaving(true);
    try {
      const motsArray = form.mots_cles.split(',').map(s => s.trim()).filter(Boolean);
      const user = await base44.auth.me();

      // 1. Create the correction
      const correction = await base44.entities.VenusCorrection.create({
        ...form,
        mots_cles: JSON.stringify(motsArray),
        interaction_id: presetData?.id || '',
        auteur: user?.email || 'unknown',
        statut: 'validee',
      });

      // 2. Auto-create knowledge entry from the correction
      const knowledge = await base44.entities.VenusKnowledge.create({
        titre: `Correction: ${form.question_client.substring(0, 50)}`,
        categorie: form.categorie,
        question: form.question_client,
        reponse_officielle: form.nouvelle_reponse,
        mots_cles: JSON.stringify(motsArray),
        pays: presetData?.country_code || 'ALL',
        ville: presetData?.ville || '',
        langue: 'fr',
        priorite: 'haute',
        auteur: user?.email || 'unknown',
        version: 1,
        statut: 'valide',
      });

      // 3. Link knowledge to correction
      await base44.entities.VenusCorrection.update(correction.id, { knowledge_id: knowledge.id });

      // 4. Resolve the interaction if it exists
      if (presetData?.id) {
        await base44.entities.VenusInteraction.update(presetData.id, { statut: 'resolu' });
      }

      // 5. Log audit
      await logAudit('create', 'correction', correction.id, null, correction);
      await logAudit('create', 'knowledge', knowledge.id, null, knowledge);

      // 6. Refresh all relevant queries
      queryClient.invalidateQueries({ queryKey: ['venus-knowledge'] });
      queryClient.invalidateQueries({ queryKey: ['venus-corrections'] });
      queryClient.invalidateQueries({ queryKey: ['venus-misunderstood'] });
      queryClient.invalidateQueries({ queryKey: ['venus-negative'] });

      // 7. Reset form
      setForm({ question_client: '', reponse_venus: '', nouvelle_reponse: '', commentaires: '', categorie: 'autres', mots_cles: '' });
      onDone?.();
    } catch (e) {
      console.error('Erreur correction:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          {onDone && (
            <Button variant="ghost" size="icon" onClick={onDone}><ArrowLeft className="w-4 h-4" /></Button>
          )}
          <h2 className="text-lg font-bold text-slate-900">Correction de VENUS</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Question du client *</Label>
            <Textarea value={form.question_client} onChange={e => setForm(f => ({ ...f, question_client: e.target.value }))} rows={2} placeholder="Question posée par le client" />
          </div>
          <div>
            <Label>Réponse actuelle de VENUS</Label>
            <Textarea value={form.reponse_venus} onChange={e => setForm(f => ({ ...f, reponse_venus: e.target.value }))} rows={3} placeholder="Réponse donnée par VENUS (à corriger)" className="bg-red-50" />
          </div>
          <div>
            <Label>Nouvelle réponse officielle *</Label>
            <Textarea value={form.nouvelle_reponse} onChange={e => setForm(f => ({ ...f, nouvelle_reponse: e.target.value }))} rows={4} placeholder="Nouvelle réponse corrigée" className="bg-green-50" />
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
              <Label>Mots-clés</Label>
              <Input value={form.mots_cles} onChange={e => setForm(f => ({ ...f, mots_cles: e.target.value }))} placeholder="mot1, mot2" />
            </div>
          </div>
          <div>
            <Label>Commentaires</Label>
            <Textarea value={form.commentaires} onChange={e => setForm(f => ({ ...f, commentaires: e.target.value }))} rows={2} placeholder="Notes internes (optionnel)" />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <p className="text-xs text-slate-400">La correction sera automatiquement ajoutée à la base de connaissances.</p>
          <Button onClick={handleSave} disabled={saving || !form.question_client || !form.nouvelle_reponse}>
            <Save className="w-4 h-4 mr-1" />{saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  );
}