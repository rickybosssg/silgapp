import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, Send, Loader2, Play, Pause, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";

function getSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/mpeg",
    "audio/aac",
  ];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch (_) {}
  }
  return "";
}

export default function AudioRecorder({ onSend, disabled }) {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [permissionError, setPermissionError] = useState("");

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    const clearError = () => {
      if (document.visibilityState === "visible") setPermissionError("");
    };
    document.addEventListener("visibilitychange", clearError);
    window.addEventListener("focus", clearError);
    return () => {
      document.removeEventListener("visibilitychange", clearError);
      window.removeEventListener("focus", clearError);
    };
  }, []);

  const cleanupStream = () => {
    streamRef.current?.getTracks?.().forEach(track => track.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const openAppSettings = () => {
    const platform = window.Capacitor?.getPlatform?.();
    const url = platform === "ios"
      ? "app-settings:"
      : "intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;data=package:com.base6a0ec08f3af5e1d1284254c1.app;end";
    try {
      window.open(url, "_system");
    } catch {
      alert("Ouvrez les parametres de l'application SILGAPP et autorisez le microphone.");
    }
  };

  const startRecording = async () => {
    try {
      setPermissionError("");
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error("unsupported");
      }

      // Android WebView peut retourner un etat "denied" stale apres retour des parametres.
      // La seule source fiable est l'appel getUserMedia lui-meme.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = getSupportedMimeType();
      let recorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        cleanupStream();
      };

      recorder.onerror = (e) => {
        console.error("MediaRecorder error:", e);
        setPermissionError("Erreur pendant l'enregistrement audio.");
        cleanupStream();
        setRecording(false);
      };

      recorder.start();
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch (err) {
      const denied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError" || err?.message === "denied";
      const notFound = err?.name === "NotFoundError";
      setPermissionError(
        denied
          ? "Microphone refuse. Autorisez le microphone dans les parametres de l'application."
          : notFound
          ? "Aucun microphone trouve sur cet appareil."
          : "Microphone non disponible. Verifiez les permissions."
      );
      cleanupStream();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const handleUploadAndSend = async () => {
    if (!audioBlob) return;
    setUploading(true);
    try {
      const { base44 } = await import("@/api/base44Client");
      const ext = audioBlob.type.includes("mp4") ? "m4a" : audioBlob.type.includes("mpeg") ? "mp3" : "webm";
      const file = new File([audioBlob], `audio_${Date.now()}.${ext}`, { type: audioBlob.type });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await onSend({ message_type: "audio", audio_url: file_url, content: "" });
      setAudioBlob(null);
      setAudioUrl(null);
      setDuration(0);
    } catch (err) {
      console.error("Upload audio error:", err);
      alert("Erreur lors de l'envoi de l'audio");
    }
    setUploading(false);
  };

  const cancelRecording = () => {
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setDuration(0);
  };

  const togglePlay = () => {
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.src = audioUrl;
      a.onended = () => setPlaying(false);
      a.play().catch(() => setPlaying(false));
      setPlaying(true);
    }
  };

  const formatTime = (s) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  if (recording) {
    return (
      <div className="flex items-center gap-2 px-2">
        <div className="flex items-center gap-2 bg-red-50 rounded-full px-3 py-1.5 border border-red-200">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs font-bold text-red-600 tabular-nums">{formatTime(duration)}</span>
        </div>
        <Button variant="destructive" size="icon" className="h-8 w-8 rounded-full" onClick={stopRecording}>
          <Square className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  if (audioBlob) {
    return (
      <div className="flex items-center gap-2 px-2">
        <Button variant="outline" size="sm" className="h-8 rounded-full gap-1.5 bg-blue-50 border-blue-200" onClick={togglePlay}>
          {playing ? <Pause className="w-3.5 h-3.5 text-blue-600" /> : <Play className="w-3.5 h-3.5 text-blue-600" />}
          <span className="text-xs font-bold text-blue-600 tabular-nums">{formatTime(duration)}</span>
        </Button>
        <Button size="sm" className="h-8 rounded-full gap-1" onClick={handleUploadAndSend} disabled={uploading}>
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Envoyer
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-gray-400" onClick={cancelRecording}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex-shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 rounded-full text-gray-500 hover:text-red-500 hover:bg-red-50"
        onClick={startRecording}
        disabled={disabled}
        title="Message vocal"
      >
        <Mic className="w-4 h-4" />
      </Button>
      {permissionError && (
        <div className="absolute bottom-12 left-0 z-50 w-64 rounded-2xl border border-red-200 bg-white p-3 shadow-xl">
          <button
            type="button"
            onClick={() => setPermissionError("")}
            className="absolute right-2 top-2 rounded-full p-1 text-gray-400 hover:bg-gray-100"
            aria-label="Fermer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <p className="pr-6 text-xs font-semibold leading-relaxed text-red-700">{permissionError}</p>
          <Button type="button" size="sm" variant="outline" onClick={openAppSettings} className="mt-2 h-8 rounded-xl text-xs font-bold">
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Ouvrir les parametres
          </Button>
        </div>
      )}
    </div>
  );
}
