import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, LogOut, Bell, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { clearPersistedToken } from "@/lib/authPersistence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { navItems as allNavItems } from "@/components/layout/Sidebar";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import { PAYS_SILGAPP } from "@/components/international/CountrySelector.jsx";

// Bottom tab bar : items communs aux deux réseaux
const bottomTabPaths = ["/", "/carte", "/courses", "/livreurs"];

// Store scroll positions and state per route using sessionStorage for persistence
const SCROLL_STORAGE_KEY = 'silgapp_scroll_';
const STATE_STORAGE_KEY = 'silgapp_state_';

function saveScrollPosition(pathname, position) {
  try { sessionStorage.setItem(SCROLL_STORAGE_KEY + pathname, String(position)); } catch (_) {}
}

function restoreScrollPosition(pathname) {
  try {
    const saved = sessionStorage.getItem(SCROLL_STORAGE_KEY + pathname);
    return saved !== null ? Number(saved) : 0;
  } catch (_) { return 0; }
}

export default function MobileNav({ notificationCount = 0, demandesCount = 0, reseau }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  useEffect(() => { base44.auth.me().then(setUser).catch(() => null); }, []);

  // Hardware back button for Android
  useEffect(() => {
    const handleBackButton = (e) => {
      e.preventDefault();
      if (location.pathname !== '/') {
        navigate(-1);
      }
    };
    document.addEventListener('backbutton', handleBackButton, false);
    return () => document.removeEventListener('backbutton', handleBackButton);
  }, [navigate, location]);

  // Save scroll position before unmount/route change
  useEffect(() => {
    const savePosition = () => saveScrollPosition(location.pathname, window.scrollY);
    window.addEventListener('beforeunload', savePosition);
    return () => {
      savePosition();
      window.removeEventListener('beforeunload', savePosition);
    };
  }, [location.pathname]);

  // Restore scroll position on route change with slight delay for content render
  useEffect(() => {
    const savedY = restoreScrollPosition(location.pathname);
    const timer = setTimeout(() => {
      window.scrollTo({ top: savedY, behavior: 'auto' });
    }, 100);
    return () => clearTimeout(timer);
  }, [location.pathname]);
  const logout = () => {
    ['base44_access_token', 'access_token', 'base44_token', 'token'].forEach(k => {
      try { localStorage.removeItem(k); } catch(_) {}
    });
    { clearPersistedToken(); base44.auth.logout(); };
    setTimeout(() => window.location.reload(), 300);
  };
  const [showMenu, setShowMenu] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const { isPays, countryCode: adminCountryCode, selectedCountry, setSelectedCountry } = useAdminContext();
  const effectiveCountry = isPays ? adminCountryCode : selectedCountry;
  const showCountryPicker = reseau === "externe" && !isPays;

  return (
    <>
      {/* ===== MOBILE HEADER ===== */}
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-card border-b border-border z-40 flex items-center justify-between px-4 shadow-sm safe-area-top" style={{ minHeight: '3.5rem' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-sm">
            <span className="text-primary-foreground font-black text-sm">S</span>
          </div>
          <div>
            <h1 className="font-extrabold text-sm text-foreground leading-tight">SILGAPP</h1>
            <p className="text-[9px] text-muted-foreground leading-tight">SILGAPP Livraison</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {demandesCount > 0 && (
            <Link to="/admin/demandes-livreurs" className="relative">
              <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-[10px] font-black">
                {demandesCount > 9 ? '9+' : demandesCount}
              </span>
            </Link>
          )}
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

            {/* Sélecteur de pays — réseau externe uniquement */}
            {showCountryPicker && (
              <div className="px-3 py-2 border-b border-border">
                <button
                  onClick={() => setCountryOpen(!countryOpen)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base flex-shrink-0">
                      {effectiveCountry ? PAYS_SILGAPP.find(p => p.code === effectiveCountry)?.emoji_flag || "" : ""}
                    </span>
                    <span className="text-sm font-medium text-foreground truncate">
                      {effectiveCountry ? PAYS_SILGAPP.find(p => p.code === effectiveCountry)?.nom : "Choisir un pays"}
                    </span>
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform", countryOpen && "rotate-180")} />
                </button>
                {countryOpen && (
                  <div className="mt-1 border border-border rounded-xl bg-card shadow-lg max-h-56 overflow-y-auto">
                    {PAYS_SILGAPP.map((p) => (
                      <button
                        key={p.code}
                        onClick={() => { setSelectedCountry(p.code); setCountryOpen(false); }}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted",
                          effectiveCountry === p.code ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                        )}
                      >
                        <span className="text-base flex-shrink-0">{p.emoji_flag}</span>
                        <span className="flex-1 text-left">{p.nom}</span>
                        {effectiveCountry === p.code && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
              {allNavItems.filter(item => item.reseauOnly === reseau).map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path + item.reseauOnly}
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
                    {item.path === "/admin/demandes-livreurs" && demandesCount > 0 && (
                      <Badge className="bg-destructive text-destructive-foreground text-xs">
                        {demandesCount}
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
          {allNavItems.filter(item => item.reseauOnly === reseau && bottomTabPaths.includes(item.path)).map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => {
                  // Save current scroll position before navigation
                  saveScrollPosition(location.pathname, window.scrollY);

                  if (isActive) {
                    // Reset to root route of this tab, then scroll to top
                    navigate(item.path, { replace: true });
                    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
                  } else {
                    navigate(item.path);
                  }
                }}
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
              </button>
            );
          })}

          {/* Menu button */}
          <button
            onClick={() => setShowMenu(true)}
            className="flex flex-col items-center justify-center py-2 px-1 flex-1 text-muted-foreground min-h-[56px]"
          >
            <div className="w-10 h-6 flex items-center justify-center rounded-full relative">
              <Menu className="w-5 h-5" />
              {(notificationCount > 0 || demandesCount > 0) && (
                <span className="absolute -top-1 right-0 w-3.5 h-3.5 rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center">
                  {((notificationCount || 0) + (demandesCount || 0)) > 9 ? '9+' : (notificationCount || 0) + (demandesCount || 0)}
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
