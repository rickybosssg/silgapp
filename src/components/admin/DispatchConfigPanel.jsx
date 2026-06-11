import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Zap, Save, Loader2, Users, Clock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

const NB_OPTIONS = [
  { value: "1", label: "1 livreur", desc: "Attribution séquentielle classique" },
  { value: "3", label: "3 livreurs", desc: "Recommandé — bon équilibre vitesse/équité" },
  { value: "5", label: "5 livreurs", desc: "Plus rapide, moins équitable" },
  { value: "10", label: "10 livreurs", desc: "Très rapide, zone dense" },
  { value: "tous", label: "Tous les livreurs", desc: "Maximum de vitesse" },
];

const TIMEOUT_OPTIONS = [
  { value: "30", label: "30 secondes", desc: "Très rapide" },
  { value: "60", label: "60 secondes", desc: "Recommandé" },
  { value: "90", label: "90 secondes", desc: "Plus de temps de réponse" },
];

export default function DispatchConfigPanel() {
  const [nbLivreurs, setNbLivreurs] = useState("3");
  const [timeoutSec, setTimeoutSec] = useState("60");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await base44.functions.invoke("dispatchExterneAuto", { action: "get_config" });
        const config = res?.data?.config;
        if (config) {
          setNbLivreurs(config.nb >= 999 ? "tous" : String(config.nb));
          setTimeoutSec(String(config.timeout));
        }
      } catch (err) {
        console.error("Erreur chargement config dispatch:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke("dispatchExterneAuto", {
        action: "set_config",
        nb_livreurs: nbLivreurs,
        timeout_sec: parseInt(timeoutSec, 10),
      });
      toast.success("Configuration dispatch sauvegardée ✓");
    } catch (err) {
      toast.error("Erreur sauvegarde: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-200 rounded-xl">
        <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700">
          Les modifications sont appliquées <strong>immédiatement</strong> sans mise à jour APK.
          Le dispatch recalcule les meilleurs candidats disponibles à chaque nouvelle vague.
        </p>
      </div>

      {/* Nb livreurs */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-primary" />
          <p className="font-bold text-sm">Livreurs notifiés par vague</p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {NB_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setNbLivreurs(opt.value)}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                nbLivreurs === opt.value
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                nbLivreurs === opt.value ? "border-primary" : "border-gray-300"
              }`}>
                {nbLivreurs === opt.value && (
                  <div className="w-2 h-2 rounded-full bg-primary" />
                )}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-bold ${nbLivreurs === opt.value ? "text-primary" : "text-foreground"}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </div>
              {opt.value === "3" && (
                <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                  Défaut
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Timeout */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-primary" />
          <p className="font-bold text-sm">Temps de réponse par vague</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {TIMEOUT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setTimeoutSec(opt.value)}
              className={`flex flex-col items-center p-3 rounded-xl border transition-all ${
                timeoutSec === opt.value
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <p className={`text-lg font-black ${timeoutSec === opt.value ? "text-primary" : "text-foreground"}`}>
                {opt.value}s
              </p>
              <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
              {opt.value === "60" && (
                <span className="text-[9px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full mt-1">
                  Défaut
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Résumé */}
      <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
        <p className="text-xs text-gray-600 leading-relaxed">
          <strong>Configuration actuelle :</strong>{" "}
          {NB_OPTIONS.find(o => o.value === nbLivreurs)?.label} seront notifiés simultanément,
          avec <strong>{timeoutSec} secondes</strong> pour répondre.
          Après expiration, les meilleurs candidats disponibles sont recalculés.
        </p>
      </div>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-11 rounded-xl gap-2 font-bold"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Sauvegarde..." : "Sauvegarder la configuration"}
      </Button>
    </div>
  );
}