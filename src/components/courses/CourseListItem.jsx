import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Phone, Clock, User, ArrowRight, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import CourseStatusBadge from "./CourseStatusBadge";
import UrgenceBadge from "./UrgenceBadge";

export default function CourseListItem({ course, onAssign, onView }) {
  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          {/* Client info */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-semibold text-sm">{course.client_nom}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="w-3 h-3" />
              <span className="text-xs">{course.client_telephone}</span>
            </div>
          </div>

          {/* Route */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="truncate">{course.adresse_depart}</span>
            <ArrowRight className="w-3 h-3 flex-shrink-0" />
            <MapPin className="w-3 h-3 text-accent flex-shrink-0" />
            <span className="truncate">{course.adresse_arrivee}</span>
          </div>

          {/* Montant */}
          <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 rounded-lg w-fit">
            <DollarSign className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span className="text-sm font-bold text-blue-700">
              {course.prix_reel && course.statut === "livree" ? course.prix_reel : course.prix}
              <span className="text-xs font-semibold text-blue-600 ml-1">FCFA</span>
            </span>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-2 flex-wrap">
            <CourseStatusBadge statut={course.statut} />
            {course.urgence && course.urgence !== "normale" && (
              <UrgenceBadge urgence={course.urgence} />
            )}
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(course.created_date), "HH:mm", { locale: fr })}
            </span>
            {course.livreur_nom && (
              <span className="text-xs text-muted-foreground">→ {course.livreur_nom}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onView(course)}>
            Détails
          </Button>
          {(course.statut === "nouvelle" || course.statut === "en_attente_livreur") && (
            <Button size="sm" className="text-xs h-7 bg-primary" onClick={() => onAssign(course)}>
              Assigner
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}