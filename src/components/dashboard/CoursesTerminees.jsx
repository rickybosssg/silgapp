import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, ArrowRight, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { format } from "date-fns";
import CourseStatusBadge from "@/components/courses/CourseStatusBadge";
import { cleanAddress } from "@/lib/addressUtils";

function CourseItem({ course, onView }) {
  const addrDepart = cleanAddress(course.adresse_depart);
  const addrArrivee = cleanAddress(course.adresse_arrivee);
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b last:border-0">
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm text-gray-900">{course.client_nom || course.client_telephone}</span>
          <CourseStatusBadge statut={course.statut} />
          {course.livreur_nom && (
            <span className="text-[10px] text-muted-foreground">→ {course.livreur_nom}</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="truncate">{addrDepart}</span>
          <ArrowRight className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="truncate">{addrArrivee}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {(course.prix_reel || course.prix) > 0 && (
          <span className="text-xs font-bold text-green-700">{(course.prix_reel || course.prix).toLocaleString()} F</span>
        )}
        <span className="text-[10px] text-muted-foreground">
          {format(new Date(course.heure_livraison || course.created_date), "HH:mm")}
        </span>
        <Button
          size="sm"
          className="h-8 px-3 rounded-lg gap-1 font-semibold text-xs bg-primary hover:bg-primary/90 text-white shadow-sm transition-all"
          onClick={() => onView(course)}
        >
          <Eye className="w-3 h-3" />
          Détails
        </Button>
      </div>
    </div>
  );
}

export default function CoursesTerminees({ courses, onView }) {
  const [expanded, setExpanded] = useState(false);
  const affichees = expanded ? courses : courses.slice(0, 5);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
          <h2 className="font-bold text-sm text-foreground">Historique du jour</h2>
          <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">
            {courses.length}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">Livrées & annulées</p>
      </div>
      <div className="px-4 pb-2">
        {courses.length === 0 ? (
          <p className="text-center py-6 text-muted-foreground text-sm">Aucune course terminée aujourd'hui</p>
        ) : (
          <>
            {affichees.map(c => (
              <CourseItem key={c.id} course={c} onView={onView} />
            ))}
            {courses.length > 5 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full py-2 text-xs text-primary flex items-center justify-center gap-1 hover:underline"
              >
                {expanded ? <><ChevronUp className="w-3 h-3" /> Réduire</> : <><ChevronDown className="w-3 h-3" /> Voir les {courses.length - 5} autres</>}
              </button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}