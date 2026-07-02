import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import MessagesPage from "@/components/chat/MessagesPage";
import { Loader2 } from "lucide-react";

export default function AdminMessages() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me()
      .then(u => setUser(u))
      .catch(() => setUser(null));
  }, []);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] lg:h-screen">
      <MessagesPage
        myType="admin"
        myId={user.email}
        myName={user.full_name || user.email}
      />
    </div>
  );
}