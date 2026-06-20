import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Save, Loader2, Plus, Trash2, ChevronUp, ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const TIMEOUT_PRESETS = [
  { value: 30, label: "30s" },
  { value: 60, label: "60s" },
  { value: 90, label: "90s" },
  { value: 120, label: "120s" },
];

const WAVE_LABELS = ["Vague 1", "Vague 2", "Vague 3", "Vague 4", "Vague 5", "Vague 6"];

export default function DispatchWaveConfigPanel() {
  const [enabled, setEnabled] = useState(true);
  const [waves, setWaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const configs = await base44.entities.DispatchWaveConfig.list();
        const cfg = configs[0];
        if (cfg) {
          setEnabled(cfg.gps_waves_enabled !== false);
          try {
            const parsed = JSON.parse(cfg.waves_json || "[]");
            setWaves(parsed.length ? parsed : defaultWaves());
          } catch {
            setWaves(defaultWaves());
          }
        } else {
          setWaves(defaultWaves());
        }
      } catch (err) {
        console.error("Erreur chargement config vagues:", err);
        setWaves(defaultWaves());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function defaultWaves() {
    return [
      { size: 3, timeout_sec: 60 },
      { size: 5, timeout_sec: 60 },
      { size: 999, timeout_sec: 60 },
    ];
  }

  const addWave = () => {
    if (waves.length >= 6) {
      toast.warning("Maximum 6 vagues");
      return;
    }
    setWaves([...waves, { size: 10, timeout_sec: 60 }]);
  };

  const removeWave = (index) => {
    if (waves.length <= 1) {
      toast.warning("Au moins 1 vague requise");
      return;
    }
    setWaves(waves.filter((_, i) => i !== index));
  };

  const moveWave = (index, direction) => {
    const newWaves = [...waves];
    const target = index + direction;
    if (target < 0 || target >= newWaves.length) return;
    [newWaves[index], newWaves[target]] = [newWaves[target], newWaves[index]];
    setWaves(newWaves);
  };

  const updateWave = (index, field, value) => {
    const newWaves = [...waves];
    newWaves[index] = { ...newWaves[index], [field]: value };
    setWaves(newWaves);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const configs = await base44.entities.DispatchWaveConfig.list();
      const wavesJson = JSON.stringify(waves);

      if (configs[0]) {
        await base44.entities.DispatchWaveConfig.update(configs[0].id, {
          gps_waves_enabled: enabled,
          waves_json: wavesJson,
        });
      } else {
        await base44.entities.DispatchWaveConfig.create({
          gps_waves_enabled: enabled,
          waves_json: wavesJson,
        });
      }
      toast.success("Configuration vagues GPS sauvegardée ");
    } catch (err) {
      toast.error("Erreur: " + err.message);
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

  const totalLivreursNotifies = waves.reduce((sum, w, i) => {
    if (w.size >= 999 && i === waves.length - 1) return sum; // last wave "tous" not countable
    return sum + (w.size >= 999 ? 0 : w.size);
  }, 0);

  const totalTemps = waves.reduce((sum, w) => sum + w.timeout_sec, 0);

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-200 rounded-xl">
        <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700">
          Ces paramètres s'appliquent aux courses <strong>avec GPS connu</strong> (expédition, réception, déplacement, admin).
          Les courses sans GPS conservent le dispatch par heartbeat. Modifications appliquées immédiatement.
        </p>
      </div>

      {/* Enable/Disable */}
      <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200">
        <div>
          <p className="font-bold text-sm">Dispatch GPS par vagues</p>
          <p className="text-xs text-muted-foreground">
            {enabled ? "Les livreurs sont notifiés par proximité, vague par vague" : "Tous les livreurs sont notifiés simultanément (mode actuel)"}
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {/* Waves */}
      <div>
        <p className="font-bold text-sm mb-3">Configuration des vagues</p>
        <div className="space-y-3">
          {waves.map((wave, idx) => {
            const isLast = idx === waves.length - 1;
            return (
              <div
                key={idx}
                className="bg-white rounded-xl border border-gray-200 p-4 space-y-3"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveWave(idx, -1)}
                        disabled={idx === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveWave(idx, 1)}
                        disabled={isLast}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="font-bold text-sm text-gray-900">
                      {WAVE_LABELS[idx] || `Vague ${idx + 1}`}
                    </span>
                    {isLast && wave.size >= 999 && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                        Tous les restants
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => removeWave(idx)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    disabled={waves.length <= 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3">
                  {/* Size */}
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                      Livreurs à notifier
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={wave.size >= 999 ? "" : wave.size}
                        placeholder="999 = tous"
                        onChange={(e) => {
                          const val = e.target.value === "" ? 999 : Math.max(1, parseInt(e.target.value, 10) || 1);
                          updateWave(idx, "size", val);
                        }}
                        className="w-20 px-3 py-2 rounded-lg border border-gray-200 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <button
                        onClick={() => updateWave(idx, "size", 999)}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                          wave.size >= 999
                            ? "bg-amber-100 text-amber-700 border border-amber-300"
                            : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                        }`}
                      >
                        Tous
                      </button>
                    </div>
                  </div>

                  {/* Timeout */}
                  <div className="flex-shrink-0">
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                      Temps réponse
                    </label>
                    <div className="flex gap-1">
                      {TIMEOUT_PRESETS.map(preset => (
                        <button
                          key={preset.value}
                          onClick={() => updateWave(idx, "timeout_sec", preset.value)}
                          className={`px-2.5 py-2 rounded-lg text-xs font-bold transition-all ${
                            wave.timeout_sec === preset.value
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add wave */}
        <button
          onClick={addWave}
          disabled={waves.length >= 6}
          className="mt-3 w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm font-bold">Ajouter une vague</span>
        </button>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Résumé de la configuration</p>
        <div className="space-y-1.5">
          {waves.map((wave, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm">
              <span className="text-gray-500">
                {WAVE_LABELS[idx] || `Vague ${idx + 1}`}
              </span>
              <span className="font-bold text-gray-800">
                {wave.size >= 999 ? "Tous les restants" : `${wave.size} livreur${wave.size > 1 ? "s" : ""}`}
                {" · "}{wave.timeout_sec}s
              </span>
            </div>
          ))}
          <div className="pt-2 mt-2 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
            <span>Temps total max avant cycle épuisé</span>
            <span className="font-bold text-gray-500">{totalTemps}s ({Math.round(totalTemps / 60)} min)</span>
          </div>
        </div>
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
