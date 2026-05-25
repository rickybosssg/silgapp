import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Clock, User, ArrowRight, Zap, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import UrgenceBadge from "@/components/courses/UrgenceBadge";

function CourseItem({ course, onAssign, onView }) {
  const queryClient = useQueryClient();

  const lancerAutoMutation = useMutation({
    mutationFn: () => base44.functions.invoke("dispatchMoteur", { action: "lancer_auto", course_id: course.id }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      if (res?.data?.livreur) {
        toast.success(`Dispatch auto lancé → ${res.data.livreur}`);
      } else {
        toast.warning(res?.data?.message || "Aucun livreur disponible");
      }
    },
    onError: (e) => toast.error("Erreur dispatch : " + e.message),
  });

  return (
    <Card className="p-4 border-l-4 border-l-orange-400 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-semibold text-sm">{course.client_nom || "Client"}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Phone className="w-3 h-3" />
              <span className="text-xs">{course.client_telephone}</span>
            </div>
            {course.urgence && course.urgence !== "normale" && (
              <UrgenceBadge urgence={course.urgence} />
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="truncate">{course.adresse_depart || "—"}</span>
            <ArrowRight className="w-3 h-3 flex-shrink-0" />
            <MapPin className="w-3 h-3 text-accent flex-shrink-0" />
            <span className="truncate">{course.adresse_arrivee || "—"}</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {course.prix && (
              <span className="text-xs font-semibold">{course.prix.toLocaleString()} FCFA</span>
            )}
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(course.created_date), "HH:mm", { locale: fr })}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onView(course)}>
            Détails
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 border-purple-300 text-purple-700 hover:bg-purple-50"
            onClick={() => onAssign(course)}
          >
            <UserCheck className="w-3 h-3 mr-1" />
            Manuel
          </Button>
          <Button
            size="sm"
            className="text-xs h-7 bg-pink-600 hover:bg-pink-700 text-white"
            onClick={() => lancerAutoMutation.mutate()}
            disabled={lancerAutoMutation.isPending}
          >
            <Zap className="w-3 h-3 mr-1" />
            {lancerAutoMutation.isPending ? "..." : "Auto"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function CoursesADispatcher({ courses, onAssign, onView }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-orange-400 animate-pulse" />
          <h2 className="font-bold text-sm text-foreground">Courses à dispatcher</h2>
          <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
            {courses.length}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">Assignez manuellement ou envoyez en auto</p>
      </div>
      <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
        {courses.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            ✅ Aucune course en attente de dispatch
          </div>
        ) : (
          courses.map(c => (
            <CourseItem key={c.id} course={c} onAssign={onAssign} onView={onView} />
          ))
        )}
      </div>
    </Card>
  );
}