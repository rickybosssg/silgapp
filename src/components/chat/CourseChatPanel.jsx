import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Loader2, MessageCircle, ImagePlus } from "lucide-react";
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

/**
 * CourseChatPanel — Vue messagerie plein écran d'une course.
 * Charge et envoie des messages avec `course_id` (même fil que ChatWindow).
 * Utilisé par l'admin depuis MessagesPage (?course=<id>).
 * Le client et le livreur utilisent ChatWindow (embarqué dans CourseActiveCard).
 */
export default function CourseChatPanel({ courseId, myType, myId, myName, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [courseInfo, setCourseInfo] = useState(null);
  const bottomRef = useRef(null);
  const sendingRef = useRef(false);
  const knownIdsRef = useRef(new Set());

  // Charger les messages existants + infos course
  useEffect(() => {
    if (!courseId) return;
    base44.entities.Message.filter({ course_id: courseId }, "created_date", 100)
      .then(async (msgs) => {
        const list = dedupeAndSortMessages(msgs || []);
        const profiles = await buildSenderProfiles(base44, list);
        const enriched = enrichMessagesWithProfiles(list, profiles);
        knownIdsRef.current = new Set(enriched.map(getMessageKey));
        setMessages(enriched);
      })
      .catch(() => setMessages([]));
    base44.entities.CourseExterne.get(courseId)
      .then(c => setCourseInfo(c))
      .catch(() => {});
  }, [courseId]);

  // Subscription temps réel
  useEffect(() => {
    if (!courseId) return;
    const unsub = base44.entities.Message.subscribe((event) => {
      if (event.type === "create" && event.data?.course_id === courseId) {
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
  }, [courseId, myType, myId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (msgData) => {
    if (sendingRef.current || !courseId) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const clientMessageId = msgData.client_message_id || buildClientMessageId(courseId, myType, myId);
      const res = await base44.functions.invoke("envoyerMessage", {
        course_id: courseId,
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
    if (!input.trim() || sendingRef.current || !courseId) return;
    const content = input.trim();
    setInput("");
    await sendMessage({ content, message_type: "text" });
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

  const courseLabel = courseInfo
    ? `${courseInfo.client_nom || "Client"} — ${courseInfo.adresse_depart || ""} → ${courseInfo.adresse_arrivee || ""}`
    : `Course #${courseId?.slice(-6)}`;

  return (
    <div className="flex flex-col h-full bg-[#16191d]">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 bg-[#0f1216] text-white">
        <button onClick={onBack} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <MessageCircle className="w-4 h-4 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-sm font-bold truncate block">Messagerie course</span>
          <span className="text-[10px] text-white/50 truncate block">{courseLabel}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 bg-[#16191d]">
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
            isMine={msg.sender_type === myType && msg.sender_id === myId}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Barre de saisie */}
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