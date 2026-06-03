import React, { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";

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
    <div className="min-h-screen bg-background">
      {/* Desktop layout */}
      <div className="hidden lg:flex min-h-screen">
        <Sidebar notificationCount={notifCount} reseau={reseau} />
        <main className="flex-1 min-h-screen overflow-x-hidden bg-background">
          <Outlet />
        </main>
      </div>

      {/* Mobile layout */}
      <div className="lg:hidden">
        <MobileNav notificationCount={notifCount} reseau={reseau} />
        <main className="pt-14 pb-16 min-h-screen safe-area-top safe-area-bottom">
          <Outlet />
        </main>
      </div>
    </div>
  );
}