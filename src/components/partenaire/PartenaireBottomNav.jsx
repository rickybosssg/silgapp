import React from "react";
import { Home, Package, ShoppingBag, MessageCircle, BarChart3, Truck, Pill, Gift } from "lucide-react";

export default function PartenaireBottomNav({ tab, setTab, badgeCount = 0, messageBadge = 0, etablissementType, showPromo = true }) {
  const isPharmacie = etablissementType === "pharmacie";
  const activeClasses = isPharmacie
    ? { text: "text-emerald-700", bar: "bg-emerald-600" }
    : etablissementType === "restaurant"
      ? { text: "text-orange-700", bar: "bg-orange-600" }
      : { text: "text-blue-700", bar: "bg-blue-600" };
  const baseItems = isPharmacie ? [
    { id: "home", icon: Home, label: "Accueil" },
    { id: "messages", icon: MessageCircle, label: "Messages", badge: messageBadge },
    { id: "livraisons", icon: Truck, label: "Livraisons", badge: badgeCount },
    { id: "promo", icon: Gift, label: "Promo" },
    { id: "statistiques", icon: BarChart3, label: "Stats" },
    { id: "infos", icon: Pill, label: "Infos" },
  ] : [
    { id: "home", icon: Home, label: "Accueil" },
    { id: "commandes", icon: Package, label: "Commandes", badge: badgeCount },
    { id: "produits", icon: ShoppingBag, label: "Produits" },
    { id: "messages", icon: MessageCircle, label: "Messages", badge: messageBadge },
    { id: "promo", icon: Gift, label: "Promo" },
    { id: "statistiques", icon: BarChart3, label: "Stats" },
  ];
  const items = baseItems.filter((item) => item.id !== "promo" || showPromo);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-100 safe-area-bottom shadow-[0_-2px_10px_rgba(0,0,0,0.03)]">
      <div className="max-w-lg mx-auto grid px-1.5 py-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(item => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className="relative min-w-0 flex flex-col items-center gap-0.5 py-2 px-1 active:scale-95 transition-transform"
            >
              <div className="relative">
                <item.icon
                  className={"w-5 h-5 shrink-0 transition-colors " + (active ? activeClasses.text : "text-gray-400")}
                  strokeWidth={active ? 2.5 : 2}
                />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className={"w-full truncate text-center text-[9px] sm:text-[10px] font-bold leading-tight transition-colors " + (active ? activeClasses.text : "text-gray-400")}>
                {item.label}
              </span>
              {active && <div className={"absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full " + activeClasses.bar} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
