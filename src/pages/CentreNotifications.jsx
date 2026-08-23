import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Bell, MessageSquare, Sparkles, Package, CreditCard, XCircle, Settings, Check, Archive, Inbox, ArrowRight, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAdminContext } from "@/hooks/useAdminContext.js";

const CATEGORIES = [
  { key: "all", label: "Tous", icon: Inbox },
  { key: "message", label: "Messages", icon: MessageSquare },
  { key: "venus", label: "VENUS", icon: Sparkles },
  { key: "course", label: "Courses", icon: Package },
  { key: "payment", label: "Paiements", icon: CreditCard },
  { key: "cancellation", label: "Annulations", icon: XCircle },
  { key: "system", label: "Système", icon: Settings },
];

const PRIORITY_STYLES = {
  P0: { bg: "bg-red-50 border-red-200", badge: "bg-red-500 text-white", label: "Critique" },
  P1: { bg: "bg-orange-50 border-orange-200", badge: "bg-orange-500 text-white", label: "Important" },
  P2: { bg: "bg-blue-50 border-blue-200", badge: "bg-blue-500 text-white", label: "Info" },
  P3: { bg: "bg-gray-50 border-gray-200", badge: "bg-gray-400 text-white", label: "Routine" },
};

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

export default function CentreNotifications() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState("all");
  const { isPays, countryCode, selectedCountry, loading: adminContextLoading } = useAdminContext();
  const effectiveCountry = isPays ? countryCode : selectedCountry;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin-inbox-items", effectiveCountry || "ALL"],
    queryFn: () => base44.entities.AdminInboxItem.filter(
      effectiveCountry ? { country_code: effectiveCountry } : {},
      "-created_date",
      200
    ),
    enabled: !adminContextLoading,
    refetchInterval: 30000,
  });

  useEffect(() => {
    const unsubscribe = base44.entities.AdminInboxItem.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ["admin-inbox-items"] });
      queryClient.invalidateQueries({ queryKey: ["admin-inbox-unread-count"] });
    });
    return () => unsubscribe?.();
  }, [queryClient]);

  const unreadCount = useMemo(() => items.filter(i => i.status === "unread").length, [items]);

  const filteredItems = useMemo(() => {
    const sorted = items.filter(i => i.status !== "archived").sort((a, b) => {
      // Unread first
      if (a.status === "unread" && b.status !== "unread") return -1;
      if (a.status !== "unread" && b.status === "unread") return 1;
      // Then by date desc
      return new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime();
    });
    if (activeCategory === "all") return sorted;
    return sorted.filter(i => i.type === activeCategory);
  }, [items, activeCategory]);

  const handleMarkRead = async (item) => {
    try {
      await base44.entities.AdminInboxItem.update(item.id, {
        status: "read",
        read_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["admin-inbox-items"] });
    } catch (e) {
      toast.error("Erreur marquage lu");
    }
  };

  const handleArchive = async (item) => {
    try {
      await base44.entities.AdminInboxItem.update(item.id, { status: "archived" });
      queryClient.invalidateQueries({ queryKey: ["admin-inbox-items"] });
      toast.success("Archivé");
    } catch (e) {
      toast.error("Erreur archivage");
    }
  };

  const handleMarkAllRead = async () => {
    const unread = items.filter(i => i.status === "unread");
    if (unread.length === 0) return;
    try {
      const readAt = new Date().toISOString();
      await Promise.all(unread.map(item =>
        base44.entities.AdminInboxItem.update(item.id, { status: "read", read_at: readAt })
      ));
      queryClient.invalidateQueries({ queryKey: ["admin-inbox-items"] });
      queryClient.invalidateQueries({ queryKey: ["admin-inbox-unread-count"] });
      toast.success(`${unread.length} notification(s) marquée(s) comme lues`);
    } catch (e) {
      toast.error("Erreur marquage global");
    }
  };

  const handleOpen = async (item) => {
    if (item.status === "unread") await handleMarkRead(item);
    if (item.action_url?.startsWith("/")) navigate(item.action_url);
  };

  const categoryCounts = useMemo(() => {
    const counts = { all: items.filter(i => i.status !== "archived").length };
    for (const cat of CATEGORIES.slice(1)) {
      counts[cat.key] = items.filter(i => i.type === cat.key && i.status !== "archived").length;
    }
    return counts;
  }, [items]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            <h1 className="text-base font-bold text-gray-900">Centre de notifications</h1>
            {unreadCount > 0 && (
              <span className="ml-1 min-w-5 h-5 px-1.5 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Tout marquer lu
            </button>
          )}
          <Link
            to="/admin/centre-notifications-push"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            <Megaphone className="w-3.5 h-3.5" />
            Envoyer push
          </Link>
        </div>
      </div>

      {/* Categories */}
      <div className="bg-white border-b border-gray-100 px-4 py-2">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const count = categoryCounts[cat.key] || 0;
            const isActive = activeCategory === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
                  isActive
                    ? "bg-primary text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {cat.label}
                {count > 0 && (
                  <span className={cn(
                    "ml-0.5 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center",
                    isActive ? "bg-white/20" : "bg-gray-300 text-gray-700"
                  )}>
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Items list */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-2">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement...</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Aucune notification</p>
          </div>
        ) : (
          filteredItems.map(item => {
            const priority = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.P3;
            const isUnread = item.status === "unread";
            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl border p-3 transition-all",
                  priority.bg,
                  isUnread ? "ring-1 ring-primary/20" : "opacity-70"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", priority.badge)}>
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn("text-[9px] font-black uppercase px-1.5 py-0.5 rounded", priority.badge)}>
                        {priority.label}
                      </span>
                      <span className="text-[10px] text-gray-500 font-medium uppercase">{item.type}</span>
                      <span className="text-[10px] text-gray-400 ml-auto">{timeAgo(item.created_date)}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-900">{item.title}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{item.body}</p>

                    <div className="flex flex-wrap gap-2 mt-2">
                      {item.action_url?.startsWith("/") && (
                        <button
                          onClick={() => handleOpen(item)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary text-white text-[10px] font-semibold hover:bg-primary/90"
                        >
                          Ouvrir <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                      {isUnread && (
                        <>
                        <button
                          onClick={() => handleMarkRead(item)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-gray-200 text-[10px] font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          <Check className="w-3 h-3" /> Marquer lu
                        </button>
                        <button
                          onClick={() => handleArchive(item)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-gray-200 text-[10px] font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          <Archive className="w-3 h-3" /> Archiver
                        </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
