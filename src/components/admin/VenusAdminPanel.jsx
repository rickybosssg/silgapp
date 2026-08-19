import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  X, AlertTriangle, Info, CheckCircle2, Truck, Wallet,
  Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import VenusRapportsTab from "./VenusRapportsTab";
import VenusAdminChat from "./VenusAdminChat";
import VenusAdminInsights from "./VenusAdminInsights";

const VENUS_AVATAR = "https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/17cf522aa_file_0000000034b871f7bf133c0de0c9eb62.png";

const PRIORITY_CONFIG = {
  P0: { label: "Critique", color: "bg-red-500", text: "text-red-500", icon: AlertTriangle },
  P1: { label: "Important", color: "bg-orange-500", text: "text-orange-500", icon: AlertTriangle },
  P2: { label: "Info", color: "bg-blue-500", text: "text-blue-500", icon: Info },
  P3: { label: "Routine", color: "bg-slate-400", text: "text-slate-500", icon: CheckCircle2 },
};

const FILTERS = [
  { key: "all", label: "Tous" },
  { key: "P0", label: "P0" },
  { key: "P1", label: "P1" },
  { key: "P2", label: "P2" },
  { key: "P3", label: "P3" },
];

export default function VenusAdminPanel({ onClose }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("alertes");

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["venus-admin-events"],
    queryFn: () => base44.entities.VenusAdminEvent.list("-created_date", 100),
    refetchInterval: 10000,
  });

  const markAsRead = useMutation({
    mutationFn: (eventIds) => Promise.all(
      (Array.isArray(eventIds) ? eventIds : [eventIds]).map(id =>
        base44.entities.VenusAdminEvent.update(id, { status: "notified", admin_read_at: new Date().toISOString() })
      )
    ),
    onSuccess: () => queryClient.invalidateQueries(["venus-admin-events"]),
  });

  const ignoreEvent = useMutation({
    mutationFn: (eventIds) => Promise.all(
      (Array.isArray(eventIds) ? eventIds : [eventIds]).map(id =>
        base44.entities.VenusAdminEvent.update(id, { status: "ignored" })
      )
    ),
    onSuccess: () => queryClient.invalidateQueries(["venus-admin-events"]),
  });

  const filteredEvents = useMemo(() => {
    if (filter === "all") return events;
    return events.filter(e => e.priority === filter);
  }, [events, filter]);

  // Regroupement — événements similaires (même type + priorité) dans une fenêtre de 5 min
  const groupedEvents = useMemo(() => {
    if (!filteredEvents || filteredEvents.length === 0) return [];
    const groups = [];
    let cur = null;
    for (const evt of filteredEvents) {
      const t = new Date(evt.created_date).getTime();
      if (cur && cur.event_type === evt.event_type && cur.priority === evt.priority && (cur.lastTime - t) < 5 * 60 * 1000) {
        cur.count += 1;
        cur.lastTime = t;
        cur.events.push(evt);
      } else {
        cur = { ...evt, count: 1, lastTime: t, events: [evt] };
        groups.push(cur);
      }
    }
    return groups;
  }, [filteredEvents]);

  const unreadCount = events.filter(e => e.status === "new").length;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="w-full max-w-lg h-[100dvh] sm:h-[600px] sm:max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white">

        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-primary via-blue-600 to-primary-dark">
          <div className="flex items-center gap-3">
            <img src={VENUS_AVATAR} alt="VENUS" className="w-12 h-12 rounded-xl object-cover shadow-lg border-2 border-white" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-white text-lg leading-tight">VENUS Admin</h2>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">
                    {unreadCount} non lu{unreadCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/80 font-medium">Assistante de direction — Eric</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="bg-white/20 hover:bg-white/30 text-white rounded-xl" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-slate-50">
          <button
            onClick={() => setActiveTab("insights")}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-bold", activeTab === "insights" ? "bg-primary text-white" : "bg-white text-slate-600 border border-slate-200")}
          >
            À surveiller
          </button>
          <button
            onClick={() => setActiveTab("alertes")}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-bold", activeTab === "alertes" ? "bg-primary text-white" : "bg-white text-slate-600 border border-slate-200")}
          >
            Alertes
          </button>
          <button
            onClick={() => setActiveTab("rapports")}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-bold", activeTab === "rapports" ? "bg-primary text-white" : "bg-white text-slate-600 border border-slate-200")}
          >
            Rapports
          </button>
          <button
            onClick={() => setActiveTab("conversation")}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-bold", activeTab === "conversation" ? "bg-primary text-white" : "bg-white text-slate-600 border border-slate-200")}
          >
            Conversation
          </button>
        </div>

        {activeTab === "insights" && <VenusAdminInsights />}
        {activeTab === "alertes" && (
        <>
        {/* Filtres */}
        <div className="flex items-center gap-1.5 p-3 border-b bg-slate-50 overflow-x-auto scrollbar-hide">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors",
                filter === f.key
                  ? "bg-primary text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Liste des événements */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-slate-500">Chargement des événements...</p>
            </div>
          ) : groupedEvents.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm text-slate-400 font-medium">Aucun événement à signaler</p>
              </div>
            </div>
          ) : (
            groupedEvents.map(evt => {
              const prio = PRIORITY_CONFIG[evt.priority] || PRIORITY_CONFIG.P3;
              const isUnread = evt.status === "new";
              return (
                <div
                  key={evt.id}
                  className={cn(
                    "rounded-xl p-3 border bg-white shadow-sm transition-all",
                    isUnread ? "border-primary/30 ring-1 ring-primary/10" : "border-slate-200 opacity-80"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", prio.color)}>
                      <prio.icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded", prio.color, "text-white")}>
                          {evt.priority}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {format(new Date(evt.created_date), "HH:mm", { locale: fr })}
                        </span>
                        {isUnread && <span className="w-2 h-2 bg-primary rounded-full" />}
                      </div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-sm font-bold text-slate-900">{evt.title}</p>
                        {evt.count > 1 && (
                          <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full">×{evt.count}</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{evt.summary}</p>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 mt-2">
                        {evt.course_id && (
                          <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1">
                            <Eye className="w-3 h-3" /> Course
                          </Button>
                        )}
                        {evt.livreur_id && (
                          <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1">
                            <Truck className="w-3 h-3" /> Livreur
                          </Button>
                        )}
                        {evt.payment_id && (
                          <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1">
                            <Wallet className="w-3 h-3" /> Paiement
                          </Button>
                        )}
                        {isUnread && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px] px-2 ml-auto"
                            onClick={() => markAsRead.mutate(evt.events.map(e => e.id))}
                          >
                            Marquer comme lu
                          </Button>
                        )}
                        {evt.status !== "ignored" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px] px-2 text-slate-400"
                            onClick={() => ignoreEvent.mutate(evt.events.map(e => e.id))}
                          >
                            <EyeOff className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        </>
        )}
        {activeTab === "rapports" && <VenusRapportsTab />}
        {activeTab === "conversation" && <VenusAdminChat />}
      </div>
    </div>
  );
}
