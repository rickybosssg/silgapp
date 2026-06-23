import React, { useState, useRef } from "react";
import { Mic, Square, Send, Loader2, Play, Pause, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AudioRecorder({ onSend, disabled, senderName }) {
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
  const audioRef = useRef(new Audio());

  const getSupportedMimeType = () => {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
    return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
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
      if (navigator.permissions?.query) {
        try {
          const status = await navigator.permissions.query({ name: "microphone" });
          if (status.state === "denied") throw new Error("denied");
        } catch (err) {
          if (err?.message === "denied") throw err;
        }
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
        clearInterval(timerRef.current);
      };

      recorder.start();
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch (err) {
      const denied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError" || err?.message === "denied";
      setPermissionError(
        denied
          ? "Microphone refuse. Autorisez le microphone dans les parametres de l'application."
          : "Microphone non disponible sur cet appareil."
      );
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const handleUploadAndSend = async () => {
    if (!audioBlob) return;
    setUploading(true);
    try {
      const { base44 } = await import("@/api/base44Client");
      const file = new File([audioBlob], `audio_${Date.now()}.webm`, { type: "audio/webm" });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await onSend({ message_type: "audio", audio_url: file_url, content: "" });
      setAudioBlob(null);
      setAudioUrl(null);
      setDuration(0);
    } catch {
      alert("Erreur lors de l'envoi de l'audio");
    }
    setUploading(false);
  };

  const cancelRecording = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (playing) {
      a.pause();
    } else {
      a.src = audioUrl;
      a.play();
    }
    setPlaying(!playing);
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
        <Button
          variant="destructive"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={stopRecording}
        >
          <Square className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  if (audioBlob) {
    return (
      <div className="flex items-center gap-2 px-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-full gap-1.5 bg-blue-50 border-blue-200"
          onClick={togglePlay}
        >
          {playing ? <Pause className="w-3.5 h-3.5 text-blue-600" /> : <Play className="w-3.5 h-3.5 text-blue-600" />}
          <span className="text-xs font-bold text-blue-600 tabular-nums">{formatTime(duration)}</span>
        </Button>
        <Button
          size="sm"
          className="h-8 rounded-full gap-1"
          onClick={handleUploadAndSend}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Envoyer
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-gray-400" onClick={cancelRecording}>

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
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={openAppSettings}
            className="mt-2 h-8 rounded-xl text-xs font-bold"
          >
            <Settings className="mr-1.5 h-3.5 w-3.5" />
            Ouvrir les parametres
          </Button>
        </div>
      )}
    </div>
  );
}
