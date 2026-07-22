import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Upload, Loader2, CheckCircle, AlertTriangle, XCircle, FileJson, Download } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from '@/components/ui/use-toast';

const BATCH_SIZE = 50;

export default function BulkScenarioImportDialog({ open, onClose, onSaved }) {
  const [jsonText, setJsonText] = useState('');
  const [scenarios, setScenarios] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [results, setResults] = useState(null);
  const [resumeFrom, setResumeFrom] = useState(0);
  const fileInputRef = useRef(null);

  const reset = () => {
    setJsonText('');
    setScenarios(null);
    setProcessing(false);
    setCurrentBatch(0);
    setTotalBatches(0);
    setProcessedCount(0);
    setResults(null);
    setResumeFrom(0);
  };

  const parseJson = (text) => {
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data)) {
        throw new Error('Le JSON doit être un tableau de scénarios');
      }
      // Valider que chaque scénario a au moins un nom ou une conversation
      const valid = data.filter(s => s && (s.nom || s.conversation || s.reponse_ideale));
      if (valid.length === 0) throw new Error('Aucun scénario valide trouvé');
      return { scenarios: valid, total: data.length, invalid: data.length - valid.length };
    } catch (e) {
      throw new Error(`JSON invalide: ${e.message}`);
    }
  };

  const handleParse = () => {
    try {
      const parsed = parseJson(jsonText);
      setScenarios(parsed.scenarios);
      setTotalBatches(Math.ceil(parsed.scenarios.length / BATCH_SIZE));
      setResults(null);
      setResumeFrom(0);
      toast({
        title: 'JSON validé',
        description: `${parsed.scenarios.length} scénarios détectés${parsed.invalid > 0 ? ` (${parsed.invalid} ignorés comme invalides)` : ''}`,
      });
    } catch (e) {
      toast({ title: 'Erreur de parsing', description: e.message, variant: 'destructive' });
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setJsonText(ev.target.result);
      setScenarios(null);
      setResults(null);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const processBatches = async (startBatch = 0) => {
    if (!scenarios) return;
    setProcessing(true);
    setResults(null);

    const allResults = [];
    const total = scenarios.length;
    let processed = startBatch * BATCH_SIZE;

    for (let b = startBatch; b < totalBatches; b++) {
      setCurrentBatch(b + 1);
      const start = b * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, total);
      const batch = scenarios.slice(start, end).map((s, i) => ({ ...s, _index: start + i }));

      try {
        const res = await base44.functions.invoke('indexerDocumentVenus', {
          action: 'import_massif_scenarios_batch',
          scenarios: batch,
          auteur: 'admin',
        });
        if (res?.results) {
          allResults.push(...res.results);
        }
      } catch (e) {
        // En cas d'erreur sur un batch, on enregistre les erreurs et on permet la reprise
        for (let i = 0; i < batch.length; i++) {
          allResults.push({ index: start + i, status: 'error', error: e.message, nom: batch[i].nom || `Scénario ${start + i + 1}` });
        }
        setResumeFrom(b + 1);
        setProcessedCount(processed + batch.length);
        setProcessing(false);
        setResults(allResults);
        toast({ title: 'Interruption', description: `Batch ${b + 1} a échoué. Vous pouvez reprendre.`, variant: 'destructive' });
        return;
      }

      processed += batch.length;
      setProcessedCount(processed);
    }

    setProcessing(false);
    setResults(allResults);
    setCurrentBatch(totalBatches);

    const created = allResults.filter(r => r.status === 'created').length;
    const ignored = allResults.filter(r => r.status === 'ignored').length;
    const errors = allResults.filter(r => r.status === 'error').length;
    toast({
      title: 'Import terminé',
      description: `${created} créés, ${ignored} ignorés (doublons), ${errors} erreurs sur ${total} scénarios`,
    });
    if (created > 0) onSaved?.();
  };

  const handleDownloadReport = () => {
    if (!results) return;
    const report = results.map(r => ({
      index: r.index,
      nom: r.nom || '',
      statut: r.status,
      raison: r.reason || '',
      erreur: r.error || '',
      id: r.id || '',
    }));
    const csv = ['Index,Nom,Statut,Raison,Erreur,ID', ...report.map(r =>
      `"${r.index}","${r.nom.replace(/"/g, '""')}","${r.statut}","${r.raison}","${r.erreur.replace(/"/g, '""')}","${r.id}"`
    )].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rapport_import_scenarios_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const progressPct = scenarios ? Math.round((processedCount / scenarios.length) * 100) : 0;
  const createdCount = results?.filter(r => r.status === 'created').length || 0;
  const ignoredCount = results?.filter(r => r.status === 'ignored').length || 0;
  const errorCount = results?.filter(r => r.status === 'error').length || 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !processing) { reset(); onClose?.(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" /> Import massif de scénarios
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!scenarios && (
            <>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <FileJson className="w-4 h-4 mr-1" /> Choisir un fichier JSON
                  </Button>
                  <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
                  <span className="text-xs text-slate-400">ou collez le JSON ci-dessous</span>
                </div>
                <Textarea
                  value={jsonText}
                  onChange={e => setJsonText(e.target.value)}
                  rows={10}
                  className="font-mono text-xs"
                  placeholder={`Collez un tableau JSON de scénarios :\n\n[\n  {\n    "nom": "Client demande tarif",\n    "description": "...",\n    "conversation": [{"role":"client","content":"..."},{"role":"venus","content":"..."}],\n    "reponse_ideale": "...",\n    "categorie": "faq",\n    "statut": "brouillon"\n  }\n]`}
                />
              </div>
              <Button onClick={handleParse} disabled={!jsonText.trim()} className="w-full">
                Valider le JSON
              </Button>
            </>
          )}

          {/* Résumé de validation */}
          {scenarios && !processing && !results && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <FileJson className="w-8 h-8 text-blue-400 mx-auto mb-2" />
              <p className="text-lg font-bold text-blue-700">{scenarios.length} scénarios prêts à importer</p>
              <p className="text-sm text-blue-600 mt-1">{totalBatches} lot(s) de {BATCH_SIZE}</p>
              <p className="text-xs text-blue-500 mt-2">Les doublons (nom ou conversation identique) seront automatiquement ignorés.</p>
              <div className="flex gap-2 mt-4 justify-center">
                <Button variant="outline" onClick={() => { setScenarios(null); }}>Retour</Button>
                <Button onClick={() => processBatches(0)}>
                  <Upload className="w-4 h-4 mr-2" /> Lancer l'import
                </Button>
              </div>
            </div>
          )}

          {/* Progression */}
          {processing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">Traitement en cours...</span>
                <span className="text-slate-500">Lot {currentBatch}/{totalBatches}</span>
              </div>
              <Progress value={progressPct} />
              <p className="text-xs text-slate-400 text-center">{processedCount}/{scenarios?.length || 0} scénarios traités</p>
              <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Indexation...
              </div>
            </div>
          )}

          {/* Résultats */}
          {results && (
            <div className="space-y-3">
              {/* Reprise */}
              {resumeFrom > 0 && resumeFrom < totalBatches && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-sm text-amber-700">Import interrompu au lot {resumeFrom}</span>
                  <Button size="sm" onClick={() => processBatches(resumeFrom)}>
                    <Upload className="w-3 h-3 mr-1" /> Reprendre
                  </Button>
                </div>
              )}

              {/* Compteurs */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-1" />
                  <p className="text-xl font-bold text-green-700">{createdCount}</p>
                  <p className="text-[10px] text-green-600">Créés</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                  <AlertTriangle className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                  <p className="text-xl font-bold text-slate-600">{ignoredCount}</p>
                  <p className="text-[10px] text-slate-500">Ignorés (doublons)</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <XCircle className="w-5 h-5 text-red-400 mx-auto mb-1" />
                  <p className="text-xl font-bold text-red-600">{errorCount}</p>
                  <p className="text-[10px] text-red-500">Erreurs</p>
                </div>
              </div>

              {/* Détail des résultats */}
              <div className="border border-slate-200 rounded-lg max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-semibold text-slate-500">#</th>
                      <th className="text-left p-2 font-semibold text-slate-500">Nom</th>
                      <th className="text-left p-2 font-semibold text-slate-500">Statut</th>
                      <th className="text-left p-2 font-semibold text-slate-500">Détail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.slice(0, 200).map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="p-2 text-slate-400">{r.index}</td>
                        <td className="p-2 text-slate-700 truncate max-w-[180px]">{r.nom}</td>
                        <td className="p-2">
                          {r.status === 'created' && <span className="text-green-600 font-medium">Créé</span>}
                          {r.status === 'ignored' && <span className="text-slate-500">Ignoré</span>}
                          {r.status === 'error' && <span className="text-red-500 font-medium">Erreur</span>}
                        </td>
                        <td className="p-2 text-slate-400 truncate max-w-[200px]">
                          {r.reason && <span className="text-xs">{r.reason}</span>}
                          {r.error && <span className="text-xs text-red-400">{r.error}</span>}
                        </td>
                      </tr>
                    ))}
                    {results.length > 200 && (
                      <tr><td colSpan={4} className="p-2 text-center text-slate-400">... et {results.length - 200} autres</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2 justify-between">
                <Button variant="outline" size="sm" onClick={handleDownloadReport}>
                  <Download className="w-4 h-4 mr-1" /> Télécharger le rapport
                </Button>
                <Button variant="outline" size="sm" onClick={() => { reset(); onClose?.(); }}>
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}