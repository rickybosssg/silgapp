import React from "react";
import { MapPin, TrendingUp, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * HeatmapControls — Contrôles pour la carte thermique
 * Permet de basculer entre les modes : Standard, Demande, Couverture, Opportunité
 */
export default function HeatmapControls({ mode, onModeChange }) {
  return (
    <div className="flex flex-col gap-2 bg-white rounded-lg shadow-lg border border-gray-200 p-2 min-w-[180px]">
      <p className="text-xs font-semibold text-gray-700 px-1">Carte thermique</p>
      
      <Button
        size="sm"
        variant={mode === "off" ? "default" : "outline"}
        onClick={() => onModeChange("off")}
        className="text-xs justify-start"
      >
        <MapPin className="w-3 h-3 mr-1" /> Standard
      </Button>
      
      <Button
        size="sm"
        variant={mode === "demande" ? "default" : "outline"}
        onClick={() => onModeChange("demande")}
        className="text-xs justify-start bg-red-50 hover:bg-red-100 border-red-200"
      >
        <TrendingUp className="w-3 h-3 mr-1" /> 🔥 Demande
      </Button>
      
      <Button
        size="sm"
        variant={mode === "couverture" ? "default" : "outline"}
        onClick={() => onModeChange("couverture")}
        className="text-xs justify-start bg-blue-50 hover:bg-blue-100 border-blue-200"
      >
        <Users className="w-3 h-3 mr-1" /> 🟢 Couverture
      </Button>
      
      <Button
        size="sm"
        variant={mode === "opportunite" ? "default" : "outline"}
        onClick={() => onModeChange("opportunite")}
        className="text-xs justify-start bg-purple-50 hover:bg-purple-100 border-purple-200"
      >
        <Zap className="w-3 h-3 mr-1" /> ⚡ Opportunité
      </Button>
      
      {/* Légendes dynamiques */}
      {mode === "demande" && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <p className="text-xs font-medium text-gray-600 mb-1">Demande clients</p>
          <div className="flex items-center gap-1 h-3 rounded overflow-hidden">
            <div className="flex-1 h-full bg-gradient-to-r from-green-500 via-yellow-400 to-red-600" />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Faible</span>
            <span>Forte</span>
          </div>
        </div>
      )}
      
      {mode === "couverture" && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <p className="text-xs font-medium text-gray-600 mb-1">Couverture livreurs</p>
          <div className="flex items-center gap-1 h-3 rounded overflow-hidden">
            <div className="flex-1 h-full bg-gradient-to-r from-blue-500 via-green-400 to-emerald-600" />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Faible</span>
            <span>Forte</span>
          </div>
        </div>
      )}
      
      {mode === "opportunite" && (
        <div className="mt-2 pt-2 border-t border-gray-200">
          <p className="text-xs font-medium text-gray-600 mb-1">Opportunités</p>
          <div className="flex items-center gap-1 h-3 rounded overflow-hidden">
            <div className="flex-1 h-full bg-gradient-to-r from-red-600 via-yellow-400 to-green-500" />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>🔴 Opportunité</span>
            <span>🟢 Équilibré</span>
          </div>
          <p className="text-xs text-gray-500 mt-1.5 leading-tight">
            Rouge = forte demande, peu de livreurs
          </p>
        </div>
      )}
    </div>
  );
}