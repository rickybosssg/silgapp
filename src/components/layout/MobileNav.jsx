import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, LogOut, Bell, ChevronDown, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { clearPersistedToken } from "@/lib/authPersistence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { navItems as allNavItems } from "@/components/layout/Sidebar";
import { useAdminContext } from "@/hooks/useAdminContext.js";
import { usePaysActifs } from "@/components/international/CountrySelector.jsx";
import { SILGAPP_LOGO_URL } from "@/lib/branding";
import { useQuery } from "@tanstack/react-query";

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

export default function MobileNav({ notificationCount = 0, demandesCount = 0, partenaireDemandesCount = 0, neoCount = 0, messageCount = 0, reseau }) {
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
  const { pays: paysListe = [] } = usePaysActifs();

  // ── Badge non-lu pour le Centre de notifications ──
  const { data: inboxUnread = 0 } = useQuery({
    queryKey: ["admin-inbox-unread-count", effectiveCountry || "ALL"],
    queryFn: async () => {
      try {
        const filter = { status: "unread", ...(effectiveCountry ? { country_code: effectiveCountry } : {}) };
        const items = await base44.entities.AdminInboxItem.filter(filter, "-created_date", 200);
        return items?.length || 0;
      } catch { return 0; }
    },
    refetchInterval: 30000,
  });

  return (
    <>
      {/* ===== MOBILE HEADER ===== */}
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-sidebar/95 backdrop-blur-xl border-b border-white/5 z-40 flex items-center justify-between px-4 shadow-sm safe-area-top" style={{ minHeight: '3.5rem' }}>
        <div className="flex items-center gap-2.5">
          <img
            src={SILGAPP_LOGO_URL}
            alt="SILGAPP"
            className="w-8 h-8 rounded-xl object-cover"
          />
          <div>
            <h1 className="font-extrabold text-sm text-white leading-tight">SILGAPP</h1>
            <p className="text-[9px] text-slate-300 leading-tight">SILGAPP Livraison</p>
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
          {partenaireDemandesCount > 0 && (
            <Link to="/admin/boutiques" className="relative">
              <span className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center text-white text-[10px] font-black">
                {partenaireDemandesCount > 9 ? '9+' : partenaireDemandesCount}
              </span>
            </Link>
          )}
          {notificationCount > 0 && (
            <Link to="/notifications" className="relative">
              <Bell className="w-5 h-5 text-slate-400" />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            </Link>
          )}
          {messageCount > 0 && (
            <Link to="/admin/messages" className="relative">
              <MessageCircle className="w-5 h-5 text-slate-400" />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                {messageCount > 9 ? '9+' : messageCount}
              </span>
            </Link>
          )}
          {inboxUnread > 0 && (
            <Link to="/admin/centre-notifications" className="relative">
              <Bell className="w-5 h-5 text-slate-400" />
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                {inboxUnread > 9 ? '9+' : inboxUnread}
              </span>
            </Link>
          )}
          <Button variant="ghost" size="icon" onClick={() => setShowMenu(true)} className="text-slate-400">
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* ===== MOBILE SLIDE-IN MENU ===== */}
      {showMenu && (
        <div className="lg:hidden fixed inset-0 z-50" onClick={() => setShowMenu(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="absolute right-0 top-0 bottom-0 w-72 bg-sidebar flex flex-col shadow-2xl border-l border-white/5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Menu header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-white/5 flex-shrink-0">
              <div>
                {user && (
                  <div>
                    <p className="text-sm font-semibold text-white">{user.full_name || user.email}</p>
                    <p className="text-xs text-slate-400 capitalize">{user.role}</p>
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowMenu(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Sélecteur de pays — réseau externe uniquement */}
            {showCountryPicker && (
              <div className="px-3 py-2 border-b border-white/5">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base pointer-events-none z-10">
                    {effectiveCountry ? paysListe.find(p => p.code === effectiveCountry)?.emoji_flag || "🌍" : "🌍"}
                  </span>
                  <select
                    value={effectiveCountry || ""}
                    onChange={(e) => setSelectedCountry(e.target.value)}
                    className="w-full appearance-none bg-white text-gray-900 text-sm font-semibold rounded-xl pl-10 pr-9 py-2.5 border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 cursor-pointer"
                  >
                    <option value="" className="bg-white text-gray-700">Choisir un pays</option>
                    {paysListe.map((p) => (
                      <option key={p.code} value={p.code} className="bg-white text-gray-900">
                        {p.emoji_flag} {p.nom}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-700 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
              {allNavItems.map((item) => {
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
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm silgapp-relief-surface"
                        : "text-slate-300 hover:bg-white/5 hover:text-sidebar-primary"
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
                    {["/admin/boutiques", "/admin/restaurants", "/admin/pharmacies"].includes(item.path) && partenaireDemandesCount > 0 && (
                      <Badge className="bg-destructive text-destructive-foreground text-xs">
                        {partenaireDemandesCount}
                      </Badge>
                    )}
                    {item.path === "/admin/neo" && neoCount > 0 && (
                      <Badge className="bg-cyan-500 text-white text-xs">
                        {neoCount}
                      </Badge>
                    )}
                    {item.path === "/admin/messages" && messageCount > 0 && (
                      <Badge className="bg-red-500 text-white text-xs">
                        {messageCount}
                      </Badge>
                    )}
                    {item.path === "/admin/centre-notifications" && inboxUnread > 0 && (
                      <Badge className="bg-red-500 text-white text-xs animate-pulse">
                        {inboxUnread > 99 ? "99+" : inboxUnread}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Logout */}
            <div className="border-t border-white/5 p-3 flex-shrink-0">
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
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-sidebar/95 backdrop-blur-xl border-t border-white/5 z-40 safe-area-bottom shadow-[0_-8px_30px_rgba(0,0,0,0.3)]">
        <div className="flex items-stretch justify-around">
          {allNavItems.filter(item => bottomTabPaths.includes(item.path)).map((item) => {
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
                  isActive ? "text-sidebar-primary" : "text-slate-400"
                )}
              >
                <div className={cn(
                  "w-10 h-6 flex items-center justify-center rounded-full transition-all",
                  isActive && "bg-sidebar-primary/10"
                )}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={cn(
                  "text-[10px] font-medium mt-0.5",
                  isActive ? "text-sidebar-primary" : "text-slate-400"
                )}>
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* Menu button */}
          <button
            onClick={() => setShowMenu(true)}
            className="flex flex-col items-center justify-center py-2 px-1 flex-1 text-slate-400 min-h-[56px]"
          >
            <div className="w-10 h-6 flex items-center justify-center rounded-full relative">
              <Menu className="w-5 h-5" />
              {(notificationCount > 0 || demandesCount > 0 || partenaireDemandesCount > 0 || messageCount > 0 || inboxUnread > 0) && (
                <span className="absolute -top-1 right-0 w-3.5 h-3.5 rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center">
                  {((notificationCount || 0) + (demandesCount || 0) + (partenaireDemandesCount || 0) + (messageCount || 0) + (inboxUnread || 0)) > 9 ? '9+' : (notificationCount || 0) + (demandesCount || 0) + (partenaireDemandesCount || 0) + (messageCount || 0) + (inboxUnread || 0)}
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
