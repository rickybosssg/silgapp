import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Send, Loader2, MessageCircle, ImagePlus, X } from "lucide-react";
import ChatBubble from "@/components/chat/ChatBubble";
import AudioRecorder from "@/components/chat/AudioRecorder";
import { playNotificationSound } from "@/hooks/useSonEtVibration";
import {
  buildClientMessageId,
  buildSenderProfiles,
  dedupeAndSortMessages,
  enrichMessagesWithProfiles,
  getMessageKey,
  mergeMessageList,
} from "@/lib/chatUtils";

export default function ChatWindow({ courseId, senderType, senderId, senderName, compact = false }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(!compact);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const bottomRef = useRef(null);
  const sendingRef = useRef(false);
  const knownIdsRef = useRef(new Set());

  // Charger les messages existants
  useEffect(() => {
    if (!courseId || !open) return;
    base44.entities.Message.filter({ course_id: courseId }, "created_date", 100)
      .then(async (msgs) => {
        const list = dedupeAndSortMessages(msgs || []);
        const profiles = await buildSenderProfiles(base44, list);
        const enriched = enrichMessagesWithProfiles(list, profiles);
        knownIdsRef.current = new Set(enriched.map(getMessageKey));
        setMessages(enriched);
      })
      .catch(() => setMessages([]));
  }, [courseId, open]);

  // Subscription temps réel + son notification
  useEffect(() => {
    if (!courseId || !open) return;
    const unsub = base44.entities.Message.subscribe((event) => {
      if (event.type === "create" && event.data?.course_id === courseId) {
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
      }
    });
    return () => unsub?.();
  }, [courseId, open, senderType, senderId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Envoi sécurisé via la fonction backend envoyerMessage
  const sendMessage = async (msgData) => {
    if (sendingRef.current || !courseId) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const clientMessageId = msgData.client_message_id || buildClientMessageId(courseId, senderType, senderId);
      const res = await base44.functions.invoke("envoyerMessage", {
        course_id: courseId,
        sender_type: senderType,
        sender_id: senderId,
        client_message_id: clientMessageId,
        ...msgData,
      });
      const newMsg = res?.data?.message;
      if (newMsg) {
        // Anti-doublon : ne pas ajouter si déjà présent
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
    if (!input.trim() || sendingRef.current || !courseId) return;
    const content = input.trim();
    setInput("");
    await sendMessage({ content, message_type: "text" });
  };

  const handleAudioSend = async (audioData) => {
    await sendMessage(audioData);
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
    <div className="flex flex-col h-[460px] bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
      {/* Header */}
      <div className="p-3 bg-slate-950 text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4" />
          <span className="text-sm font-bold">Messagerie SILGAPP</span>
        </div>
        {compact && (
          <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 bg-gradient-to-b from-slate-50 to-white">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-gray-400 text-center">
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
      <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 safe-area-bottom shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
        <AudioRecorder
          onSend={handleAudioSend}
          disabled={sending}
          senderName={senderName}
        />
        <label className="cursor-pointer flex-shrink-0">
          <input type="file" accept="image/*" onChange={handlePhotoSend} className="hidden" disabled={sending || uploadingPhoto} />
          <div className="h-10 w-10 rounded-full flex items-center justify-center text-gray-500 hover:text-primary hover:bg-gray-100 transition-colors">
            {uploadingPhoto ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
          </div>
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Votre message..."
          disabled={sending}
          rows={1}
          className="flex-1 min-h-11 max-h-24 min-w-0 resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40"
        />
        <Button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="h-11 min-w-[104px] rounded-xl bg-primary hover:bg-primary/90 shadow-md flex-shrink-0 disabled:opacity-60 gap-2 px-4 font-black text-white"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          <span>Envoyer</span>
        </Button>
      </div>
    </div>
  );
}
