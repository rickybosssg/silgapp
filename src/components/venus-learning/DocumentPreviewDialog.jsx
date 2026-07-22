import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, FileText, Hash, Layers, Loader2, Pencil } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';

const DOC_CATEGORIES = ['SILGAPP', 'Administration', 'Livreurs', 'Clients', 'Pharmacies', 'Restaurants', 'Boutiques', 'Paiements', 'Juridique', 'Marketing', 'Technique', 'API', 'Formation'];

export default function DocumentPreviewDialog({ open, preview, onClose, onPublished }) {
  const [titre, setTitre] = useState('');
  const [categorie, setCategorie] = useState('');
  const [motsClesText, setMotsClesText] = useState('');
  const [texte, setTexte] = useState('');
  const [resume, setResume] = useState('');
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (preview) {
      setTitre(preview.titre || '');
      setCategorie(preview.categorie || 'SILGAPP');
      setMotsClesText((preview.mots_cles || []).join(', '));
      setTexte(preview.texte || '');
      setResume(preview.resume || '');
    }
  }, [preview]);

  if (!preview) return null;

  const motsClesParsed = motsClesText.split(',').map(k => k.trim()).filter(Boolean);
  const estimatedTokens = Math.ceil(texte.length / 4);

  const handlePublish = async () => {
    if (!titre.trim() || !texte.trim()) {
      toast({ title: 'Champs requis', description: 'Le titre et le texte sont obligatoires', variant: 'destructive' });
      return;
    }
    setPublishing(true);
    try {
      const res = await base44.functions.invoke('indexerDocumentVenus', {
        action: 'publier_document',
        texte,
        titre: titre.trim(),
        resume: resume.trim(),
        mots_cles: motsClesParsed,
        categorie,
        langue: preview.langue || 'fr',
        fichier_url: preview.fichier_url,
        fichier_nom: preview.fichier_nom,
        fichier_type_mime: preview.fichier_type_mime,
      });
      if (res?.success) {
        onPublished?.(titre.trim(), res.nb_chunks || 0);
      } else {
        throw new Error(res?.error || 'Publication échouée');
      }
    } catch (e) {
      toast({ title: 'Erreur de publication', description: e.message, variant: 'destructive' });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !publishing) onClose?.(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" /> Aperçu avant publication
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Métadonnées éditables */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Titre</Label>
              <Input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Titre du document" />
            </div>
            <div>
              <Label>Catégorie</Label>
              <Select value={categorie} onValueChange={setCategorie}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Résumé</Label>
            <Textarea value={resume} onChange={e => setResume(e.target.value)} rows={2} placeholder="Résumé du document" />
          </div>

          <div>
            <Label>Mots-clés générés ({motsClesParsed.length})</Label>
            <Input value={motsClesText} onChange={e => setMotsClesText(e.target.value)} placeholder="mots-clés séparés par des virgules" />
            <div className="flex flex-wrap gap-1 mt-2">
              {motsClesParsed.map((mc, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{mc}</span>
              ))}
            </div>
          </div>

          {/* Texte éditable */}
          <div>
            <Label>Texte extrait (éditable)</Label>
            <Textarea value={texte} onChange={e => setTexte(e.target.value)} rows={8} className="font-mono text-xs" />
          </div>

          {/* Chunks preview */}
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">Chunks générés ({preview.nb_chunks})</span>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {preview.chunks?.slice(0, 10).map((chunk, i) => (
                <div key={i} className="text-xs text-slate-500 p-2 bg-white rounded border border-slate-100">
                  <span className="font-semibold text-slate-400">#{chunk.index}</span> ({chunk.taille} chars) {chunk.resume.substring(0, 80)}...
                </div>
              ))}
              {preview.nb_chunks > 10 && (
                <p className="text-xs text-slate-400 text-center pt-1">... et {preview.nb_chunks - 10} autres chunks</p>
              )}
            </div>
          </div>

          {/* Stats et problèmes */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
              <FileText className="w-4 h-4 text-slate-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-slate-700">{texte.length.toLocaleString()}</p>
              <p className="text-[10px] text-slate-400">Caractères</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
              <Hash className="w-4 h-4 text-slate-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-slate-700">{estimatedTokens.toLocaleString()}</p>
              <p className="text-[10px] text-slate-400">Tokens estimés</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
              <Layers className="w-4 h-4 text-slate-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-slate-700">{preview.nb_chunks}</p>
              <p className="text-[10px] text-slate-400">Chunks RAG</p>
            </div>
          </div>

          {/* Problèmes détectés */}
          {preview.problems?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-amber-700">Problèmes détectés</span>
              </div>
              <ul className="text-xs text-amber-600 list-disc list-inside">
                {preview.problems.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}
          {(!preview.problems || preview.problems.length === 0) && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-700">Aucun problème détecté — le document est prêt à être publié.</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onClose?.()} disabled={publishing}>Annuler</Button>
          <Button onClick={handlePublish} disabled={publishing || !titre.trim() || !texte.trim()}>
            {publishing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
            {publishing ? 'Publication...' : 'Publier et indexer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}