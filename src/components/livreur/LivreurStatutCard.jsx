import React from "react";
import { cn } from "@/lib/utils";
import BatterieFaibleButton from "./BatterieFaibleButton";
import CoursePersonnelleButton from "./CoursePersonnelleButton";
import { CircleCheck, PowerOff, Route } from "lucide-react";

export default function LivreurStatutCard({ statut, livreur, isExterne = false }) {
  const isDisponible = statut === "disponible";
  const isEnCourse = statut === "en_course";
  const isHorsLigne = statut === "hors_ligne";

  return (
    <div className="space-y-3">
      <div className={cn(
        "rounded-[1.75rem] p-4 flex items-center gap-4 transition-all duration-500 relative overflow-hidden border",
        isDisponible && "bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 text-white shadow-xl shadow-emerald-500/25 border-white/20",
        isEnCourse && "bg-gradient-to-r from-blue-800 via-indigo-700 to-sky-600 text-white shadow-xl shadow-blue-500/25 border-white/20",
        isHorsLigne && "bg-white text-gray-500 border-slate-200 shadow-sm",
      )}>
        {/* Halo de fond décoratif */}
        {isDisponible && <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />}
        {isEnCourse && <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />}

        {/* Icône statut */}
        <div className="relative flex-shrink-0">
          <div className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner",
            isDisponible && "bg-white/20",
            isEnCourse && "bg-white/20",
            isHorsLigne && "bg-gray-200",
          )}>
            {isDisponible && <CircleCheck className="h-7 w-7 text-white" />}
            {isEnCourse && <Route className="h-7 w-7 text-white" />}
            {isHorsLigne && <PowerOff className="h-7 w-7 text-gray-500" />}
          </div>
          {/* Ping animé */}
          {(isDisponible || isEnCourse) && (
            <span className={cn(
              "absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full animate-ping opacity-75",
              isDisponible ? "bg-white" : "bg-sky-300"
            )} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className={cn(
            "font-black text-lg leading-tight",
            isHorsLigne && "text-gray-600"
          )}>
            {isDisponible && "Libre"}
            {isEnCourse && "En course"}
            {isHorsLigne && "OFF"}
          </p>
          <p className={cn(
            "text-xs mt-0.5 leading-relaxed",
            isDisponible && "text-white/75",
            isEnCourse && "text-white/75",
            isHorsLigne && "text-gray-400",
          )}>
            {isDisponible && "Prêt à recevoir une mission"}
            {isEnCourse && "Vous êtes en déplacement"}
            {isHorsLigne && "Appuyez sur « Activer » pour accepter des courses"}
          </p>
        </div>

        {/* Badge statut secondaire */}
        {isDisponible && (
          <div className="bg-white/20 px-2.5 py-1 rounded-full flex-shrink-0">
            <span className="text-[11px] font-bold text-white"> ON</span>
          </div>
        )}
        {isEnCourse && (
          <div className="bg-white/20 px-2.5 py-1 rounded-full flex-shrink-0">
            <span className="text-[11px] font-bold text-white"> En mission</span>
          </div>
        )}
      </div>

      {/* Boutons action - uniquement pour livreurs internes */}
      {!isExterne && (isDisponible || isEnCourse) && livreur && (
        <div className="pt-1 flex flex-wrap gap-2">
          <BatterieFaibleButton livreur={livreur} />
          {isDisponible && <CoursePersonnelleButton livreur={livreur} />}
        </div>
      )}
    </div>
  );
}
