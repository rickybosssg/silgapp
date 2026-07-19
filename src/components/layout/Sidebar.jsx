import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { clearPersistedToken } from "@/lib/authPersistence";
import { 
  LayoutDashboard, MapPin, Plus, Truck, BarChart3, Bell, 
  Package, TrendingUp, ChevronLeft, ChevronRight, LogOut, Wallet, Shield, Globe, Settings, MessageCircle, Users, Megaphone, ChevronDown, Check, UserCheck, ShieldAlert, Store, UtensilsCrossed, Pill, PieChart, Sparkles, GraduationCap, Workflow, Brain, Library, Activity
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
  { clearPersistedToken(); base44.auth.logout(); };
  setTimeout(() => window.location.reload(), 300);
};


export const navItems = [
  { path: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { path: "/admin/nouvelle-course", label: "Nouvelle course", icon: Plus },
  { path: "/carte", label: "Carte en direct", icon: MapPin },
  { path: "/courses", label: "Toutes les courses", icon: Package },
  { path: "/livreurs", label: "Livreurs", icon: Truck },
  { path: "/admin/externe/dus-livreurs", label: "Dû Utilisateur", icon: Wallet },
  { path: "/admin/paiements", label: "Paiements", icon: Wallet },
  { path: "/rapport", label: "Rapport du jour", icon: BarChart3 },
  { path: "/recapitulatif", label: "Récapitulatif", icon: TrendingUp },
  { path: "/admin/statistiques", label: "Statistiques", icon: PieChart },
  { path: "/admin/comptabilite", label: "Comptabilité", icon: Wallet },
  { path: "/admin/global", label: "Admin Global", icon: Globe },
  { path: "/admin/gestion-pays", label: "Gestion des pays", icon: Settings },
  { path: "/admin/externe/clients", label: "Clients externes", icon: Users },
  { path: "/admin/publicites", label: "Publicités", icon: Megaphone },
  { path: "/admin/venus", label: "Centre VENUS", icon: Sparkles },
  { path: "/admin/venus-learning", label: "Apprentissage VENUS", icon: GraduationCap },
  { path: "/admin/venus-rapports", label: "Rapports VENUS", icon: MessageCircle },
  { path: "/admin/venus-workflows", label: "Workflows VENUS", icon: Workflow },
  { path: "/admin/venus-improvement", label: "Amélioration VENUS", icon: Brain },
  { path: "/admin/venus-documents", label: "Bibliothèque RAG", icon: Library },
  { path: "/admin/venus-supervision", label: "Supervision VENUS", icon: Activity },
  { path: "/admin/venus-international", label: "International VENUS", icon: Globe },
  { path: "/admin/centre-notifications", label: "Notifications Push", icon: Megaphone },
  { path: "/admin/externe", label: "Config Dispatch", icon: Settings },
  { path: "/admin/demandes-livreurs", label: "Livreurs à valider", icon: UserCheck },
  { path: "/admin/livreurs-bloques", label: "Livreurs bloqués", icon: ShieldAlert },
  { path: "/admin/anti-fraude", label: "Anti-Fraude", icon: Shield },
  { path: "/admin/messages", label: "Messagerie", icon: MessageCircle },
  { path: "/admin/support", label: "Support tickets", icon: MessageCircle },
  { path: "/admin/boutiques", label: "Boutiques", icon: Store },
  { path: "/admin/restaurants", label: "Restaurants", icon: UtensilsCrossed },
  { path: "/admin/pharmacies", label: "Pharmacies", icon: Pill },
  { path: "/admin/commandes-partenaires", label: "Commandes Partenaires", icon: Package },
  { path: "/admin/neo", label: "NEO – Moteur d'amélioration", icon: Sparkles },
  { path: "/admin/bugs", label: "Suivi des bugs", icon: ShieldAlert },
  { path: "/notifications", label: "Notifications", icon: Bell },
  { path: "/maintenance", label: "Maintenance", icon: Shield },
];

export default function Sidebar({ notificationCount = 0, demandesCount = 0, partenaireDemandesCount = 0, neoCount = 0, paiementCount = 0, messageCount = 0, livreursBloquesCount = 0, reseau }) {
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
            <p className="text-[10px] text-white/40">SILGAPP Livraison</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
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
                  {item.path === "/admin/demandes-livreurs" && demandesCount > 0 && (
                    <Badge className="bg-destructive text-white text-[10px] h-5 min-w-5 flex items-center justify-center px-1">
                      {demandesCount}
                    </Badge>
                  )}
                  {["/admin/boutiques", "/admin/restaurants", "/admin/pharmacies"].includes(item.path) && partenaireDemandesCount > 0 && (
                    <Badge className="bg-destructive text-white text-[10px] h-5 min-w-5 flex items-center justify-center px-1">
                      {partenaireDemandesCount}
                    </Badge>
                  )}
                  {item.path === "/admin/neo" && neoCount > 0 && (
                    <Badge className="bg-cyan-500 text-white text-[10px] h-5 min-w-5 flex items-center justify-center px-1">
                      {neoCount}
                    </Badge>
                  )}
                  {item.path === "/admin/paiements" && paiementCount > 0 && (
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  )}
                  {item.path === "/admin/messages" && messageCount > 0 && (
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  )}
                  {item.path === "/admin/livreurs-bloques" && livreursBloquesCount > 0 && (
                    <Badge className="bg-destructive text-white text-[10px] h-5 min-w-5 flex items-center justify-center px-1">
                      {livreursBloquesCount}
                    </Badge>
                  )}
                </>
              )}
              {(item.path === "/notifications" && notificationCount > 0) || (item.path === "/admin/demandes-livreurs" && demandesCount > 0) || (["/admin/boutiques", "/admin/restaurants", "/admin/pharmacies"].includes(item.path) && partenaireDemandesCount > 0) || (item.path === "/admin/neo" && neoCount > 0) || (item.path === "/admin/messages" && messageCount > 0) || (item.path === "/admin/livreurs-bloques" && livreursBloquesCount > 0) ? (
                collapsed && (
                  <span className="absolute right-1 top-1 w-2 h-2 rounded-full bg-destructive" />
                )
              ) : null}
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