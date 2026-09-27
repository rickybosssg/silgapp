import React, { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { Loader2, MessageSquare, X, MapPin, FileText, Play } from "lucide-react";

/**
 * EnterpriseCourseMessages — Supervision LECTURE SEULE de la messagerie
 * d'une course Enterprise par l'admin de l'agence.
 *
 * - Appelle getEnterpriseCourseMessages (backend, asServiceRole, vérif tenant).
 * - Aucun champ de saisie, aucun bouton d'envoi, aucun média upload.
 * - Ne modifie aucun participant_user_ids, ne crée aucun message.
 */
export default function EnterpriseCourseMessages({ courseId, open, onClose }) {
  const [messages, setMessages] = useState([]);
  const [courseInfo, setCourseInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadMessages = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("getEnterpriseCourseMessages", { course_id: courseId });
      const data = res?.data || res;
      setMessages(data?.messages || []);
      setCourseInfo(data?.course || null);
    } catch (err) {
      setError(err?.message || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (open && courseId) {
      loadMessages();
    }
  }, [open, courseId, loadMessages]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare className="w-4 h-4 text-blue-600 shrink-0" />
              <div className="min-w-0">
                <DialogTitle className="text-sm truncate">Messagerie course</DialogTitle>
                {courseInfo && (
                  <p className="text-[10px] text-gray-500 truncate">
                    {courseInfo.client_nom || "Client"} · {courseInfo.livreur_nom || "Non assigné"}
                  </p>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          {courseInfo && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-50 text-blue-600">
                {courseInfo.statut || "—"}
              </span>
              {courseInfo.prix_final > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-600">
                  {courseInfo.prix_final.toLocaleString("fr-FR")} {courseInfo.devise || "FCFA"}
                </span>
              )}
            </div>
          )}
        </DialogHeader>

        {/* Badge lecture seule */}
        <div className="px-4 py-1.5 bg-amber-50 border-b shrink-0">
          <span className="text-[10px] font-semibold text-amber-700">👁️ Supervision en lecture seule</span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-sm text-red-500">{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={loadMessages}>
                Réessayer
              </Button>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Aucun message dans cette conversation</p>
            </div>
          ) : (
            messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MessageBubble({ message }) {
  const isSystem = message.sender_type === "admin" && message.sender_id === "silgapp_system";
  const isVenus = message.sender_id === "venus";
  const isLivreur = message.sender_type === "livreur";
  const isClient = message.sender_type === "client";

  const align = isSystem || isVenus ? "center" : isLivreur ? "start" : isClient ? "end" : "start";
  const bubbleClass =
    isSystem || isVenus
      ? "bg-gray-100 text-gray-600 text-center text-[11px] italic"
      : isLivreur
      ? "bg-white border text-gray-900"
      : isClient
      ? "bg-blue-500 text-white"
      : "bg-gray-200 text-gray-900";

  const time = message.created_date
    ? new Date(message.created_date).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
    : "";

  const senderLabel = isSystem ? "SILGAPP" : isVenus ? "VENUS" : message.sender_name || message.sender_type || "—";

  return (
    <div className={`flex flex-col ${align === "end" ? "items-end" : align === "center" ? "items-center" : "items-start"}`}>
      <div className={`max-w-[85%] rounded-xl px-3 py-2 ${bubbleClass}`}>
        {/* Sender label (sauf pour messages système centrés) */}
        {!isSystem && !isVenus && (
          <p className="text-[9px] font-bold opacity-70 mb-0.5">{senderLabel}</p>
        )}

        {/* Content by type */}
        {message.message_type === "text" && message.content && (
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        )}

        {message.message_type === "photo" && message.photo_url && (
          <img src={message.photo_url} alt="Photo" className="rounded-lg max-w-full max-h-48 object-cover" />
        )}

        {message.message_type === "audio" && message.audio_url && (
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4" />
            <span className="text-sm">Message vocal</span>
          </div>
        )}

        {message.message_type === "video" && message.video_url && (
          <video src={message.video_url} controls className="rounded-lg max-w-full max-h-48" />
        )}

        {message.message_type === "document" && message.document_url && (
          <a href={message.document_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm underline">
            <FileText className="w-4 h-4" /> Document
          </a>
        )}

        {message.message_type === "location" && message.location_lat != null && message.location_lng != null && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4" />
            <span>Position : {message.location_lat.toFixed(5)}, {message.location_lng.toFixed(5)}</span>
          </div>
        )}
      </div>

      {/* Timestamp */}
      {time && (
        <span className="text-[9px] text-gray-400 mt-0.5 px-1">{time}</span>
      )}
    </div>
  );
}