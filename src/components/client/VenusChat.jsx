import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { X, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

const VENUS_AVATAR = "https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/17cf522aa_file_0000000034b871f7bf133c0de0c9eb62.png";

export default function VenusChat({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    initConversation();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const initConversation = async () => {
    try {
      const conversation = await base44.agents.createConversation({
        agent_name: "venus",
        metadata: {
          name: "Conversation VENUS",
          description: "Assistance SILGAPP Externe",
        },
      });
      setConversationId(conversation.id);

      // Message de bienvenue premium
      setMessages([
        {
          role: "assistant",
          content: "Bonjour 👋 Je suis **VENUS**, votre assistante intelligente **SILGAPP**.\n\nJe suis là pour vous aider à :\n\n✨ **Créer une course** — Expédier ou recevoir un colis en quelques clics\n\n🚚 **Suivre en temps réel** — Localisez votre livreur et votre colis sur la carte\n\n📱 **QR codes** — Comprendre comment fonctionnent les codes de validation\n\n💰 **Estimations** — Connaître le prix exact avant de confirmer\n\n🚀 **Assistance 24/7** — Je suis toujours disponible pour répondre à vos questions\n\n**Comment puis-je vous aider aujourd'hui ?**",
        },
      ]);
    } catch (err) {
      console.error("Erreur initialisation conversation:", err);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !conversationId) return;

    const userMessage = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Ajouter le message utilisateur
      const conversation = await base44.agents.getConversation(conversationId);
      await base44.agents.addMessage(conversation, userMessage);

      // Récupérer la réponse de VENUS
      const updatedConversation = await base44.agents.getConversation(conversationId);
      const lastMessage = updatedConversation.messages[updatedConversation.messages.length - 1];

      if (lastMessage && lastMessage.role === "assistant") {
        setMessages((prev) => [...prev, { role: "assistant", content: lastMessage.content }]);
      }
    } catch (err) {
      console.error("Erreur envoi message:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Désolée, une erreur est survenue. Veuillez réessayer." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg h-[600px] flex flex-col animate-in zoom-in-95 duration-200 shadow-2xl">
        {/* Header Premium */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-primary via-blue-600 to-red-600 rounded-t-xl">
          <div className="flex items-center gap-3">
            <img 
              src={VENUS_AVATAR} 
              alt="VENUS" 
              className="w-12 h-12 rounded-xl object-cover shadow-lg border-2 border-white"
            />
            <div>
              <h2 className="font-black text-white text-lg">VENUS</h2>
              <p className="text-xs text-blue-100 font-medium">Assistante intelligente SILGAPP</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="bg-white/20 hover:bg-white/30 text-white rounded-xl"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-slate-50 to-white">
          {messages.map((message, idx) => (
            <div
              key={idx}
              className={cn(
                "flex gap-2",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {message.role === "assistant" && (
                <img 
                  src={VENUS_AVATAR} 
                  alt="VENUS" 
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0 shadow-md"
                />
              )}
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-3",
                  message.role === "user"
                    ? "bg-gradient-to-r from-primary to-red-600 text-white shadow-lg"
                    : "bg-white border border-slate-200 shadow-md"
                )}
              >
                <ReactMarkdown 
                  className={cn(
                    "text-sm prose prose-sm max-w-none",
                    message.role === "user" && "prose-invert"
                  )}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start gap-2">
              <img 
                src={VENUS_AVATAR} 
                alt="VENUS" 
                className="w-8 h-8 rounded-full object-cover flex-shrink-0 shadow-md"
              />
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-md">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-100"></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-200"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-white rounded-b-xl">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Posez votre question à VENUS..."
              className="flex-1 rounded-xl border-slate-200 focus:border-primary"
              disabled={loading}
            />
            <Button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="bg-gradient-to-r from-primary to-red-600 hover:from-primary/90 hover:to-red-700 rounded-xl shadow-lg"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}