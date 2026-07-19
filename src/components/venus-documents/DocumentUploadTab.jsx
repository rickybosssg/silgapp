import React, { useState, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, File, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

const CATEGORIES = [
  'SILGAPP', 'Administration', 'Livreurs', 'Clients', 'Pharmacies',
  'Restaurants', 'Boutiques', 'Paiements', 'Juridique', 'Marketing',
  'Technique', 'API', 'Formation',
];

const TYPES_DOCUMENT = [
  'PDF', 'Word', 'Excel', 'Texte', 'Markdown', 'Image',
  'Manuel', 'Procedure', 'Contrat', 'Tarifs', 'CG', 'FAQ',
  'Guide_Admin', 'Guide_Livreur', 'Guide_Partenaires', 'Formation', 'Politique',
];

const PAYS = [
  { code: 'ALL', label: 'Tous les pays' },
  { code: 'BF', label: 'Burkina Faso' },
  { code: 'CI', label: "Côte d'Ivoire" },
  { code: 'TG', label: 'Togo' },
  { code: 'BJ', label: 'Bénin' },
  { code: 'SN', label: 'Sénégal' },
  { code: 'ML', label: 'Mali' },
  { code: 'GN', label: 'Guinée' },
  { code: 'NE', label: 'Niger' },
  { code: 'GH', label: 'Ghana' },
];

function detectTypeDocument(nom, mime) {
  const ext = nom?.split('.').pop()?.toLowerCase() || '';
  if (mime?.includes('pdf') || ext === 'pdf') return 'PDF';
  if (ext === 'doc' || ext === 'docx') return 'Word';
  if (ext === 'xls' || ext === 'xlsx' || mime?.includes('sheet')) return 'Excel';
  if (ext === 'md') return 'Markdown';
  if (mime?.startsWith('image/')) return 'Image';
  if (ext === 'txt') return 'Texte';
  return 'Texte';
}

export default function DocumentUploadTab({ onIndexed }) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });

  // Métadonnées du document en cours
  const [metadata, setMetadata] = useState({
    titre: '',
    description: '',
    categorie: 'SILGAPP',
    type_document: '',
    pays: 'ALL',
    tags: '',
  });

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, []);

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    addFiles(selected);
  };

  const addFiles = (newFiles) => {
    const valid = newFiles.filter(f => f.size < 25 * 1024 * 1024); // 25MB max
    if (valid.length < newFiles.length) {
      toast({ title: 'Certains fichiers dépassent 25MB', variant: 'destructive' });
    }
    setFiles(prev => [...prev, ...valid]);
    // Auto-remplir le titre et le type avec le premier fichier
    if (valid.length > 0 && !metadata.titre) {
      const f = valid[0];
      setMetadata(prev => ({
        ...prev,
        titre: f.name.replace(/\.[^/.]+$/, ''),
        type_document: detectTypeDocument(f.name, f.type),
      }));
    }
  };

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast({ title: 'Aucun fichier sélectionné', variant: 'destructive' });
      return;
    }
    if (!metadata.titre.trim()) {
      toast({ title: 'Le titre est obligatoire', variant: 'destructive' });
      return;
    }

    setUploading(true);
    setProgress({ current: 0, total: files.length, status: 'Démarrage...' });

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress({ current: i + 1, total: files.length, status: `Upload de ${file.name}...` });

        // Étape 1: Upload du fichier
        const uploadResult = await base44.integrations.Core.UploadFile({ file });
        const fileUrl = uploadResult.file_url;

        // Étape 2: Indexation via backend function
        setProgress({ current: i + 1, total: files.length, status: `Indexation de ${file.name}...` });

        const titre = files.length > 1 ? `${metadata.titre} (${i + 1}/${files.length})` : metadata.titre;

        const result = await base44.functions.invoke('indexerDocumentVenus', {
          action: 'index_document',
          fichier_url: fileUrl,
          fichier_nom: file.name,
          fichier_type_mime: file.type,
          fichier_taille: file.size,
          titre,
          description: metadata.description,
          categorie: metadata.categorie,
          type_document: metadata.type_document || detectTypeDocument(file.name, file.type),
          auteur: 'admin',
          pays: metadata.pays,
          tags: metadata.tags ? metadata.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          statut: 'valide',
        });

        if (!result.success) {
          toast({
            title: `Indexation partielle: ${file.name}`,
            description: result.error || 'Erreur lors de l\'indexation',
            variant: 'destructive',
          });
        }
      }

      setProgress({ current: files.length, total: files.length, status: 'Terminé !' });
      toast({ title: 'Documents indexés', description: `${files.length} fichier(s) traité(s)` });

      // Reset
      setFiles([]);
      setMetadata({ titre: '', description: '', categorie: 'SILGAPP', type_document: '', pays: 'ALL', tags: '' });

      if (onIndexed) onIndexed();
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      setProgress({ current: 0, total: 0, status: '' });
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Zone de drop */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-indigo-200 rounded-2xl p-8 sm:p-12 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.html"
        />
        <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-4">
          <Upload className="w-8 h-8 text-indigo-600" />
        </div>
        <p className="font-semibold text-slate-900">Glissez vos fichiers ici</p>
        <p className="text-sm text-slate-500 mt-1">ou cliquez pour sélectionner</p>
        <p className="text-xs text-slate-400 mt-2">PDF, Word, Excel, Texte, Markdown, Images (OCR) — Max 25MB</p>
      </div>

      {/* Liste des fichiers */}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">{files.length} fichier(s) sélectionné(s)</p>
          {files.map((file, idx) => (
            <div key={idx} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                <File className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              {!uploading && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeFile(idx)}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Métadonnées */}
      {files.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <p className="font-semibold text-slate-900 text-sm">Métadonnées du document</p>

          <div className="space-y-2">
            <Label>Titre *</Label>
            <Input
              value={metadata.titre}
              onChange={e => setMetadata(prev => ({ ...prev, titre: e.target.value }))}
              placeholder="Titre du document"
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={metadata.description}
              onChange={e => setMetadata(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Description courte (optionnel)"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Catégorie</Label>
              <Select value={metadata.categorie} onValueChange={v => setMetadata(prev => ({ ...prev, categorie: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={metadata.type_document} onValueChange={v => setMetadata(prev => ({ ...prev, type_document: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES_DOCUMENT.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Pays</Label>
              <Select value={metadata.pays} onValueChange={v => setMetadata(prev => ({ ...prev, pays: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYS.map(p => <SelectItem key={p.code} value={p.code}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tags (séparés par virgule)</Label>
              <Input
                value={metadata.tags}
                onChange={e => setMetadata(prev => ({ ...prev, tags: e.target.value }))}
                placeholder="guide, procédure, urgence"
              />
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      {uploading && (
        <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-indigo-600 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-indigo-900">{progress.status}</p>
            <div className="w-full bg-indigo-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all"
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
          <span className="text-sm text-indigo-600 font-medium">{progress.current}/{progress.total}</span>
        </div>
      )}

      {/* Bouton d'indexation */}
      {files.length > 0 && !uploading && (
        <Button
          onClick={handleUpload}
          size="lg"
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <Upload className="w-5 h-5" />
          Indexer {files.length} document{files.length > 1 ? 's' : ''}
        </Button>
      )}
    </div>
  );
}