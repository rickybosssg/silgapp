import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const VENUS_AVATAR = "https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/17cf522aa_file_0000000034b871f7bf133c0de0c9eb62.png";

const SUGGESTIONS = [
  "Qui me doit le plus ?",
  "Combien avons-nous encaissé aujourd'hui ?",
  "Compare avec hier",
  "Montre-moi les 5 meilleurs livreurs",
  "Quelle course pose problème ?",
  "Et la semaine dernière ?",
];

export default function VenusAdminChat() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Bonjour Eric. Je peux répondre à vos questions sur l'activité du jour, les rapports, les livreurs, les paiements et les courses en cours. Que souhaitez-vous savoir ?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const sendMessage = async (text) => {
    const content = (text || input).trim();
    if (!content || isLoading) return;

    const userMessage = { role: "user", content };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const result = await base44.functions.invoke("venusAdminChat", {
        message: content,
        history: messages.map(m => ({ role: m.role, content: m.content })),
        country_code: "ALL",
      });

      const reply = result?.success
        ? result.response
        : "Désolé Eric, je n'ai pas pu traiter votre demande pour le moment.";

      setMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages([...newMessages, { role: "assistant", content: "Une erreur est survenue. Réessayez dans un instant." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex gap-2", msg.role === "user" && "flex-row-reverse")}>
            {msg.role === "assistant" && (
              <img src={VENUS_AVATAR} alt="VENUS" className="w-7 h-7 rounded-lg object-cover flex-shrink-0 mt-0.5" />
            )}
            <div className={cn(
              "max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
              msg.role === "user"
                ? "bg-primary text-white rounded-tr-sm"
                : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm"
            )}>
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2">
            <img src={VENUS_AVATAR} alt="VENUS" className="w-7 h-7 rounded-lg object-cover flex-shrink-0 mt-0.5" />
            <div className="bg-white border border-slate-200 rounded-xl rounded-tl-sm px-3 py-2 shadow-sm">
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            </div>
          </div>
        )}
      </div>

      {/* Suggestions rapides */}
      {messages.length <= 1 && !isLoading && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="text-[11px] font-medium text-primary bg-primary/5 border border-primary/20 rounded-full px-2.5 py-1 hover:bg-primary/10 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t bg-white flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Posez votre question..."
          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          disabled={isLoading}
        />
        <Button size="icon" onClick={() => sendMessage()} disabled={isLoading || !input.trim()} className="rounded-lg flex-shrink-0">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}