import React, { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Play, Pause, Mic } from "lucide-react";

function AudioBubble({ audioUrl, isMine }) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(new Audio());

  const togglePlay = () => {
    const a = audioRef.current;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.src = audioUrl;
      a.onloadedmetadata = () => setDuration(Math.round(a.duration));
      a.onended = () => setPlaying(false);
      a.play();
      setPlaying(true);
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
        "flex items-center gap-2 px-3 py-2 rounded-2xl transition-all active:scale-95",
        isMine ? "bg-primary text-white rounded-br-md" : "bg-white border border-gray-200 text-gray-900 rounded-bl-md shadow-sm"
      )}
    >
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center",
        isMine ? "bg-white/20" : "bg-blue-100"
      )}>
        {playing ? (
          <Pause className={cn("w-4 h-4", isMine ? "text-white" : "text-blue-600")} />
        ) : (
          <Play className={cn("w-4 h-4", isMine ? "text-white" : "text-blue-600")} />
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <div className={cn("h-1 w-16 rounded-full overflow-hidden", isMine ? "bg-white/30" : "bg-gray-200")}>
          <div className={cn("h-full rounded-full transition-all duration-200", playing ? "animate-pulse" : "", isMine ? "bg-white" : "bg-blue-500")} style={{ width: playing ? "100%" : "0%" }} />
        </div>
        <span className="text-xs font-bold tabular-nums">{duration > 0 ? fmt(duration) : "..."}</span>
      </div>
      <Mic className={cn("w-3.5 h-3.5", isMine ? "text-white/60" : "text-blue-400")} />
    </button>
  );
}

export default function ChatBubble({ message, isMine }) {
  const senderLabel = {
    client: "Client",
    livreur: "Livreur",
    admin: "SILGAPP Admin",
  };

  return (
    <div className={cn("flex gap-2 mb-3", isMine ? "justify-end" : "justify-start")}>
      {!isMine && (
        <div className="flex flex-col items-center flex-shrink-0">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white",
            message.sender_type === "livreur" ? "bg-blue-500" :
            message.sender_type === "admin" ? "bg-amber-500" : "bg-gray-400"
          )}>
            {message.sender_type === "livreur" ? "L" : message.sender_type === "admin" ? "A" : "C"}
          </div>
        </div>
      )}
      <div className={cn("max-w-[75%]", isMine && "flex flex-col items-end")}>
        {!isMine && (
          <p className="text-[10px] text-gray-500 font-semibold mb-0.5 px-1">
            {message.sender_name} · {senderLabel[message.sender_type] || message.sender_type}
          </p>
        )}
        {message.message_type === "audio" && message.audio_url ? (
          <AudioBubble audioUrl={message.audio_url} isMine={isMine} />
        ) : (
          <div className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
            isMine ? "bg-primary text-white rounded-br-md" : "bg-white border border-gray-200 text-gray-900 rounded-bl-md shadow-sm"
          )}>
            <p>{message.content}</p>
          </div>
        )}
        <p className="text-[9px] text-gray-400 mt-0.5 px-1">
          {message.created_date ? format(new Date(message.created_date), "HH:mm") : ""}
        </p>
      </div>
      {isMine && (
        <div className="flex flex-col items-center flex-shrink-0">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white",
            message.sender_type === "livreur" ? "bg-blue-500" :
            message.sender_type === "admin" ? "bg-amber-500" : "bg-gray-400"
          )}>
            {message.sender_type === "livreur" ? "L" : message.sender_type === "admin" ? "A" : "C"}
          </div>
        </div>
      )}
    </div>
  );
}