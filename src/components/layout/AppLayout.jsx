import React from "react";
import { Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";

export default function AppLayout({ reseau }) {
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: () => base44.entities.Notification.filter({ lue: false }),
    initialData: [],
    refetchInterval: 30000,
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop layout */}
      <div className="hidden lg:flex min-h-screen">
        <Sidebar notificationCount={notifications.length} reseau={reseau} />
        <main className="flex-1 min-h-screen overflow-x-hidden bg-background">
          <Outlet />
        </main>
      </div>

      {/* Mobile layout */}
      <div className="lg:hidden">
        <MobileNav notificationCount={notifications.length} reseau={reseau} />
        <main className="pt-14 pb-16 min-h-screen safe-area-top safe-area-bottom">
          <Outlet />
        </main>
      </div>
    </div>
  );
}