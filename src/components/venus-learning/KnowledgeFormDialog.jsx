import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { CATEGORIES, CATEGORY_LABELS, PAYS_CODES, STATUT_LABELS, PRIORITE_LABELS, logAudit, createKnowledgeVersion, getCategoryLabel } from '@/lib/venusLearning';
import { Eye, Edit3, Save, Send, Archive, Trash2, FileText, CheckCircle, Loader2, RefreshCw, AlertTriangle, Clock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function KnowledgeFormDialog({ open, onClose, editEntry, presetQuestion, onSaved }) {
  const [form, setForm] = useState({
    titre: '', description: '', categorie: 'cas_livraison', sous_categorie: '',
    question: '', reponse_officielle: '', mots_cles: '', pays: 'ALL', ville: '',
    langue: 'fr', priorite: 'normale', statut: 'brouillon',
  });
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState(''); // '', 'saving', 'saved', 'error'
  const [savedId, setSavedId] = useState(null);
  const [customCatOpen, setCustomCatOpen] = useState(false);
  const [customCat, setCustomCat] = useState('');
  const autoSaveTimer = useRef(null);
  const lastSavedRef = useRef('');

  useEffect(() => {
    if (editEntry) {
      setForm({
        titre: editEntry.titre || '', description: editEntry.description || '',
        categorie: editEntry.categorie || 'cas_livraison', sous_categorie: editEntry.sous_categorie || '',
        question: editEntry.question || '', reponse_officielle: editEntry.reponse_officielle || '',
        mots_cles: editEntry.mots_cles ? (typeof editEntry.mots_cles === 'string' ? (() => { try { return JSON.parse(editEntry.mots_cles).join(', '); } catch { return ''; } })() : '') : '',
        pays: editEntry.pays || 'ALL', ville: editEntry.ville || '', langue: editEntry.langue || 'fr',
        priorite: editEntry.priorite || 'normale', statut: editEntry.statut || 'brouillon',
      });
      setSavedId(editEntry.id);
      lastSavedRef.current = JSON.stringify(editEntry);
    } else if (presetQuestion) {
      setForm(f => ({ ...f, question: presetQuestion }));
      setSavedId(null);
    } else {
      setForm({ titre: '', description: '', categorie: 'cas_livraison', sous_categorie: '', question: '', reponse_officielle: '', mots_cles: '', pays: 'ALL', ville: '', langue: 'fr', priorite: 'normale', statut: 'brouillon' });
      setSavedId(null);
    }
    setAutoSaveStatus('');
    setPreviewMode(false);
  }, [editEntry, presetQuestion, open]);

  // ── Auto-save (uniquement pour les brouillons existants) ──
  const doAutoSave = useCallback(async () => {
    if (!savedId || !form.titre || !form.reponse_officielle) return;
    if (form.statut !== 'brouillon') return;
    const currentStr = JSON.stringify(form);
    if (currentStr === lastSavedRef.current) return;

    setAutoSaveStatus('saving');
    try {
      const motsArray = form.mots_cles.split(',').map(s => s.trim()).filter(Boolean);
      const data = { ...form, mots_cles: JSON.stringify(motsArray) };
      await base44.entities.VenusKnowledge.update(savedId, data);
      lastSavedRef.current = currentStr;
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus(''), 3000);
    } catch (e) {
      console.error('[AutoSave] Erreur:', e.message);
      setAutoSaveStatus('error');
    }
  }, [savedId, form]);

  useEffect(() => {
    if (!open || !savedId || form.statut !== 'brouillon') return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { doAutoSave(); }, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [form, open, savedId, doAutoSave]);

  const setField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const prepareData = () => {
    const motsArray = form.mots_cles.split(',').map(s => s.trim()).filter(Boolean);
    return { ...form, mots_cles: JSON.stringify(motsArray) };
  };

  const handleSaveDraft = async () => {
    if (!form.titre || !form.reponse_officielle) return;
    setSaving(true);
    const data = { ...prepareData(), statut: form.statut === 'valide' ? 'valide' : 'brouillon' };
    try {
      const user = await base44.auth.me().catch(() => null);
      if (editEntry || savedId) {
        const id = editEntry?.id || savedId;
        const newVersion = (editEntry?.version || 1) + 1;
        await createKnowledgeVersion(id, editEntry?.version || 1, editEntry, 'update');
        await base44.entities.VenusKnowledge.update(id, { ...data, version: newVersion, auteur: user?.email || data.auteur });
        await logAudit('update', 'knowledge', id, editEntry, data);
      } else {
        const created = await base44.entities.VenusKnowledge.create({ ...data, version: 1, auteur: user?.email || 'admin' });
        await createKnowledgeVersion(created.id, 1, created, 'create');
        await logAudit('create', 'knowledge', created.id, null, created);
        setSavedId(created.id);
      }
      onSaved?.();
    } catch (e) {
      console.error('Erreur sauvegarde:', e);
      alert('Erreur lors de la sauvegarde: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!form.titre || !form.reponse_officielle) return;
    setPublishing(true);
    try {
      const user = await base44.auth.me().catch(() => null);
      const data = { ...prepareData(), statut: 'valide', date_publication: new Date().toISOString(), auteur: user?.email || form.auteur || 'admin' };
      const id = editEntry?.id || savedId;
      if (id) {
        const newVersion = (editEntry?.version || 1) + 1;
        await createKnowledgeVersion(id, editEntry?.version || 1, editEntry, 'publish');
        await base44.entities.VenusKnowledge.update(id, { ...data, version: newVersion });
        await logAudit('publish', 'knowledge', id, editEntry, data);
      } else {
        const created = await base44.entities.VenusKnowledge.create({ ...data, version: 1 });
        await createKnowledgeVersion(created.id, 1, created, 'publish');
        await logAudit('publish', 'knowledge', created.id, null, created);
      }

      // ── Auto-indexation dans la base RAG ──
      const textePourRag = `Titre: ${form.titre}\nDescription: ${form.description || ''}\nCatégorie: ${getCategoryLabel(form.categorie)}\nSous-catégorie: ${form.sous_categorie || 'N/A'}\nQuestion: ${form.question || 'N/A'}\n\nContenu:\n${form.reponse_officielle}\n\nMots-clés: ${form.mots_cles}`;
      try {
        const ragResult = await base44.functions.invoke('indexerDocumentVenus', {
          action: 'index_texte_direct',
          texte: textePourRag,
          auteur: user?.email || 'admin',
        });
        if (ragResult?.success && ragResult?.document?.id && id) {
          await base44.entities.VenusKnowledge.update(id, { rag_indexe: true, rag_document_id: ragResult.document.id });
        }
      } catch (ragErr) {
        console.warn('[Publish] Indexation RAG échouée:', ragErr.message);
      }

      onSaved?.();
      onClose();
    } catch (e) {
      console.error('Erreur publication:', e);
      alert('Erreur lors de la publication: ' + e.message);
    } finally {
      setPublishing(false);
    }
  };

  const handleArchive = async () => {
    const id = editEntry?.id || savedId;
    if (!id) return;
    if (!confirm(`Archiver "${form.titre}" ? Le document sera retiré de la base RAG de VENUS mais restera consultable.`)) return;
    try {
      // Désindexer du RAG d'abord
      if (editEntry?.rag_indexe && editEntry?.rag_document_id) {
        try {
          await base44.functions.invoke('indexerDocumentVenus', { action: 'desindexer_knowledge', knowledge_id: id });
        } catch (e) { console.warn('Erreur désindexation RAG:', e.message); }
      }
      await base44.entities.VenusKnowledge.update(id, { statut: 'archive', rag_indexe: false });
      await logAudit('archive', 'knowledge', id, editEntry, { statut: 'archive' });
      onSaved?.();
      onClose();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const handleReindex = async () => {
    const id = editEntry?.id || savedId;
    if (!id) return;
    setPublishing(true);
    try {
      const res = await base44.functions.invoke('indexerDocumentVenus', { action: 'reindexer_knowledge', knowledge_id: id });
      if (res?.success) {
        alert('Document réindexé dans le RAG avec succès.');
      } else {
        alert('Erreur de réindexation: ' + (res?.error || 'inconnue'));
      }
      onSaved?.();
    } catch (e) { alert('Erreur: ' + e.message); } finally { setPublishing(false); }
  };

  const handleDelete = async () => {
    const id = editEntry?.id || savedId;
    if (!id) return;
    if (!confirm(`Supprimer définitivement "${form.titre}" ?`)) return;
    try {
      await base44.entities.VenusKnowledge.delete(id);
      await logAudit('delete', 'knowledge', id, editEntry, null);
      onSaved?.();
      onClose();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const wordCount = (form.reponse_officielle || '').trim().split(/\s+/).filter(Boolean).length;
  const charCount = (form.reponse_officielle || '').length;
  const isPublished = form.statut === 'valide';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {editEntry ? 'Modifier le document' : 'Nouveau document'}
              {form.statut && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUT_LABELS[form.statut]?.color || ''}`}>
                  {STATUT_LABELS[form.statut]?.label || form.statut}
                </span>
              )}
              {isPublished && (
                form.rag_indexe ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Indexé RAG
                  </span>
                ) : form.rag_erreur ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1" title={form.rag_erreur}>
                    <AlertTriangle className="w-3 h-3" /> Erreur RAG
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-1">
                    <Clock className="w-3 h-3" /> En attente RAG
                  </span>
                )
              )}
            </DialogTitle>
            {autoSaveStatus && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                {autoSaveStatus === 'saving' && <><Loader2 className="w-3 h-3 animate-spin" /> Sauvegarde...</>}
                {autoSaveStatus === 'saved' && <><CheckCircle className="w-3 h-3 text-green-500" /> Enregistré</>}
                {autoSaveStatus === 'error' && <span className="text-red-500">Erreur auto-save</span>}
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* ── Métadonnées ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Titre *</Label>
              <Input value={form.titre} onChange={e => setField('titre', e.target.value)} placeholder="Titre du document" />
            </div>
            <div className="md:col-span-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setField('description', e.target.value)} placeholder="Description courte du document" />
            </div>
            <div>
              <Label>Catégorie</Label>
              <Select value={form.categorie} onValueChange={v => setField('categorie', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{getCategoryLabel(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sous-catégorie</Label>
              <Input value={form.sous_categorie} onChange={e => setField('sous_categorie', e.target.value)} placeholder="Sous-catégorie (libre)" />
            </div>
            <div>
              <Label>Priorité</Label>
              <Select value={form.priorite} onValueChange={v => setField('priorite', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PRIORITE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Pays</Label>
              <Select value={form.pays} onValueChange={v => setField('pays', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYS_CODES.map(p => <SelectItem key={p} value={p}>{p === 'ALL' ? 'Tous les pays' : p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Mots-clés (séparés par des virgules)</Label>
              <Input value={form.mots_cles} onChange={e => setField('mots_cles', e.target.value)} placeholder="mot1, mot2, mot3..." />
            </div>
            <div className="md:col-span-2">
              <Label>Question / Résumé court</Label>
              <Input value={form.question} onChange={e => setField('question', e.target.value)} placeholder="Question ou résumé court (optionnel pour les longs documents)" />
            </div>
          </div>

          {/* ── Grand éditeur de texte ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Contenu du document *</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{wordCount} mots · {charCount} caractères</span>
                <Button
                  size="sm"
                  variant={previewMode ? 'default' : 'outline'}
                  onClick={() => setPreviewMode(!previewMode)}
                  className="h-7"
                >
                  {previewMode ? <><Edit3 className="w-3.5 h-3.5 mr-1" />Éditer</> : <><Eye className="w-3.5 h-3.5 mr-1" />Aperçu</>}
                </Button>
              </div>
            </div>
            {previewMode ? (
              <div className="min-h-[400px] max-h-[500px] overflow-y-auto bg-white border border-slate-200 rounded-lg p-4 prose prose-sm max-w-none">
                <ReactMarkdown>{form.reponse_officielle || '*Aucun contenu à afficher*'}</ReactMarkdown>
              </div>
            ) : (
              <Textarea
                value={form.reponse_officielle}
                onChange={e => setField('reponse_officielle', e.target.value)}
                rows={20}
                className="min-h-[400px] max-h-[500px] resize-y font-mono text-sm leading-relaxed"
                placeholder="Collez ici votre texte intégral : cas de livraison, procédures, scénarios, FAQ, règles métier, scripts de conversation, etc.

Vous pouvez coller des textes très longs sans limite. Le contenu sera automatiquement découpé (chunking) et indexé dans la base RAG de VENUS lors de la publication.

Format Markdown supporté : **gras**, *italique*, listes, titres, etc."
              />
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate-200 flex-shrink-0 flex-wrap gap-2">
          <div className="flex gap-2 mr-auto">
            {editEntry && (
              <Button variant="outline" size="sm" onClick={handleDelete} className="text-red-600 hover:bg-red-50">
                <Trash2 className="w-4 h-4 mr-1" />Supprimer
              </Button>
            )}
            {editEntry && !isPublished && (
              <Button variant="outline" size="sm" onClick={handleArchive}>
                <Archive className="w-4 h-4 mr-1" />Archiver
              </Button>
            )}
            {editEntry && isPublished && (
              <Button variant="outline" size="sm" onClick={handleReindex} disabled={publishing}>
                <RefreshCw className={`w-4 h-4 mr-1 ${publishing ? 'animate-spin' : ''}`} />Réindexer
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>Fermer</Button>
          <Button variant="outline" onClick={handleSaveDraft} disabled={saving || !form.titre || !form.reponse_officielle}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Enregistrer
          </Button>
          <Button onClick={handlePublish} disabled={publishing || !form.titre || !form.reponse_officielle} className="bg-green-600 hover:bg-green-700">
            {publishing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
            Publier {editEntry?.rag_indexe ? '(re-indexer)' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}