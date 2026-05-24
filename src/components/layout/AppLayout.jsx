import React from "react";
import { Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import MobileNav from "./MobileNav";

export default function AppLayout() {
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: () => base44.entities.Notification.filter({ lue: false }),
    initialData: [],
    refetchInterval: 30000,
  });

  return (
    <div className="min-h-screen bg-background">
      <MobileNav notificationCount={notifications.length} />
      <main className="lg:ml-0 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="lg:flex">
          <div className="hidden lg:block">
            {/* Desktop sidebar rendered by MobileNav */}
          </div>
          <div className="flex-1">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}