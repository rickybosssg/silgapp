import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Volume2, VolumeX, Mic, Save, Loader2, Sparkles, Brain } from "lucide-react";

const VOICES = [
  { value: "honey", label: "Honey — Jeune femme, douce et chaleureuse (recommandée pour Venus)" },
  { value: "sunny", label: "Sunny — Jeune femme, vive et entraînante" },
  { value: "spark", label: "Spark — Jeune femme, énergique et rapide" },
  { value: "river", label: "River — Femme, calme et neutre" },
  { value: "storm", label: "Storm — Femme, formelle et autoritaire" },
];

const LANGUAGES = [
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais" },
];

export default function VenusAudioSettings() {
  const qc = useQueryClient();
  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["venus-audio-config"],
    queryFn: () => base44.entities.SystemConfig.filter({}),
  });

  const getVal = (cle, fallback) => {
    const c = configs.find(x => x.cle === cle);
    return c?.valeur ?? fallback;
  };

  const [openaiEnabled, setOpenaiEnabled] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [voice, setVoice] = useState("honey");
  const [language, setLanguage] = useState("fr");
  const [onlyOnVoiceInput, setOnlyOnVoiceInput] = useState(true);
  const [maxChars, setMaxChars] = useState(500);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded && configs.length >= 0 && !isLoading) {
      setOpenaiEnabled(getVal("VENUS_OPENAI_ENABLED", "false") === "true");
      setEnabled(getVal("VENUS_AUDIO_RESPONSE_ENABLED", "false") === "true");
      setVoice(getVal("VENUS_AUDIO_RESPONSE_VOICE", "honey"));
      setLanguage(getVal("VENUS_AUDIO_RESPONSE_LANGUAGE", "fr"));
      setOnlyOnVoiceInput(getVal("VENUS_AUDIO_ONLY_ON_VOICE_INPUT", "true") === "true");
      setMaxChars(parseInt(getVal("VENUS_AUDIO_MAX_DURATION_CHARS", "500"), 10) || 500);
      setLoaded(true);
    }
  }, [configs, isLoading, loaded]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const upsert = async (cle, valeur, description) => {
        const existing = configs.find(c => c.cle === cle);
        if (existing) {
          await base44.entities.SystemConfig.update(existing.id, { valeur: String(valeur) });
        } else {
          await base44.entities.SystemConfig.create({ cle, valeur: String(valeur), description });
        }
      };
      await upsert("VENUS_OPENAI_ENABLED", openaiEnabled, "Active le moteur OpenAI pour VENUS (function calling + RAG). Fallback automatique vers InvokeLLM si desactive.");
      await Promise.all([
        upsert("VENUS_AUDIO_RESPONSE_ENABLED", enabled, "Activer les reponses audio de Venus"),
        upsert("VENUS_AUDIO_RESPONSE_VOICE", voice, "Voix TTS de Venus"),
        upsert("VENUS_AUDIO_RESPONSE_LANGUAGE", language, "Langue des reponses audio"),
        upsert("VENUS_AUDIO_ONLY_ON_VOICE_INPUT", onlyOnVoiceInput, "Repondre en audio seulement si le client a envoye un vocal"),
        upsert("VENUS_AUDIO_MAX_DURATION_CHARS", maxChars, "Limite de caracteres pour generer un audio"),
      ]);
      qc.invalidateQueries({ queryKey: ["venus-audio-config"] });
    } catch (e) {
      console.error("Erreur sauvegarde config audio:", e);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <Mic className="w-4 h-4 text-purple-600" />
        <h3 className="text-sm font-bold">Configuration des notes vocales</h3>
        <Badge className={enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"} variant="outline">
          {enabled ? <Volume2 className="w-3 h-3 mr-1" /> : <VolumeX className="w-3 h-3 mr-1" />}
          {enabled ? "Audio activé" : "Texte uniquement"}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Venus transcrit automatiquement les notes vocales reçues sur WhatsApp. Configurez ici si elle peut également répondre en audio.
      </p>

      {/* ── Interrupteur OpenAI ── */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              Moteur OpenAI
              <Badge className={openaiEnabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"} variant="outline">
                <Sparkles className="w-3 h-3 mr-1" />
                {openaiEnabled ? "Activé" : "Désactivé"}
              </Badge>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Connecte VENUS à l'API OpenAI (gpt-4.1-mini) pour une compréhension quasi humaine + function calling.
              Le RAG SILGAPP reste la source de connaissances. Fallback automatique vers InvokeLLM si désactivé.
            </p>
          </div>
        </div>
        <Switch checked={openaiEnabled} onCheckedChange={setOpenaiEnabled} />
      </div>

      {/* Toggle principal audio */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-100">
        <div>
          <p className="text-sm font-semibold text-foreground">Réponses audio de Venus</p>
          <p className="text-[11px] text-muted-foreground">Permet à Venus de répondre par note vocale</p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {/* Options */}
      <div className={`space-y-3 transition-opacity ${enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
        <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
          <div>
            <p className="text-sm font-semibold text-foreground">Audio seulement si le client envoie un vocal</p>
            <p className="text-[11px] text-muted-foreground">Sinon, Venus répond toujours en texte (recommandé, moins coûteux)</p>
          </div>
          <Switch checked={onlyOnVoiceInput} onCheckedChange={setOnlyOnVoiceInput} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Voix</label>
            <select
              value={voice}
              onChange={e => setVoice(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            >
              {VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Langue</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            >
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">
            Limite de caractères pour l'audio : <span className="text-purple-600 font-bold">{maxChars}</span>
          </label>
          <input
            type="range"
            min="100"
            max="1000"
            step="50"
            value={maxChars}
            onChange={e => setMaxChars(parseInt(e.target.value, 10))}
            className="w-full accent-purple-600"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Les réponses plus longues, avec liens, QR codes ou tarifs restent en texte automatiquement.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}