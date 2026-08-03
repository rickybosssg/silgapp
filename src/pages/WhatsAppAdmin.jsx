import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import WhatsAppMessages from "@/components/whatsapp/WhatsAppMessages";
import { Loader2 } from "lucide-react";

export default function WhatsAppAdmin() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me()
      .then(u => setUser(u))
      .catch(() => setUser(null));
  }, []);

  // Marquer toutes les conversations WhatsApp comme lues à l'ouverture
  useEffect(() => {
    if (!user) return;
    const markAllRead = async () => {
      try {
        const all = await base44.entities.Conversation.list("-last_message_date", 200);
        const waConvs = (all || []).filter(c => c.source === "whatsapp");
        const now = new Date().toISOString();
        await Promise.all(
          waConvs
            .filter(c => {
              if (c.last_sender_type === "admin") return false;
              if (!c.last_message_date) return false;
              if (!c.admin_last_read_date) return true;
              return new Date(c.last_message_date) > new Date(c.admin_last_read_date);
            })
            .map(c => base44.entities.Conversation.update(c.id, { admin_last_read_date: now }).catch(() => null))
        );
      } catch (_) {}
    };
    markAllRead();
  }, [user]);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] lg:h-screen">
      <WhatsAppMessages
        myEmail={user.email}
        myName={user.full_name || user.email}
      />
    </div>
  );
}