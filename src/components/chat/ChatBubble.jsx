import React, { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Play, Pause, Mic } from "lucide-react";

function AudioBubble({ audioUrl, isMine }) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef(null);

  const togglePlay = () => {
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      setLoading(true);
      a.src = audioUrl;
      a.onloadedmetadata = () => {
        setDuration(Math.round(a.duration || 0));
        setLoading(false);
      };
      a.onended = () => setPlaying(false);
      a.onerror = () => {
        setLoading(false);
        setPlaying(false);
      };
      a.play()
        .then(() => setPlaying(true))
        .catch(() => {
          setLoading(false);
          setPlaying(false);
        });
    }
  };

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <button
      onClick={togglePlay}
      className={cn(
        "flex items-center gap-2.5 px-4 py-2.5 rounded-2xl transition-all active:scale-95 shadow-sm",
        isMine ? "bg-primary text-white rounded-br-md" : "bg-white border border-gray-200 text-gray-900 rounded-bl-md"
      )}
    >
      <div className={cn(
        "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
        isMine ? "bg-white/20" : "bg-blue-100"
      )}>
        {playing ? (
          <Pause className={cn("w-4 h-4", isMine ? "text-white" : "text-blue-600")} />
        ) : (
          <Play className={cn("w-4 h-4", isMine ? "text-white" : "text-blue-600")} />
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className={cn("h-1.5 w-20 rounded-full overflow-hidden", isMine ? "bg-white/30" : "bg-gray-200")}>
          <div className={cn("h-full rounded-full transition-all duration-200", playing ? "animate-pulse" : "", isMine ? "bg-white" : "bg-blue-500")} style={{ width: playing ? "100%" : "0%" }} />
        </div>
        <span className="text-xs font-bold tabular-nums">{duration > 0 ? fmt(duration) : "..."}</span>
      </div>
      <Mic className={cn("w-4 h-4 flex-shrink-0", isMine ? "text-white/60" : "text-blue-400")} />
    </button>
  );
}

const ROLE_CONFIG = {
  client: { color: "bg-emerald-500", initial: "C", label: "Client" },
  livreur: { color: "bg-blue-500", initial: "L", label: "Livreur" },
  admin: { color: "bg-amber-500", initial: "A", label: "Admin" },
  partenaire: { color: "bg-purple-500", initial: "P", label: "Partenaire" },
};

function Avatar({ message, size = "w-9 h-9" }) {
  const role = {
    ...(ROLE_CONFIG[message.sender_type] || { color: "bg-gray-400", initial: "?", label: message.sender_type }),
    label: message.sender_role_label || ROLE_CONFIG[message.sender_type]?.label || message.sender_type,
  };

  if (message.sender_photo_url) {
    return (
      <img
        src={message.sender_photo_url}
        alt={message.sender_name}
        className={cn(size, "rounded-full object-cover border-2 border-white shadow-sm flex-shrink-0")}
      />
    );
  }

  return (
    <div className={cn(
      size, "rounded-full flex items-center justify-center text-sm font-black text-white shadow-sm flex-shrink-0",
      role.color
    )}>
      {role.initial}
    </div>
  );
}

export default function ChatBubble({ message, isMine }) {
  const role = ROLE_CONFIG[message.sender_type] || { color: "bg-gray-400", initial: "?", label: message.sender_type };

  return (
    <div className={cn("flex gap-2.5 mb-4", isMine ? "justify-end" : "justify-start")}>
      {!isMine && <Avatar message={message} />}

      <div className={cn("max-w-[82%] sm:max-w-[76%] flex flex-col", isMine ? "items-end" : "items-start")}>
        {/* Nom + rôle (uniquement pour les messages reçus) */}
        {!isMine && (
          <div className="flex items-center gap-2 mb-1 px-0.5">
            <span className="text-xs font-black text-slate-950 truncate max-w-[150px]">
              {message.sender_name || "Utilisateur"}
            </span>
            <span className={cn(
            "text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white",
              role.color
            )}>
              {role.label}
            </span>
          </div>
        )}

        {/* Contenu du message */}
        {message.message_type === "audio" && message.audio_url ? (
          <AudioBubble audioUrl={message.audio_url} isMine={isMine} />
        ) : message.message_type === "photo" && message.photo_url ? (
          <div className={cn(
            "rounded-2xl overflow-hidden max-w-[240px] shadow-sm",
            isMine ? "rounded-br-md" : "rounded-bl-md border border-gray-200"
          )}>
            <img
              src={message.photo_url}
              alt="Photo"
              className="w-full h-auto object-cover cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => window.open(message.photo_url, "_blank")}
              loading="lazy"
            />
          </div>
        ) : (
          <div className={cn(
            "rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm break-words",
            isMine
              ? "bg-primary text-white rounded-br-md shadow-primary/20"
              : "bg-white border border-slate-200 text-slate-950 rounded-bl-md shadow-slate-200/70"
          )}>
            <p className="whitespace-pre-wrap font-medium">{message.content}</p>
          </div>
        )}

        {/* Horodatage */}
        <p className="text-[10px] text-slate-500 mt-1 px-0.5 font-semibold">
          {message.created_date ? format(new Date(message.created_date), "HH:mm") : ""}
        </p>
      </div>

      {isMine && <Avatar message={message} />}
    </div>
  );
}
