import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Loader2, MessageCircle, User, Truck, Shield, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import ChatBubble from "@/components/chat/ChatBubble";
import AudioRecorder from "@/components/chat/AudioRecorder";
import NewConversationDialog from "@/components/chat/NewConversationDialog";
import { playNotificationSound } from "@/hooks/useSonEtVibration";

function ConversationItem({ conv, myType, myId, active, onClick }) {
  const [otherParticipant, setOtherParticipant] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    try {
      const parts = JSON.parse(conv.participants || "[]");
      const other = parts.find(p => !(p.type === myType && p.id === myId));
      setOtherParticipant(other || parts[0]);
    } catch { setOtherParticipant(null); }
  }, [conv, myType, myId]);

  return (
    <button
      onClick={() => onClick(conv)}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left",
        active ? "bg-primary/10 border border-primary/20" : "hover:bg-gray-50 border border-transparent"
      )}
    >
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0",
        (otherParticipant?.type || conv.group_type) === "livreur" ? "bg-blue-500" :
        (otherParticipant?.type || conv.group_type) === "admin" ? "bg-amber-500" : "bg-emerald-500"
      )}>
        {(otherParticipant?.type || conv.group_type) === "livreur" ? <Truck className="w-4 h-4" /> :
         (otherParticipant?.type || conv.group_type) === "admin" ? <Shield className="w-4 h-4" /> :
         conv.group_type === "group" ? <Users className="w-4 h-4" /> :
         <User className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900 truncate">
            {conv.title || otherParticipant?.name || "Discussion"}
          </p>
          {conv.last_message_date && (
            <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">
              {format(new Date(conv.last_message_date), "HH:mm", { locale: fr })}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {conv.last_sender_name ? (
            <><span className="font-medium">{conv.last_sender_name}</span>: </>
          ) : null}
          {conv.last_message || "Nouvelle conversation"}
        </p>
      </div>
    </button>
  );
}

function GeneralChatWindow({ conversationId, myType, myId, myName, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!conversationId) return;
    base44.entities.Message.filter({ conversation_id: conversationId }, "created_date", 100)
      .then(msgs => setMessages(msgs || []))
      .catch(() => setMessages([]));
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const unsub = base44.entities.Message.subscribe((event) => {
      if (event.type === "create" && event.data?.conversation_id === conversationId) {
        const isFromMe = event.data.sender_type === myType && event.data.sender_id === myId;
        if (!isFromMe) {
          playNotificationSound();
          navigator.vibrate?.([200, 100, 200]);
        }
        setMessages(prev => {
          const exists = prev.some(m => m.id === event.data.id);
          return exists ? prev : [...prev, event.data].sort((a, b) =>
            new Date(a.created_date) - new Date(b.created_date)
          );
        });
        // Mettre à jour la conversation (last_message)
        base44.entities.Conversation.update(conversationId, {
          last_message: event.data.message_type === "text" ? event.data.content?.slice(0, 80) || "" : event.data.message_type === "audio" ? " Message vocal" : " Photo",
          last_message_date: event.data.created_date,
          last_sender_name: event.data.sender_name,
        }).catch(() => {});
      }
    });
    return () => unsub?.();
  }, [conversationId, myType, myId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (msgData) => {
    if (sending || !conversationId) return;
    setSending(true);
    try {
      await base44.entities.Message.create({
        conversation_id: conversationId,
        sender_type: myType,
        sender_id: myId,
        sender_name: myName,
        ...msgData,
      });
    } catch (err) {
      console.error("Erreur envoi message:", err);
    }
    setSending(false);
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setInput("");
    await sendMessage({ content: input.trim(), message_type: "text" });
  };

  const handlePhotoSend = async (e) => {
    const file = e.target.files?.[0];
    if (!file || sending) return;
    setUploadingPhoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await sendMessage({ message_type: "photo", photo_url: file_url, content: "" });
    } catch (err) {
      console.error("Erreur envoi photo:", err);
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 bg-gradient-to-r from-primary to-primary/80 text-white">
        <button onClick={onBack} className="text-white/80 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <MessageCircle className="w-4 h-4" />
        <span className="text-sm font-bold truncate">Messagerie</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 bg-gray-50">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-gray-400 text-center">
              Aucun message. Dites bonjour !
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            message={msg}
            isMine={msg.sender_type === myType && msg.sender_id === myId}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-white border-t border-gray-100 flex items-center gap-2">
        <AudioRecorder
          onSend={(data) => sendMessage(data)}
          disabled={sending}
          senderName={myName}
        />
        <label className="cursor-pointer">
          <input type="file" accept="image/*" onChange={handlePhotoSend} className="hidden" disabled={sending || uploadingPhoto} />
          <div className="h-9 w-9 rounded-full flex items-center justify-center text-gray-400 hover:text-primary transition-colors">
            {uploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
            )}
          </div>
        </label>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Votre message..."
          disabled={sending}
          className="flex-1 h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="h-10 w-10 rounded-xl bg-primary hover:bg-primary/90"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

export default function MessagesPage({ myType, myId, myName, onBack }) {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewConv, setShowNewConv] = useState(false);

  useEffect(() => {
    if (!myId) return;
    loadConversations();
  }, [myId]);

  // Subscription pour rafraîchir la liste
  useEffect(() => {
    const unsub = base44.entities.Conversation.subscribe((event) => {
      if (event.type === "update" || event.type === "create") {
        loadConversations();
      }
    });
    return () => unsub?.();
  }, [myId]);

  const loadConversations = async () => {
    try {
      const all = await base44.entities.Conversation.list("-last_message_date", 100);
      // Filtrer celles où l'utilisateur est participant
      const mine = all.filter(c => {
        try {
          const parts = JSON.parse(c.participants || "[]");
          return parts.some(p => p.type === myType && p.id === myId);
        } catch { return false; }
      });
      setConversations(mine);
    } catch {}
    setLoading(false);
  };

  if (activeConvId) {
    return (
      <GeneralChatWindow
        conversationId={activeConvId}
        myType={myType}
        myId={myId}
        myName={myName}
        onBack={() => setActiveConvId(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h2 className="text-lg font-bold text-gray-900">Messages</h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full gap-1.5 h-8 text-xs"
          onClick={() => setShowNewConv(true)}
        >
          <UserPlus className="w-3.5 h-3.5" />
          Nouveau
        </Button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}
        {!loading && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center px-8">
            <MessageCircle className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-sm font-semibold text-gray-500 mb-2">Aucune conversation</p>
            <p className="text-xs text-gray-400 mb-4">
              Discutez avec les livreurs et clients SILGAPP
            </p>
            <Button
              size="sm"
              className="rounded-full gap-1.5"
              onClick={() => setShowNewConv(true)}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Nouvelle discussion
            </Button>
          </div>
        )}
        {conversations.map(conv => (
          <ConversationItem
            key={conv.id}
            conv={conv}
            myType={myType}
            myId={myId}
            active={conv.id === activeConvId}
            onClick={(c) => setActiveConvId(c.id)}
          />
        ))}
      </div>

      <NewConversationDialog
        open={showNewConv}
        onClose={() => setShowNewConv(false)}
        myType={myType}
        myId={myId}
        myName={myName}
        onStart={(convId) => setActiveConvId(convId)}
      />
    </div>
  );
}