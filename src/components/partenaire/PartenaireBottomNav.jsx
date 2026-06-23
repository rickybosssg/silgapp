import React from "react";
import { Home, Package, ShoppingBag, MessageCircle, BarChart3, Truck, Pill } from "lucide-react";

export default function PartenaireBottomNav({ tab, setTab, badgeCount = 0, messageBadge = 0, etablissementType }) {
  const isPharmacie = etablissementType === "pharmacie";
  const items = isPharmacie ? [
    { id: "home", icon: Home, label: "Accueil" },
    { id: "messages", icon: MessageCircle, label: "Messages", badge: messageBadge },
    { id: "livraisons", icon: Truck, label: "Livraisons", badge: badgeCount },
    { id: "statistiques", icon: BarChart3, label: "Stats" },
    { id: "infos", icon: Pill, label: "Infos" },
  ] : [
    { id: "home", icon: Home, label: "Accueil" },
    { id: "commandes", icon: Package, label: "Commandes", badge: badgeCount },
    { id: "produits", icon: ShoppingBag, label: "Produits" },
    { id: "messages", icon: MessageCircle, label: "Messages", badge: messageBadge },
    { id: "statistiques", icon: BarChart3, label: "Stats" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-100 safe-area-bottom shadow-[0_-2px_10px_rgba(0,0,0,0.03)]">
      <div className="max-w-lg mx-auto flex items-center justify-around px-2 py-1">
        {items.map(item => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className="relative flex flex-col items-center gap-0.5 py-2 px-3 flex-1"
            >
              <div className="relative">
                <item.icon
                  className={"w-5 h-5 transition-colors " + (active ? "text-purple-600" : "text-gray-400")}
                  strokeWidth={active ? 2.5 : 2}
                />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className={"text-[10px] font-bold transition-colors " + (active ? "text-purple-600" : "text-gray-400")}>
                {item.label}
              </span>
              {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-purple-600 rounded-full" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}