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
        isDisponible && "bg-white text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border-emerald-200",
        isEnCourse && "bg-white text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.06)] border-blue-200",
        isHorsLigne && "bg-white text-slate-500 border-black/5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]",
      )}>
        {/* Halo de fond décoratif */}
        {isDisponible && <div className="absolute -right-6 -top-6 w-24 h-24 bg-[#00a86b]/10 rounded-full blur-xl pointer-events-none" />}
        {isEnCourse && <div className="absolute -right-6 -top-6 w-24 h-24 bg-sky-400/10 rounded-full blur-xl pointer-events-none" />}

        {/* Icône statut */}
        <div className="relative flex-shrink-0">
          <div className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner",
            isDisponible && "bg-[#00a86b]/20",
            isEnCourse && "bg-sky-400/20",
            isHorsLigne && "bg-slate-100",
          )}>
            {isDisponible && <CircleCheck className="h-7 w-7 text-[#00a86b]" />}
            {isEnCourse && <Route className="h-7 w-7 text-sky-400" />}
            {isHorsLigne && <PowerOff className="h-7 w-7 text-slate-400" />}
          </div>
          {/* Ping animé */}
          {(isDisponible || isEnCourse) && (
            <span className={cn(
              "absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full animate-ping opacity-75",
              isDisponible ? "bg-[#00a86b]" : "bg-sky-400"
            )} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className={cn(
            "font-black text-lg leading-tight",
            isHorsLigne && "text-slate-500"
          )}>
            {isDisponible && "Libre"}
            {isEnCourse && "En course"}
            {isHorsLigne && "OFF"}
          </p>
          <p className={cn(
            "text-xs mt-0.5 leading-relaxed",
            isDisponible && "text-[#00a86b]/80",
            isEnCourse && "text-sky-300/80",
            isHorsLigne && "text-slate-400",
          )}>
            {isDisponible && "Prêt à recevoir une mission"}
            {isEnCourse && "Vous êtes en déplacement"}
            {isHorsLigne && "Appuyez sur « Activer » pour accepter des courses"}
          </p>
        </div>

        {/* Badge statut secondaire */}
        {isDisponible && (
          <div className="bg-[#00a86b]/20 px-2.5 py-1 rounded-full flex-shrink-0">
            <span className="text-[11px] font-bold text-[#00a86b]"> ON</span>
          </div>
        )}
        {isEnCourse && (
          <div className="bg-sky-400/20 px-2.5 py-1 rounded-full flex-shrink-0">
            <span className="text-[11px] font-bold text-sky-300"> En mission</span>
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
