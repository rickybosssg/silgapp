import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Clock, User, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import CourseStatusBadge from "@/components/courses/CourseStatusBadge";
import UrgenceBadge from "@/components/courses/UrgenceBadge";

const STATUT_LABELS = {
  automatique: "🤖 Dispatch auto",
  manuel: "✋ Assigné manuel",
};

function CourseItem({ course, onView }) {
  return (
    <Card className="p-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-semibold text-sm">{course.client_nom || "Client"}</span>
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
            <CourseStatusBadge statut={course.statut} />
            {course.livreur_nom && (
              <span className="text-xs font-medium text-foreground">🚴 {course.livreur_nom}</span>
            )}
            {(course.prix_reel || course.prix) > 0 && (
              <span className="text-xs font-bold text-green-700 ml-auto">
                {(course.prix_reel || course.prix).toLocaleString()} F
              </span>
            )}
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(course.created_date), "HH:mm", { locale: fr })}
            </span>
          </div>
        </div>

        <Button size="sm" variant="outline" className="text-xs h-7 flex-shrink-0" onClick={() => onView(course)}>
          Détails
        </Button>
      </div>
    </Card>
  );
}

export default function CoursesEnTraitement({ courses, onView }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
          <h2 className="font-bold text-sm text-foreground">Courses en traitement</h2>
          <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
            {courses.length}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">Assignées — en attente d'acceptation ou en cours</p>
      </div>
      <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
        {courses.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-300 mx-auto" />
            <p className="text-muted-foreground text-sm">Aucune course en traitement</p>
            <p className="text-xs text-muted-foreground">Les courses assignées apparaîtront ici</p>
          </div>
        ) : (
          courses.map(c => (
            <CourseItem key={c.id} course={c} onView={onView} />
          ))
        )}
      </div>
    </Card>
  );
}