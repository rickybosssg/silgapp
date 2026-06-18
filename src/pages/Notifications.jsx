import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Bell, Check, CheckCheck, BellOff } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const typeConfig = {
  nouvelle_course:  { color: "bg-blue-100 text-blue-700",     dot: "bg-blue-500",    label: "Nouvelle course" },
  course_assignee:  { color: "bg-amber-100 text-amber-700",   dot: "bg-amber-500",   label: "Assignée" },
  course_acceptee:  { color: "bg-green-100 text-green-700",   dot: "bg-green-500",   label: "Acceptée" },
  course_refusee:   { color: "bg-red-100 text-red-700",       dot: "bg-red-500",     label: "Refusée" },
  colis_recupere:   { color: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500",  label: "Colis recupere" },
  en_livraison:     { color: "bg-blue-100 text-blue-700",     dot: "bg-blue-500",    label: "En livraison" },
  course_livree:    { color: "bg-emerald-100 text-emerald-700",dot: "bg-emerald-500", label: "Livrée" },
  course_bloquee:   { color: "bg-orange-100 text-orange-700", dot: "bg-orange-500",  label: "Bloquée" },
  course_annulee:   { color: "bg-red-100 text-red-700",       dot: "bg-red-400",     label: "Annulée" },
};

export default function Notifications() {
  const queryClient = useQueryClient();

  const { data: notificationsRaw = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => base44.entities.Notification.list("-created_date", 100),
    initialData: [],
  });

  // 🛡️ ANTI-DOUBLON COURSE : une seule notification par course_id
  // Priorité : non-lue > plus récente
  const notifications = React.useMemo(() => {
    const seen = new Map();
    const sorted = [...notificationsRaw].sort((a, b) => {
      // Non-lue d'abord
      if (!a.lue && b.lue) return -1;
      if (a.lue && !b.lue) return 1;
      // Puis plus récente
      return new Date(b.created_date) - new Date(a.created_date);
    });
    return sorted.filter(n => {
      if (!n.course_id) return true; // garder les notifs sans course_id
      if (seen.has(n.course_id)) return false; // déjà vu → doublon
      seen.set(n.course_id, true);
      return true;
    });
  }, [notificationsRaw]);

  const markReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { lue: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('marquerToutesNotificationsLues', {});
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });

  const unreadCount = notifications.filter(n => !n.lue).length;

  // 🛡️ Stats dédoublonnage (diagnostic)
  const dedupCount = notificationsRaw.length - notifications.length;

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl mx-auto">

      {/* ── HERO HEADER ──────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary via-red-600 to-rose-700 p-5 shadow-xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white rounded-full" />
          <div className="absolute -bottom-12 -left-6 w-56 h-56 bg-white rounded-full" />
        </div>
        <div className="relative flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="relative w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
              <Bell className="w-5 h-5 text-white" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-yellow-400 text-yellow-900 text-[10px] font-black rounded-full flex items-center justify-center shadow">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Notifications</h1>
              <p className="text-white/60 text-xs mt-0.5">
                {unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Tout est à jour"} · {notifications.length} affichées
              </p>
              {dedupCount > 0 && (
                <p className="text-white/40 text-[10px] mt-0.5">
                  🛡️ {dedupCount} doublon{dedupCount > 1 ? "s" : ""} filtré{dedupCount > 1 ? "s" : ""} (unicité par course)
                </p>
              )}
            </div>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-white hover:bg-white/20 border border-white/30 text-xs"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tout marquer lu</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── LOADING ──────────────────────────────────── */}
      {isLoading && (
        <div className="text-center py-12 text-muted-foreground text-sm">Chargement…</div>
      )}

      {/* ── EMPTY STATE ──────────────────────────────── */}
      {!isLoading && notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <BellOff className="w-7 h-7 text-gray-500" />
          </div>
          <p className="font-semibold text-foreground">Aucune notification</p>
          <p className="text-xs text-muted-foreground mt-1">Vous êtes à jour !</p>
        </div>
      )}

      {/* ── LISTE ────────────────────────────────────── */}
      <div className="space-y-2">
        {notifications.map(notif => {
          const config = typeConfig[notif.type] || { color: "bg-gray-100 text-gray-600", dot: "bg-gray-400", label: notif.type };
          return (
            <div
              key={notif.id}
              className={`rounded-2xl border p-4 transition-all ${!notif.lue ? "border-primary/20 bg-primary/5" : "border-gray-100 bg-white"}`}
            >
              <div className="flex items-start gap-3">
                {/* Dot indicateur */}
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!notif.lue ? config.dot : "bg-gray-200"}`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${config.color}`}>
                      {config.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(notif.created_date), "dd MMM · HH:mm", { locale: fr })}
                    </span>
                    {!notif.lue && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">Nouveau</span>
                    )}
                  </div>
                  <p className={`text-sm font-semibold leading-snug ${notif.lue ? "text-foreground/70" : "text-foreground"}`}>{notif.titre}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{notif.message}</p>
                </div>

                {!notif.lue && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 flex-shrink-0 hover:bg-green-100 hover:text-green-700 rounded-xl"
                    onClick={() => markReadMutation.mutate(notif.id)}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
