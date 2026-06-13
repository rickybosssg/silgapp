import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, MapPin, Plus, Truck, BarChart3, Bell, 
  Package, TrendingUp, ChevronLeft, ChevronRight, LogOut, Wallet, Shield, Globe, Settings, MessageCircle, Users, Megaphone, ChevronDown, Check
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import { PAYS_SILGAPP } from "@/components/international/CountrySelector.jsx";

const doLogout = () => {
  ['base44_access_token', 'access_token', 'base44_token', 'token'].forEach(k => {
    try { localStorage.removeItem(k); } catch(_) {}
  });
  base44.auth.logout();
  setTimeout(() => window.location.reload(), 300);
};


export const navItems = [
  { path: "/", label: "Tableau de bord", icon: LayoutDashboard, reseauOnly: "interne" },
  { path: "/", label: "Tableau de bord", icon: LayoutDashboard, reseauOnly: "externe" },
  { path: "/nouvelle-course", label: "Nouvelle course", icon: Plus, reseauOnly: "interne" },
  { path: "/carte", label: "Carte en direct", icon: MapPin, reseauOnly: "interne" },
  { path: "/carte", label: "Carte en direct", icon: MapPin, reseauOnly: "externe" },
  { path: "/courses", label: "Toutes les courses", icon: Package, reseauOnly: "interne" },
  { path: "/courses", label: "Toutes les courses", icon: Package, reseauOnly: "externe" },
  { path: "/livreurs", label: "Livreurs", icon: Truck, reseauOnly: "interne" },
  { path: "/livreurs", label: "Livreurs", icon: Truck, reseauOnly: "externe" },
  { path: "/rapport", label: "Rapport du jour", icon: BarChart3, reseauOnly: "interne" },
  { path: "/rapport", label: "Rapport du jour", icon: BarChart3, reseauOnly: "externe" },
  { path: "/recapitulatif", label: "Récapitulatif", icon: TrendingUp, reseauOnly: "interne" },
  { path: "/recapitulatif", label: "Récapitulatif", icon: TrendingUp, reseauOnly: "externe" },
  { path: "/admin/externe/dus-livreurs", label: "Comptabilité", icon: Wallet, reseauOnly: "externe" },
  { path: "/admin/global", label: "Admin Global", icon: Globe, reseauOnly: "externe" },
  { path: "/admin/gestion-pays", label: "Gestion des pays", icon: Settings, reseauOnly: "externe" },
  { path: "/admin/externe/clients", label: "Clients externes", icon: Users, reseauOnly: "externe" },
  { path: "/admin/publicites", label: "Publicités", icon: Megaphone, reseauOnly: "externe" },
  { path: "/admin/venus-rapports", label: "Rapports VENUS", icon: MessageCircle, reseauOnly: "externe" },
  { path: "/admin/centre-notifications", label: "Notifications Push", icon: Megaphone, reseauOnly: "externe" },
  { path: "/admin/externe", label: "Config Dispatch", icon: Settings, reseauOnly: "externe" },
  { path: "/notifications", label: "Notifications", icon: Bell, reseauOnly: "interne" },
  { path: "/notifications", label: "Notifications", icon: Bell, reseauOnly: "externe" },
  { path: "/maintenance", label: "Maintenance", icon: Shield, reseauOnly: "interne" },
  { path: "/maintenance", label: "Maintenance", icon: Shield, reseauOnly: "externe" },
];

export default function Sidebar({ notificationCount = 0, reseau }) {
  const [collapsed, setCollapsed] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const location = useLocation();
  const { isPays, countryCode: adminCountryCode, selectedCountry, setSelectedCountry } = useAdminContext();
  const effectiveCountry = isPays ? adminCountryCode : selectedCountry;
  const showCountryPicker = reseau === "externe" && !isPays;


  return (
    <aside className={cn(
      "h-screen bg-slate-900 flex flex-col transition-all duration-300 sticky top-0 shadow-xl shadow-black/20",
      collapsed ? "w-[68px]" : "w-60"
    )}>
      {/* Logo */}
      <div className={cn(
        "h-16 flex items-center border-b border-white/8 flex-shrink-0 overflow-hidden",
        collapsed ? "px-4 justify-center" : "px-5 gap-3"
      )}>
        <img 
          src="https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/2c20ad136_SILGAPPLOGO2.jpg"
          alt="SILGAPP ET"
          className="w-9 h-9 rounded-xl flex-shrink-0 ring-2 ring-white/10"
        />
        {!collapsed && (
          <div>
            <h1 className="font-extrabold text-sm text-white tracking-wide">SILGAPP</h1>
            <p className="text-[10px] text-white/40">Silga Livraison</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.filter(item => {
          if (item.reseauOnly && item.reseauOnly !== reseau) return false;
          return true;
        }).map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path + item.reseauOnly}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                isActive
                  ? "bg-primary text-white shadow-lg shadow-primary/30"
                  : "text-white/50 hover:bg-white/8 hover:text-white/90"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="truncate flex-1">{item.label}</span>
                  {item.path === "/notifications" && notificationCount > 0 && (
                    <Badge className="bg-destructive text-white text-[10px] h-5 min-w-5 flex items-center justify-center px-1">
                      {notificationCount}
                    </Badge>
                  )}
                </>
              )}
              {collapsed && item.path === "/notifications" && notificationCount > 0 && (
                <span className="absolute right-1 top-1 w-2 h-2 rounded-full bg-destructive" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/8 flex-shrink-0">

        {/* Sélecteur de pays — réseau externe uniquement */}
        {showCountryPicker && (
          <div className={cn("relative border-b border-white/8", collapsed ? "px-2 py-2" : "px-3 py-2")}>
            {collapsed ? (
              <button
                onClick={() => setCountryOpen(!countryOpen)}
                className="w-full flex items-center justify-center h-9 rounded-lg bg-white/8 hover:bg-white/15 transition-colors"
                title={effectiveCountry ? PAYS_SILGAPP.find(p => p.code === effectiveCountry)?.nom : "Choisir un pays"}
              >
                <span className="text-base">
                  {effectiveCountry ? PAYS_SILGAPP.find(p => p.code === effectiveCountry)?.emoji_flag || "🌍" : "🌍"}
                </span>
              </button>
            ) : (
              <button
                onClick={() => setCountryOpen(!countryOpen)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/8 hover:bg-white/15 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base flex-shrink-0">
                    {effectiveCountry ? PAYS_SILGAPP.find(p => p.code === effectiveCountry)?.emoji_flag || "🌍" : "🌍"}
                  </span>
                  <span className="text-xs font-semibold text-white/70 truncate">
                    {effectiveCountry ? PAYS_SILGAPP.find(p => p.code === effectiveCountry)?.nom : "Choisir un pays"}
                  </span>
                </div>
                <ChevronDown className={cn("w-3.5 h-3.5 text-white/40 flex-shrink-0 transition-transform", countryOpen && "rotate-180")} />
              </button>
            )}

            {/* Dropdown pays */}
            {countryOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCountryOpen(false)} />
                <div className={cn(
                  "absolute z-50 bg-slate-800 border border-white/15 rounded-xl shadow-2xl max-h-72 overflow-y-auto",
                  collapsed ? "left-14 bottom-0 w-52" : "left-3 right-3 bottom-full mb-2"
                )}>
                  {PAYS_SILGAPP.map((p) => (
                    <button
                      key={p.code}
                      onClick={() => { setSelectedCountry(p.code); setCountryOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-white/10",
                        effectiveCountry === p.code ? "bg-primary/30 text-white" : "text-white/70"
                      )}
                    >
                      <span className="text-base flex-shrink-0">{p.emoji_flag}</span>
                      <span className="flex-1 text-left font-medium">{p.nom}</span>
                      {effectiveCountry === p.code && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Déconnexion */}
        <button
          onClick={doLogout}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors",
            collapsed ? "justify-center" : ""
          )}
          title="Déconnexion"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Déconnexion</span>}
        </button>
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full h-9 flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
          title={collapsed ? "Étendre" : "Réduire"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}