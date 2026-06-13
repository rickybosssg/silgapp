import React, { Suspense, lazy, useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { base44 } from "@/api/base44Client";

const Sidebar = lazy(() => import("./Sidebar"));
const MobileNav = lazy(() => import("./MobileNav"));

function SidebarFallback() {
  return (
    <aside className="h-screen bg-slate-900 flex flex-col w-60 sticky top-0 shadow-xl shadow-black/20">
      <div className="h-16 flex items-center px-5 gap-3 border-b border-white/8">
        <div className="w-9 h-9 rounded-xl bg-white/10 animate-pulse" />
        <div>
          <div className="h-4 w-20 bg-white/10 rounded animate-pulse" />
          <div className="h-3 w-16 bg-white/10 rounded mt-1 animate-pulse" />
        </div>
      </div>
      <div className="flex-1 py-3 px-2 space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" />
        ))}
      </div>
    </aside>
  );
}

function MobileNavFallback() {
  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b z-40 flex items-center px-4 safe-area-top" style={{ minHeight: "3.5rem" }}>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-slate-200 animate-pulse" />
        <div>
          <div className="h-4 w-16 bg-slate-200 rounded animate-pulse" />
          <div className="h-3 w-20 bg-slate-100 rounded mt-1 animate-pulse" />
        </div>
      </div>
    </header>
  );
}

export default function AppLayout({ reseau }) {
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const data = await base44.entities.Notification.filter({ lue: false });
        setNotifCount((data || []).length);
      } catch (_) {}
    };
    fetchNotifs();
    const iv = setInterval(fetchNotifs, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop layout */}
      <div className="hidden lg:flex min-h-screen">
        <Suspense fallback={<SidebarFallback />}>
          <Sidebar notificationCount={notifCount} reseau={reseau} />
        </Suspense>
        <main className="flex-1 min-h-screen overflow-x-hidden bg-slate-50">
          <Outlet />
        </main>
      </div>

      {/* Mobile layout */}
      <div className="lg:hidden">
        <Suspense fallback={<MobileNavFallback />}>
          <MobileNav notificationCount={notifCount} reseau={reseau} />
        </Suspense>
        <main className="pt-14 pb-16 min-h-screen bg-slate-50 safe-area-top safe-area-bottom">
          <Outlet />
        </main>
      </div>
    </div>
  );
}