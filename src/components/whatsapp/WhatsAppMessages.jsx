import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import WhatsAppConversationList from "./WhatsAppConversationList";
import WhatsAppChatWindow from "./WhatsAppChatWindow";
import { Loader2 } from "lucide-react";

export default function WhatsAppMessages({ myEmail, myName }) {
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const reloadTimer = useRef(null);

  const loadConversations = async () => {
    try {
      const all = await base44.entities.Conversation.list("-last_message_date", 200);
      const waConvs = (all || []).filter(c => c.source === "whatsapp");
      setConversations(waConvs);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    const unsub = base44.entities.Conversation.subscribe(() => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => loadConversations(), 1500);
    });
    return () => { unsub?.(); if (reloadTimer.current) clearTimeout(reloadTimer.current); };
  }, []);

  const filtered = conversations.filter(c => {
    if (search) {
      const s = search.toLowerCase();
      const matchesName = (c.title || "").toLowerCase().includes(s);
      const matchesPhone = (c.whatsapp_phone || "").includes(s);
      if (!matchesName && !matchesPhone) return false;
    }
    if (filterCountry && c.country_code !== filterCountry) return false;
    if (filterStatus === "venus" && !c.venus_active) return false;
    if (filterStatus === "admin" && c.venus_active) return false;
    if (filterStatus === "archived" && !c.archived) return false;
    if (filterStatus === "active" && c.archived) return false;
    return true;
  });

  const handleConvUpdate = (updatedConv) => {
    setConversations(prev => prev.map(c => c.id === updatedConv.id ? { ...c, ...updatedConv } : c));
    setActiveConv(prev => prev?.id === updatedConv.id ? { ...prev, ...updatedConv } : prev);
  };

  return (
    <div className="flex h-full">
      <div className={`${activeConv ? "hidden md:flex" : "flex"} flex-col w-full md:w-96 border-r border-gray-200 bg-white`}>
        <WhatsAppConversationList
          conversations={filtered}
          activeConvId={activeConv?.id}
          onSelect={setActiveConv}
          search={search}
          setSearch={setSearch}
          filterCountry={filterCountry}
          setFilterCountry={setFilterCountry}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          loading={loading}
        />
      </div>
      <div className={`${activeConv ? "flex" : "hidden md:flex"} flex-col flex-1 bg-gray-50`}>
        {activeConv ? (
          <WhatsAppChatWindow
            conv={activeConv}
            myEmail={myEmail}
            myName={myName}
            onBack={() => setActiveConv(null)}
            onConvUpdate={handleConvUpdate}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p className="text-sm">Selectionnez une conversation</p>
          </div>
        )}
      </div>
    </div>
  );
}