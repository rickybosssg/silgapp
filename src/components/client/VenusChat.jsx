import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

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

      // Message de bienvenue
      setMessages([
        {
          role: "assistant",
          content: "👋 Bonjour ! Je suis VENUS, votre assistante SILGAPP Externe 🚚\n\nJe peux vous aider à :\n• Créer une course (expédier/recevoir un colis)\n• Suivre votre livraison en temps réel\n• Obtenir des infos sur votre livreur\n• Comprendre le fonctionnement des QR codes\n• Estimer le prix de votre course\n\nComment puis-je vous aider aujourd'hui ?",
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
      <Card className="w-full max-w-lg h-[600px] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-primary to-red-600 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-white">VENUS</h2>
              <p className="text-xs text-white/80">Assistante SILGAPP Externe</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="bg-white/20 hover:bg-white/30 text-white"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white">
          {messages.map((message, idx) => (
            <div
              key={idx}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-white border border-border shadow-sm"
                )}
              >
                <ReactMarkdown className="text-sm prose prose-sm max-w-none">
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-border rounded-2xl px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  <span className="text-sm text-muted-foreground">VENUS écrit...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-white">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Posez votre question..."
              className="flex-1"
              disabled={loading}
            />
            <Button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="bg-primary hover:bg-primary/90"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}