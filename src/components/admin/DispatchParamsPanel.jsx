import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Save, Zap, Users, Clock, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const NB_OPTIONS = [
  { value: 1, label: "1 livreur", desc: "Mode classique — 1 à la fois" },
  { value: 3, label: "3 livreurs", desc: "Recommandé — équilibre vitesse/équité" },
  { value: 5, label: "5 livreurs", desc: "Rapide — plus de chances" },
  { value: 10, label: "10 livreurs", desc: "Très rapide — grandes villes" },
  { value: 0, label: "Tous", desc: "Envoyer à tous les livreurs éligibles" },
];

const TIMEOUT_OPTIONS = [
  { value: 30, label: "30 secondes", desc: "Très rapide" },
  { value: 60, label: "60 secondes", desc: "Recommandé" },
  { value: 90, label: "90 secondes", desc: "Plus de temps pour répondre" },
];

export default function DispatchParamsPanel() {
  const [config, setConfig] = useState({ nb_livreurs_par_vague: 3, timeout_secondes: 60 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    base44.functions.invoke("dispatchExterneAuto", { action: "get_config" })
      .then(res => {
        if (res?.data?.config) setConfig(res.data.config);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await base44.functions.invoke("dispatchExterneAuto", { action: "set_config", config });
      toast.success("Configuration sauvegardée ");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error("Erreur : " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Titre */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-red-600 flex items-center justify-center shadow-md shadow-red-100">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="font-bold text-sm text-foreground">Paramètres Dispatch Externe</p>
          <p className="text-xs text-muted-foreground">Configuration du moteur multi-livreurs</p>
        </div>
      </div>

      {/* Nombre de livreurs par vague */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-primary" />
          <p className="font-semibold text-sm">Livreurs notifiés simultanément</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {NB_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setConfig(c => ({ ...c, nb_livreurs_par_vague: opt.value }))}
              className={`p-3 rounded-2xl border-2 text-left transition-all ${
                config.nb_livreurs_par_vague === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className={`font-bold text-sm ${config.nb_livreurs_par_vague === opt.value ? "text-primary" : "text-gray-800"}`}>
                  {opt.label}
                </p>
                {config.nb_livreurs_par_vague === opt.value && (
                  <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Timeout */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-primary" />
          <p className="font-semibold text-sm">Délai de réponse par vague</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {TIMEOUT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setConfig(c => ({ ...c, timeout_secondes: opt.value }))}
              className={`p-3 rounded-2xl border-2 text-left transition-all ${
                config.timeout_secondes === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className={`font-bold text-sm ${config.timeout_secondes === opt.value ? "text-primary" : "text-gray-800"}`}>
                  {opt.label}
                </p>
                {config.timeout_secondes === opt.value && (
                  <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Résumé + Bouton */}
      <div className="flex items-center justify-between bg-gray-50 rounded-2xl p-4 gap-4">
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Configuration active : </span>
          {config.nb_livreurs_par_vague === 0 ? "Tous les livreurs" : `${config.nb_livreurs_par_vague} livreur(s)`}
          {" "} — {config.timeout_secondes}s par vague
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          size="sm"
          className={`rounded-xl gap-2 flex-shrink-0 ${saved ? "bg-green-500 hover:bg-green-600" : ""}`}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Sauvegarde..." : saved ? "Sauvegardé " : "Sauvegarder"}
        </Button>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-800 space-y-1">
        <p className="font-bold text-blue-900"> Fonctionnement :</p>
        <p>• La course est envoyée <strong>simultanément</strong> à {config.nb_livreurs_par_vague === 0 ? "tous les" : config.nb_livreurs_par_vague} livreur(s) éligibles.</p>
        <p>• Le <strong>premier</strong> à accepter obtient la course (verrou atomique).</p>
        <p>• Si aucun ne répond en {config.timeout_secondes}s → nouvelle sélection automatique.</p>
        <p>• Les livreurs ayant déjà vu la course restent éligibles aux vagues suivantes.</p>
      </div>
    </div>
  );
}