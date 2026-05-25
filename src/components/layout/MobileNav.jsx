import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, MapPin, Plus, Truck, BarChart3, Bell, 
  Package, TrendingUp, Menu, X, LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/nouvelle-course", label: "Course", icon: Plus },
  { path: "/carte", label: "Carte", icon: MapPin },
  { path: "/courses", label: "Courses", icon: Package },
  { path: "/livreurs", label: "Livreurs", icon: Truck },
];

const allNavItems = [
  { path: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { path: "/nouvelle-course", label: "Nouvelle course", icon: Plus },
  { path: "/carte", label: "Carte en direct", icon: MapPin },
  { path: "/courses", label: "Toutes les courses", icon: Package },
  { path: "/livreurs", label: "Livreurs", icon: Truck },
  { path: "/rapport", label: "Rapport du jour", icon: BarChart3 },
  { path: "/recapitulatif", label: "Récapitulatif", icon: TrendingUp },
  { path: "/notifications", label: "Notifications", icon: Bell },
];

export default function MobileNav({ notificationCount = 0 }) {
  const location = useLocation();
  const [user, setUser] = useState(null);
  useEffect(() => { base44.auth.me().then(setUser).catch(() => null); }, []);
  const logout = () => base44.auth.logout();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <>
      {/* ===== MOBILE HEADER ===== */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border z-40 flex items-center justify-between px-4 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-sm">
            <span className="text-primary-foreground font-black text-sm">S</span>
          </div>
          <div>
            <h1 className="font-extrabold text-sm text-foreground leading-tight">SILGAPP 2</h1>
            <p className="text-[9px] text-muted-foreground leading-tight">Silga Livraison</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {notificationCount > 0 && (
            <Link to="/notifications" className="relative">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            </Link>
          )}
          <Button variant="ghost" size="icon" onClick={() => setShowMenu(true)} className="text-muted-foreground">
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* ===== MOBILE SLIDE-IN MENU ===== */}
      {showMenu && (
        <div className="lg:hidden fixed inset-0 z-50" onClick={() => setShowMenu(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="absolute right-0 top-0 bottom-0 w-72 bg-card flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Menu header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
              <div>
                {user && (
                  <div>
                    <p className="text-sm font-semibold text-foreground">{user.full_name || user.email}</p>
                    <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowMenu(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
              {allNavItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setShowMenu(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.path === "/notifications" && notificationCount > 0 && (
                      <Badge className="bg-destructive text-destructive-foreground text-xs">
                        {notificationCount}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Logout */}
            <div className="border-t border-border p-3 flex-shrink-0">
              <Button
                variant="outline"
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => { logout(); setShowMenu(false); }}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Déconnexion
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MOBILE BOTTOM TAB BAR ===== */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40 safe-area-bottom">
        <div className="flex items-stretch justify-around">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center justify-center py-2 px-1 flex-1 transition-all min-h-[56px]",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <div className={cn(
                  "w-10 h-6 flex items-center justify-center rounded-full transition-all",
                  isActive && "bg-primary/10"
                )}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={cn(
                  "text-[10px] font-medium mt-0.5",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* Menu button */}
          <button
            onClick={() => setShowMenu(true)}
            className="flex flex-col items-center justify-center py-2 px-1 flex-1 text-muted-foreground min-h-[56px]"
          >
            <div className="w-10 h-6 flex items-center justify-center rounded-full relative">
              <Menu className="w-5 h-5" />
              {notificationCount > 0 && (
                <span className="absolute -top-1 right-0 w-3.5 h-3.5 rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium mt-0.5">Plus</span>
          </button>
        </div>
      </nav>

    </>
  );
}