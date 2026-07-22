import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Truck, MessageCircle, X, Phone } from "lucide-react";
import { clearPersistedToken } from "@/lib/authPersistence";
import SupportChatWindow from "@/components/chat/SupportChatWindow";

/**
 * Écran affiché quand le compte livreur est bloqué/en attente/refusé.
 * Inclut un bouton "Discuter avec le support" qui ouvre une messagerie
 * bidirectionnelle connectée à l'onglet Messages de l'admin.
 */
export default function BlockedLivreurScreen({ livreur, state }) {
  const [showChat, setShowChat] = useState(false);

  const config = {
    livreur_en_attente: {
      icon: <Truck className="w-8 h-8 text-secondary" />,
      bg: "bg-secondary/20",
      title: "Compte en attente",
      message: "Votre compte livreur est en cours de vérification par l'équipe SILGAPP. Vous serez notifié dès que votre compte sera validé.",
    },
    livreur_refuse: {
      icon: <Truck className="w-8 h-8 text-destructive" />,
      bg: "bg-destructive/10",
      title: "Compte refusé",
      message: "Votre demande d'inscription a été refusée. Contactez le support SILGAPP pour plus d'informations.",
    },
    livreur_bloque: {
      icon: <Truck className="w-8 h-8 text-destructive" />,
      bg: "bg-destructive/10",
      title: "Compte désactivé",
      message: "Votre compte livreur a été désactivé. Contactez le support SILGAPP.",
    },
  };

  const cfg = config[state] || config.livreur_bloque;
  const livreurName = `${livreur?.prenom || ""} ${livreur?.nom || ""}`.trim() || "Livreur";

  // ── Mode chat ouvert — plein écran ──
  if (showChat && livreur?.id) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
          <button
            onClick={() => setShowChat(false)}
            className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-primary"
          >
            <X className="w-5 h-5" />
            Retour
          </button>
          <span className="text-sm font-bold text-gray-900">Support SILGAPP</span>
          <div className="w-16" />
        </div>
        <div className="flex-1 overflow-hidden">
          <SupportChatWindow
            livreurId={livreur.id}
            livreurName={livreurName}
            myType="livreur"
            myId={livreur.id}
            myName={livreurName}
          />
        </div>
      </div>
    );
  }

  // ── Écran bloqué standard ──
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
      <div className="text-center space-y-4 max-w-sm w-full">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
          {cfg.icon}
        </div>
        <h2 className="text-lg font-bold text-foreground">{cfg.title}</h2>
        <p className="text-sm text-muted-foreground">{cfg.message}</p>
        <p className="text-xs text-muted-foreground">📞 Support : +226 66 92 51 90</p>

        {/* Bouton Messagerie — discuter avec le support SILGAPP */}
        <button
          onClick={() => setShowChat(true)}
          className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors shadow-sm"
        >
          <MessageCircle className="w-5 h-5" />
          Discuter avec le support
        </button>

        <button
          onClick={() => { clearPersistedToken(); base44.auth.logout(); }}
          className="text-xs text-primary underline"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}