import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { X, Send, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

const VENUS_AVATAR = "https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/17cf522aa_file_0000000034b871f7bf133c0de0c9eb62.png";

const buildWelcomeMessage = (countryContext) => {
  if (!countryContext || !countryContext.code) {
    return {
      role: "assistant",
      content: "Bonjour 👋 Je suis **VENUS**, votre assistante intelligente **SILGAPP**.\n\n❤️ *Plus qu'un service, une promesse* ❤️\n\nSILGAPP est disponible dans **8 pays d'Afrique de l'Ouest** :\n🇧🇫 Burkina Faso · 🇨🇮 Côte d'Ivoire · 🇹🇬 Togo · 🇧🇯 Bénin · 🇸🇳 Sénégal · 🇲🇱 Mali · 🇬🇳 Guinée · 🇳🇪 Niger\n\nJe suis là pour vous aider à :\n\n✨ **Créer une course** — Expédier ou recevoir un colis\n🚚 **Suivre en temps réel** — Localisez votre livreur sur la carte\n📱 **QR codes & PIN** — Validation de récupération et livraison\n💰 **Prix adapté à votre pays** — Calculé automatiquement selon votre localisation\n📞 **Support** — +226 66 92 51 90\n\n**Dans quel pays êtes-vous ? Comment puis-je vous aider ?**",
    };
  }

  const { code, nom, ville, devise, prix_par_km, prix_minimum, commission_pct, indicatif, livreursDispos, pubsActives } = countryContext;
  const gainLivreur = 100 - (commission_pct || 30);

  return {
    role: "assistant",
    content: `Bonjour 👋 Je suis **VENUS**, votre assistante SILGAPP pour **${nom || code}** ${countryContext.emoji || "🌍"}\n\n❤️ *Plus qu'un service, une promesse* ❤️\n\n🌍 **Pays actif : ${nom || code} (${code})**\n📍 **Ville principale : ${ville || "N/D"}**\n📞 **Indicatif : ${indicatif || "N/D"}**\n\n💰 **Tarifs ${code} :**\n- Prix/km : **${prix_par_km || "N/D"} ${devise || "FCFA"}**\n- Minimum course : **${prix_minimum || 1000} ${devise || "FCFA"}**\n- Commission SILGAPP : **${commission_pct || 30}%** | Gain livreur : **${gainLivreur}%**\n\n🚚 **Réseau actuel à ${ville || code} :**\n- Livreurs disponibles : **${livreursDispos ?? "N/D"}**${pubsActives > 0 ? `\n- Offres actives dans votre pays : **${pubsActives}**` : ""}\n\nJe réponds **uniquement** aux questions concernant **${nom || code}**. Pour un autre pays, demandez-moi de changer de contexte.\n\n**Comment puis-je vous aider aujourd'hui ?**`,
  };
};

const DEFAULT_WELCOME = buildWelcomeMessage(null);

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

export default function VenusChat({ onClose, countryContext }) {
  const welcomeMessage = countryContext?.code ? buildWelcomeMessage(countryContext) : DEFAULT_WELCOME;
  const [messages, setMessages] = useState([welcomeMessage]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [conversationId, setConversationId] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const messagesEndRef = useRef(null);
  const unsubscribeRef = useRef(null);

  // Réinitialiser le message de bienvenue si le pays change
  useEffect(() => {
    setMessages(prev => {
      if (prev.length === 1 && prev[0].role === "assistant") {
        return [countryContext?.code ? buildWelcomeMessage(countryContext) : DEFAULT_WELCOME];
      }
      return prev;
    });
  }, [countryContext?.code]);

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
    const rebuilt = [welcomeMessage];
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

      // Créer une nouvelle conversation avec contexte pays
      const contextMeta = countryContext?.code ? {
        name: `Conversation VENUS — ${countryContext.nom || countryContext.code}`,
        description: `Assistance SILGAPP | Pays actif: ${countryContext.code} | Ville: ${countryContext.ville || "N/D"} | Devise: ${countryContext.devise || "FCFA"}`,
        country_code: countryContext.code,
        country_nom: countryContext.nom,
        ville: countryContext.ville,
        devise: countryContext.devise,
        prix_par_km: countryContext.prix_par_km,
        prix_minimum: countryContext.prix_minimum,
        indicatif: countryContext.indicatif,
        livreurs_dispos: countryContext.livreursDispos,
      } : { name: "Conversation VENUS", description: "Assistance SILGAPP" };

      const conversation = await base44.agents.createConversation({
        agent_name: "venus",
        metadata: contextMeta,
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

    const userQuestion = input.trim();
    const userMsg = { role: "user", content: userQuestion };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    const msgStartTime = Date.now();

    try {
      const conversation = await base44.agents.getConversation(conversationId);
      await base44.agents.addMessage(conversation, userMsg);

      // Enregistrer l'interaction pour les rapports VENUS (fire & forget)
      const nbMessages = messages.filter(m => m.role === "user").length + 1;
      base44.functions.invoke("venusAnalytics", {
        action: "save_interaction",
        conversation_id: conversationId,
        user_id: userEmail || "anonymous",
        user_type: "client",
        country_code: countryContext?.code || "BF",
        ville: countryContext?.ville || "",
        question: userQuestion,
        reponse: "",
        nb_messages: nbMessages,
        duree_secondes: Math.round((Date.now() - msgStartTime) / 1000),
      }).catch(() => null); // silencieux
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
    setMessages([welcomeMessage]);
    // Créer une toute nouvelle conversation
    try {
      const contextMeta = countryContext?.code ? {
        name: `Conversation VENUS — ${countryContext.nom || countryContext.code}`,
        description: `Assistance SILGAPP | Pays actif: ${countryContext.code}`,
        country_code: countryContext.code,
      } : { name: "Conversation VENUS", description: "Assistance SILGAPP" };
      const conversation = await base44.agents.createConversation({
        agent_name: "venus",
        metadata: contextMeta,
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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg h-[600px] flex flex-col shadow-2xl overflow-hidden rounded-2xl bg-white" style={{backgroundColor: '#ffffff'}}>

        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-primary via-blue-600 to-red-600">
          <div className="flex items-center gap-3">
            <img src={VENUS_AVATAR} alt="VENUS" className="w-12 h-12 rounded-xl object-cover shadow-lg border-2 border-white" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-white text-lg leading-tight">VENUS</h2>
                {countryContext?.code && (
                  <span className="text-[10px] font-bold bg-white/20 text-white px-2 py-0.5 rounded-full border border-white/30">
                    🌍 {countryContext.code}
                  </span>
                )}
              </div>
              <p className="text-xs text-white font-semibold">
                {initializing ? "Chargement de la mémoire..." : countryContext?.ville ? `Assistante locale — ${countryContext.ville}` : "Assistante intelligente SILGAPP"}
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
        <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{backgroundColor: '#f3f4f6'}}>
          {initializing ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                <p className="text-sm text-gray-700 font-medium">Restauration de la mémoire VENUS...</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, idx) => (
                <div key={idx} className={cn("flex gap-2", message.role === "user" ? "justify-end" : "justify-start")}>
                  {message.role === "assistant" && (
                    <img src={VENUS_AVATAR} alt="VENUS" className="w-8 h-8 rounded-full object-cover flex-shrink-0 shadow-md" />
                  )}
                  <div
                    className="max-w-[75%] rounded-2xl px-4 py-3"
                    style={message.role === "user" ? {
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      fontSize: '15px',
                      lineHeight: '1.5',
                      fontWeight: '500',
                    } : {
                      backgroundColor: '#ffffff',
                      color: '#111827',
                      fontSize: '15px',
                      lineHeight: '1.5',
                      border: '1px solid #d1d5db',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    }}
                  >
                  <ReactMarkdown
                    components={{
                      p: ({children}) => <p style={{color: message.role === 'user' ? '#ffffff' : '#111827', margin: '2px 0', fontSize: '15px'}}>{children}</p>,
                      strong: ({children}) => <strong style={{color: message.role === 'user' ? '#ffffff' : '#111827', fontWeight: '700'}}>{children}</strong>,
                      em: ({children}) => <em style={{color: message.role === 'user' ? '#ffe4e4' : '#374151'}}>{children}</em>,
                      li: ({children}) => <li style={{color: message.role === 'user' ? '#ffffff' : '#111827', fontSize: '15px'}}>{children}</li>,
                      a: ({children, href}) => <a href={href} style={{color: message.role === 'user' ? '#fecaca' : '#dc2626'}}>{children}</a>,
                    }}
                  >
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
        <div className="p-4 border-t" style={{backgroundColor: '#ffffff'}}>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez votre question à VENUS..."
              disabled={loading || initializing}
              style={{
                flex: 1,
                height: '44px',
                borderRadius: '12px',
                border: '1.5px solid #d1d5db',
                padding: '0 14px',
                fontSize: '15px',
                color: '#111827',
                backgroundColor: '#ffffff',
                outline: 'none',
              }}
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

      </div>
    </div>
  );
}