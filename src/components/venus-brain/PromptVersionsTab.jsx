import React, { useState, useEffect } from "react";
import { RotateCcw, Power, Eye, GitCompare, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

export default function PromptVersionsTab({ personalityKey, onRestored }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [compareA, setCompareA] = useState(null);
  const [compareB, setCompareB] = useState(null);
  const [diffResult, setDiffResult] = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const { toast } = useToast();

  const loadVersions = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("gererBrainPrompt", {
        action: "list",
        personality_key: personalityKey,
      });
      setVersions(res.data?.versions || []);
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVersions();
  }, [personalityKey]);

  const handleRestore = async (promptId, version) => {
    if (!confirm(`Restaurer la version ${version} ? Une copie sera créée et activée.`)) return;
    try {
      await base44.functions.invoke("gererBrainPrompt", {
        action: "restore",
        prompt_id: promptId,
      });
      toast({ title: `Version ${version} restaurée et activée` });
      loadVersions();
      onRestored();
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const handleActivate = async (promptId) => {
    try {
      await base44.functions.invoke("gererBrainPrompt", {
        action: "activate",
        prompt_id: promptId,
      });
      toast({ title: "Version activée" });
      loadVersions();
      onRestored();
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const handleDeactivate = async (promptId) => {
    try {
      await base44.functions.invoke("gererBrainPrompt", {
        action: "deactivate",
        prompt_id: promptId,
      });
      toast({ title: "Version désactivée" });
      loadVersions();
      onRestored();
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const handleCompare = async () => {
    if (!compareA || !compareB || compareA === compareB) {
      toast({ title: "Sélectionnez deux versions différentes", variant: "destructive" });
      return;
    }
    setDiffLoading(true);
    try {
      const res = await base44.functions.invoke("gererBrainPrompt", {
        action: "compare",
        prompt_id_a: compareA,
        prompt_id_b: compareB,
      });
      setDiffResult(res.data);
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setDiffLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compare bar */}
      {versions.length >= 2 && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <GitCompare className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Comparer :</span>
            <select
              value={compareA || ""}
              onChange={(e) => setCompareA(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="">Version A</option>
              {versions.map(v => (
                <option key={v.id} value={v.id}>v{v.version}</option>
              ))}
            </select>
            <span className="text-muted-foreground">↔</span>
            <select
              value={compareB || ""}
              onChange={(e) => setCompareB(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="">Version B</option>
              {versions.map(v => (
                <option key={v.id} value={v.id}>v{v.version}</option>
              ))}
            </select>
            <Button size="sm" onClick={handleCompare} disabled={!diffLoading && (!compareA || !compareB)}>
              {diffLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Comparer"}
            </Button>
          </div>
        </Card>
      )}

      {/* Diff result */}
      {diffResult && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">
              Diff: v{diffResult.version_a.version} ↔ v{diffResult.version_b.version}
            </h3>
            <Badge variant="outline">{diffResult.stats.changed_lines} lignes modifiées</Badge>
          </div>
          <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-xs">
            {diffResult.diff.length === 0 ? (
              <p className="text-green-600 p-2">✓ Identiques — aucune différence</p>
            ) : (
              diffResult.diff.map((d, i) => (
                <div key={i} className="border rounded p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={d.status === "added" ? "default" : d.status === "removed" ? "destructive" : "secondary"}>
                      {d.status}
                    </Badge>
                    <span className="text-muted-foreground">Ligne {d.line}</span>
                  </div>
                  {d.a && <div className="text-red-600 bg-red-50 p-1 rounded">- {d.a}</div>}
                  {d.b && <div className="text-green-600 bg-green-50 p-1 rounded">+ {d.b}</div>}
                </div>
              ))
            )}
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setDiffResult(null)}>
            Fermer
          </Button>
        </Card>
      )}

      {/* Versions list */}
      {versions.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Aucune version enregistrée pour cette personnalité. Utilisez l'onglet Éditeur pour créer la première version.
        </Card>
      ) : (
        <div className="space-y-2">
          {versions.map(v => (
            <Card key={v.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">Version {v.version}</span>
                    {v.statut === "active" && (
                      <Badge className="bg-green-100 text-green-700 border-green-300">Active</Badge>
                    )}
                    {v.statut === "inactive" && <Badge variant="secondary">Inactive</Badge>}
                    {v.statut === "archive" && <Badge variant="outline">Archivée</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {v.auteur} — {v.date_creation ? new Date(v.date_creation).toLocaleString("fr-FR") : "N/A"}
                  </p>
                  {v.notes && <p className="text-sm mt-1 text-muted-foreground">{v.notes}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{v.contenu?.length || 0} caractères</p>
                </div>
                <div className="flex items-center gap-1">
                  {v.statut !== "active" && (
                    <Button size="sm" variant="outline" onClick={() => handleActivate(v.id)}>
                      <Power className="w-3 h-3 mr-1" /> Activer
                    </Button>
                  )}
                  {v.statut === "active" && (
                    <Button size="sm" variant="outline" onClick={() => handleDeactivate(v.id)}>
                      Désactiver
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleRestore(v.id, v.version)}>
                    <RotateCcw className="w-3 h-3 mr-1" /> Restaurer
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}