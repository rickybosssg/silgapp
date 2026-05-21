import React from "react";
import { Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import Sidebar from "./Sidebar";
import AdminGuard from "@/components/AdminGuard";

export default function AppLayout() {
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: () => base44.entities.Notification.filter({ lue: false }),
    initialData: [],
    refetchInterval: 30000,
  });

  return (
    <AdminGuard>
      <div className="flex min-h-screen bg-background">
        <Sidebar notificationCount={notifications.length} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </AdminGuard>
  );
}