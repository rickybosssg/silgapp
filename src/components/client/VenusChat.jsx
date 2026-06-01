import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { X, Send, Loader2, Trash2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

const VENUS_AVATAR = "https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/17cf522aa_file_0000000034b871f7bf133c0de0c9eb62.png";

const WELCOME_MESSAGE = {
  role: "assistant",
  content: "Bonjour 👋 Je suis **VENUS**, votre assistante intelligente **SILGAPP**.\n\n❤️ *Plus qu'un service, une promesse* ❤️\n\nJe suis là pour vous aider à :\n\n✨ **Créer une course** — Expédier ou recevoir un colis\n\n🚚 **Suivre en temps réel** — Localisez votre livreur sur la carte\n\n📱 **QR codes & PIN** — Validation de récupération et livraison\n\n💰 **Prix transparent** — 100 F/km, calculé automatiquement\n\n📞 **Support** — +226 66 92 51 90\n\n**Comment puis-je vous aider aujourd'hui ?**",
};

function getStorageKey(userEmail) {
  return `venus_conv_${userEmail || "anonymous"}`;
}

function loadSavedConvId(userEmail) {
  try {
    return localStorage.getItem(getStorageKey(userEmail)) || null;
  } catch {
    return null;
  }
}

function saveConvId(userEmail, convId) {
  try {
    localStorage.setItem(getStorageKey(userEmail), convId);
  } catch {}
}

function clearConvId(userEmail) {
  try {
    localStorage.removeItem(getStorageKey(userEmail));
  } catch {}
}

export default function VenusChat({ onClose }) {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [conversationId, setConversationId] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const messagesEndRef = useRef(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    initConversation();
    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const buildMessages = (rawMessages) => {
    const rebuilt = [WELCOME_MESSAGE];
    rawMessages.forEach((m) => {
      if (m.role === "user" || m.role === "assistant") {
        rebuilt.push({ role: m.role, content: m.content });
      }
    });
    return rebuilt;
  };

  const subscribeToConv = (convId) => {
    if (unsubscribeRef.current) unsubscribeRef.current();
    unsubscribeRef.current = base44.agents.subscribeToConversation(convId, (data) => {
      if (data.messages && data.messages.length > 0) {
        setMessages(buildMessages(data.messages));
        setLoading(false);
      }
    });
  };

  const initConversation = async () => {
    setInitializing(true);
    try {
      // Récupérer l'email utilisateur pour clé de stockage
      let email = null;
      try {
        const user = await base44.auth.me();
        email = user?.email || null;
      } catch {}
      setUserEmail(email);

      // Chercher une conversation sauvegardée
      const savedConvId = loadSavedConvId(email);

      if (savedConvId) {
        // Tenter de recharger la conversation existante
        try {
          const existing = await base44.agents.getConversation(savedConvId);
          if (existing && existing.id) {
            setConversationId(existing.id);
            if (existing.messages && existing.messages.length > 0) {
              setMessages(buildMessages(existing.messages));
            }
            subscribeToConv(existing.id);
            setInitializing(false);
            return;
          }
        } catch {
          // Conversation expirée ou introuvable → en créer une nouvelle
          clearConvId(email);
        }
      }

      // Créer une nouvelle conversation
      const conversation = await base44.agents.createConversation({
        agent_name: "venus",
        metadata: { name: "Conversation VENUS", description: "Assistance SILGAPP" },
      });
      setConversationId(conversation.id);
      saveConvId(email, conversation.id);
      subscribeToConv(conversation.id);
    } catch (err) {
      console.error("Erreur init conversation VENUS:", err);
    }
    setInitializing(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !conversationId) return;

    const userMsg = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const conversation = await base44.agents.getConversation(conversationId);
      await base44.agents.addMessage(conversation, userMsg);
    } catch (err) {
      console.error("Erreur envoi message:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Désolée, une erreur est survenue. Veuillez réessayer." },
      ]);
      setLoading(false);
    }
  };

  const handleClearHistory = async () => {
    setShowClearConfirm(false);
    if (unsubscribeRef.current) unsubscribeRef.current();
    clearConvId(userEmail);
    setConversationId(null);
    setMessages([WELCOME_MESSAGE]);
    // Créer une toute nouvelle conversation
    try {
      const conversation = await base44.agents.createConversation({
        agent_name: "venus",
        metadata: { name: "Conversation VENUS", description: "Assistance SILGAPP" },
      });
      setConversationId(conversation.id);
      saveConvId(userEmail, conversation.id);
      subscribeToConv(conversation.id);
    } catch (err) {
      console.error("Erreur reset conversation:", err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg h-[600px] flex flex-col animate-in zoom-in-95 duration-200 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-primary via-blue-600 to-red-600">
          <div className="flex items-center gap-3">
            <img src={VENUS_AVATAR} alt="VENUS" className="w-12 h-12 rounded-xl object-cover shadow-lg border-2 border-white" />
            <div>
              <h2 className="font-black text-white text-lg leading-tight">VENUS</h2>
              <p className="text-xs text-white/80 font-medium">
                {initializing ? "Chargement de la mémoire..." : "Assistante intelligente SILGAPP"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Bouton supprimer l'historique */}
            <Button
              variant="ghost"
              size="icon"
              className="bg-white/10 hover:bg-white/20 text-white rounded-xl w-8 h-8"
              title="Supprimer l'historique"
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="bg-white/20 hover:bg-white/30 text-white rounded-xl" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Confirmation suppression historique */}
        {showClearConfirm && (
          <div className="p-3 bg-red-50 border-b border-red-200 flex items-center gap-2">
            <p className="text-xs text-red-700 flex-1">🗑️ Supprimer tout l'historique VENUS ?</p>
            <Button size="sm" variant="destructive" className="h-7 text-xs px-2" onClick={handleClearHistory}>
              Confirmer
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setShowClearConfirm(false)}>
              Annuler
            </Button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-slate-50 to-white">
          {initializing ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                <p className="text-sm text-muted-foreground">Restauration de la mémoire VENUS...</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, idx) => (
                <div key={idx} className={cn("flex gap-2", message.role === "user" ? "justify-end" : "justify-start")}>
                  {message.role === "assistant" && (
                    <img src={VENUS_AVATAR} alt="VENUS" className="w-8 h-8 rounded-full object-cover flex-shrink-0 shadow-md" />
                  )}
                  <div className={cn(
                    "max-w-[75%] rounded-2xl px-4 py-3 text-sm",
                    message.role === "user"
                      ? "bg-gradient-to-r from-primary to-red-600 text-white shadow-lg"
                      : "bg-white border border-slate-200 shadow-md"
                  )}>
                    <ReactMarkdown className={cn("prose prose-sm max-w-none", message.role === "user" && "prose-invert")}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}

              {/* Indicateur de frappe */}
              {loading && (
                <div className="flex justify-start gap-2">
                  <img src={VENUS_AVATAR} alt="VENUS" className="w-8 h-8 rounded-full object-cover flex-shrink-0 shadow-md" />
                  <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-md">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t bg-white">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez votre question à VENUS..."
              className="flex-1 rounded-xl border-slate-200 focus:border-primary"
              disabled={loading || initializing}
            />
            <Button
              onClick={sendMessage}
              disabled={loading || initializing || !input.trim()}
              className="bg-gradient-to-r from-primary to-red-600 hover:opacity-90 rounded-xl shadow-lg"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>

      </Card>
    </div>
  );
}