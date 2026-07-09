import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, User, ArrowRight, Eye } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import CourseStatusBadge from "@/components/courses/CourseStatusBadge";
import UrgenceBadge from "@/components/courses/UrgenceBadge";
import { cleanAddress } from "@/lib/addressUtils";

// Statuts externes traduits lisiblement — couleurs distinctes par étape
const STATUT_EXTERNE_LABELS = {
  nouvelle: "🔵 Nouvelle",
  recherche_livreur: "🔍 Recherche livreur",
  livreur_en_route: "🟡 En route vers l'expéditeur",
  colis_recupere: "🟠 Colis récupéré",
  en_livraison: "🔵 En route vers le destinataire",
  livree: "🟢 Livré",
  annulee: "🔴 Annulé",
};

function CourseItemExterne({ course, onView }) {
  const expediteur = course.expediteur_nom || course.client_nom || "Client";
  const statutLabel = STATUT_EXTERNE_LABELS[course.statut] || course.statut;
  const statutColor = {
    livreur_en_route: "bg-yellow-400 text-black border-yellow-500",
    colis_recupere: "bg-green-500 text-black border-green-600",
    en_livraison: "bg-yellow-400 text-black border-yellow-500",
    recherche_livreur: "bg-red-500 text-white font-bold border-red-600",
    nouvelle: "bg-blue-100 text-blue-700 border-blue-200",
  }[course.statut] || "bg-gray-100 text-gray-600 border-gray-200";

  const addrDepart = cleanAddress(course.adresse_depart, course.gps_depart_lat, course.gps_depart_lng);
  const addrArrivee = cleanAddress(course.adresse_arrivee, course.gps_arrivee_lat, course.gps_arrivee_lng);

  return (
    <Card className="p-4 hover:shadow-md transition-all border-l-4 border-l-blue-400 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          {/* Nom client — agrandi et en gras */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="font-bold text-base text-gray-900">{expediteur}</span>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${statutColor}`}>
              {statutLabel}
            </span>
          </div>

          {/* Adresses — nettoyées, jamais d'URL */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="truncate">{addrDepart}</span>
            <ArrowRight className="w-3 h-3 flex-shrink-0" />
            <MapPin className="w-3 h-3 text-accent flex-shrink-0" />
            <span className="truncate">{addrArrivee || "Destination à définir"}</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {course.livreur_nom && (
              <span className="text-xs font-medium text-foreground">🚴 {course.livreur_nom}</span>
            )}
            {course.destinataire_nom && (
              <span className="text-xs text-muted-foreground">→ {course.destinataire_nom}</span>
            )}
            {course.prix_final > 0 && (
              <span className="text-xs font-bold text-green-700 ml-auto">
                {course.prix_final.toLocaleString()} F
              </span>
            )}
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(course.created_date), "HH:mm", { locale: fr })}
            </span>
          </div>
        </div>

        {onView && (
          <Button
            size="sm"
            className="flex-shrink-0 h-9 px-4 rounded-xl gap-1.5 font-semibold text-xs bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/20 transition-all"
            onClick={() => onView(course)}
          >
            <Eye className="w-3.5 h-3.5" />
            Détails
          </Button>
        )}
      </div>
    </Card>
  );
}

function CourseItemInterne({ course, onView }) {
  // Badge spécial pour dispatch automatique en cours
  const isDispatchAuto = course.dispatch_status === 'propose' && course.statut === 'en_attente_livreur';
  const addrDepart = cleanAddress(course.adresse_depart);
  const addrArrivee = cleanAddress(course.adresse_arrivee);
  
  return (
    <Card className={`p-4 hover:shadow-md transition-all space-y-2.5 ${isDispatchAuto ? 'border-l-4 border-l-amber-400 bg-amber-50/30' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="font-bold text-base text-gray-900">{course.client_nom || "Client"}</span>
            </div>
            {course.urgence && course.urgence !== "normale" && (
              <UrgenceBadge urgence={course.urgence} />
            )}
            {isDispatchAuto && (
              <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-amber-100 text-amber-700 border-amber-200 flex items-center gap-1">
                <span className="animate-pulse">🔍</span> Recherche livreur en cours
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="truncate">{addrDepart}</span>
            <ArrowRight className="w-3 h-3 flex-shrink-0" />
            <MapPin className="w-3 h-3 text-accent flex-shrink-0" />
            <span className="truncate">{addrArrivee}</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {!isDispatchAuto && <CourseStatusBadge statut={course.statut} dispatchStatus={course.dispatch_status} />}
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

        <Button
          size="sm"
          className="flex-shrink-0 h-9 px-4 rounded-xl gap-1.5 font-semibold text-xs bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/20 transition-all"
          onClick={() => onView(course)}
        >
          <Eye className="w-3.5 h-3.5" />
          Détails
        </Button>
      </div>
    </Card>
  );
}

export default function CoursesEnTraitement({ courses, onView, isExterne = false }) {
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
        <p className="text-xs text-muted-foreground">Assignées — en cours de livraison</p>
      </div>
      <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
        {courses.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-300 mx-auto" />
            <p className="text-muted-foreground text-sm">Aucune course en traitement</p>
            <p className="text-xs text-muted-foreground">Les courses assignées apparaîtront ici</p>
          </div>
        ) : (
          courses.map(c =>
            isExterne
              ? <CourseItemExterne key={c.id} course={c} onView={onView} />
              : <CourseItemInterne key={c.id} course={c} onView={onView} />
          )
        )}
      </div>
    </Card>
  );
}