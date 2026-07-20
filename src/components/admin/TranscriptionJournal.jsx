import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Check, Edit3, Volume2, AlertCircle } from "lucide-react";

const STATUS_CONFIG = {
  transcrit: { label: "Transcrit", className: "bg-green-100 text-green-700 border-green-200" },
  faible_confiance: { label: "Faible confiance", className: "bg-amber-100 text-amber-700 border-amber-200" },
  echec: { label: "Échec", className: "bg-red-100 text-red-700 border-red-200" },
  non_transcrit: { label: "Non transcrit", className: "" },
};

const METHODE_CONFIG = {
  whisper: { label: "Whisper", className: "bg-blue-100 text-blue-700" },
  llm_fallback: { label: "LLM Fallback", className: "bg-purple-100 text-purple-700" },
  hybride: { label: "Hybride", className: "bg-indigo-100 text-indigo-700" },
  aucune: { label: "Aucune", className: "bg-gray-100 text-gray-500" },
};

function parseRaisons(raisonsStr) {
  if (!raisonsStr) return [];
  try {
    const parsed = JSON.parse(raisonsStr);
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch {
    return [raisonsStr];
  }
}

export default function TranscriptionJournal() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [correctionText, setCorrectionText] = useState("");
  const [savingId, setSavingId] = useState(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["venus-audio-transcriptions"],
    queryFn: () => base44.entities.Message.filter(
      { message_type: "audio", source: "whatsapp" },
      "-created_date", 30
    ),
    refetchInterval: 30000,
  });

  const handleSaveCorrection = async (msgId) => {
    setSavingId(msgId);
    try {
      await base44.entities.Message.update(msgId, {
        transcription_correction: correctionText,
        transcription_corrigee_par: "admin",
        transcription_corrigee_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["venus-audio-transcriptions"] });
      setEditingId(null);
      setCorrectionText("");
    } catch (e) {
      console.error("Erreur sauvegarde correction:", e);
    } finally {
      setSavingId(null);
    }
  };

  const startEdit = (msg) => {
    setEditingId(msg.id);
    setCorrectionText(msg.transcription_correction || msg.transcription || "");
  };

  const stats = {
    total: messages.length,
    transcrit: messages.filter(m => m.transcription_status === "transcrit").length,
    faible: messages.filter(m => m.transcription_status === "faible_confiance").length,
    echec: messages.filter(m => m.transcription_status === "echec").length,
    corriges: messages.filter(m => !!m.transcription_correction).length,
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-purple-600" />
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Journal de transcription</p>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          {stats.total > 0 && (
            <>
              <span className="text-green-600 font-semibold">{stats.transcrit} OK</span>
              <span className="text-amber-600 font-semibold">{stats.faible} faible</span>
              <span className="text-red-600 font-semibold">{stats.echec} échec</span>
              {stats.corriges > 0 && <span className="text-blue-600 font-semibold">{stats.corriges} corrigés</span>}
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-muted-foreground text-xs">Chargement...</div>
      ) : messages.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Mic className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p className="text-xs">Aucune note vocale reçue</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
          {messages.map((msg, idx) => {
            const config = STATUS_CONFIG[msg.transcription_status] || STATUS_CONFIG.non_transcrit;
            const confidence = msg.transcription_confidence || 0;
            const confidencePct = Math.round(confidence * 100);
            const isEditing = editingId === msg.id;
            const hasCorrection = !!msg.transcription_correction;

            return (
              <div key={msg.id || idx} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-foreground truncate">{msg.sender_name || "—"}</span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {new Date(msg.created_date).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <Badge variant="outline" className={`text-[9px] flex-shrink-0 ${config.className}`}>
                    {config.label}
                  </Badge>
                </div>

                {msg.audio_url && (
                  <audio controls src={msg.audio_url} className="w-full h-8" preload="none" />
                )}

                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">Transcription auto</p>
                    {msg.transcription_methode && (
                      <Badge variant="outline" className={`text-[8px] ${(METHODE_CONFIG[msg.transcription_methode] || METHODE_CONFIG.aucune).className}`}>
                        {(METHODE_CONFIG[msg.transcription_methode] || METHODE_CONFIG.aucune).label}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-foreground bg-white rounded-lg p-2 border border-gray-100">
                    {msg.transcription || <span className="text-muted-foreground italic">Aucune transcription</span>}
                  </p>
                </div>

                {msg.transcription_brute && msg.transcription_brute !== msg.transcription && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Brut (avant nettoyage)</p>
                    <p className="text-[11px] text-gray-500 bg-gray-50 rounded-lg p-2 border border-gray-100 font-mono">
                      {msg.transcription_brute}
                    </p>
                  </div>
                )}

                {msg.transcription_raisons && parseRaisons(msg.transcription_raisons).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {parseRaisons(msg.transcription_raisons).map((r, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                        {r}
                      </span>
                    ))}
                  </div>
                )}

                {hasCorrection && !isEditing && (
                  <div>
                    <p className="text-[10px] font-semibold text-green-600 uppercase mb-0.5">Correction admin</p>
                    <p className="text-xs text-foreground bg-green-50 rounded-lg p-2 border border-green-100">
                      {msg.transcription_correction}
                    </p>
                  </div>
                )}

                {msg.transcription_status !== "echec" && (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-muted-foreground">Confiance</span>
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${confidencePct >= 70 ? "bg-green-500" : confidencePct >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${confidencePct}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-semibold text-muted-foreground">{confidencePct}%</span>
                  </div>
                )}

                {msg.transcription_status === "echec" && (
                  <div className="flex items-center gap-1.5 text-[10px] text-red-600">
                    <AlertCircle className="w-3 h-3" />
                    <span>Transcription automatique échouée</span>
                  </div>
                )}

                {isEditing ? (
                  <div className="space-y-2">
                    <Textarea
                      value={correctionText}
                      onChange={(e) => setCorrectionText(e.target.value)}
                      className="text-xs min-h-[60px] resize-none"
                      placeholder="Saisissez la transcription corrigée..."
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-[11px] gap-1"
                        onClick={() => handleSaveCorrection(msg.id)}
                        disabled={savingId === msg.id}
                      >
                        <Check className="w-3 h-3" />
                        {savingId === msg.id ? "Sauvegarde..." : "Enregistrer"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px]"
                        onClick={() => { setEditingId(null); setCorrectionText(""); }}
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => startEdit(msg)}
                  >
                    <Edit3 className="w-3 h-3" />
                    {hasCorrection ? "Modifier la correction" : "Corriger la transcription"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {messages.length > 0 && (
        <p className="text-[10px] text-muted-foreground mt-2 italic">
          Les corrections aident VENUS à mieux comprendre les patterns de reconnaissance vocale.
        </p>
      )}
    </div>
  );
}