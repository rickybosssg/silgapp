import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Plus, Trash2, Save, ChevronRight, Workflow as WorkflowIcon } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

const STEP_TYPES = [
  { value: 'collecter_info', label: 'Collecter Info', color: 'bg-blue-100 text-blue-700' },
  { value: 'action', label: 'Action', color: 'bg-green-100 text-green-700' },
  { value: 'notification', label: 'Notification', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'condition', label: 'Condition', color: 'bg-purple-100 text-purple-700' },
  { value: 'attente_evenement', label: 'Attente Événement', color: 'bg-orange-100 text-orange-700' },
  { value: 'sous_workflow', label: 'Sous-Workflow', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'fin', label: 'Fin', color: 'bg-gray-100 text-gray-700' },
];

export default function WorkflowEditorTab({ workflows, selectedCode, onRefresh }) {
  const [selectedWf, setSelectedWf] = useState(null);
  const [etapes, setEtapes] = useState([]);
  const [meta, setMeta] = useState({ nom: '', description: '', code: '', categorie: 'course' });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (selectedCode && workflows.length > 0) {
      const wf = workflows.find(w => w.code === selectedCode);
      if (wf) loadWorkflow(wf);
    }
  }, [selectedCode, workflows]);

  const loadWorkflow = (wf) => {
    setSelectedWf(wf);
    setMeta({ nom: wf.nom, description: wf.description, code: wf.code, categorie: wf.categorie });
    try { setEtapes(JSON.parse(wf.etapes || '[]')); } catch { setEtapes([]); }
  };

  const handleSelect = (code) => {
    const wf = workflows.find(w => w.code === code);
    if (wf) loadWorkflow(wf);
  };

  const moveStep = (index, dir) => {
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= etapes.length) return;
    const newEtapes = [...etapes];
    [newEtapes[index], newEtapes[newIndex]] = [newEtapes[newIndex], newEtapes[index]];
    setEtapes(newEtapes);
  };

  const deleteStep = (index) => {
    setEtapes(etapes.filter((_, i) => i !== index));
  };

  const addStep = () => {
    const newStep = {
      id: `step_${Date.now()}`,
      type: 'notification',
      message: 'Nouveau message',
      prochaine_etape: etapes.length > 0 ? etapes[etapes.length - 1].id : 'fin',
    };
    setEtapes([...etapes, newStep]);
  };

  const updateStep = (index, field, value) => {
    const newEtapes = [...etapes];
    newEtapes[index] = { ...newEtapes[index], [field]: value };
    setEtapes(newEtapes);
  };

  const handleSave = async () => {
    if (!selectedWf) return;
    setSaving(true);
    try {
      await base44.entities.VenusWorkflow.update(selectedWf.id, {
        nom: meta.nom,
        description: meta.description,
        categorie: meta.categorie,
        etapes: JSON.stringify(etapes),
      });
      toast({ title: 'Workflow mis à jour', description: `${etapes.length} étapes enregistrées` });
      onRefresh?.();
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (workflows.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">Initialisez les workflows d'abord.</p>;
  }

  return (
    <div>
      {/* Selector */}
      <div className="flex items-center gap-2 mb-4">
        <WorkflowIcon className="w-4 h-4 text-muted-foreground" />
        <Select value={selectedWf?.code || ''} onValueChange={handleSelect}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Sélectionner un workflow" /></SelectTrigger>
          <SelectContent>
            {workflows.map(wf => <SelectItem key={wf.id} value={wf.code}>{wf.nom}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!selectedWf ? (
        <p className="text-sm text-muted-foreground text-center py-10">Sélectionnez un workflow à éditer.</p>
      ) : (
        <div>
          {/* Metadata */}
          <div className="bg-white rounded-xl border border-border p-4 mb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nom</label>
                <Input value={meta.nom} onChange={e => setMeta({ ...meta, nom: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Catégorie</label>
                <Select value={meta.categorie} onValueChange={v => setMeta({ ...meta, categorie: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="course">Course</SelectItem>
                    <SelectItem value="livraison">Livraison</SelectItem>
                    <SelectItem value="paiement">Paiement</SelectItem>
                    <SelectItem value="partenaire">Partenaire</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="programmation">Programmation</SelectItem>
                    <SelectItem value="communication">Communication</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea value={meta.description} onChange={e => setMeta({ ...meta, description: e.target.value })} className="mt-1" rows={2} />
            </div>
          </div>

          {/* Steps */}
          <div className="bg-white rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Étapes du workflow ({etapes.length})</h3>
              <div className="flex gap-2">
                <Button onClick={addStep} size="sm" variant="outline"><Plus className="w-4 h-4 mr-1" /> Étape</Button>
                <Button onClick={handleSave} size="sm" disabled={saving}><Save className="w-4 h-4 mr-1" /> {saving ? 'Sauvegarde...' : 'Enregistrer'}</Button>
              </div>
            </div>

            <div className="space-y-2">
              {etapes.map((step, idx) => {
                const stepType = STEP_TYPES.find(t => t.value === step.type) || STEP_TYPES[2];
                return (
                  <div key={idx} className="border border-border rounded-lg p-3 bg-muted/30">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col gap-1 pt-1">
                        <button onClick={() => moveStep(idx, -1)} className="text-muted-foreground hover:text-foreground"><ArrowUp className="w-3 h-3" /></button>
                        <button onClick={() => moveStep(idx, 1)} className="text-muted-foreground hover:text-foreground"><ArrowDown className="w-3 h-3" /></button>
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className={`text-[10px] ${stepType.color}`}>{stepType.label}</Badge>
                          <code className="text-[10px] text-muted-foreground">{step.id}</code>
                          {step.prochaine_etape && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <ChevronRight className="w-3 h-3" /> {step.prochaine_etape}
                            </span>
                          )}
                        </div>
                        <Select value={step.type} onValueChange={v => updateStep(idx, 'type', v)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STEP_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {step.type === 'collecter_info' && (
                          <>
                            <Input placeholder="Champ" value={step.champ || ''} onChange={e => updateStep(idx, 'champ', e.target.value)} className="h-7 text-xs" />
                            <Textarea placeholder="Question" value={step.question || ''} onChange={e => updateStep(idx, 'question', e.target.value)} className="text-xs" rows={2} />
                            <Input placeholder="Options (séparées par virgule)" value={(step.options || []).join(', ')} onChange={e => updateStep(idx, 'options', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} className="h-7 text-xs" />
                          </>
                        )}
                        {(step.type === 'notification' || step.type === 'fin') && (
                          <Textarea placeholder="Message" value={step.message || ''} onChange={e => updateStep(idx, 'message', e.target.value)} className="text-xs" rows={2} />
                        )}
                        {step.type === 'action' && (
                          <Input placeholder="Action (creer_course, lancer_dispatch, etc.)" value={step.action || ''} onChange={e => updateStep(idx, 'action', e.target.value)} className="h-7 text-xs" />
                        )}
                        {step.type === 'attente_evenement' && (
                          <Input placeholder="Événement (livreur_accepte, colis_recupere, etc.)" value={step.evenement || ''} onChange={e => updateStep(idx, 'evenement', e.target.value)} className="h-7 text-xs" />
                        )}
                        {step.type === 'condition' && (
                          <div className="grid grid-cols-3 gap-1">
                            <Input placeholder="Champ" value={step.condition?.champ || ''} onChange={e => updateStep(idx, 'condition', { ...step.condition, champ: e.target.value })} className="h-7 text-xs" />
                            <Input placeholder="Opérateur" value={step.condition?.operateur || ''} onChange={e => updateStep(idx, 'condition', { ...step.condition, operateur: e.target.value })} className="h-7 text-xs" />
                            <Input placeholder="Valeur" value={step.condition?.valeur || ''} onChange={e => updateStep(idx, 'condition', { ...step.condition, valeur: e.target.value })} className="h-7 text-xs" />
                          </div>
                        )}
                        {step.type === 'sous_workflow' && (
                          <Input placeholder="Code du sous-workflow" value={step.workflow_code || ''} onChange={e => updateStep(idx, 'workflow_code', e.target.value)} className="h-7 text-xs" />
                        )}
                        <Input placeholder="Prochaine étape (ID)" value={step.prochaine_etape || ''} onChange={e => updateStep(idx, 'prochaine_etape', e.target.value)} className="h-7 text-xs" />
                      </div>
                      <button onClick={() => deleteStep(idx)} className="text-red-400 hover:text-red-600 pt-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}