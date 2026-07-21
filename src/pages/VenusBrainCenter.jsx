import React, { useState, useEffect, useCallback } from "react";
import { Brain, Edit3, History, FlaskConical, Plus, Save, RotateCcw, Play, GitCompare, Power, PowerOff } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import PromptEditorTab from "@/components/venus-brain/PromptEditorTab";
import PromptVersionsTab from "@/components/venus-brain/PromptVersionsTab";
import PromptSimulatorTab from "@/components/venus-brain/PromptSimulatorTab";

const PERSONALITIES = [
  { key: "standard", label: "Standard", description: "Assistante par défaut pour tous les clients" },
  { key: "sav", label: "SAV", description: "Service après-vente — réclamations et problèmes" },
  { key: "commercial", label: "Commercial", description: "Prospection et conversion de nouveaux clients" },
  { key: "vip", label: "VIP", description: "Clients premium — ton plus personnalisé" },
  { key: "administrateur", label: "Administrateur", description: "Assistance interne aux admins SILGAPP" },
];

const TABS = [
  { key: "editor", label: "Éditeur", icon: Edit3 },
  { key: "versions", label: "Versions", icon: History },
  { key: "simulator", label: "Simulateur", icon: FlaskConical },
];

export default function VenusBrainCenter() {
  const [activeTab, setActiveTab] = useState("editor");
  const [selectedPersonality, setSelectedPersonality] = useState("standard");
  const [activePrompt, setActivePrompt] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadActivePrompt = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("gererBrainPrompt", {
        action: "get_active",
        personality_key: selectedPersonality,
      });
      setActivePrompt(res.data?.prompt || null);
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [selectedPersonality, toast]);

  useEffect(() => {
    loadActivePrompt();
  }, [loadActivePrompt]);

  const personalityInfo = PERSONALITIES.find(p => p.key === selectedPersonality) || PERSONALITIES[0];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
            <Brain className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Cerveau de VENUS</h1>
            <p className="text-sm text-muted-foreground">
              Prompt système central — versionné, testable, multi-personnalités
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activePrompt ? (
            <Badge className="bg-green-100 text-green-700 border-green-300">
              <Power className="w-3 h-3 mr-1" /> Version {activePrompt.version} active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              <PowerOff className="w-3 h-3 mr-1" /> Fallback prompt statique
            </Badge>
          )}
        </div>
      </div>

      {/* Sélecteur de personnalité */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-medium">Personnalité :</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERSONALITIES.map(p => (
            <button
              key={p.key}
              onClick={() => setSelectedPersonality(p.key)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedPersonality === p.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
              title={p.description}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">{personalityInfo.description}</p>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "editor" && (
        <PromptEditorTab
          personalityKey={selectedPersonality}
          personalityLabel={personalityInfo.label}
          activePrompt={activePrompt}
          onSaved={loadActivePrompt}
          loading={loading}
        />
      )}
      {activeTab === "versions" && (
        <PromptVersionsTab
          personalityKey={selectedPersonality}
          onRestored={loadActivePrompt}
        />
      )}
      {activeTab === "simulator" && (
        <PromptSimulatorTab
          personalityKey={selectedPersonality}
          activePrompt={activePrompt}
        />
      )}
    </div>
  );
}