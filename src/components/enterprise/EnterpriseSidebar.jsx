import React, { useState } from "react";
import { LayoutDashboard, Map, Package, Plus, Truck, Users, MessageCircle, Wallet, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const enterpriseNavItems = [
  { id: "overview", label: "Tableau de bord", icon: LayoutDashboard },
  { id: "carte", label: "Carte en direct", icon: Map },
  { id: "courses", label: "Courses", icon: Package },
  { id: "create", label: "Nouvelle course", icon: Plus },
  { id: "livreurs", label: "Livreurs", icon: Truck },
  { id: "clients", label: "Clients", icon: Users },
  { id: "messagerie", label: "Messagerie", icon: MessageCircle },
  { id: "comptabilite", label: "Comptabilité", icon: Wallet },
  { id: "parametres", label: "Paramètres", icon: Settings },
];

export default function EnterpriseSidebar({ enterprise, activeTab, onTabChange, collapsed, onToggleCollapse, pendingCount = 0 }) {
  const isAgenceActive = enterprise?.actif !== false && enterprise?.statut === "actif";

  return (
    <aside className={cn(
      "h-screen bg-sidebar flex flex-col transition-all duration-300 sticky top-0 shadow-[8px_0_30px_rgba(0,0,0,0.3)] border-r border-white/5",
      collapsed ? "w-[68px]" : "w-60"
    )}>
      {/* Logo + nom entreprise */}
      <div className={cn(
        "h-16 flex items-center border-b border-white/5 flex-shrink-0 overflow-hidden",
        collapsed ? "px-4 justify-center" : "px-5 gap-3"
      )}>
        <div className="w-9 h-9 rounded-xl bg-sidebar-primary flex items-center justify-center silgapp-relief flex-shrink-0 overflow-hidden">
          {enterprise?.logo_url ? (
            <img src={enterprise.logo_url} alt={enterprise.nom} className="w-full h-full rounded-xl object-cover" />
          ) : (
            <span className="text-white font-bold text-sm">
              {(enterprise?.nom || "E").charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <h1 className="font-extrabold text-sm text-white tracking-wide truncate">
              {enterprise?.nom_commercial || enterprise?.nom || "Entreprise"}
            </h1>
            <div className="flex items-center gap-1.5">
              <span className={cn("w-1.5 h-1.5 rounded-full", isAgenceActive ? "bg-emerald-400" : "bg-red-400")} />
              <p className="text-[10px] text-slate-300">{isAgenceActive ? "Agence active" : "Suspendue"}</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {enterpriseNavItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          const showBadge = item.id === "pending" && pendingCount > 0;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              title={collapsed ? item.label : undefined}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm silgapp-relief-surface"
                  : "text-slate-300 hover:bg-white/5 hover:text-sidebar-primary"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="truncate flex-1 text-left">{item.label}</span>
                  {showBadge && (
                    <span className="bg-destructive text-white text-[10px] h-5 min-w-5 flex items-center justify-center px-1 rounded-full">
                      {pendingCount}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle (desktop only) */}
      <div className="border-t border-white/5 flex-shrink-0 hidden lg:block">
        <button
          onClick={onToggleCollapse}
          className="w-full h-9 flex items-center justify-center text-slate-400 hover:text-sidebar-primary hover:bg-white/5 transition-colors"
          title={collapsed ? "Étendre" : "Réduire"}
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>
    </aside>
  );
}