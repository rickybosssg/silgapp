import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, AlertTriangle, Play, MapPin, Phone, User } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const motifLabels = {
  client_injoignable: "Client injoignable",
  client_absent: "Client absent",
  adresse_a_confirmer: "Adresse à confirmer",
  autre: "Autre",
};

function CoursePauseCard({ course, onReprendre }) {
  const pauseStartedAt = new Date(course.pause_started_at);
  const dureeSecondes = Math.round((Date.now() - pauseStartedAt.getTime()) / 1000);
  const dureeMinutes = Math.round(dureeSecondes / 60);
  const heures = Math.floor(dureeMinutes / 60);
  const minutes = dureeMinutes % 60;
  const alerte30Min = dureeMinutes >= 30;

  const formatDuree = () => {
    if (heures > 0) {
      return `${heures}h ${minutes}min`;
    }
    return `${minutes}min`;
  };

  return (
    <Card className={`p-4 border-l-4 ${alerte30Min ? 'border-l-red-500 bg-red-50' : 'border-l-amber-400'}`}>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-base text-foreground">{course.client_nom || "Client"}</h3>
              {alerte30Min && (
                <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  {dureeMinutes} min
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="w-3 h-3" />
              <span>{course.client_telephone}</span>
            </div>
          </div>
        </div>

        {/* Livreur assigné */}
        <div className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg p-2">
          <User className="w-3 h-3 text-primary" />
          <span className="font-medium text-foreground">{course.pause_livreur_nom || course.livreur_nom}</span>
        </div>

        {/* Trajet */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="truncate text-muted-foreground">{course.adresse_depart}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <MapPin className="w-3 h-3 text-accent flex-shrink-0" />
            <span className="truncate text-muted-foreground">{course.adresse_arrivee}</span>
          </div>
        </div>

        {/* Infos pause */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700">Motif</span>
            <span className="text-xs font-medium text-amber-900">
              {motifLabels[course.pause_motif] || course.pause_motif}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700">Depuis</span>
            <span className="text-xs font-medium text-amber-900 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(pauseStartedAt, "HH:mm", { locale: fr })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700">Durée</span>
            <span className={`text-sm font-black ${alerte30Min ? 'text-red-600' : 'text-amber-800'}`}>
              {formatDuree()}
            </span>
          </div>
        </div>

        {/* Bouton reprendre */}
        <Button
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold"
          onClick={() => onReprendre(course)}
        >
          <Play className="w-4 h-4 mr-2" />
          Reprendre la course (Admin)
        </Button>
      </div>
    </Card>
  );
}

export default function CoursesEnPausePanel({ courses, onReprendre }) {
  if (!courses || courses.length === 0) {
    return null; // Ne pas afficher si aucune course en pause
  }

  const alerteCount = courses.filter(c => {
    const dureeMinutes = Math.round((Date.now() - new Date(c.pause_started_at).getTime()) / 60000);
    return dureeMinutes >= 30;
  }).length;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
          <h2 className="font-bold text-sm text-foreground">Courses en pause</h2>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${alerteCount > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
            {courses.length}
          </span>
        </div>
        {alerteCount > 0 && (
          <span className="text-xs font-semibold text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {alerteCount} &gt; 30min
          </span>
        )}
      </div>
      <div className="p-3 space-y-3 max-h-[400px] overflow-y-auto">
        {courses.map(course => (
          <CoursePauseCard
            key={course.id}
            course={course}
            onReprendre={onReprendre}
          />
        ))}
      </div>
    </Card>
  );
}