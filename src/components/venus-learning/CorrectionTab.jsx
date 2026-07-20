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
    regle_metier: '', commentaires: '', categorie: 'autres', mots_cles: '',
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

      // 2b. Auto-create business rule if regle_metier is provided
      let businessRuleId = '';
      if (form.regle_metier && form.regle_metier.trim().length > 10) {
        const rule = await base44.entities.VenusBusinessRule.create({
          nom: `Règle: ${form.question_client.substring(0, 60)}`,
          description: form.regle_metier.trim(),
          domaine: form.categorie || 'general',
          categorie: form.categorie || 'general',
          priorite: 'haute',
          conditions_application: JSON.stringify([form.question_client.substring(0, 200)]),
          exemples: JSON.stringify([form.question_client]),
          reponse_associee: form.nouvelle_reponse,
          statut: 'valide',
          pays: presetData?.country_code || 'ALL',
          langue: 'fr',
          auteur: user?.email || 'unknown',
          version: 1,
          date_creation: new Date().toISOString(),
        });
        businessRuleId = rule.id;
      }

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
          <div>
            <Label>📖 Règle métier *</Label>
            <Textarea value={form.regle_metier} onChange={e => setForm(f => ({ ...f, regle_metier: e.target.value }))} rows={4} placeholder="Principe général que VENUS devra appliquer dans toutes les situations similaires. Ex: Lorsque le client indique un seul lieu précédé de « à », « vers », « pour », considérer ce lieu comme la destination. Ne jamais redemander cette destination." className="bg-amber-50 border-amber-200" />
            <p className="text-xs text-amber-600 mt-1">Cette règle sera appliquée automatiquement par VENUS dans toutes les conversations similaires, avant même la génération de la réponse.</p>
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