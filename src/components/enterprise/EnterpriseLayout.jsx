import React, { useState, useCallback, useEffect } from "react";
import { Menu, X, LogOut, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import EnterpriseSidebar, { enterpriseNavItems } from "./EnterpriseSidebar";
import { cn } from "@/lib/utils";

const doLogout = () => {
  ["base44_access_token", "access_token", "base44_token", "token"].forEach(k => {
    try { localStorage.removeItem(k); } catch (_) {}
  });
  base44.auth.logout();
  setTimeout(() => window.location.reload(), 300);
};

export default function EnterpriseLayout({ enterprise, activeTab, onTabChange, pendingCount = 0, onRefresh, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleTabChange = useCallback((tabId) => {
    onTabChange(tabId);
    setDrawerOpen(false);
  }, [onTabChange]);

  const currentNav = enterpriseNavItems.find(n => n.id === activeTab);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Desktop layout (lg+) ── */}
      <div className="hidden lg:flex min-h-screen">
        <EnterpriseSidebar
          enterprise={enterprise}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          pendingCount={pendingCount}
        />
        <main className="flex-1 min-h-screen overflow-x-hidden bg-background">
          {/* Top bar desktop */}
          <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {currentNav && <currentNav.icon className="w-5 h-5 text-primary" />}
              <h2 className="text-lg font-bold text-foreground">{currentNav?.label}</h2>
            </div>
            <div className="flex items-center gap-2">
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  title="Rafraîchir"
                >
                  <RefreshCw className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
              <button
                onClick={doLogout}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Déconnexion
              </button>
            </div>
          </div>
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile layout ── */}
      <div className="lg:hidden">
        {/* Mobile header */}
        <header className="safe-area-top sticky top-0 z-40 bg-sidebar text-white shadow-lg">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setDrawerOpen(true)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center overflow-hidden shrink-0">
                {enterprise?.logo_url ? (
                  <img src={enterprise.logo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold text-xs">
                    {(enterprise?.nom || "E").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{enterprise?.nom_commercial || enterprise?.nom}</p>
                <p className="text-[10px] text-slate-300">{currentNav?.label}</p>
              </div>
            </div>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-64 bg-sidebar animate-in slide-in-from-left duration-200">
              <div className="h-16 flex items-center justify-between px-4 border-b border-white/5">
                <span className="text-sm font-bold text-white">Menu</span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-slate-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <EnterpriseSidebar
                enterprise={enterprise}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                collapsed={false}
                pendingCount={pendingCount}
              />
              <div className="border-t border-white/5 p-2">
                <button
                  onClick={doLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Déconnexion
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile content */}
        <main className="min-h-screen bg-background pb-6">
          {children}
        </main>
      </div>
    </div>
  );
}