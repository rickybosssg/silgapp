import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Save, Loader2, Users, Clock, Info, Flame, ChevronRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import DispatchWaveConfigPanel from "@/components/admin/DispatchWaveConfigPanel";
import { useAdminContext } from "@/hooks/useAdminContext";

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
  const { selectedCountry } = useAdminContext();
  const [nbLivreurs, setNbLivreurs] = useState("3");
  const [timeoutSec, setTimeoutSec] = useState("60");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [v2Enabled, setV2Enabled] = useState(true);
  const [v2Saving, setV2Saving] = useState(false);
  const [ecoSettings, setEcoSettings] = useState({
    enabled: false,
    groupingEnabled: false,
    onRouteEnabled: false,
    emergencyStop: false,
    convertDelayMin: 45,
    maxCoursesPerMission: 2,
    proposalExpirationSec: 300,
    maxDetourKm: 6,
    minDriverGain: 0,
  });
  const [ecoSaving, setEcoSaving] = useState(false);

  const activeCountry = String(selectedCountry || "BF").toUpperCase();
  const ecoKey = (name) => `ECO:${activeCountry}:${name}`;

  useEffect(() => {
    const load = async () => {
      try {
        const res = await base44.functions.invoke("dispatchExterneAuto", { action: "get_config" });
        const config = res?.data?.config;
        if (config) {
          setNbLivreurs(config.nb >= 999 ? "tous" : String(config.nb));
          setTimeoutSec(String(config.timeout));
        }
        const v2Configs = await base44.entities.AppConfig.filter({ cle: "DISPATCH_V2_ENABLED" });
        setV2Enabled(v2Configs?.[0] ? v2Configs[0].valeur !== "false" : true);
      } catch (err) {
        console.error("Erreur chargement config dispatch:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadEco = async () => {
      const keys = [
        "ENABLED",
        "GROUPING_ENABLED",
        "ON_ROUTE_ENABLED",
        "EMERGENCY_STOP",
        "CONVERT_DELAY_MIN",
        "MAX_COURSES_PER_MISSION",
        "PROPOSAL_EXPIRATION_SEC",
        "MAX_DETOUR_KM",
        "MIN_DRIVER_GAIN",
      ].map(ecoKey);
      try {
        const rows = await base44.entities.AppConfig.filter({ cle: { $in: keys } }, undefined, 20);
        if (cancelled) return;
        const map = new Map((rows || []).map((row) => [row.cle, row.valeur]));
        setEcoSettings({
          enabled: String(map.get(ecoKey("ENABLED")) || "false") === "true",
          groupingEnabled: String(map.get(ecoKey("GROUPING_ENABLED")) || "false") === "true",
          onRouteEnabled: String(map.get(ecoKey("ON_ROUTE_ENABLED")) || "false") === "true",
          emergencyStop: String(map.get(ecoKey("EMERGENCY_STOP")) || "false") === "true",
          convertDelayMin: Number(map.get(ecoKey("CONVERT_DELAY_MIN"))) || 45,
          maxCoursesPerMission: Number(map.get(ecoKey("MAX_COURSES_PER_MISSION"))) || 2,
          proposalExpirationSec: Number(map.get(ecoKey("PROPOSAL_EXPIRATION_SEC"))) || 300,
          maxDetourKm: Number(map.get(ecoKey("MAX_DETOUR_KM"))) || 6,
          minDriverGain: Number(map.get(ecoKey("MIN_DRIVER_GAIN"))) || 0,
        });
      } catch (error) {
        console.error("Erreur chargement config Eco:", error);
      }
    };
    loadEco();
    return () => { cancelled = true; };
  }, [activeCountry]);

  const saveEcoConfig = async () => {
    setEcoSaving(true);
    try {
      const values = {
        ENABLED: ecoSettings.enabled ? "true" : "false",
        GROUPING_ENABLED: ecoSettings.groupingEnabled ? "true" : "false",
        ON_ROUTE_ENABLED: ecoSettings.onRouteEnabled ? "true" : "false",
        EMERGENCY_STOP: ecoSettings.emergencyStop ? "true" : "false",
        CONVERT_DELAY_MIN: String(Math.max(1, Number(ecoSettings.convertDelayMin) || 45)),
        MAX_COURSES_PER_MISSION: String(Math.max(2, Number(ecoSettings.maxCoursesPerMission) || 2)),
        PROPOSAL_EXPIRATION_SEC: String(Math.max(60, Number(ecoSettings.proposalExpirationSec) || 300)),
        MAX_DETOUR_KM: String(Math.max(0, Number(ecoSettings.maxDetourKm) || 6)),
        MIN_DRIVER_GAIN: String(Math.max(0, Number(ecoSettings.minDriverGain) || 0)),
      };
      for (const [name, value] of Object.entries(values)) {
        const cle = ecoKey(name);
        const existing = await base44.entities.AppConfig.filter({ cle }, undefined, 1);
        if (existing?.[0]?.id) {
          await base44.entities.AppConfig.update(existing[0].id, { valeur: value });
        } else {
          await base44.entities.AppConfig.create({
            cle,
            valeur: value,
            description: `SILGAPP Eco V1 ${name} (${activeCountry})`,
          });
        }
      }
      toast.success(`Configuration SILGAPP Eco sauvegardée pour ${activeCountry}`);
    } catch (error) {
      toast.error("Erreur sauvegarde Eco: " + (error?.message || "inconnue"));
    } finally {
      setEcoSaving(false);
    }
  };

  const handleToggleV2 = async (enabled) => {
    setV2Saving(true);
    try {
      const existing = await base44.entities.AppConfig.filter({ cle: "DISPATCH_V2_ENABLED" });
      if (existing?.[0]?.id) {
        await base44.entities.AppConfig.update(existing[0].id, { valeur: enabled ? "true" : "false" });
      } else {
        await base44.entities.AppConfig.create({
          cle: "DISPATCH_V2_ENABLED",
          valeur: enabled ? "true" : "false",
          description: "Feature flag for V2 dispatch (Fil de courses disponibles)",
        });
      }
      setV2Enabled(enabled);
      toast.success(enabled ? "Dispatch V2 activé — Fil de courses" : "Dispatch V1 activé — Vagues par proximité");
    } catch (err) {
      toast.error("Erreur bascule dispatch: " + (err?.message || "inconnue"));
    } finally {
      setV2Saving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke("dispatchExterneAuto", {
        action: "set_config",
        nb_livreurs: nbLivreurs,
        timeout_sec: parseInt(timeoutSec, 10),
      });
      toast.success("Configuration dispatch sauvegardée ");
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

      {/* ── Bascule V1 / V2 ── */}
      <div className="rounded-2xl border-2 overflow-hidden shadow-lg">
        <div className={`px-4 py-3 flex items-center justify-between ${
          v2Enabled
            ? "bg-gradient-to-r from-emerald-500 to-teal-500"
            : "bg-gradient-to-r from-indigo-500 to-blue-500"
        }`}>
          <div className="flex items-center gap-2.5">
            <Flame className="w-5 h-5 text-white" />
            <div>
              <p className="text-sm font-black text-white">
                Mode Dispatch : {v2Enabled ? "V2 — Fil de courses" : "V1 — Vagues par proximité"}
              </p>
              <p className="text-[11px] text-white/80">
                {v2Enabled
                  ? "Toutes les courses sont publiées dans un fil visible par tous les livreurs"
                  : "Les courses sont notifiées par vagues successives aux livreurs les plus proches"}
              </p>
            </div>
          </div>
          {v2Saving && <Loader2 className="w-4 h-4 text-white animate-spin" />}
        </div>
        <div className="p-4 bg-white space-y-2">
          <button
            onClick={() => handleToggleV2(true)}
            disabled={v2Saving || v2Enabled}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
              v2Enabled
                ? "border-emerald-400 bg-emerald-50 shadow-sm"
                : "border-gray-200 bg-white hover:border-emerald-300"
            }`}
          >
            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
              v2Enabled ? "border-emerald-500" : "border-gray-300"
            }`}>
              {v2Enabled && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
            </div>
            <div className="flex-1">
              <p className={`text-sm font-bold ${v2Enabled ? "text-emerald-700" : "text-foreground"}`}>
                V2 — Fil de courses disponibles
              </p>
              <p className="text-xs text-muted-foreground">
                Toutes les courses (standard + admin) apparaissent dans un fil commun. Les livreurs acceptent en temps réel.
              </p>
            </div>
            {v2Enabled && (
              <span className="text-[10px] font-bold text-white bg-emerald-500 px-2 py-0.5 rounded-full">
                ACTIF
              </span>
            )}
          </button>
          <button
            onClick={() => handleToggleV2(false)}
            disabled={v2Saving || !v2Enabled}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
              !v2Enabled
                ? "border-indigo-400 bg-indigo-50 shadow-sm"
                : "border-gray-200 bg-white hover:border-indigo-300"
            }`}
          >
            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
              !v2Enabled ? "border-indigo-500" : "border-gray-300"
            }`}>
              {!v2Enabled && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
            </div>
            <div className="flex-1">
              <p className={`text-sm font-bold ${!v2Enabled ? "text-indigo-700" : "text-foreground"}`}>
                V1 — Vagues par proximité
              </p>
              <p className="text-xs text-muted-foreground">
                Les courses sont notifiées par vagues successives aux livreurs les plus proches (GPS, priorité).
              </p>
            </div>
            {!v2Enabled && (
              <span className="text-[10px] font-bold text-white bg-indigo-500 px-2 py-0.5 rounded-full">
                ACTIF
              </span>
            )}
          </button>
        </div>
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

      <div className="border-t border-gray-200 pt-5 mt-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-black text-sm text-emerald-700">SILGAPP Eco V1</p>
            <p className="text-[11px] text-muted-foreground">
              Pays {activeCountry}. Interrupteurs OFF par défaut, sans impact sur les courses Standard.
            </p>
          </div>
          {ecoSaving && <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />}
        </div>

        {[
          ["enabled", "Activer SILGAPP Eco", "Permet aux formulaires de proposer Standard/Eco."],
          ["groupingEnabled", "Regroupement automatique", "Retient les courses Eco isolées pour chercher une mission de 2 courses."],
          ["onRouteEnabled", "Optimisation sur trajet", "Autorise les propositions sur itinéraire et proches de la destination."],
          ["emergencyStop", "Arrêt d'urgence", "Désactive immédiatement le moteur Eco et invalide les nouvelles propositions."],
        ].map(([field, label, desc]) => (
          <button
            key={field}
            type="button"
            onClick={() => setEcoSettings((prev) => ({ ...prev, [field]: !prev[field] }))}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
              ecoSettings[field] ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white"
            }`}
          >
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
              ecoSettings[field] ? "border-emerald-500" : "border-gray-300"
            }`}>
              {ecoSettings[field] && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          </button>
        ))}

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs font-bold text-gray-600">Conversion Eco → Standard</span>
            <input
              type="number"
              min="1"
              value={ecoSettings.convertDelayMin}
              onChange={(e) => setEcoSettings((prev) => ({ ...prev, convertDelayMin: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-bold"
            />
            <span className="block text-[10px] text-gray-500">minutes, défaut 45</span>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-gray-600">Max courses/mission</span>
            <input
              type="number"
              min="2"
              value={ecoSettings.maxCoursesPerMission}
              onChange={(e) => setEcoSettings((prev) => ({ ...prev, maxCoursesPerMission: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-bold"
            />
            <span className="block text-[10px] text-gray-500">V1: 2 par défaut</span>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-gray-600">Expiration proposition</span>
            <input
              type="number"
              min="15"
              value={ecoSettings.proposalExpirationSec}
              onChange={(e) => setEcoSettings((prev) => ({ ...prev, proposalExpirationSec: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-bold"
            />
            <span className="block text-[10px] text-gray-500">secondes, défaut 300 (5 min)</span>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold text-gray-600">Détour max</span>
            <input
              type="number"
              min="0"
              value={ecoSettings.maxDetourKm}
              onChange={(e) => setEcoSettings((prev) => ({ ...prev, maxDetourKm: e.target.value }))}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-bold"
            />
            <span className="block text-[10px] text-gray-500">km, préfiltrage avant ORS</span>
          </label>
        </div>

        <Button
          onClick={saveEcoConfig}
          disabled={ecoSaving}
          variant="outline"
          className="w-full h-11 rounded-xl gap-2 font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50"
        >
          {ecoSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Sauvegarder SILGAPP Eco
        </Button>
      </div>

      {/* Séparateur vagues GPS */}
      <div className="border-t border-gray-200 pt-5 mt-5">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-4 h-4 text-indigo-600" />
          <p className="font-black text-sm text-indigo-700">DISPATCH GPS — VAGUES PAR PROXIMITÉ</p>
        </div>
        <DispatchWaveConfigPanel />
      </div>

      <Link to="/admin/zones-chaudes" className="block mt-5">
        <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 transition-colors group">
          <div className="flex items-center gap-2.5">
            <Flame className="w-4 h-4 text-orange-500" />
            <div>
              <p className="text-sm font-bold text-orange-700">Zones Chaudes</p>
              <p className="text-[10px] text-orange-500">Configurer la détection et les notifications push</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-orange-400 group-hover:text-orange-600" />
        </div>
      </Link>
    </div>
  );
}
