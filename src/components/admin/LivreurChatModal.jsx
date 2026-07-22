import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X } from "lucide-react";
import SupportChatWindow from "@/components/chat/SupportChatWindow";

/**
 * Modal admin pour discuter avec un livreur (depuis la page Demandes livreurs).
 * Ouvre une conversation de support bidirectionnelle.
 */
export default function LivreurChatModal({ livreur, user, onClose }) {
  if (!livreur?.id || !user?.email) return null;

  const livreurName = `${livreur.prenom || ""} ${livreur.nom || ""}`.trim() || "Livreur";

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary to-primary/80 text-white">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold truncate">💬 {livreurName}</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat */}
        <div className="flex-1 overflow-hidden">
          <SupportChatWindow
            livreurId={livreur.id}
            livreurName={livreurName}
            myType="admin"
            myId={user.email}
            myName={user.full_name || user.email}
          />
        </div>
      </div>
    </div>
  );
}