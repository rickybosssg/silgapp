import React, { useState } from "react";
import { Play, Loader2, Brain, FileText, BookOpen, Wrench, DollarSign, Clock, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

export default function PromptSimulatorTab({ personalityKey, activePrompt }) {
  const [contenu, setContenu] = useState(activePrompt?.contenu || "");
  const [messageTest, setMessageTest] = useState("");
  const [telephone, setTelephone] = useState("+22670000000");
  const [countryCode, setCountryCode] = useState("BF");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    setContenu(activePrompt?.contenu || "");
  }, [activePrompt?.id]);

  const handleSimulate = async () => {
    if (!contenu || !messageTest) {
      toast({ title: "Prompt et message de test requis", variant: "destructive" });
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke("gererBrainPrompt", {
        action: "simulate",
        contenu,
        message_test: messageTest,
        telephone,
        country_code: countryCode,
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
      <Card className="p-3 bg-amber-50 border-amber-200">
        <div className="flex items-center gap-2 text-sm text-amber-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>Mode simulation</strong> — aucune course n'est créée, aucune notification envoyée.
            Seul un appel LLM est effectué (~3 crédits).
          </span>
        </div>
      </Card>

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
        <Button onClick={handleSimulate} disabled={running || !messageTest}>
          {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          {running ? "Simulation en cours..." : "Lancer la simulation"}
        </Button>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Response */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Réponse de VENUS</h3>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap">
              {result.reponse || "(aucune réponse)"}
            </div>
          </Card>

          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <DollarSign className="w-3 h-3" /> Crédits estimés
              </div>
              <p className="text-lg font-bold">~{result.credits_estimes}</p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Clock className="w-3 h-3" /> Temps de réponse
              </div>
              <p className="text-lg font-bold">{result.temps_reponse_ms}ms</p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Brain className="w-3 h-3" /> LLM appelé
              </div>
              <p className="text-lg font-bold">{result.llm_called ? "Oui" : "Non"}</p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Wrench className="w-3 h-3" /> Outils exécutés
              </div>
              <p className="text-lg font-bold">{result.tools_executed?.length || 0}</p>
            </Card>
          </div>

          {/* Sources */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3">Sources consultées</h3>
            <div className="space-y-3">
              {/* Règles */}
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
                ) : (
                  <p className="text-xs text-muted-foreground ml-5">Aucune règle matchée</p>
                )}
              </div>

              {/* Connaissances */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="w-3 h-3 text-green-500" />
                  <span className="text-xs font-medium">Connaissances RAG ({result.sources?.connaissances?.length || 0})</span>
                </div>
                {result.sources?.connaissances?.length > 0 ? (
                  <div className="space-y-1 ml-5">
                    {result.sources.connaissances.map(k => (
                      <div key={k.id} className="text-xs text-muted-foreground">
                        • {k.titre} <Badge variant="outline" className="ml-1 text-[10px]">{k.categorie}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground ml-5">Aucune connaissance matchée</p>
                )}
              </div>

              {/* Scénarios */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-3 h-3 text-purple-500" />
                  <span className="text-xs font-medium">Scénarios ({result.sources?.scenarios?.length || 0})</span>
                </div>
                {result.sources?.scenarios?.length > 0 ? (
                  <div className="space-y-1 ml-5">
                    {result.sources.scenarios.map(s => (
                      <div key={s.id} className="text-xs text-muted-foreground">• {s.nom}</div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground ml-5">Aucun scénario matché</p>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}