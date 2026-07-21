import React, { useState } from "react";
import { ListChecks, Loader2, Play, CheckCircle, XCircle, AlertTriangle, Coins, FileDown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

export default function BatchTestPanel({ personalityKey, countryCode }) {
  const [batchText, setBatchText] = useState("");
  const [report, setReport] = useState(null);
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  const handleBatchRun = async () => {
    const questions = batchText.split("\n").map(q => q.trim()).filter(q => q.length > 1);
    if (questions.length === 0) {
      toast({ title: "Ajoutez au moins une question", variant: "destructive" });
      return;
    }
    setRunning(true);
    setReport(null);
    setResults(null);
    try {
      const res = await base44.functions.invoke("simulerLotVenus", {
        questions,
        country_code: countryCode,
        personality_key: personalityKey,
      });
      setReport(res.data?.report || null);
      setResults(res.data?.results || null);
    } catch (e) {
      toast({ title: "Erreur tests par lot", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const handleLoadExample = () => {
    setBatchText(`Bonjour
Je veux envoyer un colis de Karpala vers Ouaga 2000
Combien ça coûte ?
Où est mon livreur ?
Je veux annuler ma course
Comment ça marche SILGAPP ?
Pouvez-vous modifier l'adresse de livraison ?
Mon colis est perdu
Le code PIN est incorrect
Je veux parler au livreur
Donnez-moi le numéro du support
Je veux recevoir un colis`);
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ListChecks className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-sm">Tests par lot (0 crédit)</h3>
        <Badge variant="outline" className="text-[10px] text-green-600 border-green-300 ml-auto">DRY-RUN</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Une question par ligne. Toutes les questions sont exécutées en mode 0 crédit (cache, règles, RAG heuristique).
        Aucune action réelle, aucun appel LLM.
      </p>

      <div className="space-y-2">
        <Label>Questions (une par ligne)</Label>
        <Textarea
          value={batchText}
          onChange={(e) => setBatchText(e.target.value)}
          placeholder={"Bonjour\nJe veux envoyer un colis\nCombien ça coûte ?"}
          className="min-h-[120px] text-sm"
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={handleBatchRun} disabled={running || !batchText.trim()} className="flex-1">
          {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          {running ? "Tests en cours..." : `Lancer ${batchText.split("\n").filter(q => q.trim().length > 1).length} test(s)`}
        </Button>
        <Button variant="outline" onClick={handleLoadExample} disabled={running}>
          Exemple
        </Button>
      </div>

      {/* Report */}
      {report && (
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Card className="p-2 text-center">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold">{report.total}</p>
            </Card>
            <Card className="p-2 text-center">
              <p className="text-xs text-muted-foreground">Réussis</p>
              <p className="text-lg font-bold text-green-600">{report.reussis}</p>
            </Card>
            <Card className="p-2 text-center">
              <p className="text-xs text-muted-foreground">Taux</p>
              <p className="text-lg font-bold">{report.taux_reussite}%</p>
            </Card>
            <Card className="p-2 text-center">
              <p className="text-xs text-muted-foreground"><Coins className="w-3 h-3 inline" /> Crédits</p>
              <p className="text-lg font-bold">{report.credits_estimes}</p>
            </Card>
            <Card className="p-2 text-center">
              <p className="text-xs text-muted-foreground">LLM calls</p>
              <p className="text-lg font-bold">{report.llm_calls}</p>
            </Card>
          </div>

          {/* Questions non comprises */}
          {report.questions_non_comprises?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-red-700">Questions non comprises ({report.questions_non_comprises.length})</span>
              </div>
              <div className="space-y-1">
                {report.questions_non_comprises.map((q, i) => (
                  <div key={i} className="text-xs text-red-600">
                    • "{q.question}" — confiance: {q.confiance}% — action: {q.action || 'aucune'}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Réponses à corriger */}
          {report.reponses_a_corriger?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-700">Réponses à corriger ({report.reponses_a_corriger.length})</span>
              </div>
              <div className="space-y-2">
                {report.reponses_a_corriger.map((q, i) => (
                  <div key={i} className="text-xs">
                    <div className="text-amber-700 font-medium">Q: "{q.question}"</div>
                    <div className="text-muted-foreground ml-3">R: {q.reponse}</div>
                    <div className="text-amber-600 ml-3">Confiance: {q.confiance}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Détail des résultats */}
          {results && results.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Détail par question :</span>
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs border-b pb-1">
                  {r.confiance >= 80
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    : r.confiance >= 50
                    ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                  <span className="font-medium truncate flex-1" title={r.question}>{r.question}</span>
                  <Badge variant="outline" className="text-[10px]">{r.action || '—'}</Badge>
                  <span className="text-muted-foreground">{r.confiance}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}