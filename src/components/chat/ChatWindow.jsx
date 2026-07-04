import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Send, Loader2, MessageCircle, ImagePlus, X } from "lucide-react";
import ChatBubble from "@/components/chat/ChatBubble";
import AudioRecorder from "@/components/chat/AudioRecorder";
import { playNotificationSound } from "@/hooks/useSonEtVibration";

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
      .then(msgs => {
        const list = msgs || [];
        knownIdsRef.current = new Set(list.map(m => m.id));
        setMessages(list);
      })
      .catch(() => setMessages([]));
  }, [courseId, open]);

  // Subscription temps réel + son notification
  useEffect(() => {
    if (!courseId || !open) return;
    const unsub = base44.entities.Message.subscribe((event) => {
      if (event.type === "create" && event.data?.course_id === courseId) {
        // Anti-doublon : vérifier le ref
        if (knownIdsRef.current.has(event.data.id)) return;
        knownIdsRef.current.add(event.data.id);

        const isFromMe = event.data.sender_type === senderType && event.data.sender_id === senderId;
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
  }, [courseId, open, senderType, senderId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Envoi sécurisé via la fonction backend envoyerMessage
  const sendMessage = async (msgData) => {
    if (sendingRef.current || !courseId) return;
    sendingRef.current = true;
    setSending(true);

    // Optimistic: afficher le message immédiatement (perçu instantané)
    const tempId = "temp_" + Date.now();
    const optimisticMsg = {
      id: tempId,
      course_id: courseId,
      sender_type: senderType,
      sender_id: senderId,
      sender_name: senderName,
      message_type: msgData.message_type || "text",
      content: msgData.content || "",
      audio_url: msgData.audio_url || null,
      photo_url: msgData.photo_url || null,
      created_date: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticMsg].sort((a, b) =>
      new Date(a.created_date) - new Date(b.created_date)
    ));

    try {
      const res = await base44.functions.invoke("envoyerMessage", {
        course_id: courseId,
        sender_type: senderType,
        sender_id: senderId,
        ...msgData,
      });
      const newMsg = res?.data?.message;
      if (newMsg) {
        knownIdsRef.current.add(newMsg.id);
        setMessages(prev => {
          const exists = prev.some(m => m.id === newMsg.id);
          if (exists) return prev.filter(m => m.id !== tempId);
          return prev.map(m => m.id === tempId ? newMsg : m);
        });
      }
    } catch (err) {
      console.error("Erreur envoi message:", err);
      setMessages(prev => prev.filter(m => m.id !== tempId));
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
    <div className="flex flex-col h-[360px] min-h-[280px] max-h-[60vh] bg-gray-50 rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="p-3 bg-gradient-to-r from-primary to-primary/80 text-white flex items-center justify-between">
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
      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm font-medium text-gray-500 text-center">Démarrez la conversation</p>
            <p className="text-xs text-gray-400 text-center">Votre message sera reçu immédiatement</p>
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
      <div className="p-3 bg-white border-t border-gray-200 flex items-center gap-2 safe-area-bottom">
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
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Votre message..."
          disabled={sending}
          className="flex-1 h-10 min-w-0 rounded-xl border border-gray-200 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30"
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