import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Loader2, Bot, UserCheck, MapPin, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function WhatsAppChatWindow({ conv, myEmail, myName, onBack, onConvUpdate }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);
  const bottomRef = useRef(null);
  const knownIds = useRef(new Set());

  useEffect(() => {
    if (!conv?.id) return;
    base44.entities.Message.filter({ conversation_id: conv.id }, "created_date", 200)
      .then(msgs => {
        const list = msgs || [];
        knownIds.current = new Set(list.map(m => m.id));
        setMessages(list);
      })
      .catch(() => setMessages([]));
  }, [conv?.id]);

  useEffect(() => {
    if (!conv?.id) return;
    const unsub = base44.entities.Message.subscribe((event) => {
      if (event.type === "create" && event.data?.conversation_id === conv.id) {
        if (knownIds.current.has(event.data.id)) return;
        knownIds.current.add(event.data.id);
        setMessages(prev => [...prev, event.data].sort((a, b) =>
          new Date(a.created_date) - new Date(b.created_date)
        ));
      }
    });
    return () => unsub?.();
  }, [conv?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Marquer comme lu
  useEffect(() => {
    if (!conv?.id) return;
    const now = new Date().toISOString();
    base44.entities.Conversation.update(conv.id, { admin_last_read_date: now }).catch(() => {});
  }, [conv?.id]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    try {
      const res = await base44.functions.invoke("envoyerWhatsAppAdmin", {
        conversation_id: conv.id,
        content,
      });
      const newMsg = res?.data?.message || res?.message;
      if (newMsg && !knownIds.current.has(newMsg.id)) {
        knownIds.current.add(newMsg.id);
        setMessages(prev => [...prev, newMsg].sort((a, b) =>
          new Date(a.created_date) - new Date(b.created_date)
        ));
      }
    } catch (err) {
      console.error("Erreur envoi:", err);
    }
    setSending(false);
  };

  const handleToggleVenus = async (action) => {
    setToggling(true);
    try {
      const res = await base44.functions.invoke("toggleVenusConversation", {
        conversation_id: conv.id,
        action,
      });
      const data = res?.data || res;
      if (data?.success !== false) {
        onConvUpdate({
          ...conv,
          venus_active: data.venus_active,
          assigned_admin_email: data.venus_active ? "" : myEmail,
        });
      }
    } catch (err) {
      console.error("Erreur toggle:", err);
    }
    setToggling(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 bg-white border-b border-gray-200 safe-area-top">
        <button onClick={onBack} className="md:hidden text-gray-500 p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-white text-sm font-bold">
          {(conv.title || "?").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{conv.title || conv.whatsapp_phone}</p>
          <p className="text-xs text-gray-400">{conv.whatsapp_phone} {conv.country_code && `• ${conv.country_code}`}</p>
        </div>
        {conv.venus_active ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleToggleVenus("take_over")}
            disabled={toggling}
            className="gap-1.5 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
          >
            {toggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Prendre la main</span>
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => handleToggleVenus("give_back")}
            disabled={toggling}
            className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700"
          >
            {toggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Rendre à Venus</span>
          </Button>
        )}
      </div>

      {/* Status banner */}
      <div className={cn(
        "px-4 py-1.5 border-b text-xs flex items-center gap-1.5",
        conv.venus_active ? "bg-blue-50 border-blue-100 text-blue-700" : "bg-amber-50 border-amber-100 text-amber-700"
      )}>
        {conv.venus_active ? (
          <><Bot className="w-3.5 h-3.5" /> Venus répond automatiquement</>
        ) : (
          <><UserCheck className="w-3.5 h-3.5" /> {conv.assigned_admin_email ? `Géré par ${conv.assigned_admin_email}` : "Mode manuel admin"}</>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">Aucun message</p>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-white border-t border-gray-200 flex items-center gap-2 safe-area-bottom">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Votre message..."
          disabled={sending}
          className="flex-1 h-11 min-w-0 rounded-xl border border-gray-200 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/20"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="h-11 w-11 rounded-xl bg-green-600 hover:bg-green-700 flex-shrink-0"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </Button>
      </div>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isMine = msg.sender_type === "admin";
  const isVenus = msg.sender_id === "venus";

  return (
    <div className={cn("flex", isMine ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[75%] rounded-2xl px-3 py-2",
        isMine
          ? isVenus ? "bg-blue-100 text-blue-900" : "bg-green-600 text-white"
          : "bg-white border border-gray-200 text-gray-900"
      )}>
        {isMine && (
          <p className={cn("text-[10px] font-bold mb-0.5", isVenus ? "text-blue-600" : "text-green-100")}>
            {isVenus ? "🤖 VENUS" : "👤 Admin"}
          </p>
        )}
        {msg.message_type === "text" && (
          <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
        )}
        {msg.message_type === "photo" && msg.photo_url && (
          <img src={msg.photo_url} alt="Photo" className="rounded-lg max-w-full max-h-60" />
        )}
        {msg.message_type === "audio" && msg.audio_url && (
          <audio controls src={msg.audio_url} className="w-full max-w-xs" />
        )}
        {msg.message_type === "video" && msg.video_url && (
          <video controls src={msg.video_url} className="rounded-lg max-w-full max-h-60" />
        )}
        {msg.message_type === "document" && msg.document_url && (
          <a href={msg.document_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm underline">
            <FileText className="w-4 h-4" /> Document
          </a>
        )}
        {msg.message_type === "location" && (
          <a
            href={`https://www.google.com/maps?q=${msg.location_lat},${msg.location_lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm underline"
          >
            <MapPin className="w-4 h-4" /> {msg.location_lat?.toFixed(5)}, {msg.location_lng?.toFixed(5)}
          </a>
        )}
        <p className={cn("text-[10px] mt-1 text-right", isMine ? (isVenus ? "text-blue-400" : "text-green-100") : "text-gray-400")}>
          {msg.created_date && format(new Date(msg.created_date), "HH:mm", { locale: fr })}
        </p>
      </div>
    </div>
  );
}