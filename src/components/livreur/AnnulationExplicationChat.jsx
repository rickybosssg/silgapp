import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Send, Loader2, MessageCircle, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const MOTIF_LABELS = {
  client_injoignable: "Client injoignable",
  mauvaise_adresse: "Mauvaise adresse",
  colis_inexistant: "Colis inexistant",
  client_change_avis: "Client a changé d'avis",
  colis_interdit: "Colis interdit",
  panne_vehicule: "Panne de véhicule",
  accident: "Accident",
  autre: "Autre",
};

export default function AnnulationExplicationChat({
  course,
  livreurId,
  livreurNom,
  motif,
  motifDetail,
  onClose,
}) {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contextSent, setContextSent] = useState(false);
  const bottomRef = useRef(null);
  const knownIdsRef = useRef(new Set());

  // ── Créer ou trouver la conversation avec l'admin ──
  useEffect(() => {
    const init = async () => {
      try {
        const participants = [
          { type: "livreur", id: livreurId, name: livreurNom },
          { type: "admin", id: "admin", name: "Admin SILGAPP" },
        ];

        // Chercher une conversation existante avec l'admin
        const existing = await base44.entities.Conversation.list();
        const found = existing.find((c) => {
          try {
            const parts = JSON.parse(c.participants || "[]");
            const ids = parts
              .map((p) => `${p.type}:${p.id}`)
              .sort()
              .join(",");
            const newIds = participants
              .map((p) => `${p.type}:${p.id}`)
              .sort()
              .join(",");
            return ids === newIds;
          } catch {
            return false;
          }
        });

        if (found) {
          setConversationId(found.id);
        } else {
          const conv = await base44.entities.Conversation.create({
            participants: JSON.stringify(participants),
            group_type: "direct",
            title: `Annulation course #${(course.id || "").slice(-6)}`,
          });
          setConversationId(conv.id);
        }
      } catch (err) {
        console.error("Erreur init conversation annulation:", err);
      }
      setLoading(false);
    };
    init();
  }, []);

  // ── Envoyer le message de contexte automatiquement ──
  useEffect(() => {
    if (!conversationId || contextSent) return;
    const motifLabel = MOTIF_LABELS[motif] || motif || "Non spécifié";
    const trajet = `${course.adresse_depart || "?"} → ${course.adresse_arrivee || "?"}`;
    const contextMsg = `🛑 *Annulation de course*\n\nTrajet: ${trajet}\nMotif: ${motifLabel}${motifDetail ? `\nDétail: ${motifDetail}` : ""}`;

    base44.functions
      .invoke("envoyerMessage", {
        conversation_id: conversationId,
        sender_type: "livreur",
        sender_id: livreurId,
        content: contextMsg,
        message_type: "text",
      })
      .then((res) => {
        const msg = res?.data?.message;
        if (msg) {
          knownIdsRef.current.add(msg.id);
          setMessages((prev) => [...prev, msg]);
        }
      })
      .catch((err) => console.error("Erreur envoi contexte:", err));
    setContextSent(true);
  }, [conversationId, contextSent]);

  // ── Charger les messages existants ──
  useEffect(() => {
    if (!conversationId) return;
    base44.entities.Message.filter({ conversation_id: conversationId }, "created_date", 100)
      .then((msgs) => {
        const list = msgs || [];
        knownIdsRef.current = new Set(list.map((m) => m.id));
        setMessages(list);
      })
      .catch(() => setMessages([]));
  }, [conversationId]);

  // ── Souscription temps réel ──
  useEffect(() => {
    if (!conversationId) return;
    const unsub = base44.entities.Message.subscribe((event) => {
      if (event.type === "create" && event.data?.conversation_id === conversationId) {
        if (knownIdsRef.current.has(event.data.id)) return;
        knownIdsRef.current.add(event.data.id);
        setMessages((prev) =>
          [...prev, event.data].sort((a, b) => new Date(a.created_date) - new Date(b.created_date))
        );
      }
    });
    return () => unsub?.();
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending || !conversationId) return;
    setSending(true);
    try {
      const res = await base44.functions.invoke("envoyerMessage", {
        conversation_id: conversationId,
        sender_type: "livreur",
        sender_id: livreurId,
        content: input.trim(),
        message_type: "text",
      });
      const msg = res?.data?.message;
      if (msg) {
        knownIdsRef.current.add(msg.id);
        setMessages((prev) => [...prev, msg]);
      }
      setInput("");
    } catch (err) {
      console.error("Erreur envoi message:", err);
    }
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 bg-gradient-to-r from-red-500 to-red-600 text-white safe-area-top">
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <Shield className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">Admin SILGAPP</p>
          <p className="text-[11px] text-white/70 truncate">
            Explication — Annulation course #{(course.id || "").slice(-6)}
          </p>
        </div>
      </div>

      {/* Bandeau d'information */}
      <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100">
        <p className="text-xs text-amber-800 font-medium">
          💬 Expliquez à l'admin pourquoi vous avez annulé cette course, puis appuyez sur Terminer.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 bg-gray-50 space-y-2">
        {messages.map((msg) => {
          const isMine = msg.sender_type === "livreur" && msg.sender_id === livreurId;
          return (
            <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
                  isMine
                    ? "bg-primary text-white rounded-br-sm"
                    : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
                )}
              >
                {msg.content}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Barre de saisie */}
      <div className="p-3 bg-white border-t border-gray-200 flex items-center gap-2 safe-area-bottom">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Votre explication..."
          disabled={sending}
          className="flex-1 h-11 min-w-0 rounded-xl border border-gray-200 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="h-11 w-11 rounded-xl bg-primary hover:bg-primary/90 text-white flex items-center justify-center shadow-md flex-shrink-0 disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>

      {/* Bouton Terminer */}
      <div className="p-3 bg-white border-t border-gray-100 safe-area-bottom">
        <button
          onClick={onClose}
          className="w-full h-12 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-sm transition-colors"
        >
          Terminer
        </button>
      </div>
    </div>
  );
}