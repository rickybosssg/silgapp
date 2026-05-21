import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, CheckCheck, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

const typeConfig = {
  nouvelle_course: { color: "bg-blue-100 text-blue-700", label: "Nouvelle course" },
  course_assignee: { color: "bg-amber-100 text-amber-700", label: "Assignée" },
  course_acceptee: { color: "bg-green-100 text-green-700", label: "Acceptée" },
  course_refusee: { color: "bg-red-100 text-red-700", label: "Refusée" },
  course_livree: { color: "bg-emerald-100 text-emerald-700", label: "Livrée" },
  course_bloquee: { color: "bg-orange-100 text-orange-700", label: "Bloquée" },
  course_annulee: { color: "bg-red-100 text-red-700", label: "Annulée" },
};

export default function Notifications() {
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => base44.entities.Notification.list("-created_date", 100),
    initialData: [],
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { lue: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter(n => !n.lue);
      await Promise.all(unread.map(n => base44.entities.Notification.update(n.id, { lue: true })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });

  const unreadCount = notifications.filter(n => !n.lue).length;

  return (
    <div className="p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <Badge className="bg-destructive text-destructive-foreground">{unreadCount}</Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <Button 
            variant="outline" size="sm" className="gap-1.5 text-xs"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
          >
            <CheckCheck className="w-3.5 h-3.5" /> Tout marquer lu
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {isLoading && <p className="text-center py-12 text-muted-foreground text-sm">Chargement...</p>}
        {!isLoading && notifications.length === 0 && (
          <p className="text-center py-12 text-muted-foreground text-sm">Aucune notification</p>
        )}
        {notifications.map(notif => {
          const config = typeConfig[notif.type] || { color: "bg-muted text-muted-foreground", label: notif.type };
          return (
            <Card
              key={notif.id}
              className={cn(
                "p-4 transition-all",
                !notif.lue && "border-l-4 border-l-primary bg-primary/5"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[10px]", config.color)}>
                      {config.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(notif.created_date), "dd/MM HH:mm", { locale: fr })}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{notif.titre}</p>
                  <p className="text-xs text-muted-foreground">{notif.message}</p>
                </div>
                {!notif.lue && (
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8"
                    onClick={() => markReadMutation.mutate(notif.id)}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}