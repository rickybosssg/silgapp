import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, User, ArrowRight, RotateCw, AlertTriangle, X } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

function RedispatchCourseItem({ course, onView, onRelaunch, onClose }) {
  const expediteur = course.expediteur_nom || course.client_nom || "Client";

  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-semibold text-sm text-slate-200">{expediteur}</span>
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
            Redispatch
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <MapPin className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span className="truncate">{course.adresse_depart || "—"}</span>
          <ArrowRight className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{course.adresse_arrivee || "—"}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <Clock className="w-3 h-3" />
          {format(new Date(course.created_date), "HH:mm", { locale: fr })}
          {course.livreur_nom && (
            <span className="text-amber-400/70">· Annulé par {course.livreur_nom}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <Button size="sm" variant="outline" className="text-xs h-7 border-slate-600 text-slate-300" onClick={() => onView(course)}>
          Détails
        </Button>
        <Button
          size="sm"
          className="text-xs h-7 bg-amber-500 hover:bg-amber-600 text-white"
          onClick={() => onRelaunch(course)}
        >
          <RotateCw className="w-3 h-3 mr-1" />
          Relancer
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7 border-red-500/40 text-red-400 hover:bg-red-500/10"
          onClick={() => onClose(course)}
        >
          <X className="w-3 h-3 mr-1" />
          Fermer
        </Button>
      </div>
    </div>
  );
}

export default function CoursesRedispatch({ courses, onView }) {
  const queryClient = useQueryClient();
  const [relaunchingId, setRelaunchingId] = useState(null);
  const [closingId, setClosingId] = useState(null);

  const relaunchMutation = useMutation({
    mutationFn: async (course) => {
      // Remettre la course en "recherche_livreur" avec dispatch_status "en_attente"
      // L'orchestrateur détectera le changement de statut et relancera le dispatch automatiquement
      return base44.entities.CourseExterne.update(course.id, {
        statut: "recherche_livreur",
        dispatch_status: "en_attente",
        dispatch_wave: 0,
        timeout_expires_at: null,
        dispatch_next_wave_at: null,
        dispatch_v2_secours_phase: 0,
        notes: (course.notes || "") + ` | [RELANCE ADMIN → recherche_livreur]`,
      });
    },
    onMutate: (course) => setRelaunchingId(course.id),
    onSuccess: (_, course) => {
      queryClient.invalidateQueries({ queryKey: ["courses-externes-dashboard"] });
      toast.success(`Course #${course.id.slice(-8)} relancée — dispatch en cours`);
    },
    onError: (e, course) => {
      toast.error(`Erreur relance: ${e.message}`);
    },
    onSettled: () => setRelaunchingId(null),
  });

  const closeMutation = useMutation({
    mutationFn: async (course) => {
      return base44.entities.CourseExterne.update(course.id, {
        statut: "annulee",
        dispatch_status: "cycle_epuise",
        notes: (course.notes || "") + ` | [FERMÉE ADMIN — ${format(new Date(), "dd/MM HH:mm", { locale: fr })}]`,
      });
    },
    onMutate: (course) => setClosingId(course.id),
    onSuccess: (_, course) => {
      queryClient.invalidateQueries({ queryKey: ["courses-externes-dashboard"] });
      toast.success(`Course #${course.id.slice(-8)} fermée`);
    },
    onError: (e, course) => {
      toast.error(`Erreur fermeture: ${e.message}`);
    },
    onSettled: () => setClosingId(null),
  });

  const redispatchCourses = (courses || []).filter(c => c.dispatch_status === "redispatch");

  if (redispatchCourses.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
        <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
          Courses en redispatch — intervention admin requise
        </p>
        <span className="bg-amber-500/20 text-amber-300 text-xs font-bold px-2 py-0.5 rounded-full">
          {redispatchCourses.length}
        </span>
      </div>
      <div className="bg-[#1e2228] rounded-2xl border border-amber-500/10 shadow-[0_8px_24px_rgba(0,0,0,0.2)] p-3 space-y-2 max-h-[400px] overflow-y-auto">
        {redispatchCourses.map(course => (
          <RedispatchCourseItem
            key={course.id}
            course={course}
            onView={onView}
            onRelaunch={relaunchMutation.mutate}
            onClose={closeMutation.mutate}
          />
        ))}
      </div>
    </div>
  );
}