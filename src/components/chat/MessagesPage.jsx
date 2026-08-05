import React, { useState, useEffect, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Loader2, MessageCircle, User, Truck, Shield, UserPlus, Users, ImagePlus, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import ChatBubble from "@/components/chat/ChatBubble";
import AudioRecorder from "@/components/chat/AudioRecorder";
import NewConversationDialog from "@/components/chat/NewConversationDialog";
import { playNotificationSound } from "@/hooks/useSonEtVibration";
import {
  buildClientMessageId,
  buildSenderProfiles,
  dedupeAndSortMessages,
  enrichMessagesWithProfiles,
  getMessageKey,
  mergeMessageList,
} from "@/lib/chatUtils";

const PARTNER_TYPES = ["partner", "partenaire", "boutique", "restaurant", "pharmacie"];
const normalizeParticipantType = (type) => PARTNER_TYPES.includes(type) ? "partenaire" : type;
const participantBelongsToMe = (participant, myType, myId) => {
  const type = normalizeParticipantType(participant?.type);
  if (type !== normalizeParticipantType(myType)) return false;
  const ids = [
    participant?.id,
    participant?.partner_id,
    participant?.partenaire_id,
    participant?.boutique_id,
    participant?.restaurant_id,
    participant?.pharmacie_id,
    participant?.user_id,
  ].filter(Boolean).map(String);
  return ids.includes(String(myId));
};

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function ConversationItem({ conv, myType, myId, active, onClick }) {
  const [otherParticipant, setOtherParticipant] = useState(null);

  useEffect(() => {
    try {
      const parts = JSON.parse(conv.participants || "[]");
      const other = parts.find(p => !participantBelongsToMe(p, myType, myId));
      setOtherParticipant(other || parts[0]);
    } catch { setOtherParticipant(null); }
  }, [conv, myType, myId]);

  const roleKey = normalizeParticipantType(otherParticipant?.type) || (conv.group_type === "group" ? "group" : "client");
  const displayName = conv.title || otherParticipant?.name || "Discussion";
  const initials = getInitials(displayName);

  // Détermine si la conversation est non lue
  const isUnread = useMemo(() => {
    if (!conv.last_message_date) return false;
    if (conv.last_sender_type === myType) return false; // dernier message = moi → lu
    if (myType === "admin") {
      if (!conv.admin_last_read_date) return true;
      return new Date(conv.last_message_date) > new Date(conv.admin_last_read_date);
    }
    return false;
  }, [conv.last_message_date, conv.last_sender_type, conv.admin_last_read_date, myType]);

  // Couleurs par rôle
  const avatarColors = roleKey === "livreur" ? "from-blue-500 to-blue-700" :
    roleKey === "admin" ? "from-amber-500 to-amber-600" :
    roleKey === "partenaire" ? "from-purple-500 to-purple-600" :
    roleKey === "group" ? "from-violet-500 to-violet-600" : "from-emerald-500 to-emerald-600";

  const AvatarIcon = roleKey === "livreur" ? Truck :
    roleKey === "admin" ? Shield :
    roleKey === "partenaire" ? Store :
    roleKey === "group" ? Users : User;

  return (
    <button
      onClick={() => onClick(conv)}
      className={cn(
        "relative w-full flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 text-left group",
        active
          ? "bg-primary/8 border border-primary/25 shadow-md shadow-primary/5"
          : isUnread
            ? "bg-red-50/60 border border-red-200/60 hover:bg-red-50 hover:border-red-300 hover:shadow-sm"
            : "bg-white border border-gray-100 hover:bg-gray-50/80 hover:border-gray-200 hover:shadow-sm"
      )}
    >
      {/* Avatar avec initiales + icône overlay */}
      <div className="relative flex-shrink-0">
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-sm bg-gradient-to-br",
          avatarColors
        )}>
          <span className="text-[13px] font-black tracking-tight">{initials}</span>
        </div>
        {/* Petit badge rôle en bas à droite */}
        <div className={cn(
          "absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm bg-gradient-to-br",
          avatarColors
        )}>
          <AvatarIcon className="w-2.5 h-2.5 text-white" />
        </div>
        {/* Point rouge non-lu */}
        {isUnread && (
          <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-red-500 border-2 border-white flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={cn(
            "text-sm truncate transition-colors",
            isUnread ? "font-extrabold text-gray-900" : "font-semibold text-gray-700 group-hover:text-gray-900"
          )}>
            {displayName}
          </p>
          {conv.last_message_date && (
            <span className={cn(
              "text-[10px] flex-shrink-0 tabular-nums",
              isUnread ? "text-red-500 font-bold" : "text-gray-400"
            )}>
              {format(new Date(conv.last_message_date), "HH:mm", { locale: fr })}
            </span>
          )}
        </div>
        <p className={cn(
          "text-xs truncate mt-0.5 flex items-center gap-1",
          isUnread ? "font-semibold text-gray-600" : "text-gray-400"
        )}>
          {conv.last_sender_name && (
            <span className={cn("font-semibold", isUnread ? "text-gray-700" : "text-gray-500")}>
              {conv.last_sender_name}:
            </span>
          )}
          <span className="truncate">{conv.last_message || "Nouvelle conversation"}</span>
        </p>
      </div>

      {/* Barre verticale non-lu */}
      {isUnread && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-red-500" />
      )}
    </button>
  );
}

function GeneralChatWindow({ conversationId, myType, myId, myName, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const bottomRef = useRef(null);
  const sendingRef = useRef(false);
  const knownIdsRef = useRef(new Set());

  useEffect(() => {
    if (!conversationId) return;
    base44.entities.Message.filter({ conversation_id: conversationId }, "created_date", 100)
      .then(async (msgs) => {
        const list = dedupeAndSortMessages(msgs || []);
        const profiles = await buildSenderProfiles(base44, list);
        const enriched = enrichMessagesWithProfiles(list, profiles);
        knownIdsRef.current = new Set(enriched.map(getMessageKey));
        setMessages(enriched);
      })
      .catch(() => setMessages([]));
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const unsub = base44.entities.Message.subscribe((event) => {
      if (event.type === "create" && event.data?.conversation_id === conversationId) {
        // Anti-doublon : vérifier le ref
        const eventKey = getMessageKey(event.data);
        if (knownIdsRef.current.has(eventKey)) return;
        knownIdsRef.current.add(eventKey);

        const isFromMe = event.data.sender_type === myType && event.data.sender_id === myId;
        if (!isFromMe) {
          playNotificationSound();
          navigator.vibrate?.([200, 100, 200]);
        }
        setMessages(prev => mergeMessageList(prev, event.data));
      }
    });
    return () => unsub?.();
  }, [conversationId, myType, myId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Envoi sécurisé via la fonction backend envoyerMessage
  const sendMessage = async (msgData) => {
    if (sendingRef.current || !conversationId) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const clientMessageId = msgData.client_message_id || buildClientMessageId(conversationId, myType, myId);
      const res = await base44.functions.invoke("envoyerMessage", {
        conversation_id: conversationId,
        sender_type: myType,
        sender_id: myId,
        client_message_id: clientMessageId,
        ...msgData,
      });
      const newMsg = res?.message || res?.data?.message;
      if (newMsg) {
        const key = getMessageKey(newMsg);
        if (!knownIdsRef.current.has(key)) {
          knownIdsRef.current.add(key);
          setMessages(prev => mergeMessageList(prev, newMsg));
        }
      }
    } catch (err) {
      console.error("Erreur envoi message:", err);
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
    <div className="flex flex-col h-full bg-[#16191d]">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 bg-[#0f1216] text-white">
        <button onClick={onBack} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <MessageCircle className="w-4 h-4" />
        <span className="text-sm font-bold truncate">Messagerie</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 bg-[#16191d]">
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

      {/* Barre de saisie — bouton Envoyer toujours visible */}
      <div className="p-2.5 bg-[#1f2429] border-t border-white/10 flex items-end gap-1.5 safe-area-bottom shadow-[0_-8px_24px_rgba(0,0,0,0.2)]">
        <AudioRecorder
          onSend={(data) => sendMessage(data)}
          disabled={sending}
          senderName={myName}
        />
        <label className="cursor-pointer flex-shrink-0">
          <input type="file" accept="image/*" onChange={handlePhotoSend} className="hidden" disabled={sending || uploadingPhoto} />
          <div className="h-10 w-10 rounded-full flex items-center justify-center text-white/50 hover:text-[#00a86b] hover:bg-white/10 transition-colors">
            {uploadingPhoto ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
          </div>
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Votre message..."
          disabled={sending}
          rows={2}
          className="flex-1 min-h-14 max-h-32 min-w-0 resize-none rounded-2xl border border-white/10 bg-[#16191d] px-4 py-3 text-[15px] font-medium leading-5 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#00a86b]/40 focus:border-[#00a86b]/40"
        />
        <Button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="h-11 w-11 sm:w-auto sm:min-w-[92px] rounded-full sm:rounded-xl bg-primary hover:bg-primary/90 shadow-md flex-shrink-0 disabled:opacity-60 gap-2 px-0 sm:px-4 font-black text-white"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          <span className="hidden sm:inline">Envoyer</span>
        </Button>
      </div>
    </div>
  );
}

export default function MessagesPage({ myType, myId, myName, onBack, initialConversationId }) {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(initialConversationId || null);
  const [loading, setLoading] = useState(true);
  const [showNewConv, setShowNewConv] = useState(false);

  useEffect(() => {
    if (!myId) return;
    loadConversations();
  }, [myId]);

  // Subscription pour rafraîchir la liste (avec debounce — anti-spam)
  const reloadTimerRef = useRef(null);
  useEffect(() => {
    const unsub = base44.entities.Conversation.subscribe((event) => {
      if (event.type === "update" || event.type === "create") {
        // Debounce: attendre 2s avant de recharger pour éviter le spam
        if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = setTimeout(() => loadConversations(), 2000);
      }
    });
    return () => { unsub?.(); if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current); };
  }, [myId]);

  const loadConversations = async () => {
    try {
      const all = await base44.entities.Conversation.list("-last_message_date", 100);
      const mine = all.filter(c => {
        try {
          const parts = JSON.parse(c.participants || "[]");
          return parts.some(p => participantBelongsToMe(p, myType, myId));
        } catch { return false; }
      });
      setConversations(mine);
    } catch {}
    setLoading(false);
  };

  // Marquer une conversation comme lue côté admin à l'ouverture + update locale
  const markConversationRead = async (convId) => {
    if (myType !== "admin") return;
    const now = new Date().toISOString();
    // Update locale immédiate → le point rouge disparaît tout de suite
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, admin_last_read_date: now } : c));
    try {
      await base44.entities.Conversation.update(convId, { admin_last_read_date: now });
    } catch (_) {}
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
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 via-gray-50/50 to-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-white/90 backdrop-blur-lg border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-2.5">
          {onBack && (
            <button onClick={onBack} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-xl hover:bg-gray-100 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2.5">
            <div className="relative w-9 h-9 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-md shadow-red-200/50">
              <MessageCircle className="w-4.5 h-4.5 text-white" />
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-900 leading-tight tracking-tight">Messages</h2>
              <p className="text-[10px] text-gray-400 font-medium leading-tight">
                {conversations.length} conversation{conversations.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
        <Button
          size="sm"
          className="rounded-full gap-1.5 h-9 px-3.5 text-xs shadow-md shadow-red-200/40 font-bold"
          onClick={() => setShowNewConv(true)}
        >
          <UserPlus className="w-3.5 h-3.5" />
          Nouveau
        </Button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
            <p className="text-xs text-gray-400 font-medium">Chargement des conversations...</p>
          </div>
        )}
        {!loading && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-8">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center mb-4 shadow-sm">
              <MessageCircle className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm font-bold text-gray-600 mb-1">Aucune conversation</p>
            <p className="text-xs text-gray-400 mb-5">
              Discutez avec les livreurs et clients SILGAPP
            </p>
            <Button
              size="sm"
              className="rounded-full gap-1.5 shadow-md"
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
            onClick={(c) => { setActiveConvId(c.id); markConversationRead(c.id); }}
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