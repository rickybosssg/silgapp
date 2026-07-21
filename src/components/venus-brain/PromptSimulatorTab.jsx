import React, { useState } from "react";
import { Play, Loader2, Brain, FileText, BookOpen, Wrench, DollarSign, Clock, AlertCircle, Zap, Coins, CheckCircle, XCircle, ListChecks } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import BatchTestPanel from "@/components/venus-brain/BatchTestPanel";

export default function PromptSimulatorTab({ personalityKey, activePrompt }) {
  const [messageTest, setMessageTest] = useState("");
  const [telephone, setTelephone] = useState("+22670000000");
  const [countryCode, setCountryCode] = useState("BF");
  const [mode, setMode] = useState("zero_credit");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  const handleSimulate = async (overrideMode) => {
    const useMode = overrideMode || mode;
    if (!messageTest) {
      toast({ title: "Message de test requis", variant: "destructive" });
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke("simulerVenus", {
        message: messageTest,
        telephone,
        country_code: countryCode,
        mode: useMode,
        personality_key: personalityKey,
      });
      setResult(res.data?.result || null);
    } catch (e) {
      toast({ title: "Erreur simulation", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <Card className={`p-3 ${mode === 'zero_credit' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center gap-2 text-sm">
          {mode === 'zero_credit' ? (
            <><Zap className="w-4 h-4 flex-shrink-0 text-green-600" />
              <span className="text-green-700">
                <strong>Mode 0 crédit (dry-run)</strong> — cache, règles métier, connaissances, RAG heuristique, workflows.
                Aucun appel LLM, aucune action réelle.
              </span></>
          ) : (
            <><Coins className="w-4 h-4 flex-shrink-0 text-amber-600" />
              <span className="text-amber-700">
                <strong>Mode avec LLM</strong> — teste la qualité conversationnelle complète (~3 crédits).
                Aucune action réelle n'est exécutée.
              </span></>
          )}
        </div>
      </Card>

      {/* Mode selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("zero_credit")}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "zero_credit" ? "bg-green-600 text-white" : "bg-muted hover:bg-muted/80"
          }`}
        >
          <Zap className="w-4 h-4 inline mr-1" /> 0 Crédit (dry-run)
        </button>
        <button
          onClick={() => setMode("with_llm")}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === "with_llm" ? "bg-amber-500 text-white" : "bg-muted hover:bg-muted/80"
          }`}
        >
          <Coins className="w-4 h-4 inline mr-1" /> Avec LLM (~3 crédits)
        </button>
      </div>

      {/* Test inputs */}
      <Card className="p-4 space-y-3">
        <div className="space-y-2">
          <Label>Message client (test)</Label>
          <Textarea
            value={messageTest}
            onChange={(e) => setMessageTest(e.target.value)}
            placeholder="Ex: Je veux envoyer un colis de Karpala vers Ouaga 2000"
            className="min-h-[80px]"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Téléphone</Label>
            <input
              type="text"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>Pays</Label>
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              {["BF", "CI", "TG", "BJ", "SN", "ML", "GN", "NE", "GH"].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => handleSimulate()} disabled={running || !messageTest} className="flex-1">
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            {running ? "Simulation..." : `Lancer (${mode === 'zero_credit' ? '0 crédit' : '~3 crédits'})`}
          </Button>
        </div>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Response */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Réponse de VENUS</h3>
              {result.dry_run && <Badge variant="outline" className="text-[10px] text-green-600 border-green-300">DRY-RUN</Badge>}
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap">
              {result.reponse || "(aucune réponse)"}
            </div>
          </Card>

          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <DollarSign className="w-3 h-3" /> Crédits
              </div>
              <p className="text-lg font-bold">{result.credits_estimated}</p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Clock className="w-3 h-3" /> Temps
              </div>
              <p className="text-lg font-bold">{result.temps_ms}ms</p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Brain className="w-3 h-3" /> LLM
              </div>
              <p className="text-lg font-bold">{result.llm_used ? "Oui" : "Non"}</p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Wrench className="w-3 h-3" /> Action
              </div>
              <p className="text-sm font-bold truncate" title={result.action_would_execute || ''}>
                {result.action_would_execute || "—"}
              </p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <CheckCircle className="w-3 h-3" /> Confiance
              </div>
              <p className="text-lg font-bold">{result.confiance}%</p>
            </Card>
          </div>

          {/* Pipeline steps */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3">Pipeline d'exécution</h3>
            <div className="space-y-1.5">
              {result.pipeline_steps?.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {step.matched
                    ? <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                  <span className={step.matched ? "font-medium" : "text-muted-foreground"}>{step.step}</span>
                  <span className="text-muted-foreground ml-auto">{step.details}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Sources */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3">Sources consultées</h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-3 h-3 text-blue-500" />
                  <span className="text-xs font-medium">Règles métier ({result.sources?.regles?.length || 0})</span>
                </div>
                {result.sources?.regles?.length > 0 ? (
                  <div className="space-y-1 ml-5">
                    {result.sources.regles.map(r => (
                      <div key={r.id} className="text-xs text-muted-foreground">
                        • {r.nom} <Badge variant="outline" className="ml-1 text-[10px]">{r.priorite}</Badge>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-muted-foreground ml-5">Aucune règle matchée</p>}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="w-3 h-3 text-green-500" />
                  <span className="text-xs font-medium">Connaissances ({result.sources?.connaissances?.length || 0})</span>
                </div>
                {result.sources?.connaissances?.length > 0 ? (
                  <div className="space-y-1 ml-5">
                    {result.sources.connaissances.map(k => (
                      <div key={k.id} className="text-xs text-muted-foreground">• {k.titre} <Badge variant="outline" className="ml-1 text-[10px]">{k.categorie}</Badge></div>
                    ))}
                  </div>
                ) : <p className="text-xs text-muted-foreground ml-5">Aucune connaissance matchée</p>}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-3 h-3 text-purple-500" />
                  <span className="text-xs font-medium">RAG documents ({result.sources?.rag_documents?.length || 0})</span>
                </div>
                {result.sources?.rag_documents?.length > 0 ? (
                  <div className="space-y-1 ml-5">
                    {result.sources.rag_documents.map(d => (
                      <div key={d.id} className="text-xs text-muted-foreground">• {d.titre} <Badge variant="outline" className="ml-1 text-[10px]">score: {d.score}</Badge></div>
                    ))}
                  </div>
                ) : <p className="text-xs text-muted-foreground ml-5">Aucun document RAG matché</p>}
              </div>

              {result.sources?.incident && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-3 h-3 text-red-500" />
                    <span className="text-xs font-medium text-red-700">Incident: {result.sources.incident.type} ({result.sources.incident.gravite})</span>
                  </div>
                </div>
              )}

              {result.sources?.modification && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-3 h-3 text-blue-500" />
                    <span className="text-xs font-medium text-blue-700">Intention de modification détectée</span>
                  </div>
                </div>
              )}

              {result.sources?.cache_hit && (
                <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3 h-3 text-cyan-500" />
                    <span className="text-xs font-medium text-cyan-700">Réponse servie depuis le cache (0 crédit)</span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Batch testing */}
      <BatchTestPanel personalityKey={personalityKey} countryCode={countryCode} />
    </div>
  );
}