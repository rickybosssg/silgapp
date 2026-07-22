import React, { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileText, Loader2, FileUp, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import DocumentPreviewDialog from './DocumentPreviewDialog';

const ACCEPTED_FORMATS = '.txt,.pdf,.docx,.xlsx,.csv,.json';
const ACCEPTED_LABELS = ['TXT', 'PDF', 'Word', 'Excel', 'CSV', 'JSON'];

export default function FileImportTab() {
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [recentImports, setRecentImports] = useState([]);
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();

  const handleFile = async (file) => {
    if (!file) return;
    const maxSize = 25 * 1024 * 1024; // 25 MB
    if (file.size > maxSize) {
      toast({ title: 'Fichier trop volumineux', description: 'Maximum 25 Mo', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      // Étape 1: Upload du fichier
      const uploadResult = await base44.integrations.Core.UploadFile({ file });
      const fileUrl = uploadResult.file_url;
      if (!fileUrl) throw new Error('Upload échoué');

      // Étape 2: Prévisualisation (extraction + chunking + mots-clés)
      setPreviewing(true);
      const res = await base44.functions.invoke('indexerDocumentVenus', {
        action: 'previsualiser_document',
        fichier_url: fileUrl,
        fichier_nom: file.name,
        fichier_type_mime: file.type,
      });

      if (res?.success && res?.preview) {
        setPreviewData(res.preview);
      } else {
        throw new Error(res?.error || 'Extraction échouée');
      }
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      setPreviewing(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handlePublished = (docTitle, nbChunks) => {
    setRecentImports(prev => [{ titre: docTitle, nb_chunks: nbChunks, date: new Date().toISOString() }, ...prev].slice(0, 5));
    setPreviewData(null);
    queryClient.invalidateQueries({ queryKey: ['rag-knowledge-stats'] });
    queryClient.invalidateQueries({ queryKey: ['venus-documents'] });
    toast({ title: 'Document publié', description: `${docTitle} — ${nbChunks} chunks indexés dans le RAG` });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Import de fichiers</h2>
          <p className="text-sm text-slate-500 mb-4">
            Uploadez un document — VENUS extrait automatiquement le texte, découpe en chunks, génère les mots-clés et indexe dans le RAG.
          </p>

          {/* Drag & drop area */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-slate-300 hover:border-primary/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FORMATS}
              className="hidden"
              onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
            {uploading || previewing ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-sm font-medium text-slate-700">
                  {uploading ? 'Upload du fichier...' : 'Extraction et analyse...'}
                </p>
                <p className="text-xs text-slate-400">VENUS analyse votre document</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileUp className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm font-medium text-slate-700">
                  Glissez un fichier ici ou cliquez pour parcourir
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {ACCEPTED_LABELS.map(fmt => (
                    <span key={fmt} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{fmt}</span>
                  ))}
                </div>
                <p className="text-xs text-slate-400">Maximum 25 Mo</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent imports */}
      {recentImports.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" /> Imports récents
            </h3>
            <div className="space-y-2">
              {recentImports.map((imp, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
                  <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{imp.titre}</p>
                    <p className="text-xs text-slate-400">{imp.nb_chunks} chunks • {new Date(imp.date).toLocaleTimeString('fr-FR')}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Indexé</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview dialog */}
      {previewData && (
        <DocumentPreviewDialog
          open={!!previewData}
          preview={previewData}
          onClose={() => setPreviewData(null)}
          onPublished={handlePublished}
        />
      )}
    </div>
  );
}