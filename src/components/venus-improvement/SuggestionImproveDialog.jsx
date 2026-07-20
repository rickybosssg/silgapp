import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sparkles, Check } from 'lucide-react';

const CATEGORIES = ['tarifs', 'expedition_colis', 'reception_colis', 'suivi_colis', 'gps', 'paiement', 'annulation_course', 'compte_client', 'compte_livreur', 'inscription', 'notifications', 'questions_generales', 'autres'];

export default function SuggestionImproveDialog({ suggestion, onClose, onSaved }) {
  const [form, setForm] = useState({
    amelioration_reponse: '', amelioration_regle_metier: '', amelioration_mots_cles: '',
    amelioration_categorie: '', amelioration_workflow: '', amelioration_commentaires: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (suggestion) {
      setForm({
        amelioration_reponse: suggestion.reponse_proposee || '',
        amelioration_regle_metier: '',
        amelioration_mots_cles: suggestion.mots_cles ? (Array.isArray(JSON.parse(suggestion.mots_cles)) ? JSON.parse(suggestion.mots_cles).join(', ') : '') : '',
        amelioration_categorie: suggestion.categorie || 'questions_generales',
        amelioration_workflow: '',
        amelioration_commentaires: '',
      });
    }
  }, [suggestion]);

  const handleSave = async () => {
    if (!form.amelioration_reponse.trim()) return;
    setSaving(true);
    try {
      const user = await base44.auth.me();
      const motsArray = form.amelioration_mots_cles.split(',').map(s => s.trim()).filter(Boolean);

      // Build history entry
      const existingHistory = suggestion.historique_versions ? JSON.parse(suggestion.historique_versions) : [];
      const newVersion = {
        version: existingHistory.length + 1,
        auteur: user?.email || 'admin',
        date: new Date().toISOString(),
        ancienne_reponse: suggestion.reponse_proposee || '',
        nouvelle_reponse: form.amelioration_reponse,
        raison: form.amelioration_commentaires || 'Amélioration manuelle',
      };

      // 1. Create business rule if provided
      let ruleId = '';
      if (form.amelioration_regle_metier && form.amelioration_regle_metier.trim().length > 10) {
        const rule = await base44.entities.VenusBusinessRule.create({
          nom: `Règle: ${suggestion.question_detectee.substring(0, 60)}`,
          description: form.amelioration_regle_metier.trim(),
          domaine: form.amelioration_categorie || 'general',
          categorie: form.amelioration_categorie || 'general',
          priorite: 'haute',
          conditions_application: JSON.stringify([suggestion.question_detectee.substring(0, 200)]),
          exemples: JSON.stringify([suggestion.question_detectee]),
          reponse_associee: form.amelioration_reponse,
          statut: 'valide',
          pays: 'ALL',
          langue: 'fr',
          auteur: user?.email || 'admin',
          version: 1,
          date_creation: new Date().toISOString(),
        });
        ruleId = rule.id;
      }

      // 2. Update suggestion with improvement data
      await base44.entities.VenusSuggestion.update(suggestion.id, {
        amelioration_reponse: form.amelioration_reponse,
        amelioration_regle_metier: form.amelioration_regle_metier || undefined,
        amelioration_mots_cles: JSON.stringify(motsArray),
        amelioration_categorie: form.amelioration_categorie,
        amelioration_workflow: form.amelioration_workflow || undefined,
        amelioration_commentaires: form.amelioration_commentaires || undefined,
        amelioration_par: user?.email || 'admin',
        amelioration_at: new Date().toISOString(),
        statut: 'amelioree',
        reponse_proposee: form.amelioration_reponse,
        mots_cles: JSON.stringify(motsArray),
        categorie: form.amelioration_categorie,
        regle_metier_id: ruleId || undefined,
        regle_metier_nom: form.amelioration_regle_metier ? `Règle: ${suggestion.question_detectee.substring(0, 60)}` : undefined,
        historique_versions: JSON.stringify([...existingHistory, newVersion]),
        hallucination_detectee: false,
        hallucination_details: undefined,
      });

      onSaved?.();
      onClose?.();
    } catch (e) {
      console.error('Erreur amélioration:', e);
    } finally {
      setSaving(false);
    }
  };

  if (!suggestion) return null;

  return (
    <Dialog open={!!suggestion} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-500" /> Améliorer la suggestion</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-amber-50 rounded-lg p-2.5 border border-amber-100">
            <p className="text-[10px] font-bold text-amber-600 uppercase mb-0.5">Réponse proposée par VENUS</p>
            <p className="text-xs text-gray-600 line-clamp-3">{suggestion.reponse_proposee}</p>
          </div>
          <div>
            <Label>✨ Réponse améliorée *</Label>
            <Textarea value={form.amelioration_reponse} onChange={e => setForm({ ...form, amelioration_reponse: e.target.value })} rows={5} className="bg-green-50 border-green-200" placeholder="Corrigez et améliorez la réponse..." />
          </div>
          <div>
            <Label>📖 Nouvelle règle métier (optionnelle)</Label>
            <Textarea value={form.amelioration_regle_metier} onChange={e => setForm({ ...form, amelioration_regle_metier: e.target.value })} rows={3} className="bg-amber-50 border-amber-200" placeholder="Principe général que VENUS appliquera dans toutes les situations similaires..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Catégorie</Label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={form.amelioration_categorie} onChange={e => setForm({ ...form, amelioration_categorie: e.target.value })}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <Label>Workflow associé</Label>
              <Input value={form.amelioration_workflow} onChange={e => setForm({ ...form, amelioration_workflow: e.target.value })} placeholder="creer_course" />
            </div>
          </div>
          <div>
            <Label>Mots-clés (séparés par virgules)</Label>
            <Input value={form.amelioration_mots_cles} onChange={e => setForm({ ...form, amelioration_mots_cles: e.target.value })} placeholder="mot1, mot2, mot3" />
          </div>
          <div>
            <Label>Commentaires (internes)</Label>
            <Textarea value={form.amelioration_commentaires} onChange={e => setForm({ ...form, amelioration_commentaires: e.target.value })} rows={2} placeholder="Raison de l'amélioration..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving || !form.amelioration_reponse.trim()}>
            <Check className="w-4 h-4 mr-1" /> {saving ? 'Enregistrement...' : 'Enregistrer l\'amélioration'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}