import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, MapPin, Plus, Truck, BarChart3, Bell, 
  Package, TrendingUp, Menu, X, LogOut 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSilgappAuth } from "@/lib/silgappAuth";

const navItems = [
  { path: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { path: "/nouvelle-course", label: "Nouvelle course", icon: Plus },
  { path: "/carte", label: "Carte", icon: MapPin },
  { path: "/courses", label: "Courses", icon: Package },
  { path: "/livreurs", label: "Livreurs", icon: Truck },
  { path: "/rapport", label: "Rapport", icon: BarChart3 },
  { path: "/recapitulatif", label: "Récap", icon: TrendingUp },
  { path: "/notifications", label: "Notifications", icon: Bell },
];

export default function MobileNav({ notificationCount = 0 }) {
  const location = useLocation();
  const { logout } = useSilgappAuth();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <>
      {/* Header mobile */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Truck className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-foreground">Silga</h1>
            <p className="text-[9px] text-muted-foreground">Livraison</p>
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowMenu(!showMenu)}
          className="text-muted-foreground"
        >
          {showMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </header>

      {/* Menu hamburger overlay */}
      {showMenu && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-50" onClick={() => setShowMenu(false)}>
          <div 
            className="absolute right-0 top-0 bottom-0 w-64 bg-card border-l border-border p-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-foreground">Menu</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowMenu(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setShowMenu(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all",
                      isActive 
                        ? "bg-primary text-primary-foreground" 
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    {item.path === "/notifications" && notificationCount > 0 && (
                      <Badge className="ml-auto bg-destructive text-destructive-foreground text-xs">
                        {notificationCount}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="absolute bottom-4 left-4 right-4">
              <Button
                variant="outline"
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => {
                  logout();
                  setShowMenu(false);
                }}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Déconnexion
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation barre du bas */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40 safe-area-bottom">
        <div className="flex items-center justify-around py-2">
          {navItems.slice(0, 5).map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center justify-center p-2 rounded-lg transition-all",
                  isActive 
                    ? "text-primary" 
                    : "text-muted-foreground"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium mt-0.5 truncate max-w-[60px]">
                  {item.label.split(' ')[0]}
                </span>
              </Link>
            );
          })}
          
          {/* More menu */}
          <div className="relative">
            <Link
              to="/notifications"
              className={cn(
                "flex flex-col items-center justify-center p-2 rounded-lg transition-all",
                location.pathname === "/notifications" || location.pathname === "/rapport" || location.pathname === "/recapitulatif"
                  ? "text-primary" 
                  : "text-muted-foreground"
              )}
            >
              <div className="relative">
                <Bell className="w-5 h-5" />
                {notificationCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-4 w-4 rounded-full p-0 flex items-center justify-center bg-destructive text-[8px]">
                    {notificationCount}
                  </Badge>
                )}
              </div>
              <span className="text-[10px] font-medium mt-0.5">Plus</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Desktop sidebar (hidden on mobile) */}
      <div className="hidden lg:block">
        <DesktopSidebar notificationCount={notificationCount} />
      </div>
    </>
  );
}

// Desktop Sidebar (same as original)
function DesktopSidebar({ notificationCount = 0 }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { logout } = useSilgappAuth();

  return (
    <aside className={cn(
      "h-screen bg-card border-r border-border flex flex-col transition-all duration-300 sticky top-0",
      collapsed ? "w-16" : "w-64"
    )}>
      <div className="h-16 flex items-center px-4 border-b border-border gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <Truck className="w-4 h-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="font-bold text-sm leading-tight text-foreground">Silga</h1>
            <p className="text-[10px] text-muted-foreground leading-tight">Livraison</p>
          </div>
        )}
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && (
                <span className="truncate">{item.label}</span>
              )}
              {!collapsed && item.path === "/notifications" && notificationCount > 0 && (
                <Badge className="ml-auto bg-destructive text-destructive-foreground text-[10px] h-5 min-w-5 flex items-center justify-center">
                  {notificationCount}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="h-12 flex items-center justify-center border-t border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        {collapsed ? <Menu className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      <button
        onClick={logout}
        className={cn(
          "h-12 flex items-center gap-3 px-4 text-sm font-medium transition-colors border-t border-border",
          "text-destructive hover:bg-destructive/10"
        )}
      >
        <LogOut className="w-4 h-4 flex-shrink-0" />
        {!collapsed && <span>Déconnexion</span>}
      </button>
    </aside>
  );
}