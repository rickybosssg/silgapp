import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Send, Loader2, MessageCircle, ImagePlus, X, RotateCcw } from "lucide-react";
import { markChatRead } from "@/lib/chatReadState";
import ChatBubble from "@/components/chat/ChatBubble";
import AudioRecorder from "@/components/chat/AudioRecorder";
import { toast } from "sonner";
import { playNotificationSound } from "@/hooks/useSonEtVibration";
import {
  buildClientMessageId,
  buildSenderProfiles,
  dedupeAndSortMessages,
  enrichMessagesWithProfiles,
  getMessageKey,
  mergeMessageList,
} from "@/lib/chatUtils";

export default function ChatWindow(props) {
  return <CourseChatWindow key={`${props.courseId ? "course" : "conversation"}:${props.courseId || props.conversationId}:${props.senderType}:${props.senderId}`} {...props} />;
}

function CourseChatWindow({ courseId, conversationId, senderType, senderId, senderName, compact = false, contextInfo = null, fullHeight = false }) {
  const scopeId = courseId || conversationId;
  const scopeField = courseId ? "course_id" : "conversation_id";
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(!compact);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pendingMedia, setPendingMedia] = useState(null);
  const uploadingRef = useRef(false);
  const bottomRef = useRef(null);
  const followLatestRef = useRef(true);
  const sendingRef = useRef(false);
  const pendingSendRef = useRef(null);
  const knownIdsRef = useRef(new Set());
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const olderScrollRef = useRef(null);
  const initializedRef = useRef(false);

  // ── Refetch réutilisable : charge les messages depuis la DB et fusionne avec l'état courant ──
  // Utilisé par : chargement initial, polling 5s, refetch foreground, refetch sur push.
  // La déduplication via getMessageKey garantit zéro doublon ni scintillement.
  const refetchMessages = useCallback(async () => {
    if (!scopeId) return;
    try {
      const msgs = await base44.entities.Message.filter({ [scopeField]: scopeId }, "-created_date", 100);
      if (!initializedRef.current) {
        setHasOlder(msgs.length === 100);
        initializedRef.current = true;
      }
      const list = dedupeAndSortMessages(msgs || []);
      const profiles = await buildSenderProfiles(base44, list);
      const enriched = enrichMessagesWithProfiles(list, profiles);
      enriched.forEach(m => knownIdsRef.current.add(getMessageKey(m)));
      setMessages(prev => dedupeAndSortMessages([...prev, ...enriched]));
      if (document.visibilityState === 'visible' && list.length) {
        markChatRead(senderType, senderId, `${scopeField}:${scopeId}`, list[list.length - 1].created_date);
      }
    } catch (_) {}
  }, [scopeId, scopeField, senderType, senderId]);

  const loadOlder = async () => {
    if (loadingOlder || !scopeId) return;
    setLoadingOlder(true);
    try {
      const rows = await base44.entities.Message.filter({ [scopeField]: scopeId }, "-created_date", 100, messages.length);
      const profiles = await buildSenderProfiles(base44, rows);
      const container = bottomRef.current?.parentElement;
      if (container) olderScrollRef.current = { height: container.scrollHeight, top: container.scrollTop };
      rows.forEach(m => knownIdsRef.current.add(getMessageKey(m)));
      setMessages(previous => dedupeAndSortMessages([...previous, ...enrichMessagesWithProfiles(rows, profiles)]));
      setHasOlder(rows.length === 100);
    } catch {
      toast.error("Impossible de charger les anciens messages");
    } finally {
      setLoadingOlder(false);
    }
  };

  // Charger les messages existants
  useEffect(() => {
    if (!scopeId || !open) return;
    refetchMessages();
  }, [scopeId, open, refetchMessages]);

  // Subscription temps réel + son notification (WebSocket = instantané)
  useEffect(() => {
    if (!scopeId || !open) return;
    const unsub = base44.entities.Message.subscribe((event) => {
      if (event.type === "create" && event.data?.[scopeField] === scopeId) {
        // Anti-doublon : vérifier le ref
        const eventKey = getMessageKey(event.data);
        if (knownIdsRef.current.has(eventKey)) return;
        knownIdsRef.current.add(eventKey);

        const isFromMe = event.data.sender_type === senderType && event.data.sender_id === senderId;
        if (!isFromMe) {
          playNotificationSound();
          navigator.vibrate?.([200, 100, 200]);
        }
        setMessages(prev => mergeMessageList(prev, event.data));
        if (document.visibilityState === 'visible') markChatRead(senderType, senderId, `${scopeField}:${scopeId}`, event.data.created_date);
      }
    });
    return () => unsub?.();
  }, [scopeId, scopeField, open, senderType, senderId]);

  // ── Polling de sécurité 5s + refetch foreground + refetch sur push ──
  // Architecture : WebSocket (instantané) + polling 5s (filet) + foreground (resync) + push (rattrapage)
  // Le polling ne tourne QUE quand le chat est ouvert ET l'app au premier plan.
  // Aucun timer orphelin : nettoyé au démontage, au changement de course, et en arrière-plan.
  useEffect(() => {
    if (!scopeId || !open) return;

    let intervalId = null;

    const startPolling = () => {
      if (intervalId) return;
      intervalId = setInterval(refetchMessages, 5000);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // Démarrer le polling si l'app est déjà au premier plan
    if (document.visibilityState === "visible") {
      startPolling();
    }

    // Gérer le passage au premier plan / arrière-plan
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // Refetch immédiat au retour au premier plan (rattrapage)
        refetchMessages();
        // Reprendre le polling
        startPolling();
      } else {
        // Arrêter le polling en arrière-plan (économie batterie)
        stopPolling();
      }
    };

    // Refetch déclenché par un push de type nouveau_message
    // Le push peut être dispatché par le hook de notifications ou la couche native.
    const handlePushRefetch = (event) => {
      const detail = event?.detail || {};
      if (detail[scopeField] === scopeId || (!detail.course_id && !detail.conversation_id && detail.type === "nouveau_message")) {
        refetchMessages();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("silgapp:chat_refetch", handlePushRefetch);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("silgapp:chat_refetch", handlePushRefetch);
      stopPolling();
    };
  }, [scopeId, scopeField, open, refetchMessages]);

  // ── Correction scroll : scrollTop sur le conteneur du chat uniquement,
  //    JAMAIS scrollIntoView (qui fait défiler toute la page).
  //    Les mises à jour realtime/polling ne doivent pas modifier la position
  //    de scroll choisie par l'utilisateur sur la page principale. ──
  useEffect(() => {
    const container = bottomRef.current?.parentElement;
    if (container && olderScrollRef.current) {
      const saved = olderScrollRef.current;
      container.scrollTop = saved.top + container.scrollHeight - saved.height;
      olderScrollRef.current = null;
    } else if (container && followLatestRef.current) container.scrollTop = container.scrollHeight;
  }, [messages]);

  // Envoi sécurisé via la fonction backend envoyerMessage
  const sendMessage = async (msgData) => {
    if (sendingRef.current || !scopeId) return false;
    sendingRef.current = true;
    setSending(true);
    try {
      const signature = JSON.stringify(msgData);
      if (pendingSendRef.current?.signature !== signature) {
        pendingSendRef.current = { signature, id: msgData.client_message_id || buildClientMessageId(scopeId, senderType, senderId) };
      }
      const clientMessageId = pendingSendRef.current.id;
      const res = await base44.functions.invoke("envoyerMessage", {
        [scopeField]: scopeId,
        sender_type: senderType,
        sender_id: senderId,
        client_message_id: clientMessageId,
        ...msgData,
      });
      const newMsg = res?.message || res?.data?.message;
      if (!newMsg?.id) throw new Error(res?.data?.error || res?.error || "Envoi non confirmé");
      if (newMsg) {
        followLatestRef.current = true;
        // Anti-doublon : ne pas ajouter si déjà présent
        const key = getMessageKey(newMsg);
        if (!knownIdsRef.current.has(key)) {
          knownIdsRef.current.add(key);
          setMessages(prev => mergeMessageList(prev, newMsg));
        }
      }
      pendingSendRef.current = null;
      return true;
    } catch (err) {
      console.error("Erreur envoi message:", err);
      toast.error(err?.response?.data?.error || err?.message || "Message non envoyé");
      return false;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || sendingRef.current || !scopeId) return;
    const content = input.trim();
    if (await sendMessage({ content, message_type: "text" })) {
      setInput(previous => previous.trim() === content ? "" : previous);
    }
  };

  const handleAudioSend = async (audioData) => {
    return sendMessage(audioData);
  };

  const handlePhotoSend = async (e) => {
    const file = e.target.files?.[0];
    if (!file || sendingRef.current || uploadingRef.current) return;
    uploadingRef.current = true;
    setUploadingPhoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (!file_url) throw new Error('Fichier non confirmé');
      const media = { ...(file.type.startsWith("video/")
        ? { message_type: "video", video_url: file_url, content: "" }
        : { message_type: "photo", photo_url: file_url, content: "" }),
        client_message_id: buildClientMessageId(scopeId, senderType, senderId) };
      setPendingMedia(media);
      if (await sendMessage(media)) setPendingMedia(null);
    } catch (err) {
      console.error("Erreur envoi photo:", err);
      toast.error("Impossible de joindre le fichier. Veuillez le sélectionner à nouveau.");
    }
    uploadingRef.current = false;
    setUploadingPhoto(false);
    e.target.value = "";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (compact && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-white shadow-xl flex items-center justify-center hover:scale-110 transition-transform"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div data-silgapp-chat-active="true" className={`flex flex-col min-h-0 ${fullHeight ? "flex-1" : "h-[460px] rounded-2xl"} bg-[#16191d] overflow-hidden border border-white/8 shadow-sm`}>
      {/* Header */}
      <div className="p-3 bg-[#0f1216] text-white flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-bold">Messagerie SILGAPP</span>
          </div>
          {contextInfo && (
            <div className="mt-1 text-[10px] leading-4 text-white/65 space-y-0.5">
              <p className="truncate">{contextInfo.reference || "Commande"} - {contextInfo.statut || "Statut"}</p>
              <p className="truncate">Client: {contextInfo.client || "-"} - Partenaire: {contextInfo.partenaire || "-"}</p>
            </div>
          )}
        </div>
        {compact && (
          <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 bg-[#16191d]"
        onScroll={event => { const node = event.currentTarget;
          followLatestRef.current = node.scrollHeight - node.clientHeight - node.scrollTop < 80; }}>
        {hasOlder && <button type="button" onClick={loadOlder} disabled={loadingOlder}
          className="block mx-auto text-sm text-white/80 py-3 disabled:opacity-50">
          {loadingOlder ? "Chargement..." : "Messages plus anciens"}
        </button>}
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-white/50 text-center">
              Aucun message. Commencez la conversation !
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            message={msg}
            isMine={msg.sender_type === senderType && msg.sender_id === senderId}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Barre de saisie — bouton Envoyer toujours visible */}
      {pendingMedia && !sending && <button type="button" disabled={sending || uploadingPhoto}
        onClick={async () => { if (await sendMessage(pendingMedia)) setPendingMedia(null); }}
        className="flex items-center justify-center gap-2 p-2 text-sm text-white bg-[#1f2429]">
        <RotateCcw className="w-4 h-4" /> Réessayer l'envoi du fichier
      </button>}
      <div className="p-2.5 bg-[#1f2429] border-t border-white/8 flex items-end gap-1.5 safe-area-bottom">
        <AudioRecorder
          onSend={handleAudioSend}
          disabled={sending || uploadingPhoto}
          senderName={senderName}
        />
        <label className="cursor-pointer flex-shrink-0">
          <input type="file" accept="image/*,video/*" onChange={handlePhotoSend} className="hidden" disabled={sending || uploadingPhoto || !!pendingMedia} />
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
          className="h-11 w-11 sm:w-auto sm:min-w-[92px] rounded-full sm:rounded-xl bg-[#00a86b] hover:bg-[#00a86b]/90 shadow-md flex-shrink-0 disabled:opacity-60 gap-2 px-0 sm:px-4 font-black text-white"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          <span className="hidden sm:inline">Envoyer</span>
        </Button>
      </div>
    </div>
  );
}
