import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Send, Loader2, MessageCircle, Camera, ImagePlus } from "lucide-react";
import ChatBubble from "@/components/chat/ChatBubble";
import AudioRecorder from "@/components/chat/AudioRecorder";
import { playNotificationSound } from "@/hooks/useSonEtVibration";

export default function ChatWindow({ courseId, senderType, senderId, senderName, clientName, livreurName, compact = false }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(!compact);
  const bottomRef = useRef(null);

  // Charger les messages existants
  useEffect(() => {
    if (!courseId || !open) return;
    base44.entities.Message.filter({ course_id: courseId }, "created_date", 100)
      .then(msgs => setMessages(msgs || []))
      .catch(() => setMessages([]));
  }, [courseId, open]);

  // Subscription temps réel + son notification
  useEffect(() => {
    if (!courseId || !open) return;
    const unsub = base44.entities.Message.subscribe((event) => {
      if (event.type === "create" && event.data?.course_id === courseId) {
        // Son + vibration si le message vient de quelqu'un d'autre
        const isFromMe = event.data.sender_type === senderType && event.data.sender_id === senderId;
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
      }
    });
    return () => unsub?.();
  }, [courseId, open, senderType, senderId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (msgData) => {
    if (sending || !courseId) return;
    setSending(true);
    try {
      await base44.entities.Message.create({
        course_id: courseId,
        sender_type: senderType,
        sender_id: senderId,
        sender_name: senderName,
        ...msgData,
      });
    } catch (err) {
      console.error("Erreur envoi message:", err);
    }
    setSending(false);
  };

  const handleSend = async () => {
    if (!input.trim() || sending || !courseId) return;
    const content = input.trim();
    setInput("");
    await sendMessage({ content, message_type: "text" });
  };

  const handleAudioSend = async (audioData) => {
    await sendMessage(audioData);
  };

  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
    <div className="flex flex-col h-[420px] bg-gray-50 rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="p-3 bg-gradient-to-r from-primary to-primary/80 text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4" />
          <span className="text-sm font-bold">Messagerie SILGAPP</span>
        </div>
        {compact && (
          <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-xs font-semibold">
            Minus
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
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

      {/* Input */}
      <div className="p-3 bg-white border-t border-gray-100 flex items-center gap-2">
        <AudioRecorder
          onSend={handleAudioSend}
          disabled={sending}
          senderName={senderName}
        />
        <label className="cursor-pointer">
          <input type="file" accept="image/*" onChange={handlePhotoSend} className="hidden" disabled={sending || uploadingPhoto} />
          <div className="h-9 w-9 rounded-full flex items-center justify-center text-gray-400 hover:text-primary hover:bg-red-50 transition-colors">
            {uploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
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