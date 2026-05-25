import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, MapPin, Plus, Truck, BarChart3, Bell, 
  Package, TrendingUp, ChevronLeft, ChevronRight, LogOut
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

const doLogout = () => {
  ['base44_access_token', 'access_token', 'base44_token', 'token'].forEach(k => {
    try { localStorage.removeItem(k); } catch(_) {}
  });
  base44.auth.logout();
  setTimeout(() => window.location.reload(), 300);
};
import { Badge } from "@/components/ui/badge";


export const navItems = [
  { path: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { path: "/nouvelle-course", label: "Nouvelle course", icon: Plus },
  { path: "/carte", label: "Carte en direct", icon: MapPin },
  { path: "/courses", label: "Toutes les courses", icon: Package },
  { path: "/livreurs", label: "Livreurs", icon: Truck },
  { path: "/rapport", label: "Rapport du jour", icon: BarChart3 },
  { path: "/recapitulatif", label: "Récapitulatif", icon: TrendingUp },
  { path: "/notifications", label: "Notifications", icon: Bell },
];

export default function Sidebar({ notificationCount = 0 }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();


  return (
    <aside className={cn(
      "h-screen bg-card border-r border-border flex flex-col transition-all duration-300 sticky top-0 shadow-sm",
      collapsed ? "w-[68px]" : "w-60"
    )}>
      {/* Logo */}
      <div className={cn(
        "h-16 flex items-center border-b border-border flex-shrink-0 overflow-hidden",
        collapsed ? "px-4 justify-center" : "px-5 gap-3"
      )}>
        <img 
          src="https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/2c20ad136_SILGAPPLOGO2.jpg"
          alt="SILGAPP ET"
          className="w-9 h-9 rounded-lg flex-shrink-0"
        />
        {!collapsed && (
          <div>
            <h1 className="font-extrabold text-sm text-foreground tracking-wide">SILGAPP ET</h1>
            <p className="text-[10px] text-muted-foreground">Silga Livraison</p>
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
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="truncate flex-1">{item.label}</span>
                  {item.path === "/notifications" && notificationCount > 0 && (
                    <Badge className="bg-destructive text-destructive-foreground text-[10px] h-5 min-w-5 flex items-center justify-center px-1">
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
      <div className="border-t border-border flex-shrink-0">
        {/* Déconnexion */}
        <button
          onClick={doLogout}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors",
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
          className="w-full h-10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={collapsed ? "Étendre" : "Réduire"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}