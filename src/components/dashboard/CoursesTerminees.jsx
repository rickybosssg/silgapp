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
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-white/8 last:border-0">
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm text-white">{course.client_nom || course.client_telephone}</span>
          <CourseStatusBadge statut={course.statut} />
          {course.livreur_nom && (
            <span className="text-[10px] text-white/50">→ {course.livreur_nom}</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-white/50">
          <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="truncate">{addrDepart}</span>
          <ArrowRight className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="truncate">{addrArrivee}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {course.prix_final > 0 && (
          <span className="text-xs font-bold text-[#00a86b]">{course.prix_final.toLocaleString()} F</span>
        )}
        {course.distance_reelle_km ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-cyan-400 bg-cyan-500/10 rounded-full px-1.5 py-0.5">
            <MapPin className="w-2.5 h-2.5" />{Number(course.distance_reelle_km).toFixed(1)} km
          </span>
        ) : null}
        <span className="text-[10px] text-white/50">
          {format(new Date(course.heure_livraison || course.created_date), "HH:mm")}
        </span>
        <Button
          size="sm"
          className="h-8 px-3 rounded-lg gap-1 font-semibold text-xs bg-[#00a86b] hover:bg-[#00a86b]/90 text-white shadow-sm transition-all"
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
    <Card className="p-0 overflow-hidden bg-[hsl(215 18% 28%)] border-white/8">
      <div className="px-4 pt-4 pb-3 border-b border-white/8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-white/40" />
          <h2 className="font-bold text-sm text-white">Historique du jour</h2>
          <span className="bg-white/10 text-white/70 text-xs font-bold px-2 py-0.5 rounded-full">
            {courses.length}
          </span>
        </div>
        <p className="text-xs text-white/50">Livrées & annulées</p>
      </div>
      <div className="px-4 pb-2">
        {courses.length === 0 ? (
          <p className="text-center py-6 text-white/50 text-sm">Aucune course terminée aujourd'hui</p>
        ) : (
          <>
            {affichees.map(c => (
              <CourseItem key={c.id} course={c} onView={onView} />
            ))}
            {courses.length > 5 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full py-2 text-xs text-[#00a86b] flex items-center justify-center gap-1 hover:underline"
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