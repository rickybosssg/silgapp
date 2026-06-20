import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import MessagesPage from "@/components/chat/MessagesPage";
import { Loader2 } from "lucide-react";

export default function AdminMessages() {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    base44.auth.me()
      .then((user) => {
        if (!mounted) return;
        setAdmin(user || null);
      })
      .catch(() => {
        if (!mounted) return;
        setAdmin(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="h-full min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const adminId = admin?.email || admin?.id || "admin";
  const adminName = admin?.full_name || admin?.email || "Admin SILGAPP";

  return (
    <div className="h-[calc(100vh-2rem)] bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <MessagesPage myType="admin" myId={adminId} myName={adminName} />
    </div>
  );
}
