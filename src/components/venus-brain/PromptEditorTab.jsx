import React, { useState } from "react";
import { Save, RotateCcw, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

export default function PromptEditorTab({ personalityKey, personalityLabel, activePrompt, onSaved, loading }) {
  const [contenu, setContenu] = useState(activePrompt?.contenu || "");
  const [notes, setNotes] = useState("");
  const [activate, setActivate] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Sync content when activePrompt changes
  React.useEffect(() => {
    setContenu(activePrompt?.contenu || "");
    setNotes("");
  }, [activePrompt?.id]);

  const handleSave = async () => {
    if (!contenu || contenu.trim().length < 10) {
      toast({ title: "Contenu trop court", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await base44.functions.invoke("gererBrainPrompt", {
        action: "save",
        personality_key: personalityKey,
        personality_label: personalityLabel,
        contenu,
        notes,
        activate,
      });
      toast({
        title: activate ? "Nouvelle version enregistrée et activée" : "Version enregistrée (inactive)",
        description: `Personnalité: ${personalityLabel}`,
      });
      onSaved();
      setNotes("");
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setContenu(activePrompt?.contenu || "");
    setNotes("");
  };

  const isModified = contenu !== (activePrompt?.contenu || "");
  const charCount = contenu.length;

  return (
    <div className="space-y-4">
      {/* Info banner */}
      {activePrompt && (
        <Card className="p-3 bg-blue-50 border-blue-200">
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              Version active: <strong>v{activePrompt.version}</strong> — par {activePrompt.auteur} — {" "}
              {activePrompt.date_creation ? new Date(activePrompt.date_creation).toLocaleString("fr-FR") : "N/A"}
            </span>
          </div>
        </Card>
      )}

      {/* Editor */}
      <Card className="p-4 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Prompt système ({personalityLabel})</Label>
            <span className="text-xs text-muted-foreground">{charCount} caractères</span>
          </div>
          <Textarea
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            placeholder="Saisissez le prompt système de VENUS pour cette personnalité..."
            className="min-h-[400px] font-mono text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label>Notes de version (optionnel)</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: Ajout des règles de gestion des colis fragiles..."
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="activate"
            checked={activate}
            onChange={(e) => setActivate(e.target.checked)}
            className="w-4 h-4"
          />
          <Label htmlFor="activate" className="text-sm cursor-pointer">
            Activer immédiatement cette version
          </Label>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving || !isModified}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Enregistrement..." : "Enregistrer la version"}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={!isModified || saving}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Annuler les modifications
          </Button>
          {isModified && (
            <span className="text-xs text-amber-600 font-medium">● Modifications non enregistrées</span>
          )}
        </div>
      </Card>
    </div>
  );
}