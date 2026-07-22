import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Loader2, ArrowLeft, MessageCircle, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { playNotificationSound } from "@/hooks/useSonEtVibration";

/**
 * Fenêtre de chat de support — utilisée côté livreur ET côté admin.
 * - Côté livreur: myType='livreur', myId=livreurId
 * - Côté admin: myType='admin', myId=user.email
 *
 * Trouve ou crée une conversation de support entre le livreur et l'admin,
 * puis affiche les messages en temps réel.
 */
export default function SupportChatWindow({ livreurId, livreurName, myType, myId, myName, onBack }) {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const sendingRef = useRef(false);
  const knownIdsRef = useRef(new Set());

  // ── Trouver ou créer la conversation de support ──
  useEffect(() => {
    if (!livreurId || !myId) return;
    let cancelled = false;

    async function findOrCreateConversation() {
      try {
        // Chercher une conversation existante avec ce livreur et admin 'support'
        const all = await base44.entities.Conversation.list("-updated_date", 200);
        const existing = (all || []).find(c => {
          try {
            const parts = JSON.parse(c.participants || "[]");
            const hasLivreur = parts.some(p => p.type === "livreur" && p.id === livreurId);
            const hasSupport = parts.some(p => p.type === "admin" && (p.id === "support" || p.id === "all"));
            return hasLivreur && hasSupport;
          } catch { return false; }
        });

        if (cancelled) return;

        if (existing) {
          setConversationId(existing.id);
        } else {
          // Créer une nouvelle conversation de support
          const participants = JSON.stringify([
            { type: "livreur", id: livreurId, name: livreurName || "Livreur" },
            { type: "admin", id: "support", name: "Support SILGAPP" },
          ]);
          const conv = await base44.entities.Conversation.create({
            participants,
            title: `Support - ${livreurName || "Livreur"}`,
            source: "app",
            group_type: "direct",
            last_message: "",
            last_message_date: new Date().toISOString(),
          });
          if (cancelled) return;
          setConversationId(conv.id);
        }
        setLoading(false);
      } catch (err) {
        console.error("[SupportChat] Erreur init conversation:", err);
        setError("Impossible de charger la messagerie. Réessayez plus tard.");
        setLoading(false);
      }
    }

    findOrCreateConversation();
    return () => { cancelled = true; };
  }, [livreurId, myId, livreurName]);

  // ── Charger les messages ──
  useEffect(() => {
    if (!conversationId) return;
    base44.entities.Message.filter({ conversation_id: conversationId }, "created_date", 200)
      .then(msgs => {
        const list = msgs || [];
        knownIdsRef.current = new Set(list.map(m => m.id));
        setMessages(list);
      })
      .catch(() => setMessages([]));
  }, [conversationId]);

  // ── Temps réel: subscription aux nouveaux messages ──
  useEffect(() => {
    if (!conversationId) return;
    const unsub = base44.entities.Message.subscribe((event) => {
      if (event.type === "create" && event.data?.conversation_id === conversationId) {
        if (knownIdsRef.current.has(event.data.id)) return;
        knownIdsRef.current.add(event.data.id);
        const isFromMe = event.data.sender_type === myType && event.data.sender_id === myId;
        if (!isFromMe) {
          playNotificationSound();
          navigator.vibrate?.([200, 100, 200]);
        }
        setMessages(prev => [...prev, event.data].sort((a, b) =>
          new Date(a.created_date) - new Date(b.created_date)
        ));
      }
    });
    return () => unsub?.();
  }, [conversationId, myType, myId]);

  // ── Auto-scroll ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Envoi de message via la fonction backend envoyerMessage ──
  const sendMessage = async (msgData) => {
    if (sendingRef.current || !conversationId) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const res = await base44.functions.invoke("envoyerMessage", {
        conversation_id: conversationId,
        sender_type: myType,
        sender_id: myId,
        sender_name: myName,
        ...msgData,
      });
      const newMsg = res?.message || res?.data?.message;
      if (newMsg && !knownIdsRef.current.has(newMsg.id)) {
        knownIdsRef.current.add(newMsg.id);
        setMessages(prev => [...prev, newMsg].sort((a, b) =>
          new Date(a.created_date) - new Date(b.created_date)
        ));
      }
    } catch (err) {
      console.error("[SupportChat] Erreur envoi:", err);
    }
    sendingRef.current = false;
    setSending(false);
  };

  const handleSend = async () => {
    if (!input.trim() || sendingRef.current) return;
    setInput("");
    await sendMessage({ content: input.trim(), message_type: "text" });
  };

  const handlePhotoSend = async (e) => {
    const file = e.target.files?.[0];
    if (!file || sendingRef.current) return;
    setUploadingPhoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await sendMessage({ message_type: "photo", photo_url: file_url, content: "" });
    } catch (err) {
      console.error("[SupportChat] Erreur photo:", err);
    }
    setUploadingPhoto(false);
    e.target.value = "";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 px-4">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 bg-gradient-to-r from-primary to-primary/80 text-white">
        {onBack && (
          <button onClick={onBack} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <MessageCircle className="w-4 h-4" />
        <span className="text-sm font-bold truncate">Support SILGAPP</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 bg-gray-50 min-h-[200px]">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full py-8">
            <p className="text-xs text-gray-400 text-center">
              Aucun message. Écrivez à l'équipe SILGAPP, nous répondrons rapidement.
            </p>
          </div>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_type === myType && msg.sender_id === myId;
          return (
            <div key={msg.id} className={cn("flex mb-2", isMine ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[80%] rounded-2xl px-3 py-2 shadow-sm",
                isMine
                  ? "bg-primary text-white rounded-br-sm"
                  : "bg-white text-gray-900 border border-gray-100 rounded-bl-sm"
              )}>
                {!isMine && msg.sender_name && (
                  <p className="text-[10px] font-bold text-primary mb-0.5">{msg.sender_name}</p>
                )}
                {msg.message_type === "photo" && msg.photo_url ? (
                  <img src={msg.photo_url} alt="photo" className="rounded-lg max-w-[200px] mb-1" />
                ) : null}
                {msg.content && (
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                )}
                {msg.created_date && (
                  <p className={cn("text-[9px] mt-0.5 text-right", isMine ? "text-white/60" : "text-gray-400")}>
                    {format(new Date(msg.created_date), "HH:mm", { locale: fr })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Barre de saisie */}
      <div className="p-3 bg-white border-t border-gray-200 flex items-center gap-2 safe-area-bottom">
        <label className="cursor-pointer flex-shrink-0">
          <input type="file" accept="image/*" onChange={handlePhotoSend} className="hidden" disabled={sending || uploadingPhoto} />
          <div className="h-10 w-10 rounded-full flex items-center justify-center text-gray-500 hover:text-primary hover:bg-gray-100 transition-colors">
            {uploadingPhoto ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
          </div>
        </label>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Votre message..."
          disabled={sending}
          className="flex-1 h-11 min-w-0 rounded-xl border border-gray-200 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="h-11 w-11 rounded-xl bg-primary hover:bg-primary/90 shadow-md flex-shrink-0 disabled:opacity-60"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </Button>
      </div>
    </div>
  );
}