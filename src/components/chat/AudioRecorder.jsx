import React, { useState, useRef } from "react";
import { Mic, Square, Send, Loader2, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AudioRecorder({ onSend, disabled, senderName }) {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioRef = useRef(new Audio());

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
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
    } catch {
      alert("Microphone non disponible. Vérifiez les permissions.");
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
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50"
      onClick={startRecording}
      disabled={disabled}
      title="Message vocal"
    >
      <Mic className="w-4 h-4" />
    </Button>
  );
}