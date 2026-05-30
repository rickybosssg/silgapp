import React from "react";
import { cn } from "@/lib/utils";

import BatterieFaibleButton from "./BatterieFaibleButton";

export default function LivreurStatutCard({ statut, livreur, isExterne = false }) {
  const isDisponible = statut === "disponible";
  const isEnCourse = statut === "en_course";
  const isHorsLigne = statut === "hors_ligne";

  return (
    <div className="space-y-3">
      <div className={cn(
        "rounded-2xl p-4 flex items-center gap-4 shadow-sm transition-all duration-500",
        isDisponible && "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-green-200",
        isEnCourse && "bg-gradient-to-r from-primary to-red-600 text-white shadow-red-200",
        isHorsLigne && "bg-gray-100 text-gray-500",
      )}>
        {/* Animated dot */}
        <div className="relative flex-shrink-0">
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center text-2xl",
            isDisponible && "bg-white/20",
            isEnCourse && "bg-white/20",
            isHorsLigne && "bg-gray-200",
          )}>
            {isDisponible && "🟢"}
            {isEnCourse && "🔵"}
            {isHorsLigne && "⚪"}
          </div>
          {(isDisponible || isEnCourse) && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-white/80 animate-ping" />
          )}
        </div>

        <div>
          <p className={cn(
            "font-bold text-base leading-tight",
            isHorsLigne && "text-gray-600"
          )}>
            {isDisponible && "🟢 Libre"}
            {isEnCourse && "🔵 En course"}
            {isHorsLigne && "⚪ OFF"}
          </p>
          <p className={cn(
            "text-xs mt-0.5",
            isDisponible && "text-white/70",
            isEnCourse && "text-white/70",
            isHorsLigne && "text-gray-400",
          )}>
            {isDisponible && "Prêt à recevoir une mission"}
            {isEnCourse && "Vous êtes en déplacement"}
            {isHorsLigne && "Appuyez sur « Passer ON » pour accepter des courses"}
          </p>
        </div>
      </div>

      {/* Bouton batterie faible - uniquement pour livreurs internes */}
      {!isExterne && (isDisponible || isEnCourse) && livreur && (
        <div className="pt-1">
          <BatterieFaibleButton livreur={livreur} />
        </div>
      )}
    </div>
  );
}